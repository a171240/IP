import "server-only"

import { randomUUID } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { llmAnalyzeBeauticianTurn, llmRewriteCustomerLine, type TurnAnalysis } from "@/lib/voice-coach/llm.server"
import { calcFillerRatio, calcWpm } from "@/lib/voice-coach/metrics"
import {
  createInitialPolicyState,
  getAnalysisTemplate,
  maybeRewriteCustomerLine,
  normalizeVoiceCoachCategoryId,
  selectNextCustomerLine,
  type VoiceCoachPolicyState,
} from "@/lib/voice-coach/script-packs"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import {
  doubaoAsrAuc,
  doubaoAsrFlash,
  doubaoTts,
  type DoubaoAsrResult,
  type DoubaoTtsEmotion,
} from "@/lib/voice-coach/speech/doubao.server"
import {
  downloadVoiceCoachAudio,
  signVoiceCoachAudio,
  uploadVoiceCoachAudio,
} from "@/lib/voice-coach/storage.server"

export type VoiceCoachEventType =
  | "turn.accepted"
  | "beautician.asr_ready"
  | "customer.text_ready"
  | "customer.audio_ready"
  | "beautician.analysis_ready"
  | "turn.error"

type VoiceCoachJobPayload = {
  reply_to_turn_id: string
  audio_format: "mp3" | "wav" | "ogg" | "raw" | "flac"
  client_audio_seconds?: number | null
}

type VoiceCoachJobStage = "main_pending" | "tts_pending" | "analysis_pending" | "done" | "error"

type VoiceCoachJobResultState = {
  pipeline_started_at_ms?: number
  reached_max_turns?: boolean
  reply_turn_id?: string
  beautician_turn_index?: number
  beautician_text?: string
  beautician_audio_url?: string | null
  beautician_audio_seconds?: number | null
  beautician_asr_confidence?: number | null
  category_id?: string
  intent_id?: string
  angle_id?: string
  reply_source?: string
  loop_guard_triggered?: boolean
  next_customer_turn_id?: string
  next_customer_text?: string
  next_customer_emotion?: VoiceCoachEmotion
  next_customer_tag?: string
  customer_text_elapsed_ms?: number
  customer_audio_elapsed_ms?: number
}

type EmitEventArgs = {
  sessionId: string
  userId: string
  type: VoiceCoachEventType
  turnId?: string | null
  jobId?: string | null
  data?: Record<string, unknown> | null
}

type ProcessJobResult = { processed: boolean; done: boolean; jobId?: string; turnId?: string }

type SessionRow = {
  id: string
  scenario_id: string
  category_id: string | null
  policy_state_json: VoiceCoachPolicyState | null
  status: string
}

