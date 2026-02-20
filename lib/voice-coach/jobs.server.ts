import "server-only"

import { randomUUID } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { llmAnalyzeBeauticianTurn, llmRewriteCustomerLine, type TurnAnalysis } from "@/lib/voice-coach/llm.server"
import { calcFillerRatio, calcWpm } from "@/lib/voice-coach/metrics"
import {
  createInitialPolicyState,
  getAnalysisTemplate,
  getSeedAudioPathForLineId,
  maybeRewriteCustomerLine,
  normalizeVoiceCoachCategoryId,
  selectNextCustomerLine,
  type VoiceCoachPolicyState,
} from "@/lib/voice-coach/script-packs"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import {
  buildTtsCacheKey,
  buildTtsLineCacheKey,
  doubaoAsrAuc,
  doubaoAsrFlash,
  doubaoTts,
  type DoubaoAsrResult,
  type DoubaoTtsEmotion,
} from "@/lib/voice-coach/speech/doubao.server"
import {
  VOICE_COACH_AUDIO_BUCKET,
  downloadVoiceCoachAudio,
  signVoiceCoachAudio,
  uploadVoiceCoachAudio,
  voiceCoachAudioExists,
} from "@/lib/voice-coach/storage.server"
import { resolveVoiceCoachServerBuild } from "@/lib/voice-coach/trace.server"

const resolveSeedAudioPathForLineId: (lineId: string | null | undefined) => string | null =
  typeof getSeedAudioPathForLineId === "function" ? getSeedAudioPathForLineId : () => null

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

export type VoiceCoachJobStage = "main_pending" | "tts_pending" | "analysis_pending" | "done" | "error"
export type VoiceCoachJobExecutor = "events_pump" | "submit_pump" | "worker" | "manual"
type VoiceCoachStableTtsSource = "line_cache" | "text_cache" | "runtime"
type VoiceCoachTtsSourceDistribution = {
  line_cache: number
  text_cache: number
  runtime: number
}

type VoiceCoachJobResultState = {
  pipeline_started_at_ms?: number
  tts_queued_at_ms?: number
  stage_entered_at_ms?: number
  picked_at_ms?: number
  picked_at?: string
  claim_attempt_count?: number
  lock_owner?: string
  trace_id?: string
  client_build?: string
  server_build?: string
  executor?: VoiceCoachJobExecutor
  submit_ack_ms?: number
  upload_ms?: number
  asr_ms?: number
  asr_ready_ms?: number
  asr_queue_wait_ms?: number
  asr_provider_attempted?: Array<"flash" | "auc">
  asr_provider_final?: "flash" | "auc" | null
  asr_outcome?: "success" | "fallback_success" | "failed"
  queue_wait_before_main_ms?: number
  queue_wait_before_tts_ms?: number | null
  queue_wait_before_tts_valid?: boolean
  queue_wait_before_tts_source?: "tts_queued_at_ms" | "stage_entered_at_ms" | "missing_anchor"
  script_select_ms?: number
  llm_ms?: number
  text_ready_ms?: number
  tts_ms?: number
  tts_cache_hit?: boolean
  tts_cache_hit_rate?: number
  tts_cache_hit_rounds?: number
  tts_rounds_total?: number
  llm_used?: boolean
  script_hit?: boolean
  script_hit_rate?: number
  script_hit_rounds?: number
  tts_line_cache_hit_rate?: number
  tts_line_cache_hit_rounds?: number
  tts_source_distribution?: VoiceCoachTtsSourceDistribution
  llm_used_when_script_hit_count?: number
  end_to_end_ms?: number
  reached_max_turns?: boolean
  reply_turn_id?: string
  beautician_turn_index?: number
  beautician_text?: string
  beautician_audio_url?: string | null
  beautician_audio_seconds?: number | null
  beautician_asr_confidence?: number | null
  flash_request_id?: string | null
  flash_logid?: string | null
  auc_request_id?: string | null
  auc_logid?: string | null
  category_id?: string
  intent_id?: string
  angle_id?: string
  reply_source?: string
  loop_guard_triggered?: boolean
  next_customer_turn_id?: string
  next_customer_line_id?: string
  next_customer_text?: string
  next_customer_emotion?: VoiceCoachEmotion
  next_customer_tag?: string
  customer_text_elapsed_ms?: number
  customer_audio_elapsed_ms?: number
  asr_error?: {
    provider: "flash" | "auc"
    code: string
    message?: string
    http_status?: number | null
    api_status?: string | null
    api_code?: string | null
    api_message?: string | null
    appid_last4?: string | null
    resource_id?: string | null
    operation_hint?: string | null
  } | null
}

type EmitEventArgs = {
  sessionId: string
  userId: string
  type: VoiceCoachEventType
  turnId?: string | null
  jobId?: string | null
  data?: Record<string, unknown> | null
  traceId?: string | null
  clientBuild?: string | null
  serverBuild?: string | null
  executor?: VoiceCoachJobExecutor
}

type ProcessJobResult = {
  processed: boolean
  done: boolean
  jobId?: string
  turnId?: string
  nextStage?: VoiceCoachJobStage
  nextResultState?: VoiceCoachJobResultState
}

export type VoiceCoachQueuedJobRecord = {
  id: string
  sessionId: string
  userId: string
  stage: VoiceCoachJobStage
  createdAt: string
  turnId?: string
  attemptCount?: number
  payload?: VoiceCoachJobPayload
  resultState?: VoiceCoachJobResultState
  updatedAt?: string
}

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
  const raw = String(process.env.VOICE_COACH_ASR_ENABLE_FLASH || "true")
    .trim()
    .toLowerCase()
  return !["0", "false", "off", "no"].includes(raw)
}

let flashResourcePermissionDenied = false

function isAsrFlashPermissionDenied(err: unknown): boolean {
  const anyErr = (err || {}) as Record<string, unknown>
  const code = typeof anyErr.code === "string" ? anyErr.code : ""
  const apiStatus = typeof anyErr.api_status === "string" ? anyErr.api_status : ""
  const apiCode = typeof anyErr.api_code === "string" ? anyErr.api_code : ""
  const apiMessage = typeof anyErr.api_message === "string" ? anyErr.api_message : ""
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  if (code === "asr_flash_http_403") {
    return apiStatus === "45000030" || apiCode === "45000030" || apiMessage.includes("45000030")
  }
  if (code === "asr_flash_permission_denied") return true
  if (apiStatus === "45000030" || apiCode === "45000030") return true
  if (!msg) return false
  return msg.includes("45000030") || msg.includes("requested resource not granted")
}

