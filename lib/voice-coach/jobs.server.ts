import "server-only"

import { randomUUID } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { llmAnalyzeBeauticianTurn, llmGenerateCustomerTurn, type TurnAnalysis } from "@/lib/voice-coach/llm.server"
import { calcFillerRatio, calcWpm, computePerTurnScores } from "@/lib/voice-coach/metrics"
import { getVoiceCoachSessionPromptContext } from "@/lib/voice-coach/session-context"
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
import { normalizeScenarioTag } from "@/lib/voice-coach/tag-utils"

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
  next_customer_turn_id?: string
  next_customer_turn_index?: number
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
  status: string
  scenario_snapshot_json?: unknown
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
  analysis_json: TurnAnalysis | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const HTTP_FALLBACK_TIMEOUT_CAP_MS = 25000
const HTTP_FALLBACK_POLL_INTERVAL_MS = 150

function stageElapsed(startedAtMs: number) {
  return Date.now() - startedAtMs
}

function logVoiceCoachJob(event: string, fields: Record<string, unknown>) {
  console.info(`[voice-coach-job] ${event}`, fields)
}

function maxTurns(): number {
  return Math.max(1, Number(process.env.VOICE_COACH_MAX_TURNS || 10) || 10)
}

function mapEmotionToTts(emotion?: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  void emotion
  return "neutral"
}