type BeauticianTurnRow = {
  id: string
  session_id: string
  turn_index: number
  role: string
  text: string | null
  audio_path: string | null
  audio_seconds: number | null
  status: string | null
  intent_id: string | null
  angle_id: string | null
  analysis_json: TurnAnalysis | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hardMaxTurns(): number {
  const n = Number(process.env.VOICE_COACH_HARD_MAX_TURNS || process.env.VOICE_COACH_MAX_TURNS || 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.round(n))
}

function mapEmotionToTts(emotion: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  switch (emotion) {
    case "pleased":
      return "happy"
    case "worried":
      return "sad"
    case "impatient":
      return "angry"
    case "neutral":
    case "skeptical":
    default:
      return "neutral"
  }
}

function shouldUseFlashAsr(): boolean {
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

function shouldAllowAucFallbackWhenFlashEnabled(): boolean {
  const raw = String(process.env.VOICE_COACH_ASR_ALLOW_AUC_FALLBACK || "true")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function processingStaleMs(): number {
  const n = Number(process.env.VOICE_COACH_PROCESSING_STALE_MS || 20000)
  if (!Number.isFinite(n) || n < 5000) return 20000
  return Math.round(n)
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function isAsrSilenceError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  return msg.includes("asr_auc_silence") || msg.includes("asr_silence")
}

function isAsrTimeoutError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  if (!msg) return false
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("AbortError")
}

function normalizeAsrFailure(err: unknown): { code: "asr_silence" | "asr_timeout" | "asr_failed"; message: string } {
  if (isAsrSilenceError(err)) {
    return {
      code: "asr_silence",
      message: "没有识别到有效语音，请重录并靠近麦克风。",
    }
  }

  if (isAsrTimeoutError(err)) {
    return {
      code: "asr_timeout",
      message: "语音识别超时，请重录并靠近麦克风。",
    }
  }

  return {
    code: "asr_failed",
    message: "语音识别失败，请重录后重试。",
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeJobStage(raw: unknown): VoiceCoachJobStage {
  const stage = String(raw || "").trim()
  if (stage === "tts_pending") return "tts_pending"
  if (stage === "analysis_pending") return "analysis_pending"
  if (stage === "done") return "done"
  if (stage === "error") return "error"
  // Compatibility for legacy values: accepted / processing / empty -> main stage.
  return "main_pending"
}

function fallbackTagFromBeauticianText(text: string, defaultTag: string) {
  const s = String(text || "")
  if (/价格|贵|优惠|折扣|套餐|会员/.test(s)) return "价格贵"
  if (/证书|资质|认证|安全|风险|规范|卫生/.test(s)) return "胸部安全"
  if (/品牌|产品|院线|材料|成分|进口/.test(s)) return "产品信任"
  if (/案例|照片|前后|反馈|对比|见证/.test(s)) return "真实案例"
  return defaultTag
}

function fallbackTopicPool(tag: string): string[] {
  if (tag === "胸部安全") {
    return [
      "你说安全我理解，但具体有哪些资质和操作规范可以给我看吗？",
      "如果我有些敏感体质，这个项目怎么确保安全？",
      "能不能说下你们在安全方面最关键的两三条保障？",
    ]
  }
  if (tag === "价格贵") {
    return [
      "价格我还是觉得偏高，你能具体说说和普通项目差在哪吗？",
      "如果按你这个价格，我能拿到哪些更确定的价值？",
      "我在意性价比，你能给我一个更清晰的价格理由吗？",
    ]
  }
  if (tag === "真实案例") {
    return [
      "我更想看真实的前后对比，最好是和我情况接近的案例。",
      "除了口头介绍，有没有可验证的案例或顾客反馈？",
      "你方便先给我看一两个具体案例吗？",
    ]
  }
  return [
    "你说得有道理，但我还是想听更具体、可验证的信息。",
    "我能理解你的意思，不过我希望你给我更落地的依据。",
    "可以继续说，但我更关心具体证据而不是笼统描述。",
  ]
}

function quickHash(input: string): number {
  const s = String(input || "")
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 131 + s.charCodeAt(i)) >>> 0
  }
  return h
}

function detectFocusKeyword(text: string): string {
  const s = String(text || "")
  const checks: Array<[RegExp, string]> = [
    [/证书|资质|认证|合规|规范/, "资质和规范"],
    [/安全|风险|卫生|敏感|保障/, "安全保障"],
    [/案例|照片|前后对比|反馈|见证/, "案例证明"],
    [/品牌|产品|院线|成分|材料/, "产品和品牌"],
    [/价格|贵|优惠|折扣|套餐|会员/, "价格和价值"],
    [/门店|连锁|顾客|复购|口碑/, "门店口碑"],
  ]

  for (let i = 0; i < checks.length; i++) {
    const [pattern, label] = checks[i]
    if (pattern.test(s)) return label
  }
  return "具体证据"
}

function dynamicFallbackLines(tag: string, focus: string): string[] {
  if (tag === "胸部安全") {
    return [
      `你提到${focus}，可以给我看下具体标准和执行流程吗？`,
      `我最担心的是安全风险，围绕${focus}你能说得再具体一点吗？`,
    ]
  }
  if (tag === "价格贵") {
    return [
      `你说了不少优势，但围绕${focus}，我想听到更清晰的价值对比。`,
      `如果按这个价格，关于${focus}你能给我更明确的承诺范围吗？`,
    ]
  }
  if (tag === "真实案例") {
    return [
      `你提到${focus}，能先给我一个和我情况相近的真实案例吗？`,
      `关于${focus}，有没有可验证的前后对比或顾客反馈？`,
    ]
  }
  return [
    `你提到${focus}，我希望看到更具体、可验证的信息。`,
    `我理解你的意思，不过围绕${focus}还需要更落地的依据。`,
  ]
}

function fallbackCustomerTurn(opts: {
  scenario: { seedTopics: string[] }
  history: Array<{ role: "customer" | "beautician"; text: string }>
  beauticianText: string
}): {
  text: string
  emotion: VoiceCoachEmotion
  tag: string
} {
  const defaultTag = String(opts.scenario.seedTopics?.[0] || "产品信任")
  const inferredTag = fallbackTagFromBeauticianText(opts.beauticianText, defaultTag)
  const focus = detectFocusKeyword(opts.beauticianText)
  const pool = Array.from(new Set([...dynamicFallbackLines(inferredTag, focus), ...fallbackTopicPool(inferredTag)]))

  const beauticianTurns = opts.history.filter((h) => h.role === "beautician").length
  const lastCustomer = [...opts.history].reverse().find((h) => h.role === "customer")
  const seedText = `${opts.beauticianText}|${lastCustomer?.text || ""}|${beauticianTurns}|${inferredTag}`
  let idx = quickHash(seedText) % pool.length
  let picked = pool[idx]

  if (lastCustomer && lastCustomer.text && lastCustomer.text.trim() === picked && pool.length > 1) {
    idx = (idx + 1) % pool.length
    picked = pool[idx]
  }

  return {
    text: picked,
    emotion: "skeptical",
    tag: inferredTag,
  }
}

function mergeResult(
  prev: VoiceCoachJobResultState | null | undefined,
  patch: Partial<VoiceCoachJobResultState>,
): VoiceCoachJobResultState {
  return {
    ...(prev || {}),
    ...(patch || {}),
  }
}

export async function emitVoiceCoachEvent(args: EmitEventArgs): Promise<number> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("voice_coach_events")
    .insert({
      session_id: args.sessionId,
      user_id: args.userId,
      turn_id: args.turnId || null,
      job_id: args.jobId || null,
      type: args.type,
      data_json: args.data || {},
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(error?.message || "voice_coach_event_insert_failed")
  return Number(data.id)
}

async function markJobError(args: {
  jobId: string
  sessionId: string
  userId: string
  turnId: string
  code: string
  message: string
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "error",
      stage: "error",
      last_error: args.message,
      finished_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", args.jobId)

  await admin.from("voice_coach_turns").update({ status: "error" }).eq("id", args.turnId).eq("session_id", args.sessionId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    type: "turn.error",
    data: {
      code: args.code,
      message: args.message,
      ts: nowIso(),
    },
  })
}

async function getSignedAudio(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

async function buildHistory(sessionId: string, turnIndex: number) {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from("voice_coach_turns")
    .select("role, text, emotion")
    .eq("session_id", sessionId)
    .lte("turn_index", turnIndex)
    .order("turn_index", { ascending: false })
    .limit(6)

  return (data || [])
    .slice()
    .reverse()
    .map((row: any) => ({
      role: row.role as "customer" | "beautician",
      text: String(row.text || ""),
      emotion: row.emotion ? (String(row.emotion) as VoiceCoachEmotion) : undefined,
    }))
}

async function queueNextStage(args: {
  jobId: string
  stage: Exclude<VoiceCoachJobStage, "done" | "error">
  result: VoiceCoachJobResultState
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "queued",
      stage: args.stage,
      updated_at: nowIso(),
      result_json: args.result,
    })
    .eq("id", args.jobId)
}

async function finishJob(args: {
  jobId: string
  result: VoiceCoachJobResultState
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "done",
      stage: "done",
      finished_at: nowIso(),
      updated_at: nowIso(),
      result_json: args.result,
    })
    .eq("id", args.jobId)
}

async function loadSessionAndTurn(args: {
  sessionId: string
  turnId: string
}): Promise<{ session: SessionRow; turn: BeauticianTurnRow } | null> {
  const admin = createAdminSupabaseClient()
  const [{ data: session, error: sessionError }, { data: turn, error: turnError }] = await Promise.all([
    admin
      .from("voice_coach_sessions")
      .select("id, scenario_id, category_id, policy_state_json, status")
      .eq("id", args.sessionId)
      .single(),
    admin
      .from("voice_coach_turns")
      .select("id, session_id, turn_index, role, text, audio_path, audio_seconds, status, intent_id, angle_id, analysis_json")
      .eq("id", args.turnId)
      .eq("session_id", args.sessionId)
      .single(),
  ])

  if (sessionError || !session || turnError || !turn) return null
  return {
    session: {
      id: String(session.id),
      scenario_id: String(session.scenario_id || "objection_safety"),
      category_id: session.category_id ? String(session.category_id) : null,
      policy_state_json: (session.policy_state_json || null) as VoiceCoachPolicyState | null,
      status: String(session.status || ""),
    },
    turn: {
      id: String(turn.id),
      session_id: String(turn.session_id),
      turn_index: Number(turn.turn_index || 0),
      role: String(turn.role || ""),
      text: turn.text ? String(turn.text) : "",
      audio_path: turn.audio_path ? String(turn.audio_path) : null,
      audio_seconds: asNumber(turn.audio_seconds),
      status: turn.status ? String(turn.status) : null,
      intent_id: turn.intent_id ? String(turn.intent_id) : null,
      angle_id: turn.angle_id ? String(turn.angle_id) : null,
      analysis_json: (turn.analysis_json || null) as TurnAnalysis | null,
    },
  }
}

async function processMainStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  payload: VoiceCoachJobPayload
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.session.status !== "active") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "session_not_active",
      message: "会话已结束或不存在",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (loaded.turn.role !== "beautician") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "turn_not_found",
      message: "未找到待处理的美容师回合",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  await admin.from("voice_coach_turns").update({ status: "processing" }).eq("id", args.turnId)

  const { data: replyTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion, intent_id, angle_id, line_id, turn_index")
    .eq("id", args.payload.reply_to_turn_id)
    .eq("session_id", args.sessionId)
    .single()

  if (!replyTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "reply_turn_not_found",
      message: "顾客回合不存在，无法继续识别",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioPath = loaded.turn.audio_path ? String(loaded.turn.audio_path) : null
  if (!audioPath) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "audio_missing",
      message: "录音文件缺失，请重录",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioBuf = await downloadVoiceCoachAudio(audioPath)
  const format = (args.payload.audio_format || "mp3") as "mp3" | "wav" | "ogg" | "raw" | "flac"

  if (format === "flac" && !shouldUseFlashAsr()) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "unsupported_audio_format",
      message: "当前仅支持 mp3/wav/ogg 录音，请调整录音格式后重试。",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  let asr: DoubaoAsrResult | null = null
  let asrProvider: "flash" | "auc" = "flash"
  let asrFallbackUsed = false
  const flashEnabled = shouldUseFlashAsr()
  const allowAucFallback = !flashEnabled || shouldAllowAucFallbackWhenFlashEnabled()
  const estimatedAudioSeconds = asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const canUseAucFallbackByDuration = !estimatedAudioSeconds || estimatedAudioSeconds >= 1.2
  let latestAsrError: unknown = null

  if (flashEnabled && format !== "raw") {
    try {
      const flashRes = await doubaoAsrFlash({
        audio: audioBuf,
        format: format as "mp3" | "wav" | "ogg" | "flac",
        uid: args.userId,
      })
      if (flashRes.text) {
        asr = flashRes
        asrProvider = "flash"
      } else {
        latestAsrError = new Error("asr_flash_empty")
      }
    } catch (err: any) {
      latestAsrError = err
      asr = null
    }
  }

  if ((!asr || !asr.text) && allowAucFallback && canUseAucFallbackByDuration) {
    asrFallbackUsed = true
    asrProvider = "auc"
    const signed = await signVoiceCoachAudio(audioPath)
    try {
      asr = (await Promise.race([
        doubaoAsrAuc({
          audioUrl: signed,
          format: format as "mp3" | "wav" | "ogg" | "raw",
          uid: args.userId,
        }),
        sleep(3500).then(() => {
          throw new Error("asr_timeout")
        }),
      ])) as DoubaoAsrResult
    } catch (err) {
      latestAsrError = err
      asr = null
    }
  }

  if (!asr || !asr.text) {
    const normalized = normalizeAsrFailure(latestAsrError)
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: normalized.code,
      message: normalized.message,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioSeconds = asr.durationSeconds || asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const wpm = calcWpm(asr.text, audioSeconds)
  const fillerRatio = calcFillerRatio(asr.text)
  const beauticianAudioUrl = await getSignedAudio(audioPath)

  const beauticianTurnNo = Math.floor((Number(loaded.turn.turn_index) + 1) / 2)
  const hardMax = hardMaxTurns()
  const reachedMax = hardMax > 0 && beauticianTurnNo >= hardMax

  await admin
    .from("voice_coach_turns")
    .update({
      text: asr.text,
      asr_confidence: asr.confidence,
      audio_seconds: audioSeconds,
      features_json: { wpm, filler_ratio: fillerRatio },
      intent_id: replyTurn.intent_id ? String(replyTurn.intent_id) : null,
      angle_id: replyTurn.angle_id ? String(replyTurn.angle_id) : null,
      status: "asr_ready",
    })
    .eq("id", args.turnId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    type: "beautician.asr_ready",
    data: {
      turn_id: args.turnId,
      text: asr.text,
      confidence: asr.confidence,
      audio_seconds: audioSeconds,
      audio_url: beauticianAudioUrl,
      asr_provider: asrProvider,
      asr_fallback_used: asrFallbackUsed,
      reached_max_turns: reachedMax,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  const stageResultBase = mergeResult(args.resultState, {
    pipeline_started_at_ms: pipelineStartedAt,
    reached_max_turns: reachedMax,
    reply_turn_id: String(replyTurn.id),
    beautician_turn_index: Number(loaded.turn.turn_index),
    beautician_text: asr.text,
    beautician_audio_url: beauticianAudioUrl,
    beautician_audio_seconds: audioSeconds,
    beautician_asr_confidence: asr.confidence,
  })

  if (reachedMax) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(stageResultBase, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const scenario = getScenario(String(loaded.session.scenario_id || "sale"))
  const categoryId = normalizeVoiceCoachCategoryId(String(loaded.session.category_id || scenario.categoryId))
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))
  const policyState = loaded.session.policy_state_json || createInitialPolicyState({ categoryId })
  const selection = selectNextCustomerLine({
    categoryId,
    policyState,
    beauticianText: asr.text,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  })

  const modelRewriteEnabled = String(process.env.VOICE_COACH_MODEL_REWRITE_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false"
  const modelRewriteRatio = Number(process.env.VOICE_COACH_MODEL_REWRITE_RATIO || 0.3)

  const rewritten = await maybeRewriteCustomerLine({
    enabled: modelRewriteEnabled,
    probability: Number.isFinite(modelRewriteRatio) ? modelRewriteRatio : 0.3,
    base: {
      text: selection.line.text,
      emotion: (selection.line.emotion || "skeptical") as VoiceCoachEmotion,
      tag: String(selection.line.tag || selection.line.intent_id || "跟进追问"),
    },
    rewrite: async () => {
      return llmRewriteCustomerLine({
        scenario,
        history,
        baseText: selection.line.text,
        intent: selection.intent_id,
        angle: selection.angle_id,
        category: categoryId,
      })
    },
  })

  const nextCustomer = {
    text: rewritten.text,
    emotion: rewritten.emotion,
    tag: rewritten.tag,
    line_id: selection.line.line_id,
    intent_id: selection.intent_id,
    angle_id: selection.angle_id,
    reply_source: rewritten.reply_source,
    loop_guard_triggered: selection.loop_guard_triggered,
  }

  await admin
    .from("voice_coach_sessions")
    .update({
      policy_state_json: selection.policy_state,
      category_id: categoryId,
    })
    .eq("id", args.sessionId)

  const customerTurnIndex = Number(loaded.turn.turn_index) + 1
  const { data: existingCustomerAtIndex } = await admin
    .from("voice_coach_turns")
    .select("id, role")
    .eq("session_id", args.sessionId)
    .eq("turn_index", customerTurnIndex)
    .maybeSingle()

  let nextCustomerTurnId = args.resultState.next_customer_turn_id || randomUUID()
  if (existingCustomerAtIndex?.id) {
    if (String(existingCustomerAtIndex.role || "") !== "customer") {
      await markJobError({
        jobId: args.jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId: args.turnId,
        code: "customer_turn_conflict",
        message: "对话状态冲突，请重试",
      })
      return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
    }

    nextCustomerTurnId = String(existingCustomerAtIndex.id)
    await admin
      .from("voice_coach_turns")
      .update({
        text: nextCustomer.text,
        emotion: nextCustomer.emotion,
        status: "text_ready",
        line_id: nextCustomer.line_id,
        intent_id: nextCustomer.intent_id,
        angle_id: nextCustomer.angle_id,
        reply_source: nextCustomer.reply_source,
        features_json: {
          tag: nextCustomer.tag,
          category_id: categoryId,
          intent_id: nextCustomer.intent_id,
          angle_id: nextCustomer.angle_id,
          loop_guard_triggered: nextCustomer.loop_guard_triggered,
        },
      })
      .eq("id", nextCustomerTurnId)
  } else {
    const { error: customerInsertError } = await admin.from("voice_coach_turns").insert({
      id: nextCustomerTurnId,
      session_id: args.sessionId,
      turn_index: customerTurnIndex,
      role: "customer",
      text: nextCustomer.text,
      emotion: nextCustomer.emotion,
      status: "text_ready",
      line_id: nextCustomer.line_id,
      intent_id: nextCustomer.intent_id,
      angle_id: nextCustomer.angle_id,
      reply_source: nextCustomer.reply_source,
      features_json: {
        tag: nextCustomer.tag,
        category_id: categoryId,
        intent_id: nextCustomer.intent_id,
        angle_id: nextCustomer.angle_id,
        loop_guard_triggered: nextCustomer.loop_guard_triggered,
      },
    })

    if (customerInsertError) {
      throw new Error(customerInsertError.message || "customer_turn_insert_failed")
    }
  }

  const fixedAnalysisTemplate = getAnalysisTemplate(categoryId, nextCustomer.intent_id)
  if (fixedAnalysisTemplate) {
    const fixedAnalysis = {
      suggestions: fixedAnalysisTemplate.suggestions.slice(0, 3),
      polished: fixedAnalysisTemplate.polished,
      highlights: [],
      risk_notes: [],
      source: "fixed",
    }
    await admin
      .from("voice_coach_turns")
      .update({
        analysis_json: fixedAnalysis,
      })
      .eq("id", args.turnId)
      .eq("session_id", args.sessionId)
  }

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    type: "customer.text_ready",
    data: {
      turn_id: nextCustomerTurnId,
      beautician_turn_id: args.turnId,
      text: nextCustomer.text,
      emotion: nextCustomer.emotion,
      category_id: categoryId,
      intent_id: nextCustomer.intent_id,
      angle_id: nextCustomer.angle_id,
      line_id: nextCustomer.line_id,
      reply_source: nextCustomer.reply_source,
      loop_guard_triggered: nextCustomer.loop_guard_triggered,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await queueNextStage({
    jobId: args.jobId,
    stage: "tts_pending",
    result: mergeResult(stageResultBase, {
      next_customer_turn_id: nextCustomerTurnId,
      next_customer_text: nextCustomer.text,
      next_customer_emotion: nextCustomer.emotion,
      next_customer_tag: nextCustomer.tag,
      category_id: categoryId,
      intent_id: nextCustomer.intent_id,
      angle_id: nextCustomer.angle_id,
      reply_source: nextCustomer.reply_source,
      loop_guard_triggered: nextCustomer.loop_guard_triggered,
      customer_text_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
}

async function processTtsStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const nextCustomerTurnId = String(args.resultState.next_customer_turn_id || "")
  if (!nextCustomerTurnId) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, { pipeline_started_at_ms: pipelineStartedAt }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const { data: customerTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion, audio_path, audio_seconds")
    .eq("id", nextCustomerTurnId)
    .eq("session_id", args.sessionId)
    .single()

  if (!customerTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "customer_turn_missing",
      message: "顾客回合不存在，无法生成语音",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  let audioUrl: string | null = null
  let audioSeconds: number | null = asNumber(customerTurn.audio_seconds)
  let audioPath: string | null = customerTurn.audio_path ? String(customerTurn.audio_path) : null
  let ttsFailed = false

  if (audioPath) {
    audioUrl = await getSignedAudio(audioPath)
  } else {
    const text = String(args.resultState.next_customer_text || customerTurn.text || "").trim()
    const emotion = (args.resultState.next_customer_emotion || customerTurn.emotion || "neutral") as VoiceCoachEmotion

    if (!text) {
      ttsFailed = true
    } else {
      try {
        const tts = await doubaoTts({
          text,
          emotion: mapEmotionToTts(emotion),
          uid: args.userId,
        })

        audioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          audioPath = `${args.userId}/${args.sessionId}/${nextCustomerTurnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPath)
        } else {
          ttsFailed = true
        }
      } catch {
        ttsFailed = true
      }
    }
  }

  await admin
    .from("voice_coach_turns")
    .update({
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioPath ? "audio_ready" : "text_ready",
      reply_source: args.resultState.reply_source || null,
    })
    .eq("id", nextCustomerTurnId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    type: "customer.audio_ready",
    data: {
      turn_id: nextCustomerTurnId,
      beautician_turn_id: args.turnId,
      audio_url: audioUrl,
      audio_seconds: audioSeconds,
      tts_failed: ttsFailed || !audioUrl,
      text: args.resultState.next_customer_text || String(customerTurn.text || ""),
      category_id: args.resultState.category_id || null,
      intent_id: args.resultState.intent_id || null,
      angle_id: args.resultState.angle_id || null,
      reply_source: args.resultState.reply_source || "fixed",
      loop_guard_triggered: Boolean(args.resultState.loop_guard_triggered),
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await finishJob({
    jobId: args.jobId,
    result: mergeResult(args.resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
      customer_audio_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
}

async function processAnalysisStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  payload: VoiceCoachJobPayload
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.turn.role !== "beautician") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "turn_not_found",
      message: "未找到待分析的美容师回合",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (loaded.turn.analysis_json) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const replyTurnId = String(args.payload.reply_to_turn_id || args.resultState.reply_turn_id || "")
  if (!replyTurnId) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const { data: replyTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion")
    .eq("id", replyTurnId)
    .eq("session_id", args.sessionId)
    .single()

  if (!replyTurn) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const scenario = getScenario(String(loaded.session.scenario_id || "objection_safety"))
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))

  try {
    const analysis = await llmAnalyzeBeauticianTurn({
      scenario,
      history,
      customerTurn: {
        text: String(replyTurn.text || ""),
        emotion: replyTurn.emotion ? (String(replyTurn.emotion) as VoiceCoachEmotion) : undefined,
      },
      beauticianText: String(loaded.turn.text || args.resultState.beautician_text || ""),
    })

    await admin
      .from("voice_coach_turns")
      .update({
        analysis_json: analysis,
        status: "analysis_ready",
      })
      .eq("id", args.turnId)

    await emitVoiceCoachEvent({
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      jobId: args.jobId,
      type: "beautician.analysis_ready",
      data: {
        turn_id: args.turnId,
        analysis,
        stage_elapsed_ms: Date.now() - pipelineStartedAt,
        ts: nowIso(),
      },
    })
  } catch {
    await emitVoiceCoachEvent({
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      jobId: args.jobId,
      type: "turn.error",
      data: {
        code: "analysis_failed",
        message: "建议生成稍慢，已跳过本次建议。",
        ts: nowIso(),
      },
    })
  }

  await finishJob({
    jobId: args.jobId,
    result: mergeResult(args.resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
    }),
  })

  return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
}

export async function processVoiceCoachJobById(args: {
  sessionId: string
  userId: string
  jobId: string
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()

  const { data: job, error: jobError } = await admin
    .from("voice_coach_jobs")
    .select("id, session_id, user_id, turn_id, status, stage, attempt_count, payload_json, result_json")
    .eq("id", args.jobId)
    .eq("session_id", args.sessionId)
    .eq("user_id", args.userId)
    .single()

  if (jobError || !job) return { processed: false, done: false }
  if (job.status !== "queued") return { processed: false, done: job.status === "done" }

  const stage = normalizeJobStage(job.stage)
  const nextAttempt = (job.attempt_count || 0) + 1

  const { data: claimed, error: claimError } = await admin
    .from("voice_coach_jobs")
    .update({
      status: "processing",
      stage,
      attempt_count: nextAttempt,
      updated_at: nowIso(),
      last_error: null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, turn_id, stage, payload_json, result_json")
    .single()

  if (claimError || !claimed) return { processed: false, done: false }

  const payload = (claimed.payload_json || {}) as VoiceCoachJobPayload
  const resultState = (claimed.result_json || {}) as VoiceCoachJobResultState
  const turnId = String(claimed.turn_id)
  const jobId = String(claimed.id)

  try {
    if (stage === "main_pending") {
      return await processMainStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        payload,
        resultState,
      })
    }

    if (stage === "tts_pending") {
      return await processTtsStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        resultState,
      })
    }

    if (stage === "analysis_pending") {
      return await processAnalysisStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        payload,
        resultState,
      })
    }

    if (stage === "done") {
      await finishJob({ jobId, result: resultState })
      return { processed: true, done: true, jobId, turnId }
    }

    await markJobError({
      jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId,
      code: "invalid_job_stage",
      message: `未知任务阶段: ${String(job.stage || "")}`,
    })
    return { processed: true, done: true, jobId, turnId }
  } catch (err: any) {
    await markJobError({
      jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId,
      code: "voice_coach_error",
      message: err?.message || String(err),
    })
    return { processed: true, done: true, jobId, turnId }
  }
}

export async function pumpVoiceCoachQueuedJobs(args: {
  sessionId: string
  userId: string
  maxJobs?: number
  allowedStages?: Array<VoiceCoachJobStage>
  maxWallMs?: number
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const maxJobs = Math.max(1, Math.min(5, Number(args.maxJobs || 1) || 1))
  const maxWallMs = Math.max(200, Number(args.maxWallMs || 1200) || 1200)
  const allowedStagesSet = Array.isArray(args.allowedStages) && args.allowedStages.length ? new Set(args.allowedStages) : null
  const staleBeforeIso = new Date(Date.now() - processingStaleMs()).toISOString()
  const deadline = Date.now() + maxWallMs

  // Recover stale processing jobs so polling won't wait forever when a previous invocation was interrupted.
  const { data: staleJobs } = await admin
    .from("voice_coach_jobs")
    .select("id, stage")
    .eq("session_id", args.sessionId)
    .eq("user_id", args.userId)
    .eq("status", "processing")
    .lt("updated_at", staleBeforeIso)
    .order("updated_at", { ascending: true })
    .limit(5)

  if (staleJobs && staleJobs.length > 0) {
    for (let i = 0; i < staleJobs.length; i++) {
      const stale = staleJobs[i]
      if (!stale?.id) continue
      const staleStage = normalizeJobStage(stale.stage)
      await admin
        .from("voice_coach_jobs")
        .update({
          status: "queued",
          stage: staleStage,
          last_error: "requeued_stale_processing",
          updated_at: nowIso(),
        })
        .eq("id", String(stale.id))
        .eq("status", "processing")
    }
  }

  let processed = 0
  for (let i = 0; i < maxJobs; i++) {
    if (Date.now() >= deadline) break

    let queuedQuery = admin
      .from("voice_coach_jobs")
      .select("id, stage")
      .eq("session_id", args.sessionId)
      .eq("user_id", args.userId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)

    if (allowedStagesSet) {
      queuedQuery = queuedQuery.in("stage", Array.from(allowedStagesSet))
    }

    const { data: queued } = await queuedQuery

    const jobId = queued?.[0]?.id ? String(queued[0].id) : ""
    if (!jobId) break

    const result = await processVoiceCoachJobById({
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
    })

    if (!result.processed) {
      // Avoid hot loop when another request claimed it.
      await sleep(80)
      continue
    }

    processed += 1
  }

  return processed
}