function shouldAllowAucFallbackWhenFlashEnabled(): boolean {
  const raw = String(process.env.VOICE_COACH_ASR_ALLOW_AUC_FALLBACK || "true")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function shouldRequireFlashAsr(): boolean {
  const raw = String(process.env.VOICE_COACH_REQUIRE_FLASH || "false")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function asrAucTotalTimeoutMs(): number {
  const n = Number(process.env.VOICE_COACH_ASR_AUC_TOTAL_TIMEOUT_MS || 9000)
  if (!Number.isFinite(n)) return 9000
  return Math.max(3500, Math.min(15000, Math.round(n)))
}

function processingStaleMs(): number {
  const n = Number(process.env.VOICE_COACH_PROCESSING_STALE_MS || 45000)
  if (!Number.isFinite(n) || n < 10000) return 45000
  return Math.round(n)
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function normalizeInlineText(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
}

function parseIsoToMs(value: unknown): number | null {
  const raw = String(value || "").trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

function nonNegativeMs(value: unknown): number | null {
  const n = asNumber(value)
  if (n === null) return null
  return Math.max(0, Math.round(n))
}

function calcQueueWaitBeforeTts(args: {
  nowMs: number
  ttsQueuedAtMs: number | null
  stageEnteredAtMs: number | null
}): {
  valueMs: number | null
  valid: boolean
  source: "tts_queued_at_ms" | "stage_entered_at_ms" | "missing_anchor"
} {
  const anchorMs = args.ttsQueuedAtMs ?? args.stageEnteredAtMs
  if (anchorMs === null) {
    return {
      valueMs: null,
      valid: false,
      source: "missing_anchor",
    }
  }
  return {
    valueMs: nonNegativeMs(args.nowMs - anchorMs),
    valid: true,
    source: args.ttsQueuedAtMs !== null ? "tts_queued_at_ms" : "stage_entered_at_ms",
  }
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

  if (isAsrFlashPermissionDenied(err)) {
    return {
      code: "asr_failed",
      message: "Flash ASR 权限未开通，请联系管理员处理权限后重试。",
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

type AsrErrorMeta = {
  provider: "flash" | "auc"
  code: string
  message: string
  http_status: number | null
  api_status: string | null
  api_code: string | null
  api_message: string | null
  request_id: string | null
  logid: string | null
  submit_logid: string | null
  query_logid: string | null
  appid_last4: string | null
  resource_id: string | null
  operation_hint: string | null
}

function asrErrorMeta(err: unknown, provider: "flash" | "auc"): AsrErrorMeta {
  const anyErr = (err || {}) as Record<string, unknown>
  const message = typeof anyErr.message === "string" ? anyErr.message : String(err || "")
  const rawCode =
    typeof anyErr.code === "string"
      ? String(anyErr.code)
      : typeof anyErr.name === "string" && anyErr.name.startsWith("asr_")
        ? String(anyErr.name)
        : provider === "flash"
          ? "asr_flash_failed"
          : "asr_auc_failed"
  const httpStatus = typeof anyErr.http_status === "number" ? Number(anyErr.http_status) : null
  const apiStatus = typeof anyErr.api_status === "string" ? String(anyErr.api_status) : null
  const apiCode = typeof anyErr.api_code === "string" ? String(anyErr.api_code) : null
  const apiMessage = typeof anyErr.api_message === "string" ? String(anyErr.api_message) : null
  const requestId =
    typeof anyErr.request_id === "string"
      ? String(anyErr.request_id)
      : typeof anyErr.flash_request_id === "string"
        ? String(anyErr.flash_request_id)
        : null
  const logid =
    typeof anyErr.logid === "string"
      ? String(anyErr.logid)
      : typeof anyErr.flash_logid === "string"
        ? String(anyErr.flash_logid)
        : null
  const submitLogid = typeof anyErr.submit_logid === "string" ? String(anyErr.submit_logid) : null
  const queryLogid = typeof anyErr.query_logid === "string" ? String(anyErr.query_logid) : null
  const appidLast4 = typeof anyErr.appid_last4 === "string" ? String(anyErr.appid_last4) : null
  const resourceId = typeof anyErr.resource_id === "string" ? String(anyErr.resource_id) : null
  let operationHint = typeof anyErr.operation_hint === "string" ? String(anyErr.operation_hint) : null
  let code = rawCode
  if (
    provider === "flash" &&
    (rawCode === "asr_flash_http_403" || httpStatus === 403) &&
    (apiStatus === "45000030" || apiCode === "45000030" || String(apiMessage || "").includes("45000030"))
  ) {
    code = "asr_flash_permission_denied"
    if (!operationHint) operationHint = "需要在控制台开通 volc.bigasr.auc_turbo 权限"
  }

  return {
    provider,
    code,
    message: message || code,
    http_status: httpStatus,
    api_status: apiStatus,
    api_code: apiCode,
    api_message: apiMessage,
    request_id: requestId,
    logid,
    submit_logid: submitLogid,
    query_logid: queryLogid,
    appid_last4: appidLast4,
    resource_id: resourceId,
    operation_hint: operationHint,
  }
}

function asrAucFallbackWhitelist(): Set<string> {
  const raw = String(
    process.env.VOICE_COACH_ASR_AUC_FALLBACK_WHITELIST ||
      "asr_flash_empty,asr_flash_timeout,asr_flash_http_5xx,asr_flash_http_403,asr_flash_status_5xx,asr_flash_network,asr_flash_permission_denied",
  )
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function shouldFallbackToAuc(meta: AsrErrorMeta | null): boolean {
  if (!meta || meta.provider !== "flash") return true
  const whitelist = asrAucFallbackWhitelist()
  if (whitelist.has(meta.code)) return true

  if (meta.http_status && meta.http_status >= 500 && whitelist.has("asr_flash_http_5xx")) return true
  if (meta.api_status && /^5/.test(meta.api_status) && whitelist.has("asr_flash_status_5xx")) return true
  return false
}

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeForEvent(value: unknown, fallback: string): string {
  const out = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "_")
  return out || fallback
}

function normalizeExecutor(raw?: string | null): VoiceCoachJobExecutor {
  const v = String(raw || "").trim()
  if (v === "events_pump") return "events_pump"
  if (v === "submit_pump") return "submit_pump"
  if (v === "manual") return "manual"
  return "worker"
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

function buildAuditMeta(resultState: VoiceCoachJobResultState | null | undefined, executor?: VoiceCoachJobExecutor) {
  const traceId = sanitizeForEvent(resultState?.trace_id || randomUUID(), randomUUID())
  const clientBuild = sanitizeForEvent(resultState?.client_build || "unknown", "unknown")
  const serverBuild = sanitizeForEvent(resultState?.server_build || resolveVoiceCoachServerBuild(), "dev")
  const resolvedExecutor = normalizeExecutor(resultState?.executor || executor || "worker")
  return {
    traceId,
    clientBuild,
    serverBuild,
    executor: resolvedExecutor,
  }
}

const VOICE_COACH_TTS_CACHE_TABLE = "voice_coach_tts_cache"
const VOICE_COACH_TTS_CACHE_URL_PREFIX = `storage://${VOICE_COACH_AUDIO_BUCKET}/`

type VoiceCoachTtsCacheRow = {
  key: string
  voice_type: string
  line_id: string | null
  cache_kind: "text" | "line"
  text: string
  audio_url: string
  hit_count: number | null
}

type VoiceCoachTtsRuntimeUrlCacheEntry = {
  audioPath: string
  audioUrl: string
  expiresAtMs: number
}

const voiceCoachTtsRuntimeUrlCache = new Map<string, VoiceCoachTtsRuntimeUrlCacheEntry>()
const voiceCoachTtsLineL1Cache = new Map<string, VoiceCoachTtsCacheRow>()
const voiceCoachTtsLineL1WarmInFlight = new Set<string>()

function ttsLineL1CacheKey(voiceType: string, lineId: string): string {
  return `${String(voiceType || "").trim()}::${String(lineId || "").trim()}`
}

function getTtsLineL1CacheRow(voiceType: string, lineId: string): VoiceCoachTtsCacheRow | null {
  const key = ttsLineL1CacheKey(voiceType, lineId)
  const hit = voiceCoachTtsLineL1Cache.get(key)
  return hit || null
}

function setTtsLineL1CacheRow(row: VoiceCoachTtsCacheRow): void {
  if (row.cache_kind !== "line") return
  const voiceType = String(row.voice_type || "").trim()
  const lineId = String(row.line_id || "").trim()
  if (!voiceType || !lineId) return
  const key = ttsLineL1CacheKey(voiceType, lineId)
  const prev = voiceCoachTtsLineL1Cache.get(key)
  if (!prev || !String(prev.audio_url || "").trim()) {
    voiceCoachTtsLineL1Cache.set(key, row)
  }
}

async function warmTtsLineL1CacheByVoiceType(voiceType: string): Promise<void> {
  const vt = String(voiceType || "").trim()
  if (!vt) return
  if (voiceCoachTtsLineL1WarmInFlight.has(vt)) return
  voiceCoachTtsLineL1WarmInFlight.add(vt)
  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from(VOICE_COACH_TTS_CACHE_TABLE)
      .select("key, voice_type, line_id, cache_kind, text, audio_url, hit_count, created_at")
      .eq("voice_type", vt)
      .eq("cache_kind", "line")
      .not("line_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000)
    if (error || !Array.isArray(data)) return
    for (const item of data) {
      const row: VoiceCoachTtsCacheRow = {
        key: String((item as any).key || ""),
        voice_type: String((item as any).voice_type || ""),
        line_id: typeof (item as any).line_id === "string" ? String((item as any).line_id) : null,
        cache_kind: "line",
        text: String((item as any).text || ""),
        audio_url: String((item as any).audio_url || ""),
        hit_count: asNumber((item as any).hit_count),
      }
      setTtsLineL1CacheRow(row)
    }
  } finally {
    voiceCoachTtsLineL1WarmInFlight.delete(vt)
  }
}

function ttsCacheVoiceTag(voiceType: string): string {
  const voice = String(voiceType || "")
    .trim()
    .toLowerCase()
  return voice.replace(/[^a-z0-9_-]/g, "_") || "default"
}

function toVoiceCoachTtsStoragePath(cacheKey: string, voiceType: string): string {
  return `seed/reply-cache/${ttsCacheVoiceTag(voiceType)}/${cacheKey}.mp3`
}

function toVoiceCoachTtsCacheUrl(path: string): string {
  const normalized = String(path || "").trim().replace(/^\/+/, "")
  return `${VOICE_COACH_TTS_CACHE_URL_PREFIX}${normalized}`
}

function parseVoiceCoachTtsCacheUrl(audioUrl: string | null | undefined): string | null {
  const raw = String(audioUrl || "").trim()
  if (!raw) return null
  if (raw.startsWith(VOICE_COACH_TTS_CACHE_URL_PREFIX)) {
    return raw.slice(VOICE_COACH_TTS_CACHE_URL_PREFIX.length) || null
  }
  // Backward compatibility: tolerate signed/public URLs persisted by historical scripts.
  const m = raw.match(/\/voice-coach-audio\/([^?]+)(\?|$)/)
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return raw.replace(/^\/+/, "") || null
}

function ttsSignedUrlTtlSeconds(): number {
  const n = Number(process.env.VOICE_COACH_TTS_SIGNED_URL_TTL_SECONDS || 3600)
  if (!Number.isFinite(n)) return 3600
  return Math.max(60, Math.min(24 * 3600, Math.round(n)))
}

function getRuntimeTtsSignedUrl(cacheKey: string): VoiceCoachTtsRuntimeUrlCacheEntry | null {
  const key = String(cacheKey || "").trim()
  if (!key) return null
  const hit = voiceCoachTtsRuntimeUrlCache.get(key)
  if (!hit) return null
  if (hit.expiresAtMs <= Date.now()) {
    voiceCoachTtsRuntimeUrlCache.delete(key)
    return null
  }
  return hit
}

function setRuntimeTtsSignedUrl(cacheKey: string, audioPath: string, audioUrl: string): void {
  const key = String(cacheKey || "").trim()
  const path = String(audioPath || "").trim()
  const url = String(audioUrl || "").trim()
  if (!key || !path || !url) return
  const ttlMs = ttsSignedUrlTtlSeconds() * 1000
  voiceCoachTtsRuntimeUrlCache.set(key, {
    audioPath: path,
    audioUrl: url,
    expiresAtMs: Date.now() + ttlMs - 3000,
  })
}

async function getVoiceCoachTtsCacheRow(key: string): Promise<VoiceCoachTtsCacheRow | null> {
  const cacheKey = String(key || "").trim()
  if (!cacheKey) return null
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from(VOICE_COACH_TTS_CACHE_TABLE)
    .select("key, voice_type, line_id, cache_kind, text, audio_url, hit_count")
    .eq("key", cacheKey)
    .maybeSingle()

  if (error || !data) return null
  return {
    key: String((data as any).key || ""),
    voice_type: String((data as any).voice_type || ""),
    line_id: typeof (data as any).line_id === "string" ? String((data as any).line_id) : null,
    cache_kind: String((data as any).cache_kind || "text") === "line" ? "line" : "text",
    text: String((data as any).text || ""),
    audio_url: String((data as any).audio_url || ""),
    hit_count: asNumber((data as any).hit_count),
  }
}

async function getVoiceCoachTtsLineCacheRow(opts: {
  voiceType: string
  lineId: string
}): Promise<VoiceCoachTtsCacheRow | null> {
  const voiceType = String(opts.voiceType || "").trim()
  const lineId = String(opts.lineId || "").trim()
  if (!voiceType || !lineId) return null
  const l1Hit = getTtsLineL1CacheRow(voiceType, lineId)
  if (l1Hit) return l1Hit
  await warmTtsLineL1CacheByVoiceType(voiceType)
  const warmedHit = getTtsLineL1CacheRow(voiceType, lineId)
  if (warmedHit) return warmedHit
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from(VOICE_COACH_TTS_CACHE_TABLE)
    .select("key, voice_type, line_id, cache_kind, text, audio_url, hit_count, created_at")
    .eq("voice_type", voiceType)
    .eq("line_id", lineId)
    .eq("cache_kind", "line")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row: VoiceCoachTtsCacheRow = {
    key: String((data as any).key || ""),
    voice_type: String((data as any).voice_type || ""),
    line_id: typeof (data as any).line_id === "string" ? String((data as any).line_id) : null,
    cache_kind: "line",
    text: String((data as any).text || ""),
    audio_url: String((data as any).audio_url || ""),
    hit_count: asNumber((data as any).hit_count),
  }
  setTtsLineL1CacheRow(row)
  return row
}

async function bumpVoiceCoachTtsCacheHitCount(key: string, currentHitCount: number | null): Promise<void> {
  const cacheKey = String(key || "").trim()
  if (!cacheKey) return
  const current = Number.isFinite(Number(currentHitCount)) ? Math.max(0, Math.floor(Number(currentHitCount))) : 0
  const admin = createAdminSupabaseClient()
  await admin
    .from(VOICE_COACH_TTS_CACHE_TABLE)
    .update({
      hit_count: current + 1,
    })
    .eq("key", cacheKey)
}

async function saveVoiceCoachTtsCacheRow(opts: {
  key: string
  voiceType: string
  text: string
  audioPath: string
  cacheKind?: "text" | "line"
  lineId?: string | null
  audioUrl?: string | null
  hitCount?: number
}): Promise<void> {
  const key = String(opts.key || "").trim()
  const voiceType = String(opts.voiceType || "").trim()
  const text = String(opts.text || "").trim()
  const audioPath = String(opts.audioPath || "").trim()
  const lineId = String(opts.lineId || "").trim()
  const audioUrl = String(opts.audioUrl || "").trim()
  const cacheKind = opts.cacheKind === "line" ? "line" : "text"
  if (!key || !voiceType || !text || !audioPath) return
  const admin = createAdminSupabaseClient()
  await admin.from(VOICE_COACH_TTS_CACHE_TABLE).upsert(
    {
      key,
      voice_type: voiceType,
      line_id: cacheKind === "line" ? lineId || null : null,
      cache_kind: cacheKind,
      text,
      audio_url: audioUrl || toVoiceCoachTtsCacheUrl(audioPath),
      hit_count: Number.isFinite(Number(opts.hitCount)) ? Math.max(0, Math.floor(Number(opts.hitCount))) : 0,
    },
    {
      onConflict: "key",
    },
  )
  if (cacheKind === "line") {
    setTtsLineL1CacheRow({
      key,
      voice_type: voiceType,
      line_id: lineId || null,
      cache_kind: "line",
      text,
      audio_url: audioUrl || toVoiceCoachTtsCacheUrl(audioPath),
      hit_count: Number.isFinite(Number(opts.hitCount)) ? Math.max(0, Math.floor(Number(opts.hitCount))) : 0,
    })
  }
}

function normalizeStableTtsSource(source: unknown): VoiceCoachStableTtsSource {
  const raw = String(source || "").trim()
  if (raw === "line_cache") return "line_cache"
  if (raw === "text_cache" || raw === "existing" || raw === "seed_cache" || raw === "tts_cache") return "text_cache"
  return "runtime"
}

function emptyTtsSourceDistribution(): VoiceCoachTtsSourceDistribution {
  return {
    line_cache: 0,
    text_cache: 0,
    runtime: 0,
  }
}

function isTtsCacheHitSource(source: VoiceCoachStableTtsSource | string): boolean {
  const normalized = normalizeStableTtsSource(source)
  return normalized === "line_cache" || normalized === "text_cache"
}

async function calcAudioRoundStatsBySession(opts: {
  sessionId: string
  currentSource: VoiceCoachStableTtsSource
  currentScriptHit: boolean
  currentLlmUsed: boolean
}): Promise<{
  ttsCacheHitRate: number
  ttsCacheHitRounds: number
  totalRounds: number
  scriptHitRate: number
  scriptHitRounds: number
  ttsLineCacheHitRate: number
  ttsLineCacheHitRounds: number
  llmUsedWhenScriptHitCount: number
  ttsSourceDistribution: VoiceCoachTtsSourceDistribution
}> {
  const sessionId = String(opts.sessionId || "").trim()
  if (!sessionId) {
    return {
      ttsCacheHitRate: 0,
      ttsCacheHitRounds: 0,
      totalRounds: 0,
      scriptHitRate: 0,
      scriptHitRounds: 0,
      ttsLineCacheHitRate: 0,
      ttsLineCacheHitRounds: 0,
      llmUsedWhenScriptHitCount: 0,
      ttsSourceDistribution: emptyTtsSourceDistribution(),
    }
  }
  const historyLimitRaw = Number(process.env.VOICE_COACH_TTS_STATS_HISTORY_LIMIT || 0)
  const historyLimit = Number.isFinite(historyLimitRaw) ? Math.max(0, Math.min(300, Math.round(historyLimitRaw))) : 0
  const currentSource = normalizeStableTtsSource(opts.currentSource)
  if (historyLimit <= 0) {
    const currentDist = emptyTtsSourceDistribution()
    currentDist[currentSource] = 1
    const currentCacheHitRounds = isTtsCacheHitSource(currentSource) ? 1 : 0
    const currentScriptHitRounds = opts.currentScriptHit ? 1 : 0
    const currentLineCacheHitRounds = currentSource === "line_cache" ? 1 : 0
    const currentLlmUsedWhenScriptHitCount = opts.currentScriptHit && opts.currentLlmUsed ? 1 : 0
    return {
      ttsCacheHitRate: Number((currentCacheHitRounds / 1).toFixed(4)),
      ttsCacheHitRounds: currentCacheHitRounds,
      totalRounds: 1,
      scriptHitRate: Number((currentScriptHitRounds / 1).toFixed(4)),
      scriptHitRounds: currentScriptHitRounds,
      ttsLineCacheHitRate: Number((currentLineCacheHitRounds / 1).toFixed(4)),
      ttsLineCacheHitRounds: currentLineCacheHitRounds,
      llmUsedWhenScriptHitCount: currentLlmUsedWhenScriptHitCount,
      ttsSourceDistribution: currentDist,
    }
  }

  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from("voice_coach_events")
    .select("data_json")
    .eq("session_id", sessionId)
    .eq("type", "customer.audio_ready")
    .order("id", { ascending: false })
    .limit(historyLimit)

  let ttsCacheHitRounds = 0
  let totalRounds = 0
  let scriptHitRounds = 0
  let ttsLineCacheHitRounds = 0
  let llmUsedWhenScriptHitCount = 0
  const ttsSourceDistribution = emptyTtsSourceDistribution()

  for (const row of data || []) {
    const payload = (row as any)?.data_json || {}
    const source = normalizeStableTtsSource(payload?.tts_source)
    const scriptHit =
      payload?.script_hit === true || (Boolean(String(payload?.line_id || "").trim()) && payload?.llm_used !== true)
    const llmUsed = payload?.llm_used === true

    totalRounds += 1
    ttsSourceDistribution[source] += 1
    if (isTtsCacheHitSource(source)) ttsCacheHitRounds += 1
    if (source === "line_cache") ttsLineCacheHitRounds += 1
    if (scriptHit) scriptHitRounds += 1
    if (scriptHit && llmUsed) llmUsedWhenScriptHitCount += 1
  }

  totalRounds += 1
  ttsSourceDistribution[currentSource] += 1
  if (isTtsCacheHitSource(currentSource)) {
    ttsCacheHitRounds += 1
  }
  if (currentSource === "line_cache") ttsLineCacheHitRounds += 1
  if (opts.currentScriptHit) scriptHitRounds += 1
  if (opts.currentScriptHit && opts.currentLlmUsed) llmUsedWhenScriptHitCount += 1

  const ttsCacheHitRate = totalRounds > 0 ? Number((ttsCacheHitRounds / totalRounds).toFixed(4)) : 0
  const scriptHitRate = totalRounds > 0 ? Number((scriptHitRounds / totalRounds).toFixed(4)) : 0
  const ttsLineCacheHitRate = totalRounds > 0 ? Number((ttsLineCacheHitRounds / totalRounds).toFixed(4)) : 0
  return {
    ttsCacheHitRate,
    ttsCacheHitRounds,
    totalRounds,
    scriptHitRate,
    scriptHitRounds,
    ttsLineCacheHitRate,
    ttsLineCacheHitRounds,
    llmUsedWhenScriptHitCount,
    ttsSourceDistribution,
  }
}

export async function emitVoiceCoachEvent(args: EmitEventArgs): Promise<number> {
  const admin = createAdminSupabaseClient()
  const rawData =
    args.data && typeof args.data === "object" && !Array.isArray(args.data) ? { ...(args.data as Record<string, unknown>) } : {}
  const rawMeta =
    rawData.meta && typeof rawData.meta === "object" && !Array.isArray(rawData.meta)
      ? { ...(rawData.meta as Record<string, unknown>) }
      : {}
  const traceId = sanitizeForEvent(
    args.traceId || (rawData.trace_id as string) || (rawMeta.trace_id as string) || randomUUID(),
    randomUUID(),
  )
  const clientBuild = sanitizeForEvent(
    args.clientBuild || (rawData.client_build as string) || (rawMeta.client_build as string) || "unknown",
    "unknown",
  )
  const serverBuild = sanitizeForEvent(
    args.serverBuild || (rawData.server_build as string) || (rawMeta.server_build as string) || resolveVoiceCoachServerBuild(),
    "dev",
  )
  const executor = normalizeExecutor(
    (typeof args.executor === "string"
      ? args.executor
      : typeof rawData.executor === "string"
        ? rawData.executor
        : typeof rawMeta.executor === "string"
          ? rawMeta.executor
          : "worker") || "worker",
  )
  const dataJson = {
    ...rawData,
    trace_id: traceId,
    client_build: clientBuild,
    server_build: serverBuild,
    executor,
    meta: {
      ...rawMeta,
      trace_id: traceId,
      client_build: clientBuild,
      server_build: serverBuild,
      executor,
    },
  }
  const { data, error } = await admin
    .from("voice_coach_events")
    .insert({
      session_id: args.sessionId,
      user_id: args.userId,
      turn_id: args.turnId || null,
      job_id: args.jobId || null,
      type: args.type,
      data_json: dataJson,
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
  extraData?: Record<string, unknown>
  traceId?: string | null
  clientBuild?: string | null
  serverBuild?: string | null
  executor?: VoiceCoachJobExecutor
}) {
  const admin = createAdminSupabaseClient()
  const updatedAt = nowIso()
  const executor = normalizeExecutor(args.executor || "worker")
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "error",
      stage: "error",
      last_error: args.message,
      finished_at: updatedAt,
      updated_at: updatedAt,
    })
    .eq("id", args.jobId)

  await admin.from("voice_coach_turns").update({ status: "error" }).eq("id", args.turnId).eq("session_id", args.sessionId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    traceId: args.traceId,
    clientBuild: args.clientBuild,
    serverBuild: args.serverBuild,
    executor,
    type: "turn.error",
    data: {
      code: args.code,
      message: args.message,
      ...(args.extraData || {}),
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
  keepProcessing?: boolean
  lockOwner?: string | null
}) {
  const admin = createAdminSupabaseClient()
  const keepProcessing = Boolean(args.keepProcessing)
  const updatedAt = nowIso()
  const stageEnteredAtMs = parseIsoToMs(updatedAt) || Date.now()
  const executor = normalizeExecutor(args.result?.executor || "worker")
  const nextResult = mergeResult(args.result, {
    stage_entered_at_ms: stageEnteredAtMs,
    executor,
  })
  await admin
    .from("voice_coach_jobs")
    .update({
      status: keepProcessing ? "processing" : "queued",
      stage: args.stage,
      updated_at: updatedAt,
      result_json: nextResult,
    })
    .eq("id", args.jobId)
}

async function finishJob(args: {
  jobId: string
  result: VoiceCoachJobResultState
}) {
  const admin = createAdminSupabaseClient()
  const updatedAt = nowIso()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "done",
      stage: "done",
      finished_at: updatedAt,
      updated_at: updatedAt,
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
  executor?: VoiceCoachJobExecutor
  chainTtsInSameLock?: boolean
  lockOwner?: string | null
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const auditMeta = buildAuditMeta(args.resultState, args.executor)
  const resultState = mergeResult(args.resultState, {
    trace_id: auditMeta.traceId,
    client_build: auditMeta.clientBuild,
    server_build: auditMeta.serverBuild,
    executor: auditMeta.executor,
  })
  const pipelineStartedAt = Number(resultState.pipeline_started_at_ms || Date.now())
  const queueWaitBeforeMainMs = nonNegativeMs(resultState.queue_wait_before_main_ms)

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.session.status !== "active") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "session_not_active",
      message: "会话已结束或不存在",
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const format = (args.payload.audio_format || "mp3") as "mp3" | "wav" | "ogg" | "raw" | "flac"

  if (format === "flac" && !shouldUseFlashAsr()) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "unsupported_audio_format",
      message: "当前仅支持 mp3/wav/ogg 录音，请调整录音格式后重试。",
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const [replyTurnRes, audioBuf] = await Promise.all([
    admin
      .from("voice_coach_turns")
      .select("id, text, emotion, intent_id, angle_id, line_id, turn_index")
      .eq("id", args.payload.reply_to_turn_id)
      .eq("session_id", args.sessionId)
      .single(),
    downloadVoiceCoachAudio(audioPath),
    admin.from("voice_coach_turns").update({ status: "processing" }).eq("id", args.turnId),
  ])
  const replyTurn = replyTurnRes.data
  if (!replyTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "reply_turn_not_found",
      message: "顾客回合不存在，无法继续识别",
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  let asr: DoubaoAsrResult | null = null
  let asrProvider: "flash" | "auc" = "flash"
  const asrProviderAttempted: Array<"flash" | "auc"> = []
  let asrFallbackUsed = false
  const requireFlash = shouldRequireFlashAsr()
  const flashEnabled = requireFlash || (shouldUseFlashAsr() && !flashResourcePermissionDenied)
  const allowAucFallbackByConfig = !flashEnabled || shouldAllowAucFallbackWhenFlashEnabled()
  const estimatedAudioSeconds = asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const canUseAucFallbackByDuration = !estimatedAudioSeconds || estimatedAudioSeconds >= 1.2
  let latestAsrError: unknown = null
  let latestAsrMeta: AsrErrorMeta | null = null
  let flashFailureMeta: AsrErrorMeta | null = null
  const asrStartedAt = Date.now()

  if (flashEnabled && format !== "raw") {
    asrProviderAttempted.push("flash")
    try {
      const flashRes = await doubaoAsrFlash({
        audio: audioBuf,
        format: format as "mp3" | "wav" | "ogg" | "flac",
        uid: args.userId,
      })
      if (flashRes.text) {
        asr = flashRes
        asrProvider = "flash"
        flashResourcePermissionDenied = false
        latestAsrMeta = null
        flashFailureMeta = null
      } else {
        latestAsrError = Object.assign(new Error("asr_flash_empty"), {
          code: "asr_flash_empty",
          provider: "flash",
        })
        flashFailureMeta = asrErrorMeta(latestAsrError, "flash")
        latestAsrMeta = flashFailureMeta
      }
    } catch (err: any) {
      latestAsrError = err
      if (isAsrFlashPermissionDenied(err)) {
        // Cache permission denial in-process to avoid repeated slow/failed flash attempts.
        flashResourcePermissionDenied = true
        if (typeof (err as any)?.code !== "string") {
          ;(err as any).code = "asr_flash_permission_denied"
        }
      }
      flashFailureMeta = asrErrorMeta(err, "flash")
      latestAsrMeta = flashFailureMeta
      asr = null
    }
  }

  const flashPermissionDeniedMeta = [flashFailureMeta, latestAsrMeta].find(
    (meta) => meta?.provider === "flash" && meta?.code === "asr_flash_permission_denied",
  )
  const hardStopOnPermissionDenied = Boolean(requireFlash && flashPermissionDeniedMeta)
  if (hardStopOnPermissionDenied) {
    const denied = flashPermissionDeniedMeta as AsrErrorMeta
    latestAsrError = Object.assign(new Error(denied.message || "asr_flash_permission_denied"), {
      code: "asr_flash_permission_denied",
      provider: "flash",
      http_status: denied.http_status,
      api_status: denied.api_status,
      api_code: denied.api_code,
      api_message: denied.api_message,
      request_id: denied.request_id,
      logid: denied.logid,
      appid_last4: denied.appid_last4,
      resource_id: denied.resource_id,
      operation_hint: denied.operation_hint,
    })
    latestAsrMeta = denied
    console.error("[voice-coach][asr][flash] require_flash hard-stop", {
      asr_error_code: denied.code,
      operation_hint: denied.operation_hint,
      flash_request_id: denied.request_id,
      flash_logid: denied.logid,
      appid_last4: denied.appid_last4,
      resource_id: denied.resource_id,
    })
  }

  const allowFallbackByReason =
    !hardStopOnPermissionDenied && (!flashEnabled || shouldFallbackToAuc(flashFailureMeta || latestAsrMeta))
  const allowAucFallback =
    !hardStopOnPermissionDenied && allowAucFallbackByConfig && canUseAucFallbackByDuration && allowFallbackByReason
  if ((!asr || !asr.text) && allowAucFallback) {
    asrFallbackUsed = true
    asrProvider = "auc"
    asrProviderAttempted.push("auc")
    const signed = await signVoiceCoachAudio(audioPath)
    try {
      asr = (await Promise.race([
        doubaoAsrAuc({
          audioUrl: signed,
          format: format as "mp3" | "wav" | "ogg" | "raw",
          uid: args.userId,
        }),
        sleep(asrAucTotalTimeoutMs()).then(() => {
          throw new Error("asr_timeout")
        }),
      ])) as DoubaoAsrResult
      latestAsrMeta = null
    } catch (err) {
      latestAsrError = err
      latestAsrMeta = asrErrorMeta(err, "auc")
      asr = null
    }
  }

  if (!asr || !asr.text) {
    const asrProviderFinalOnError =
      latestAsrMeta?.provider || (asrProviderAttempted.length > 0 ? asrProviderAttempted[asrProviderAttempted.length - 1] : null)
    const normalized = normalizeAsrFailure(latestAsrError)
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: normalized.code,
      message: normalized.message,
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
      extraData: {
        asr_provider: asrProviderFinalOnError,
        asr_provider_attempted: asrProviderAttempted,
        asr_provider_final: asrProviderFinalOnError,
        asr_outcome: "failed",
        asr_error_code: latestAsrMeta?.code || null,
        asr_http_status: latestAsrMeta?.http_status || null,
        asr_api_status: latestAsrMeta?.api_status || null,
        asr_api_code: latestAsrMeta?.api_code || null,
        asr_api_message: latestAsrMeta?.api_message || null,
        asr_request_id: latestAsrMeta?.request_id || null,
        asr_logid: latestAsrMeta?.logid || null,
        asr_submit_logid: latestAsrMeta?.submit_logid || null,
        asr_query_logid: latestAsrMeta?.query_logid || null,
        flash_request_id: latestAsrMeta?.provider === "flash" ? latestAsrMeta.request_id : null,
        flash_logid: latestAsrMeta?.provider === "flash" ? latestAsrMeta.logid : null,
        appid_last4: latestAsrMeta?.appid_last4 || null,
        resource_id: latestAsrMeta?.resource_id || null,
        operation_hint: latestAsrMeta?.operation_hint || null,
        require_flash: requireFlash,
      },
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const asrMs = Math.max(1, asNumber((asr as any)?.elapsedMs) || Date.now() - asrStartedAt)
  const asrQueueWaitMs = queueWaitBeforeMainMs
  const asrReadyMs = asrMs + (asrQueueWaitMs || 0)
  const asrProviderFinal: "flash" | "auc" = asrProvider
  const asrOutcome: "success" | "fallback_success" = asrFallbackUsed ? "fallback_success" : "success"

  const audioSeconds = asr.durationSeconds || asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const wpm = calcWpm(asr.text, audioSeconds)
  const fillerRatio = calcFillerRatio(asr.text)
  const beauticianAudioUrl = await getSignedAudio(audioPath)

  const beauticianTurnNo = Math.floor((Number(loaded.turn.turn_index) + 1) / 2)
  const hardMax = hardMaxTurns()
  const reachedMax = hardMax > 0 && beauticianTurnNo >= hardMax
  const flashRequestId = asrProvider === "flash" ? asr.requestId : flashFailureMeta?.request_id || null
  const flashLogid = asrProvider === "flash" ? asr.logid || null : flashFailureMeta?.logid || null
  const flashAppidLast4 = flashFailureMeta?.appid_last4 || null
  const flashResourceId = flashFailureMeta?.resource_id || (asrProvider === "flash" ? asr.resourceId || null : null)
  const flashOperationHint = flashFailureMeta?.operation_hint || null
  const aucRequestId =
    asrProvider === "auc" ? asr.requestId : latestAsrMeta?.provider === "auc" ? latestAsrMeta.request_id : null
  const aucLogid =
    asrProvider === "auc"
      ? asr.logid || asr.queryLogid || asr.submitLogid || null
      : latestAsrMeta?.provider === "auc"
        ? latestAsrMeta.logid || latestAsrMeta.query_logid || latestAsrMeta.submit_logid || null
        : null

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
    traceId: auditMeta.traceId,
    clientBuild: auditMeta.clientBuild,
    serverBuild: auditMeta.serverBuild,
    executor: auditMeta.executor,
    type: "beautician.asr_ready",
    data: {
      turn_id: args.turnId,
      text: asr.text,
      confidence: asr.confidence,
      audio_seconds: audioSeconds,
      audio_url: beauticianAudioUrl,
      asr_provider: asrProvider,
      asr_provider_attempted: asrProviderAttempted,
      asr_provider_final: asrProviderFinal,
      asr_outcome: asrOutcome,
      asr_resource_id: asr.resourceId || null,
      asr_fallback_used: asrFallbackUsed,
      asr_error_code: latestAsrMeta?.code || flashFailureMeta?.code || null,
      asr_http_status: latestAsrMeta?.http_status || flashFailureMeta?.http_status || null,
      asr_api_status: latestAsrMeta?.api_status || flashFailureMeta?.api_status || null,
      asr_api_code: latestAsrMeta?.api_code || flashFailureMeta?.api_code || null,
      asr_api_message: latestAsrMeta?.api_message || flashFailureMeta?.api_message || null,
      flash_error_code: flashFailureMeta?.code || null,
      flash_http_status: flashFailureMeta?.http_status || null,
      flash_api_status: flashFailureMeta?.api_status || null,
      flash_api_code: flashFailureMeta?.api_code || null,
      flash_api_message: flashFailureMeta?.api_message || null,
      flash_request_id: flashRequestId,
      flash_logid: flashLogid,
      appid_last4: flashAppidLast4,
      resource_id: flashResourceId,
      operation_hint: flashOperationHint,
      require_flash: requireFlash,
      auc_request_id: aucRequestId,
      auc_logid: aucLogid,
      submit_ack_ms: asNumber(resultState.submit_ack_ms),
      upload_ms: asNumber(resultState.upload_ms),
      asr_ms: asrMs,
      asr_ready_ms: asrReadyMs,
      asr_queue_wait_ms: asrQueueWaitMs,
      queue_wait_before_main_ms: queueWaitBeforeMainMs,
      reached_max_turns: reachedMax,
      trace_id: resultState.trace_id || null,
      client_build: resultState.client_build || null,
      server_build: resultState.server_build || auditMeta.serverBuild,
      executor: resultState.executor || auditMeta.executor,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  const stageResultBase = mergeResult(resultState, {
    pipeline_started_at_ms: pipelineStartedAt,
    reached_max_turns: reachedMax,
    reply_turn_id: String(replyTurn.id),
    beautician_turn_index: Number(loaded.turn.turn_index),
    beautician_text: asr.text,
    beautician_audio_url: beauticianAudioUrl,
    beautician_audio_seconds: audioSeconds,
    beautician_asr_confidence: asr.confidence,
    flash_request_id: flashRequestId,
    flash_logid: flashLogid,
    auc_request_id: aucRequestId,
    auc_logid: aucLogid,
    asr_ms: asrMs,
    asr_ready_ms: asrReadyMs,
    asr_queue_wait_ms: asrQueueWaitMs ?? undefined,
    asr_provider_attempted: asrProviderAttempted,
    asr_provider_final: asrProviderFinal,
    asr_outcome: asrOutcome,
    queue_wait_before_main_ms: queueWaitBeforeMainMs ?? undefined,
    asr_error:
      latestAsrMeta || flashFailureMeta
        ? {
            provider: (latestAsrMeta || flashFailureMeta)?.provider || "flash",
            code: (latestAsrMeta || flashFailureMeta)?.code || "asr_failed",
            message: (latestAsrMeta || flashFailureMeta)?.message || "",
            http_status: (latestAsrMeta || flashFailureMeta)?.http_status || null,
            api_status: (latestAsrMeta || flashFailureMeta)?.api_status || null,
            api_code: (latestAsrMeta || flashFailureMeta)?.api_code || null,
            api_message: (latestAsrMeta || flashFailureMeta)?.api_message || null,
            appid_last4: (latestAsrMeta || flashFailureMeta)?.appid_last4 || null,
            resource_id: (latestAsrMeta || flashFailureMeta)?.resource_id || null,
            operation_hint: (latestAsrMeta || flashFailureMeta)?.operation_hint || null,
          }
        : null,
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
  const scriptSelectStartedAt = Date.now()
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))
  const policyState = loaded.session.policy_state_json || createInitialPolicyState({ categoryId })
  const selection = selectNextCustomerLine({
    categoryId,
    policyState,
    beauticianText: asr.text,
    history: history.map((item) => ({ role: item.role, text: item.text })),
  })
  const scriptSelectMs = Date.now() - scriptSelectStartedAt

  const modelRewriteEnabledByConfig = String(process.env.VOICE_COACH_MODEL_REWRITE_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false"
  const modelRewriteRatio = Number(process.env.VOICE_COACH_MODEL_REWRITE_RATIO || 0.3)
  const selectedLineId = String(selection.line.line_id || "").trim()
  const baseLine = {
    text: selection.line.text,
    emotion: (selection.line.emotion || "skeptical") as VoiceCoachEmotion,
    tag: String(selection.line.tag || selection.line.intent_id || "跟进追问"),
  }
  const shouldForceDisableLlmRewrite = Boolean(selectedLineId)
  const modelRewriteEnabled = modelRewriteEnabledByConfig && !shouldForceDisableLlmRewrite

  let llmMs = 0
  const rewritten = shouldForceDisableLlmRewrite
    ? {
        ...baseLine,
        reply_source: "fixed" as const,
      }
    : await (async () => {
        const llmStartedAt = Date.now()
        const result = await maybeRewriteCustomerLine({
          enabled: modelRewriteEnabled,
          probability: Number.isFinite(modelRewriteRatio) ? modelRewriteRatio : 0.3,
          base: baseLine,
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
        llmMs = Date.now() - llmStartedAt
        return result
      })()
  const llmUsed = rewritten.reply_source === "mixed"
  const scriptHit =
    Boolean(selectedLineId) &&
    !llmUsed &&
    normalizeInlineText(rewritten.text) === normalizeInlineText(baseLine.text)
  const textReadyMs = scriptSelectMs + llmMs

  const nextCustomer = {
    text: rewritten.text,
    emotion: rewritten.emotion,
    tag: rewritten.tag,
    line_id: selection.line.line_id,
    intent_id: selection.intent_id,
    angle_id: selection.angle_id,
    reply_source: rewritten.reply_source,
    llm_used: llmUsed,
    script_hit: scriptHit,
    loop_guard_triggered: selection.loop_guard_triggered,
  }

  void (async () => {
    try {
      await admin
        .from("voice_coach_sessions")
        .update({
          policy_state_json: selection.policy_state,
          category_id: categoryId,
        })
        .eq("id", args.sessionId)
    } catch {}
  })()

  const customerTurnIndex = Number(loaded.turn.turn_index) + 1
  const { data: existingCustomerAtIndex } = await admin
    .from("voice_coach_turns")
    .select("id, role")
    .eq("session_id", args.sessionId)
    .eq("turn_index", customerTurnIndex)
    .maybeSingle()

  let nextCustomerTurnId = resultState.next_customer_turn_id || randomUUID()
  if (existingCustomerAtIndex?.id) {
    if (String(existingCustomerAtIndex.role || "") !== "customer") {
      await markJobError({
        jobId: args.jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId: args.turnId,
        code: "customer_turn_conflict",
        message: "对话状态冲突，请重试",
        traceId: auditMeta.traceId,
        clientBuild: auditMeta.clientBuild,
        serverBuild: auditMeta.serverBuild,
        executor: auditMeta.executor,
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
          llm_used: nextCustomer.llm_used,
          script_hit: nextCustomer.script_hit,
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
        llm_used: nextCustomer.llm_used,
        script_hit: nextCustomer.script_hit,
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
    void (async () => {
      try {
        await admin
          .from("voice_coach_turns")
          .update({
            analysis_json: fixedAnalysis,
          })
          .eq("id", args.turnId)
          .eq("session_id", args.sessionId)
      } catch {}
    })()
  }

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    traceId: auditMeta.traceId,
    clientBuild: auditMeta.clientBuild,
    serverBuild: auditMeta.serverBuild,
    executor: auditMeta.executor,
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
      llm_used: nextCustomer.llm_used,
      script_hit: nextCustomer.script_hit,
      loop_guard_triggered: nextCustomer.loop_guard_triggered,
      submit_ack_ms: asNumber(resultState.submit_ack_ms),
      upload_ms: asNumber(resultState.upload_ms),
      asr_ms: asNumber(stageResultBase.asr_ms),
      queue_wait_before_main_ms: asNumber(stageResultBase.queue_wait_before_main_ms),
      script_select_ms: scriptSelectMs,
      llm_ms: llmMs,
      text_ready_ms: textReadyMs,
      trace_id: resultState.trace_id || null,
      client_build: resultState.client_build || null,
      server_build: resultState.server_build || auditMeta.serverBuild,
      executor: resultState.executor || auditMeta.executor,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  const ttsQueuedAtMs = Date.now()
  const nextStageResult = mergeResult(stageResultBase, {
    next_customer_turn_id: nextCustomerTurnId,
    next_customer_line_id: nextCustomer.line_id,
    next_customer_text: nextCustomer.text,
    next_customer_emotion: nextCustomer.emotion,
    next_customer_tag: nextCustomer.tag,
    category_id: categoryId,
    intent_id: nextCustomer.intent_id,
    angle_id: nextCustomer.angle_id,
    reply_source: nextCustomer.reply_source,
    llm_used: nextCustomer.llm_used,
    script_hit: nextCustomer.script_hit,
    loop_guard_triggered: nextCustomer.loop_guard_triggered,
    customer_text_elapsed_ms: Date.now() - pipelineStartedAt,
    tts_queued_at_ms: ttsQueuedAtMs,
    stage_entered_at_ms: ttsQueuedAtMs,
    script_select_ms: scriptSelectMs,
    llm_ms: llmMs,
    text_ready_ms: textReadyMs,
  })

  if (!args.chainTtsInSameLock) {
    await queueNextStage({
      jobId: args.jobId,
      stage: "tts_pending",
      result: nextStageResult,
      keepProcessing: false,
      lockOwner: args.lockOwner || null,
    })
  }

  return {
    processed: true,
    done: false,
    jobId: args.jobId,
    turnId: args.turnId,
    nextStage: "tts_pending",
    nextResultState: nextStageResult,
  }
}

async function processTtsStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  resultState: VoiceCoachJobResultState
  executor?: VoiceCoachJobExecutor
  assumeFreshCustomerTurn?: boolean
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const auditMeta = buildAuditMeta(args.resultState, args.executor)
  const resultState = mergeResult(args.resultState, {
    trace_id: auditMeta.traceId,
    client_build: auditMeta.clientBuild,
    server_build: auditMeta.serverBuild,
    executor: auditMeta.executor,
  })
  const pipelineStartedAt = Number(resultState.pipeline_started_at_ms || Date.now())

  const nextCustomerTurnId = String(resultState.next_customer_turn_id || "")
  if (!nextCustomerTurnId) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(resultState, { pipeline_started_at_ms: pipelineStartedAt }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const ttsStartedAt = Date.now()
  const ttsQueuedAtMs = asNumber(resultState.tts_queued_at_ms)
  const stageEnteredAtMs = asNumber(resultState.stage_entered_at_ms)
  const queueWaitBeforeTts = calcQueueWaitBeforeTts({
    nowMs: ttsStartedAt,
    ttsQueuedAtMs,
    stageEnteredAtMs,
  })
  const queueWaitBeforeTtsMs = queueWaitBeforeTts.valueMs
  const queueWaitBeforeTtsValid = queueWaitBeforeTts.valid
  const queueWaitBeforeTtsSource = queueWaitBeforeTts.source

  let customerTurn:
    | {
        id: string
        text: string | null
        emotion: string | null
        audio_path: string | null
        audio_seconds: number | null
        line_id: string | null
        reply_source: string | null
      }
    | null = null

  if (args.assumeFreshCustomerTurn) {
    const nextText = String(resultState.next_customer_text || "").trim()
    if (nextText) {
      customerTurn = {
        id: nextCustomerTurnId,
        text: nextText,
        emotion: resultState.next_customer_emotion ? String(resultState.next_customer_emotion) : "neutral",
        audio_path: null,
        audio_seconds: null,
        line_id: resultState.next_customer_line_id ? String(resultState.next_customer_line_id) : null,
        reply_source: resultState.reply_source ? String(resultState.reply_source) : null,
      }
    }
  }

  if (!customerTurn) {
    const { data } = await admin
      .from("voice_coach_turns")
      .select("id, text, emotion, audio_path, audio_seconds, line_id, reply_source")
      .eq("id", nextCustomerTurnId)
      .eq("session_id", args.sessionId)
      .single()
    customerTurn = data
  }

  if (!customerTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "customer_turn_missing",
      message: "顾客回合不存在，无法生成语音",
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  let audioUrl: string | null = null
  let audioSeconds: number | null = asNumber(customerTurn.audio_seconds)
  let audioPath: string | null = customerTurn.audio_path ? String(customerTurn.audio_path) : null
  let ttsFailed = false
  let ttsSource: VoiceCoachStableTtsSource = audioPath ? "text_cache" : "runtime"

  if (audioPath) {
    audioUrl = await getSignedAudio(audioPath)
  } else {
    const text = String(resultState.next_customer_text || customerTurn.text || "").trim()
    const emotion = (resultState.next_customer_emotion || customerTurn.emotion || "neutral") as VoiceCoachEmotion
    const lineId = String((customerTurn as any).line_id || resultState.next_customer_line_id || "").trim()
    const { key: cacheKey, voiceType: ttsVoiceType, normalizedText } = buildTtsCacheKey({ text })
    const lineCacheCandidate = buildTtsLineCacheKey({
      voiceType: ttsVoiceType,
      lineId,
    })
    const lineSeedPath = resolveSeedAudioPathForLineId(String((customerTurn as any).line_id || lineId || ""))
    const runtimeCachePath = toVoiceCoachTtsStoragePath(cacheKey, ttsVoiceType)
    const runtimeLineSignedHit = lineCacheCandidate ? getRuntimeTtsSignedUrl(lineCacheCandidate.key) : null
    const runtimeTextSignedHit = getRuntimeTtsSignedUrl(cacheKey)
    const preferLineSource = resultState.script_hit === true && Boolean(lineCacheCandidate)

    if (!normalizedText) {
      ttsFailed = true
      ttsSource = "runtime"
    } else {
      try {
        // Fast path for scripted lines: directly sign pre-generated seed audio before cache-table lookups.
        if (!audioPath && preferLineSource && lineSeedPath) {
          const seedSigned = await getSignedAudio(lineSeedPath)
          if (seedSigned) {
            audioPath = lineSeedPath
            audioUrl = seedSigned
            ttsSource = "line_cache"
            setRuntimeTtsSignedUrl(cacheKey, lineSeedPath, seedSigned)
            if (lineCacheCandidate) {
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, lineSeedPath, seedSigned)
            }
          }
        }

        // 0) In-process L1 cache for signed URLs. Avoids extra network hops on repeated hot phrases.
        if (runtimeLineSignedHit) {
          audioPath = runtimeLineSignedHit.audioPath
          audioUrl = runtimeLineSignedHit.audioUrl
          ttsSource = "line_cache"
        } else if (runtimeTextSignedHit) {
          audioPath = runtimeTextSignedHit.audioPath
          audioUrl = runtimeTextSignedHit.audioUrl
          ttsSource = preferLineSource ? "line_cache" : "text_cache"
          if (preferLineSource && lineCacheCandidate) {
            setRuntimeTtsSignedUrl(lineCacheCandidate.key, runtimeTextSignedHit.audioPath, runtimeTextSignedHit.audioUrl)
          }
        }

        // 1) line_id direct cache: same (voice_type + line_id) returns URL even if text rewritten by LLM.
        const lineCacheRow =
          !audioPath && lineCacheCandidate
            ? await getVoiceCoachTtsLineCacheRow({
                voiceType: lineCacheCandidate.voiceType,
                lineId: lineCacheCandidate.lineId,
              })
            : null

        if (!audioPath && lineCacheRow) {
          const cachedDirectUrl = String(lineCacheRow.audio_url || "").trim()
          const cachedPath = parseVoiceCoachTtsCacheUrl(lineCacheRow.audio_url)
          if (cachedPath) {
            if (/^https?:\/\//i.test(cachedDirectUrl)) {
              audioPath = cachedPath
              audioUrl = cachedDirectUrl
            } else {
              audioUrl = await getSignedAudio(cachedPath)
              audioPath = audioUrl ? cachedPath : null
            }
            if (audioPath && audioUrl && lineCacheCandidate) {
              ttsSource = "line_cache"
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, audioPath, audioUrl)
              void bumpVoiceCoachTtsCacheHitCount(lineCacheRow.key, lineCacheRow.hit_count || 0)
            }
          }
        }

        // 2) text cache by normalized text.
        const cacheRow = audioPath ? null : await getVoiceCoachTtsCacheRow(cacheKey)
        const cachedDirectUrl = String(cacheRow?.audio_url || "").trim()
        const cachedPath = parseVoiceCoachTtsCacheUrl(cacheRow?.audio_url)
        if (!audioPath && cachedPath) {
          if (/^https?:\/\//i.test(cachedDirectUrl)) {
            audioPath = cachedPath
            audioUrl = cachedDirectUrl
            ttsSource = preferLineSource ? "line_cache" : "text_cache"
            setRuntimeTtsSignedUrl(cacheKey, cachedPath, cachedDirectUrl)
            if (preferLineSource && lineCacheCandidate) {
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, cachedPath, cachedDirectUrl)
            }
            void bumpVoiceCoachTtsCacheHitCount(cacheKey, cacheRow?.hit_count || 0)
          } else {
            const signed = await getSignedAudio(cachedPath)
            if (signed) {
              audioPath = cachedPath
              audioUrl = signed
              ttsSource = preferLineSource ? "line_cache" : "text_cache"
              setRuntimeTtsSignedUrl(cacheKey, cachedPath, signed)
              if (preferLineSource && lineCacheCandidate) {
                setRuntimeTtsSignedUrl(lineCacheCandidate.key, cachedPath, signed)
              }
              void bumpVoiceCoachTtsCacheHitCount(cacheKey, cacheRow?.hit_count || 0)
            }
          }
        }

        // 3) Existing fixed seed in storage (legacy path), then backfill cache rows.
        if (!audioPath && lineSeedPath && (await voiceCoachAudioExists(lineSeedPath))) {
          audioPath = lineSeedPath
          audioUrl = await getSignedAudio(lineSeedPath)
          if (audioUrl) {
            ttsSource = preferLineSource ? "line_cache" : "text_cache"
            setRuntimeTtsSignedUrl(cacheKey, lineSeedPath, audioUrl)
            if (lineCacheCandidate) {
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, lineSeedPath, audioUrl)
            }
            await saveVoiceCoachTtsCacheRow({
              key: cacheKey,
              voiceType: ttsVoiceType,
              text: normalizedText,
              audioPath: lineSeedPath,
              cacheKind: "text",
              lineId: null,
              audioUrl,
              hitCount: cacheRow?.hit_count || 0,
            })
            if (lineCacheCandidate) {
              await saveVoiceCoachTtsCacheRow({
                key: lineCacheCandidate.key,
                voiceType: lineCacheCandidate.voiceType,
                text: normalizedText,
                audioPath: lineSeedPath,
                cacheKind: "line",
                lineId: lineCacheCandidate.lineId,
                audioUrl,
                hitCount: 0,
              })
            }
          }
        }

        // 4) Storage-level cache fallback by deterministic key path (backward compat if DB row absent).
        if (!audioPath && (await voiceCoachAudioExists(runtimeCachePath))) {
          audioPath = runtimeCachePath
          audioUrl = await getSignedAudio(runtimeCachePath)
          if (audioUrl) {
            ttsSource = preferLineSource ? "line_cache" : "text_cache"
            setRuntimeTtsSignedUrl(cacheKey, runtimeCachePath, audioUrl)
            if (lineCacheCandidate) {
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, runtimeCachePath, audioUrl)
            }
            await saveVoiceCoachTtsCacheRow({
              key: cacheKey,
              voiceType: ttsVoiceType,
              text: normalizedText,
              audioPath: runtimeCachePath,
              cacheKind: "text",
              lineId: null,
              audioUrl,
              hitCount: cacheRow?.hit_count || 0,
            })
            if (lineCacheCandidate) {
              await saveVoiceCoachTtsCacheRow({
                key: lineCacheCandidate.key,
                voiceType: lineCacheCandidate.voiceType,
                text: normalizedText,
                audioPath: runtimeCachePath,
                cacheKind: "line",
                lineId: lineCacheCandidate.lineId,
                audioUrl,
                hitCount: 0,
              })
            }
          }
        }

        // 5) Runtime synthesis on miss, then upload + save cache rows.
        if (!audioPath) {
          const tts = await doubaoTts({
            text: normalizedText,
            emotion: mapEmotionToTts(emotion),
            uid: args.userId,
          })

          audioSeconds = tts.durationSeconds ?? null
          if (tts.audio) {
            audioPath = runtimeCachePath
            await uploadVoiceCoachAudio({
              path: runtimeCachePath,
              data: tts.audio,
              contentType: "audio/mpeg",
            })
            audioUrl = await signVoiceCoachAudio(runtimeCachePath)
            ttsSource = "runtime"
            setRuntimeTtsSignedUrl(cacheKey, runtimeCachePath, audioUrl)
            if (lineCacheCandidate) {
              setRuntimeTtsSignedUrl(lineCacheCandidate.key, runtimeCachePath, audioUrl)
            }
            await saveVoiceCoachTtsCacheRow({
              key: cacheKey,
              voiceType: ttsVoiceType,
              text: normalizedText,
              audioPath: runtimeCachePath,
              cacheKind: "text",
              lineId: null,
              audioUrl,
              hitCount: cacheRow?.hit_count || 0,
            })
            if (lineCacheCandidate) {
              await saveVoiceCoachTtsCacheRow({
                key: lineCacheCandidate.key,
                voiceType: lineCacheCandidate.voiceType,
                text: normalizedText,
                audioPath: runtimeCachePath,
                cacheKind: "line",
                lineId: lineCacheCandidate.lineId,
                audioUrl,
                hitCount: 0,
              })
            }
          } else {
            ttsFailed = true
            ttsSource = "runtime"
          }
        }
      } catch {
        ttsFailed = true
        ttsSource = "runtime"
      }
    }
  }
  const llmUsed = resultState.llm_used === true
  const scriptHit = resultState.script_hit === true
  const ttsCacheHit = isTtsCacheHitSource(ttsSource)
  const ttsMsRaw = Date.now() - ttsStartedAt
  const ttsMs = ttsCacheHit ? 0 : ttsMsRaw
  const roundStats = await calcAudioRoundStatsBySession({
    sessionId: args.sessionId,
    currentSource: ttsSource,
    currentScriptHit: scriptHit,
    currentLlmUsed: llmUsed,
  })

  await admin
    .from("voice_coach_turns")
    .update({
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioPath ? "audio_ready" : "text_ready",
      reply_source: resultState.reply_source || null,
    })
    .eq("id", nextCustomerTurnId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    traceId: auditMeta.traceId,
    clientBuild: auditMeta.clientBuild,
    serverBuild: auditMeta.serverBuild,
    executor: auditMeta.executor,
    type: "customer.audio_ready",
    data: {
      turn_id: nextCustomerTurnId,
      beautician_turn_id: args.turnId,
      audio_url: audioUrl,
      audio_seconds: audioSeconds,
      tts_failed: ttsFailed || !audioUrl,
      text: resultState.next_customer_text || String(customerTurn.text || ""),
      line_id: String((customerTurn as any).line_id || resultState.next_customer_line_id || "").trim() || null,
      category_id: resultState.category_id || null,
      intent_id: resultState.intent_id || null,
      angle_id: resultState.angle_id || null,
      reply_source: resultState.reply_source || "fixed",
      llm_used: llmUsed,
      script_hit: scriptHit,
      loop_guard_triggered: Boolean(resultState.loop_guard_triggered),
      submit_ack_ms: asNumber(resultState.submit_ack_ms),
      upload_ms: asNumber(resultState.upload_ms),
      asr_ms: asNumber(resultState.asr_ms),
      llm_ms: asNumber(resultState.llm_ms),
      tts_ms: ttsMs,
      queue_wait_before_tts_ms: queueWaitBeforeTtsMs,
      queue_wait_before_tts_valid: queueWaitBeforeTtsValid,
      queue_wait_before_tts_source: queueWaitBeforeTtsSource,
      tts_source: ttsSource,
      tts_cache_hit: ttsCacheHit,
      tts_cache_hit_rate: roundStats.ttsCacheHitRate,
      tts_cache_hit_rounds: roundStats.ttsCacheHitRounds,
      tts_rounds_total: roundStats.totalRounds,
      script_hit_rate: roundStats.scriptHitRate,
      script_hit_rounds: roundStats.scriptHitRounds,
      tts_line_cache_hit_rate: roundStats.ttsLineCacheHitRate,
      tts_line_cache_hit_rounds: roundStats.ttsLineCacheHitRounds,
      tts_source_distribution: roundStats.ttsSourceDistribution,
      llm_used_when_script_hit_count: roundStats.llmUsedWhenScriptHitCount,
      trace_id: resultState.trace_id || null,
      client_build: resultState.client_build || null,
      server_build: resultState.server_build || auditMeta.serverBuild,
      executor: resultState.executor || auditMeta.executor,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await finishJob({
    jobId: args.jobId,
    result: mergeResult(resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
      tts_ms: ttsMs,
      queue_wait_before_tts_ms: queueWaitBeforeTtsMs,
      queue_wait_before_tts_valid: queueWaitBeforeTtsValid,
      queue_wait_before_tts_source: queueWaitBeforeTtsSource,
      tts_cache_hit: ttsCacheHit,
      tts_cache_hit_rate: roundStats.ttsCacheHitRate,
      tts_cache_hit_rounds: roundStats.ttsCacheHitRounds,
      tts_rounds_total: roundStats.totalRounds,
      script_hit: scriptHit,
      llm_used: llmUsed,
      script_hit_rate: roundStats.scriptHitRate,
      script_hit_rounds: roundStats.scriptHitRounds,
      tts_line_cache_hit_rate: roundStats.ttsLineCacheHitRate,
      tts_line_cache_hit_rounds: roundStats.ttsLineCacheHitRounds,
      tts_source_distribution: roundStats.ttsSourceDistribution,
      llm_used_when_script_hit_count: roundStats.llmUsedWhenScriptHitCount,
      end_to_end_ms: Date.now() - pipelineStartedAt,
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
  executor?: VoiceCoachJobExecutor
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const auditMeta = buildAuditMeta(args.resultState, args.executor)
  const resultState = mergeResult(args.resultState, {
    trace_id: auditMeta.traceId,
    client_build: auditMeta.clientBuild,
    server_build: auditMeta.serverBuild,
    executor: auditMeta.executor,
  })
  const pipelineStartedAt = Number(resultState.pipeline_started_at_ms || Date.now())

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.turn.role !== "beautician") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "turn_not_found",
      message: "未找到待分析的美容师回合",
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (loaded.turn.analysis_json) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const replyTurnId = String(args.payload.reply_to_turn_id || resultState.reply_turn_id || "")
  if (!replyTurnId) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(resultState, {
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
      result: mergeResult(resultState, {
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
      beauticianText: String(loaded.turn.text || resultState.beautician_text || ""),
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
      type: "beautician.analysis_ready",
      data: {
        turn_id: args.turnId,
        analysis,
        trace_id: resultState.trace_id || null,
        client_build: resultState.client_build || null,
        server_build: resultState.server_build || auditMeta.serverBuild,
        executor: resultState.executor || auditMeta.executor,
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
      type: "turn.error",
      data: {
        code: "analysis_failed",
        message: "建议生成稍慢，已跳过本次建议。",
        trace_id: resultState.trace_id || null,
        client_build: resultState.client_build || null,
        server_build: resultState.server_build || auditMeta.serverBuild,
        executor: resultState.executor || auditMeta.executor,
        ts: nowIso(),
      },
    })
  }

  await finishJob({
    jobId: args.jobId,
    result: mergeResult(resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
    }),
  })

  return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
}

export async function listVoiceCoachQueuedJobs(args?: {
  maxJobs?: number
  allowedStages?: Array<VoiceCoachJobStage>
  newestFirst?: boolean
  maxQueueAgeMs?: number
  includeClaimHint?: boolean
}): Promise<VoiceCoachQueuedJobRecord[]> {
  const admin = createAdminSupabaseClient()
  const maxJobs = Math.max(1, Math.min(50, Number(args?.maxJobs || 10) || 10))
  const allowedStagesSet =
    Array.isArray(args?.allowedStages) && args.allowedStages.length ? new Set(args.allowedStages) : null
  const newestFirst = Boolean(args?.newestFirst)
  const includeClaimHint = Boolean(args?.includeClaimHint)
  const maxQueueAgeMsRaw = Number(args?.maxQueueAgeMs || 0)
  const maxQueueAgeMs = Number.isFinite(maxQueueAgeMsRaw) ? Math.max(0, Math.round(maxQueueAgeMsRaw)) : 0
  const queuedAfterIso = maxQueueAgeMs > 0 ? new Date(Date.now() - maxQueueAgeMs).toISOString() : null

  const selectCols = includeClaimHint
    ? "id, session_id, user_id, turn_id, stage, attempt_count, payload_json, result_json, created_at, updated_at"
    : "id, session_id, user_id, stage, created_at"

  let query = admin
    .from("voice_coach_jobs")
    .select(selectCols)
    .eq("status", "queued")
    .order("created_at", { ascending: !newestFirst })
    .limit(maxJobs)

  if (allowedStagesSet) {
    query = query.in("stage", Array.from(allowedStagesSet))
  }
  if (queuedAfterIso) {
    query = query.gte("created_at", queuedAfterIso)
  }

  const { data, error } = await query
  if (error || !data || data.length <= 0) return []

  return data
    .map((row: any) => ({
      id: String(row.id || ""),
      sessionId: String(row.session_id || ""),
      userId: String(row.user_id || ""),
      stage: normalizeJobStage(row.stage),
      createdAt: String(row.created_at || ""),
      turnId: includeClaimHint ? String(row.turn_id || "") || undefined : undefined,
      attemptCount: includeClaimHint ? Math.max(0, Number(row.attempt_count || 0) || 0) : undefined,
      payload: includeClaimHint ? ((row.payload_json || {}) as VoiceCoachJobPayload) : undefined,
      resultState: includeClaimHint ? ((row.result_json || {}) as VoiceCoachJobResultState) : undefined,
      updatedAt: includeClaimHint ? String(row.updated_at || "") || undefined : undefined,
    }))
    .filter((row) => row.id && row.sessionId && row.userId)
}

export async function recoverStaleVoiceCoachProcessingJobs(args?: {
  staleMs?: number
  maxJobs?: number
  allowedStages?: Array<VoiceCoachJobStage>
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const staleMs = Math.max(3000, Number(args?.staleMs || processingStaleMs()) || processingStaleMs())
  const maxJobs = Math.max(1, Math.min(100, Number(args?.maxJobs || 20) || 20))
  const staleBeforeIso = new Date(Date.now() - staleMs).toISOString()
  const allowedStagesSet =
    Array.isArray(args?.allowedStages) && args.allowedStages.length ? new Set(args.allowedStages) : null

  let staleQuery = admin
    .from("voice_coach_jobs")
    .select("id, stage")
    .eq("status", "processing")
    .lt("updated_at", staleBeforeIso)
    .order("updated_at", { ascending: true })
    .limit(maxJobs)

  if (allowedStagesSet) {
    staleQuery = staleQuery.in("stage", Array.from(allowedStagesSet))
  }

  const { data: staleJobs } = await staleQuery
  if (!staleJobs || staleJobs.length <= 0) return 0

  let recovered = 0
  for (let i = 0; i < staleJobs.length; i++) {
    const stale = staleJobs[i]
    if (!stale?.id) continue
    const staleStage = normalizeJobStage(stale.stage)
    const recoveredAt = nowIso()
    const { error } = await admin
      .from("voice_coach_jobs")
      .update({
        status: "queued",
        stage: staleStage,
        last_error: "requeued_stale_processing",
        updated_at: recoveredAt,
      })
      .eq("id", String(stale.id))
      .eq("status", "processing")

    if (!error) recovered += 1
  }

  return recovered
}

export async function recordVoiceCoachWorkerHeartbeat(args: {
  workerId: string
  host?: string | null
  pid?: number | null
  status?: "started" | "alive" | "stopped" | string
  meta?: Record<string, unknown> | null
}): Promise<void> {
  const workerId = String(args.workerId || "").trim().slice(0, 120)
  if (!workerId) return
  const admin = createAdminSupabaseClient()
  const heartbeatAt = nowIso()
  const host = args.host ? String(args.host).trim().slice(0, 120) : null
  const pid = typeof args.pid === "number" && Number.isFinite(args.pid) ? Math.max(0, Math.round(args.pid)) : null
  const status = String(args.status || "alive").trim().slice(0, 32) || "alive"
  const meta =
    args.meta && typeof args.meta === "object" && !Array.isArray(args.meta) ? { ...(args.meta as Record<string, unknown>) } : {}
  const { error } = await admin.from("voice_coach_worker_heartbeats").upsert(
    {
      worker_id: workerId,
      heartbeat_at: heartbeatAt,
      updated_at: heartbeatAt,
      host,
      pid,
      status,
      meta_json: meta,
    },
    {
      onConflict: "worker_id",
      ignoreDuplicates: false,
    },
  )
  if (error) throw new Error(error.message || "voice_coach_worker_heartbeat_failed")
}

export async function processVoiceCoachJobById(args: {
  sessionId: string
  userId: string
  jobId: string
  executor?: VoiceCoachJobExecutor
  lockOwner?: string | null
  chainMainToTts?: boolean
  queuedHint?: {
    turnId?: string | null
    stage?: VoiceCoachJobStage | string | null
    attemptCount?: number | null
    payload?: VoiceCoachJobPayload | null
    resultState?: VoiceCoachJobResultState | null
    createdAt?: string | null
    updatedAt?: string | null
  }
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()

  const hintedStage = normalizeJobStage(args.queuedHint?.stage)
  const hintedTurnId = String(args.queuedHint?.turnId || "").trim()
  const hasQueuedHint = Boolean(args.queuedHint && hintedTurnId)

  const hintedJob = hasQueuedHint
    ? ({
        id: args.jobId,
        session_id: args.sessionId,
        user_id: args.userId,
        turn_id: hintedTurnId,
        status: "queued",
        stage: hintedStage,
        attempt_count: Math.max(0, Number(args.queuedHint?.attemptCount || 0) || 0),
        payload_json: (args.queuedHint?.payload || {}) as VoiceCoachJobPayload,
        result_json: (args.queuedHint?.resultState || {}) as VoiceCoachJobResultState,
        created_at: args.queuedHint?.createdAt || null,
        updated_at: args.queuedHint?.updatedAt || null,
      } as any)
    : null

  let job = hintedJob
  let jobError: any = null
  if (!job) {
    const queried = await admin
      .from("voice_coach_jobs")
      .select(
        "id, session_id, user_id, turn_id, status, stage, attempt_count, payload_json, result_json, created_at, updated_at",
      )
      .eq("id", args.jobId)
      .eq("session_id", args.sessionId)
      .eq("user_id", args.userId)
      .single()
    job = queried.data
    jobError = queried.error
  }

  if (jobError || !job) return { processed: false, done: false }
  if (job.status !== "queued") return { processed: false, done: job.status === "done" }

  const stage = normalizeJobStage(job.stage)
  const nextAttempt = (job.attempt_count || 0) + 1
  const claimedAt = nowIso()
  const executor = normalizeExecutor(args.executor)
  const lockOwner = args.lockOwner ? String(args.lockOwner).slice(0, 120) : null
  const createdAtMs = parseIsoToMs((job as any).created_at)
  const updatedAtMs = parseIsoToMs((job as any).updated_at)
  const claimStartedAtMs = parseIsoToMs(claimedAt) || Date.now()
  const resultStateBeforeClaim = ((job as any).result_json || {}) as VoiceCoachJobResultState
  const stageEnteredAtMsFromResult = asNumber(resultStateBeforeClaim.stage_entered_at_ms)
  // On retry/requeue, result_json.stage_entered_at_ms may be stale.
  // Use the freshest queued timestamp as the main-stage queue anchor.
  const queueAnchorCandidates = [stageEnteredAtMsFromResult, updatedAtMs, createdAtMs].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  const stageEnteredAtMsForMain =
    queueAnchorCandidates.length > 0 ? Math.max(...queueAnchorCandidates) : Date.now()
  const stageEnteredAtMsForClaim = stage === "main_pending" ? stageEnteredAtMsForMain : stageEnteredAtMsFromResult
  const claimedResultState = mergeResult(resultStateBeforeClaim, {
    stage_entered_at_ms: stageEnteredAtMsForClaim ?? undefined,
    picked_at_ms: claimStartedAtMs,
    picked_at: claimedAt,
    executor,
    claim_attempt_count: nextAttempt,
    lock_owner: lockOwner || undefined,
  })

  const { data: claimed, error: claimError } = await admin
    .from("voice_coach_jobs")
    .update({
      status: "processing",
      stage,
      attempt_count: nextAttempt,
      updated_at: claimedAt,
      last_error: null,
      result_json: claimedResultState,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, turn_id, stage, payload_json, result_json")
    .single()

  if (claimError || !claimed) return { processed: false, done: false }

  const payload = (claimed.payload_json || {}) as VoiceCoachJobPayload
  const resultStateRaw = (claimed.result_json || claimedResultState || {}) as VoiceCoachJobResultState
  const claimedAtMs = claimStartedAtMs
  const claimedStageEnteredAtMs =
    asNumber(resultStateRaw.stage_entered_at_ms) ?? (stage === "main_pending" ? stageEnteredAtMsForMain : null)
  const claimQueueBaseMs = claimedStageEnteredAtMs
  const queueWaitBeforeMainMs =
    stage === "main_pending"
      ? nonNegativeMs(claimedAtMs - (claimQueueBaseMs ?? stageEnteredAtMsForMain))
      : nonNegativeMs(resultStateRaw.queue_wait_before_main_ms)
  const queueWaitBeforeTtsRaw = asNumber(resultStateRaw.queue_wait_before_tts_ms)
  const queueWaitBeforeTtsValidRaw =
    asBoolean(resultStateRaw.queue_wait_before_tts_valid) ?? (queueWaitBeforeTtsRaw !== null && queueWaitBeforeTtsRaw >= 0)
  const queueWaitBeforeTtsSourceRaw =
    resultStateRaw.queue_wait_before_tts_source === "tts_queued_at_ms" ||
    resultStateRaw.queue_wait_before_tts_source === "stage_entered_at_ms" ||
    resultStateRaw.queue_wait_before_tts_source === "missing_anchor"
      ? resultStateRaw.queue_wait_before_tts_source
      : undefined
  const queueWaitBeforeTts =
    stage === "tts_pending"
      ? calcQueueWaitBeforeTts({
          nowMs: claimedAtMs,
          ttsQueuedAtMs: asNumber(resultStateRaw.tts_queued_at_ms),
          stageEnteredAtMs: claimedStageEnteredAtMs ?? null,
        })
      : {
          valueMs: queueWaitBeforeTtsRaw,
          valid: queueWaitBeforeTtsValidRaw,
          source: queueWaitBeforeTtsSourceRaw || (queueWaitBeforeTtsRaw === null ? "missing_anchor" : "tts_queued_at_ms"),
        }
  const auditMeta = buildAuditMeta(resultStateRaw, executor)
  const resultState = mergeResult(resultStateRaw, {
    trace_id: auditMeta.traceId,
    client_build: auditMeta.clientBuild,
    server_build: auditMeta.serverBuild,
    executor: auditMeta.executor,
    stage_entered_at_ms: claimedStageEnteredAtMs ?? undefined,
    queue_wait_before_main_ms: queueWaitBeforeMainMs ?? undefined,
    queue_wait_before_tts_ms: queueWaitBeforeTts.valueMs,
    queue_wait_before_tts_valid: queueWaitBeforeTts.valid,
    queue_wait_before_tts_source: queueWaitBeforeTts.source,
  })
  const turnId = String(claimed.turn_id)
  const jobId = String(claimed.id)

  try {
    if (stage === "main_pending") {
      const mainResult = await processMainStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        payload,
        resultState,
        executor,
        chainTtsInSameLock: Boolean(args.chainMainToTts),
        lockOwner,
      })

      if (
        args.chainMainToTts &&
        mainResult.processed &&
        !mainResult.done &&
        mainResult.nextStage === "tts_pending" &&
        mainResult.nextResultState
      ) {
        return await processTtsStage({
          sessionId: args.sessionId,
          userId: args.userId,
          jobId,
          turnId,
          resultState: mainResult.nextResultState,
          executor,
          assumeFreshCustomerTurn: true,
        })
      }

      return mainResult
    }

    if (stage === "tts_pending") {
      return await processTtsStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        resultState,
        executor,
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
        executor,
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
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
      traceId: auditMeta.traceId,
      clientBuild: auditMeta.clientBuild,
      serverBuild: auditMeta.serverBuild,
      executor: auditMeta.executor,
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
  jobTimeoutMs?: number
  skipStaleRecovery?: boolean
  executor?: VoiceCoachJobExecutor
  lockOwner?: string | null
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const maxJobs = Math.max(1, Math.min(5, Number(args.maxJobs || 1) || 1))
  const maxWallMs = Math.max(200, Number(args.maxWallMs || 1200) || 1200)
  const jobTimeoutMs = Math.max(200, Math.min(8000, Number(args.jobTimeoutMs || Math.min(maxWallMs, 900)) || 900))
  const mainStageTimeoutMs = Math.max(
    jobTimeoutMs,
    Math.min(9000, Number(process.env.VOICE_COACH_PUMP_MAIN_JOB_TIMEOUT_MS || 7000) || 7000),
  )
  const ttsStageTimeoutMs = Math.max(
    jobTimeoutMs,
    Math.min(12000, Number(process.env.VOICE_COACH_PUMP_TTS_JOB_TIMEOUT_MS || 7000) || 7000),
  )
  const allowedStagesSet = Array.isArray(args.allowedStages) && args.allowedStages.length ? new Set(args.allowedStages) : null
  const deadline = Date.now() + maxWallMs
  const executor = normalizeExecutor(args.executor || "worker")

  if (!args.skipStaleRecovery) {
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

    if (staleJobs && staleJobs.length > 0) {
      for (let i = 0; i < staleJobs.length; i++) {
        const stale = staleJobs[i]
        if (!stale?.id) continue
        const staleStage = normalizeJobStage(stale.stage)
        const recoveredAt = nowIso()
        await admin
          .from("voice_coach_jobs")
          .update({
            status: "queued",
            stage: staleStage,
            last_error: "requeued_stale_processing",
            updated_at: recoveredAt,
          })
          .eq("id", String(stale.id))
          .eq("status", "processing")
      }
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
      .order("created_at", { ascending: false })
      .limit(1)

    if (allowedStagesSet) {
      queuedQuery = queuedQuery.in("stage", Array.from(allowedStagesSet))
    }

    const { data: queued } = await queuedQuery

    const queuedStage = normalizeJobStage(queued?.[0]?.stage)
    const jobId = queued?.[0]?.id ? String(queued[0].id) : ""
    if (!jobId) break

    const remainingMs = deadline - Date.now()
    if (remainingMs < 40) break
    const effectiveTimeoutMs = Math.max(
      200,
      Math.min(
        remainingMs,
        queuedStage === "tts_pending"
          ? ttsStageTimeoutMs
          : queuedStage === "main_pending"
            ? mainStageTimeoutMs
            : jobTimeoutMs,
      ),
    )

    const resultWrap = await Promise.race([
      processVoiceCoachJobById({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        executor,
        lockOwner: args.lockOwner || null,
        chainMainToTts: executor === "worker",
      })
        .then((result) => ({ timedOut: false, result }))
        .catch(() => ({ timedOut: false, result: { processed: false, done: false } as ProcessJobResult })),
      sleep(effectiveTimeoutMs).then(() => ({
        timedOut: true,
        result: { processed: false, done: false } as ProcessJobResult,
      })),
    ])

    if (resultWrap.timedOut) {
      // Let the long-running processing continue in background, but don't block caller.
      break
    }

    const result = resultWrap.result

    if (!result.processed) {
      // Avoid hot loop when another request claimed it.
      await sleep(80)
      continue
    }

    processed += 1
  }

  return processed
}