function shouldUseFlashAsr(): boolean {
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

function shouldAllowAucFallbackWhenFlashEnabled(): boolean {
  const raw = String(process.env.VOICE_COACH_ASR_ALLOW_AUC_FALLBACK || "false")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function processingStaleMs(): number {
  const n = Number(process.env.VOICE_COACH_PROCESSING_STALE_MS || 20000)
  if (!Number.isFinite(n) || n < 5000) return 20000
  return Math.min(Math.round(n), HTTP_FALLBACK_TIMEOUT_CAP_MS)
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function turnIndexOrNull(value: unknown, fallback?: unknown): number | null {
  const primary = asNumber(value)
  if (primary !== null) return primary
  return asNumber(fallback)
}

function isAsrSilenceError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  return msg.includes("asr_auc_silence") || msg.includes("asr_silence")
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

function jobStagePriority(raw: unknown): number {
  const stage = normalizeJobStage(raw)
  if (stage === "main_pending") return 0
  if (stage === "tts_pending") return 1
  if (stage === "analysis_pending") return 2
  if (stage === "done") return 3
  return 4
}

function fallbackTagFromBeauticianText(text: string, defaultTag: string) {
  const s = String(text || "")
  if (/价格|贵|优惠|折扣|套餐|会员|性价比/.test(s)) return "价格价值"
  if (/证书|资质|认证|安全|风险|规范|卫生|恢复|过敏|敏感/.test(s)) return "安全恢复"
  if (/推销|办卡|套路|服务|变样|售后|信任/.test(s)) return "服务信任"
  if (/案例|照片|前后|反馈|对比|见证/.test(s)) return "真实案例"
  if (/效果|见效|多久|改善|维持|反应/.test(s)) return "效果预期"
  return defaultTag
}

function fallbackTopicPool(tag: string): string[] {
  if (tag === "安全恢复") {
    return [
      "你说安全我理解，但具体有哪些资质、操作规范和恢复期边界可以给我看吗？",
      "如果我有些敏感体质，这个项目怎么评估适不适合我？",
      "能不能说下你们在安全和恢复期管理上最关键的两三条保障？",
    ]
  }
  if (tag === "价格价值") {
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
  if (tag === "服务信任") {
    return [
      "我最怕今天体验很好，后面服务和现在完全两套说法。",
      "你先别急着推荐，我更想知道后面会不会一直推销和加项。",
      "如果我现在只是先了解，你们后面是怎么跟进的？",
    ]
  }
  if (tag === "效果预期") {
    return [
      "我更关心多久能看到变化，以及看不到时你们会怎么判断。",
      "如果效果不明显，通常是继续调整还是说明不适合我？",
      "你说得挺多，我想先知道效果边界到底在哪里。",
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
    [/体验|试做|试试看|先做一次|先体验|低风险/, "先体验再决定"],
    [/效果|舒服|不舒服|反应|变化|改善/, "效果和身体反应"],
    [/长期|一直做|多久|频率|周期|维持/, "长期安排和频率"],
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
  if (focus === "先体验再决定") {
    return [
      "如果先低风险体验一次，你们通常怎么安排，做到什么程度我才能判断值不值得继续？",
      "要是先试一次，你们怎么控制风险，让我有把握再决定后续要不要长期做？",
    ]
  }
  if (focus === "效果和身体反应") {
    return [
      "我更在意做完之后身体会有什么反应，你能具体说说正常反馈和需要注意的点吗？",
      "如果我做完觉得不舒服或者效果不明显，你们一般怎么判断是不是适合继续？",
    ]
  }
  if (focus === "长期安排和频率") {
    return [
      "如果后面要长期做，频率和阶段安排通常怎么定，什么情况下需要停一停？",
      "你说可以长期维护，那具体多久做一次、做到什么阶段才算稳定？",
    ]
  }
  if (tag === "安全恢复") {
    return [
      `你提到${focus}，可以给我看下具体标准和执行流程吗？`,
      `我最担心的是安全风险，围绕${focus}你能说得再具体一点吗？`,
    ]
  }
  if (tag === "价格价值") {
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
  if (tag === "服务信任") {
    return [
      `你提到${focus}，但我更关心后面服务会不会和现在一样稳定。`,
      `围绕${focus}，你能先把后续服务和跟进方式讲清楚吗？`,
    ]
  }
  if (tag === "效果预期") {
    return [
      `你提到${focus}，那效果到底多久看、看到什么程度才算合理？`,
      `围绕${focus}，你能把效果边界和不适合继续的情况说清楚吗？`,
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
  const defaultTag = String(opts.scenario.seedTopics?.[0] || "服务信任")
  const inferredTag = fallbackTagFromBeauticianText(opts.beauticianText, defaultTag)
  const lastCustomer = [...opts.history].reverse().find((h) => h.role === "customer")
  const continuityAnchor = detectFocusKeyword(`${lastCustomer?.text || ""} ${opts.beauticianText}`)
  const focus = continuityAnchor || detectFocusKeyword(opts.beauticianText)
  const pool = Array.from(new Set([...dynamicFallbackLines(inferredTag, focus), ...fallbackTopicPool(inferredTag)]))

  const beauticianTurns = opts.history.filter((h) => h.role === "beautician").length
  const continuityLines =
    lastCustomer && String(lastCustomer.text || "").trim()
      ? [
          `我还是回到刚才说的${continuityAnchor}，你能说得更具体一点吗？`,
          `你刚才回应了，但关于${continuityAnchor}我还想再确认一下。`,
          `围绕${continuityAnchor}，你能给我一个更直接的依据吗？`,
        ]
      : []
  const mergedPool = Array.from(new Set([...continuityLines, ...pool]))
  const seedText = `${opts.beauticianText}|${lastCustomer?.text || ""}|${beauticianTurns}|${inferredTag}`
  let idx = quickHash(seedText) % mergedPool.length
  let picked = mergedPool[idx]

  if (lastCustomer && lastCustomer.text && lastCustomer.text.trim() === picked && mergedPool.length > 1) {
    idx = (idx + 1) % mergedPool.length
    picked = mergedPool[idx]
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

  logVoiceCoachJob("job.error", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    code: args.code,
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
      .select("id, scenario_id, status, scenario_snapshot_json")
      .eq("id", args.sessionId)
      .single(),
    admin
      .from("voice_coach_turns")
      .select("id, session_id, turn_index, role, text, audio_path, audio_seconds, status, analysis_json")
      .eq("id", args.turnId)
      .eq("session_id", args.sessionId)
      .single(),
  ])

  if (sessionError || !session || turnError || !turn) return null
  return {
    session: {
      id: String(session.id),
      scenario_id: String(session.scenario_id || "objection_safety"),
      status: String(session.status || ""),
      scenario_snapshot_json: session.scenario_snapshot_json || null,
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
  const stageStartedAt = Date.now()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())
  logVoiceCoachJob("main.start", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    replyToTurnId: args.payload.reply_to_turn_id,
  })

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
    .select("id, text, emotion, turn_index")
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
  const asrStartedAt = Date.now()

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
  let flashAttempted = false
  let flashErrorMessage = ""
  let aucFallbackUsed = false
  const flashEnabled = shouldUseFlashAsr()
  const allowAucFallback = !flashEnabled || shouldAllowAucFallbackWhenFlashEnabled()

  if (flashEnabled && format !== "raw") {
    flashAttempted = true
    try {
      asr = await doubaoAsrFlash({
        audio: audioBuf,
        format: format as "mp3" | "wav" | "ogg" | "flac",
        uid: args.userId,
      })
    } catch (err: any) {
      flashErrorMessage = String(err?.message || err || "")
      asr = null
    }
  }

  if ((!asr || !asr.text) && allowAucFallback) {
    aucFallbackUsed = true
    const signed = await signVoiceCoachAudio(audioPath)
    try {
      asr = await doubaoAsrAuc({
        audioUrl: signed,
        format: format as "mp3" | "wav" | "ogg" | "raw",
        uid: args.userId,
      })
    } catch (err) {
      if (isAsrSilenceError(err)) {
        await markJobError({
          jobId: args.jobId,
          sessionId: args.sessionId,
          userId: args.userId,
          turnId: args.turnId,
          code: "asr_silence",
          message: "没有识别到有效语音，请重录并靠近麦克风。",
        })
        return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
      }
      throw err
    }
  }

  if ((!asr || !asr.text) && flashAttempted && !allowAucFallback) {
    const asrMsg = flashErrorMessage.includes("timeout")
      ? "语音识别超时，请重录并靠近麦克风。"
      : "未识别到有效语音，请重录。"
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: flashErrorMessage.includes("timeout") ? "asr_flash_timeout" : "asr_empty",
      message: asrMsg,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (!asr || !asr.text) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "asr_empty",
      message: "识别内容为空，请重录",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioSeconds = asr.durationSeconds || asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const wpm = calcWpm(asr.text, audioSeconds)
  const fillerRatio = calcFillerRatio(asr.text)
  const beauticianAudioUrl = await getSignedAudio(audioPath)

  logVoiceCoachJob("main.asr", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    elapsedMs: stageElapsed(asrStartedAt),
    format,
    flashEnabled,
    flashAttempted,
    aucFallbackUsed,
    textLength: asr.text.length,
    confidence: asr.confidence,
  })

  const beauticianTurnNo = Math.floor((Number(loaded.turn.turn_index) + 1) / 2)
  const reachedMax = beauticianTurnNo >= maxTurns()

  await admin
    .from("voice_coach_turns")
    .update({
      text: asr.text,
      asr_confidence: asr.confidence,
      audio_seconds: audioSeconds,
      features_json: { wpm, filler_ratio: fillerRatio },
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
      turn_index: Number.isFinite(Number(loaded.turn.turn_index)) ? Number(loaded.turn.turn_index) : null,
      text: asr.text,
      confidence: asr.confidence,
      audio_seconds: audioSeconds,
      audio_url: beauticianAudioUrl,
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
    await queueNextStage({
      jobId: args.jobId,
      stage: "analysis_pending",
      result: stageResultBase,
    })
    return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
  }

  const scenario = getScenario(String(loaded.session.scenario_id || "objection_safety"))
  const sessionContextText = getVoiceCoachSessionPromptContext(loaded.session.scenario_snapshot_json)
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))
  const llmStartedAt = Date.now()

  let nextCustomer = fallbackCustomerTurn({
    scenario,
    history,
    beauticianText: asr.text,
  })
  let llmFallbackUsed = false
  let llmFallbackReason = ""
  try {
    nextCustomer = await llmGenerateCustomerTurn({
      scenario,
      history,
      target:
        "Continue the same objection thread. Directly follow up on the beautician's latest reply, and ask for one concrete proof point, condition, example, risk-control detail, trial arrangement, or next step tied to what they just said.",
      sessionContextText: sessionContextText || undefined,
    })
  } catch (err: any) {
    llmFallbackUsed = true
    llmFallbackReason = err?.message || String(err || "")
    nextCustomer = fallbackCustomerTurn({
      scenario,
      history,
      beauticianText: asr.text,
    })
  }
  const normalizedNextCustomerTag = normalizeScenarioTag(nextCustomer.tag, scenario)

  const customerTurnIndex = Number(loaded.turn.turn_index) + 1
  const nextCustomerTurnIndex = turnIndexOrNull(customerTurnIndex, args.resultState.next_customer_turn_index)
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
        features_json: { tag: normalizedNextCustomerTag },
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
      features_json: { tag: normalizedNextCustomerTag },
    })

    if (customerInsertError) {
      throw new Error(customerInsertError.message || "customer_turn_insert_failed")
    }
  }

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    type: "customer.text_ready",
    data: {
      turn_id: nextCustomerTurnId,
      turn_index: nextCustomerTurnIndex,
      beautician_turn_id: args.turnId,
      text: nextCustomer.text,
      emotion: nextCustomer.emotion,
      llm_fallback_used: llmFallbackUsed,
      llm_fallback_reason: llmFallbackReason || null,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  logVoiceCoachJob("main.customer_text_ready", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    nextCustomerTurnId,
    nextCustomerTurnIndex,
    llmElapsedMs: stageElapsed(llmStartedAt),
    llmFallbackUsed,
    totalElapsedMs: stageElapsed(stageStartedAt),
  })

  await queueNextStage({
    jobId: args.jobId,
    stage: "tts_pending",
    result: mergeResult(stageResultBase, {
      next_customer_turn_id: nextCustomerTurnId,
      next_customer_turn_index: nextCustomerTurnIndex ?? undefined,
      next_customer_text: nextCustomer.text,
      next_customer_emotion: nextCustomer.emotion,
      next_customer_tag: normalizedNextCustomerTag,
      customer_text_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  logVoiceCoachJob("main.done", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    nextStage: "tts_pending",
    reachedMax,
    totalElapsedMs: stageElapsed(stageStartedAt),
    pipelineElapsedMs: stageElapsed(pipelineStartedAt),
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
  const stageStartedAt = Date.now()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())
  logVoiceCoachJob("tts.start", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    nextCustomerTurnId: args.resultState.next_customer_turn_id || "",
  })

  const nextCustomerTurnId = String(args.resultState.next_customer_turn_id || "")
  if (!nextCustomerTurnId) {
    await queueNextStage({
      jobId: args.jobId,
      stage: "analysis_pending",
      result: mergeResult(args.resultState, { pipeline_started_at_ms: pipelineStartedAt }),
    })
    return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
  }

  const { data: customerTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion, audio_path, audio_seconds, turn_index")
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
  const customerTurnIndex = turnIndexOrNull(customerTurn.turn_index, args.resultState.next_customer_turn_index)
  let ttsFailed = false
  let cacheHit = false

  if (audioPath) {
    cacheHit = true
    audioUrl = await getSignedAudio(audioPath)
  } else {
    const text = String(args.resultState.next_customer_text || customerTurn.text || "").trim()
    const emotion = (args.resultState.next_customer_emotion || customerTurn.emotion || "neutral") as VoiceCoachEmotion

    if (!text) {
      ttsFailed = true
    } else {
      const synthStartedAt = Date.now()
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
        logVoiceCoachJob("tts.synth", {
          jobId: args.jobId,
          sessionId: args.sessionId,
          turnId: args.turnId,
          nextCustomerTurnId,
          elapsedMs: stageElapsed(synthStartedAt),
          textLength: text.length,
          audioSeconds,
          hasAudio: Boolean(audioUrl),
        })
      } catch {
        ttsFailed = true
        logVoiceCoachJob("tts.synth", {
          jobId: args.jobId,
          sessionId: args.sessionId,
          turnId: args.turnId,
          nextCustomerTurnId,
          elapsedMs: stageElapsed(synthStartedAt),
          textLength: text.length,
          hasAudio: false,
          failed: true,
        })
      }
    }
  }

  await admin
    .from("voice_coach_turns")
    .update({
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioPath ? "audio_ready" : "text_ready",
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
      turn_index: customerTurnIndex,
      beautician_turn_id: args.turnId,
      audio_url: audioUrl,
      audio_seconds: audioSeconds,
      tts_failed: ttsFailed || !audioUrl,
      text: args.resultState.next_customer_text || String(customerTurn.text || ""),
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await queueNextStage({
    jobId: args.jobId,
    stage: "analysis_pending",
    result: mergeResult(args.resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
      customer_audio_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  logVoiceCoachJob("tts.done", {
    jobId: args.jobId,
    sessionId: args.sessionId,
    turnId: args.turnId,
    nextCustomerTurnId,
    customerTurnIndex,
    cacheHit,
    ttsFailed,
    hasAudio: Boolean(audioUrl),
    totalElapsedMs: stageElapsed(stageStartedAt),
    pipelineElapsedMs: stageElapsed(pipelineStartedAt),
  })

  return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
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
  const sessionContextText = getVoiceCoachSessionPromptContext(loaded.session.scenario_snapshot_json)
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
      sessionContextText: sessionContextText || undefined,
    })

    // Compute per-turn dimension scores
    const beauticianText = String(loaded.turn.text || args.resultState.beautician_text || "")
    const wpm = calcWpm(beauticianText, loaded.turn.audio_seconds)
    const fillerRatio = calcFillerRatio(beauticianText)
    const asrConf = typeof args.resultState.beautician_asr_confidence === "number" ? args.resultState.beautician_asr_confidence : null

    analysis.per_turn_scores = computePerTurnScores({
      wpm,
      fillerRatio,
      asrConfidence: asrConf,
      llmPersuasion: analysis.persuasion_score,
      llmOrganization: analysis.organization_score,
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
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const pumpStartedAt = Date.now()
  const maxJobs = Math.max(1, Math.min(5, Number(args.maxJobs || 1) || 1))
  const staleBeforeIso = new Date(Date.now() - processingStaleMs()).toISOString()

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

  const staleRequeueCount = staleJobs?.length || 0
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
    const { data: queued } = await admin
      .from("voice_coach_jobs")
      .select("id, stage, created_at")
      .eq("session_id", args.sessionId)
      .eq("user_id", args.userId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(20)

    const picked = (queued || [])
      .slice()
      .sort((a: any, b: any) => {
        const priorityDiff = jobStagePriority(a?.stage) - jobStagePriority(b?.stage)
        if (priorityDiff !== 0) return priorityDiff
        return new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime()
      })[0]

    const jobId = picked?.id ? String(picked.id) : ""
    if (!jobId) break
    const stage = normalizeJobStage(picked?.stage)

    const jobStartedAt = Date.now()
    const result = await processVoiceCoachJobById({
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
    })

    if (!result.processed) {
      // Avoid hot loop when another request claimed it.
      await sleep(HTTP_FALLBACK_POLL_INTERVAL_MS)
      continue
    }

    processed += 1
    logVoiceCoachJob("pump.job", {
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
      stage,
      elapsedMs: stageElapsed(jobStartedAt),
      done: result.done,
    })
  }

  if (processed > 0 || staleRequeueCount > 0 || stageElapsed(pumpStartedAt) >= 500) {
    logVoiceCoachJob("pump.done", {
      sessionId: args.sessionId,
      userId: args.userId,
      processed,
      staleRequeueCount,
      maxJobs,
      elapsedMs: stageElapsed(pumpStartedAt),
    })
  }

  return processed
}

export async function pumpVoiceCoachAnalysisJobs(args: {
  sessionId: string
  userId: string
  maxJobs?: number
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const pumpStartedAt = Date.now()
  const maxJobs = Math.max(1, Math.min(5, Number(args.maxJobs || 1) || 1))
  const staleBeforeIso = new Date(Date.now() - processingStaleMs()).toISOString()

  const { data: staleJobs } = await admin
    .from("voice_coach_jobs")
    .select("id")
    .eq("session_id", args.sessionId)
    .eq("user_id", args.userId)
    .eq("status", "processing")
    .eq("stage", "analysis_pending")
    .lt("updated_at", staleBeforeIso)
    .order("updated_at", { ascending: true })
    .limit(5)

  const staleRequeueCount = staleJobs?.length || 0
  if (staleJobs && staleJobs.length > 0) {
    for (let i = 0; i < staleJobs.length; i += 1) {
      const stale = staleJobs[i]
      if (!stale?.id) continue
      await admin
        .from("voice_coach_jobs")
        .update({
          status: "queued",
          stage: "analysis_pending",
          last_error: "requeued_stale_processing",
          updated_at: nowIso(),
        })
        .eq("id", String(stale.id))
        .eq("status", "processing")
    }
  }

  let processed = 0
  for (let i = 0; i < maxJobs; i += 1) {
    const { data: queued } = await admin
      .from("voice_coach_jobs")
      .select("id")
      .eq("session_id", args.sessionId)
      .eq("user_id", args.userId)
      .eq("status", "queued")
      .eq("stage", "analysis_pending")
      .order("created_at", { ascending: true })
      .limit(1)

    const jobId = queued?.[0]?.id ? String(queued[0].id) : ""
    if (!jobId) break

    const jobStartedAt = Date.now()
    const result = await processVoiceCoachJobById({
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
    })

    if (!result.processed) {
      await sleep(HTTP_FALLBACK_POLL_INTERVAL_MS)
      continue
    }

    processed += 1
    logVoiceCoachJob("pump.analysis.job", {
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
      elapsedMs: stageElapsed(jobStartedAt),
      done: result.done,
    })
  }

  if (processed > 0 || staleRequeueCount > 0 || stageElapsed(pumpStartedAt) >= 500) {
    logVoiceCoachJob("pump.analysis.done", {
      sessionId: args.sessionId,
      userId: args.userId,
      processed,
      staleRequeueCount,
      maxJobs,
      elapsedMs: stageElapsed(pumpStartedAt),
    })
  }

  return processed
}
