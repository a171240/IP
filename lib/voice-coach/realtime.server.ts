import { createServer, type IncomingMessage, type Server as HttpServer } from "http"
import { randomUUID } from "crypto"

import { jsonrepair } from "jsonrepair"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { WebSocketServer, WebSocket, type RawData } from "ws"
import { z } from "zod"

import { calcFillerRatio, calcWpm } from "@/lib/voice-coach/metrics"
import {
  getVoiceCoachRealtimeConfig,
  type VoiceCoachRealtimeAudioChunkPayload,
  type VoiceCoachRealtimeAudioEndPayload,
  type VoiceCoachRealtimeAudioFormat,
  type VoiceCoachRealtimeAsrInputSource,
  type VoiceCoachRealtimeClientMessage,
  type VoiceCoachRealtimeSessionStartPayload,
  type VoiceCoachRealtimeServerMessage,
} from "@/lib/voice-coach/realtime-contract"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"

type DoubaoTtsEmotion = "neutral" | "happy" | "sad" | "angry"

type DoubaoTtsResult = {
  audio: Buffer | null
  encoding: "mp3"
  durationSeconds: number | null
  requestId: string
}

type DoubaoAsrResult = {
  text: string
  confidence: number | null
  durationSeconds: number | null
  requestId: string
}

type RealtimeSessionRow = {
  id: string
  user_id: string
  scenario_id: string
  status: string
}

type RealtimeTurnRow = {
  id: string
  turn_index: number
  role: string
  text: string | null
  emotion: string | null
}

type CustomerTurnDraft = {
  text: string
  emotion: VoiceCoachEmotion
  tag: string
}

type BufferedSegment = {
  audio: Buffer
  durationSeconds: number | null
}

type RealtimeConnectionState = {
  ws: WebSocket
  traceId: string
  userId: string
  sessionId: string | null
  replyToTurnId: string | null
  clientAttemptId: string | null
  audioFormat: VoiceCoachRealtimeAudioFormat
  sampleRate: number
  channels: number
  chunkMs: number
  audioChunks: Buffer[]
  audioBytes: number
  receivedChunks: number
  pendingChunkMeta: VoiceCoachRealtimeAudioChunkPayload | null
  serverTurnId: string | null
  customerTurnId: string | null
  startedAtMs: number | null
  processingStartedAtMs: number | null
  firstAudioChunkMs: number | null
  interrupted: boolean
  closed: boolean
  partialInFlight: boolean
  lastPartialAtMs: number
  lastPartialText: string
  activeTask: Promise<void> | null
}

type StartGatewayResult = {
  server: HttpServer
  wss: WebSocketServer
  close: () => Promise<void>
}

const INLINE_AUDIO_MAX_BYTES = 600 * 1024
const MAX_REALTIME_AUDIO_BYTES = 4 * 1024 * 1024
const PARTIAL_PREVIEW_INTERVAL_MS = 1200
const PARTIAL_PREVIEW_MIN_BYTES = 8 * 1024
const DEFAULT_TTS_VOICE_TYPE = "zh_female_vv_uranus_bigtts"
const LEGACY_TTS_VOICE_ALIASES = new Set(["bv700_streaming", "bv700"])

const CustomerTurnSchema = z.object({
  text: z.string().min(1).max(300),
  emotion: z.enum(["neutral", "worried", "skeptical", "impatient", "pleased"] as const),
  tag: z.string().min(1).max(40),
})

function getIsoNow() {
  return new Date().toISOString()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timeoutMs(name: string, fallback: number): number {
  const raw = Number(process.env[name] || fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(1000, Math.round(raw))
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function checkVoiceCoachAccess(userId: string) {
  const enabled = String(process.env.VOICE_COACH_ENABLED ?? "")
    .trim()
    .toLowerCase()
  if (enabled !== "true") {
    return { ok: false as const, status: 404, error: "voice_coach_disabled" }
  }

  const allowListRaw = (process.env.VOICE_COACH_ALLOW_USER_IDS || "").trim()
  if (allowListRaw) {
    const allowList = new Set(parseCsv(allowListRaw))
    if (!allowList.has(userId)) {
      return { ok: false as const, status: 403, error: "voice_coach_not_allowed" }
    }
  }

  const maxTurns = Math.max(1, Number(process.env.VOICE_COACH_MAX_TURNS || 10) || 10)
  return { ok: true as const, maxTurns }
}

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    process.env.IPgongchang_SUPABASE_URL ||
    ""
  )
}

function getSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.IPgongchang_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.IPgongchang_SUPABASE_SECRET_KEY ||
    ""
  )
}

function createAdminSupabaseClient() {
  const url = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  if (!url || !serviceRoleKey) {
    throw new Error("supabase_admin_env_missing")
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function uploadVoiceCoachAudio(opts: {
  path: string
  data: Buffer
  contentType: string
}) {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from("voice-coach-audio").upload(opts.path, opts.data, {
    contentType: opts.contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message || "storage_upload_failed")
}

async function signVoiceCoachAudio(path: string, expiresInSeconds = 3600) {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.from("voice-coach-audio").createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message || "storage_signed_url_failed")
  return data.signedUrl
}

async function emitVoiceCoachEvent(args: {
  sessionId: string
  userId: string
  type: "turn.accepted" | "beautician.asr_ready" | "customer.text_ready" | "customer.audio_ready" | "turn.error"
  turnId?: string | null
  data?: Record<string, unknown> | null
}) {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.from("voice_coach_events").insert({
    session_id: args.sessionId,
    user_id: args.userId,
    turn_id: args.turnId || null,
    type: args.type,
    data_json: args.data || {},
  })
  if (error) throw new Error(error.message || "voice_coach_event_insert_failed")
}

function getEnvOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim()
  if (!value) throw new Error(`${name}_missing`)
  return value
}

function normalizeTtsVoiceType(input: string): string {
  const normalized = input.trim()
  if (!normalized) return DEFAULT_TTS_VOICE_TYPE
  const lower = normalized.toLowerCase()
  if (LEGACY_TTS_VOICE_ALIASES.has(lower)) return DEFAULT_TTS_VOICE_TYPE
  if (/^bv\d+(_streaming)?$/i.test(normalized)) return DEFAULT_TTS_VOICE_TYPE
  return normalized
}

function ttsProfile(): "fast" | "balanced" {
  const raw = String(process.env.VOICE_COACH_TTS_PROFILE || "fast")
    .trim()
    .toLowerCase()
  return raw === "fast" ? "fast" : "balanced"
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout: number, timeoutError: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(timeoutError)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function doubaoTts(opts: {
  text: string
  emotion?: DoubaoTtsEmotion
  uid?: string
}): Promise<DoubaoTtsResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const profile = ttsProfile()
  const isFastProfile = profile === "fast"
  const cluster = (process.env.VOLC_TTS_CLUSTER || "volcano_tts").trim()
  const configuredVoiceType = normalizeTtsVoiceType(process.env.VOLC_TTS_VOICE_TYPE || DEFAULT_TTS_VOICE_TYPE)
  const fallbackVoiceTypes = isFastProfile
    ? []
    : String(process.env.VOLC_TTS_FALLBACK_VOICES || "")
        .split(",")
        .map((s) => normalizeTtsVoiceType(s))
        .filter(Boolean)
  const voiceTypeCandidates = Array.from(new Set([configuredVoiceType, ...fallbackVoiceTypes])).filter(Boolean)
  const language = (process.env.VOLC_TTS_LANGUAGE || "cn").trim()
  const ttsTimeout = timeoutMs("VOLC_TTS_TIMEOUT_MS", isFastProfile ? 6500 : 12000)
  const maxRetry = isFastProfile ? 0 : 1
  const allowEmotionFallback = !isFastProfile
  const requestId = randomUUID()

  const bodyBase = {
    app: {
      appid,
      token: "voice_coach",
      cluster,
    },
    user: {
      uid: opts.uid || "voice_coach",
    },
    audio: {
      voice_type: configuredVoiceType,
      encoding: "mp3",
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
      language,
      ...(opts.emotion ? { emotion: opts.emotion } : {}),
    },
    request: {
      reqid: requestId,
      text: opts.text,
      text_type: "plain",
      operation: "query",
    },
  }

  async function doRequestOnce(body: Record<string, unknown>) {
    const res = await fetchWithTimeout(
      "https://openspeech.bytedance.com/api/v1/tts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer;${accessToken}`,
        },
        body: JSON.stringify(body),
      },
      ttsTimeout,
      "tts_timeout",
    )

    const json = (await res.json().catch(() => null)) as
      | { code?: number; message?: string; data?: string; addition?: unknown }
      | null
    if (!res.ok) {
      throw new Error(json?.message || `tts_http_${res.status}`)
    }
    if (typeof json?.code === "number" && json.code !== 0 && json.code !== 3000) {
      throw new Error(json?.message || `tts_code_${json.code}`)
    }
    if (!json?.data || typeof json.data !== "string") {
      throw new Error("tts_missing_audio")
    }

    return {
      audio: Buffer.from(json.data, "base64"),
      durationSeconds: safeNumber((json as { addition?: any } | null)?.addition?.duration)
        ? Number((json as { addition?: any }).addition.duration) / 1000
        : null,
    }
  }

  async function doRequestWithRetry(body: Record<string, unknown>) {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      try {
        return await doRequestOnce(body)
      } catch (error) {
        lastError = error
        if (attempt >= maxRetry) break
        await sleep(120 * (attempt + 1))
      }
    }
    throw lastError instanceof Error ? lastError : new Error("tts_request_failed")
  }

  let lastError: unknown = null
  for (const voiceType of voiceTypeCandidates) {
    const withEmotion = {
      ...bodyBase,
      audio: {
        ...bodyBase.audio,
        voice_type: voiceType,
        ...(opts.emotion ? { emotion: opts.emotion } : {}),
      },
    }

    try {
      const result = await doRequestWithRetry(withEmotion)
      return {
        audio: result.audio,
        encoding: "mp3",
        durationSeconds: result.durationSeconds,
        requestId,
      }
    } catch (error) {
      lastError = error
    }

    if (opts.emotion && allowEmotionFallback) {
      const withoutEmotion = {
        ...bodyBase,
        audio: {
          ...bodyBase.audio,
          voice_type: voiceType,
        },
      }
      try {
        const result = await doRequestWithRetry(withoutEmotion)
        return {
          audio: result.audio,
          encoding: "mp3",
          durationSeconds: result.durationSeconds,
          requestId,
        }
      } catch (error) {
        lastError = error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("tts_all_fallback_failed")
}

async function doubaoAsrFlash(opts: {
  audio: Buffer
  format: "mp3" | "wav" | "ogg" | "flac"
  uid?: string
}): Promise<DoubaoAsrResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const resourceId = String(process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim()
  if (!resourceId) throw new Error("asr_flash_resource_missing")
  const flashTimeout = timeoutMs("VOLC_ASR_FLASH_TIMEOUT_MS", 12000)
  const requestId = randomUUID()

  const res = await fetchWithTimeout(
    "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1",
      },
      body: JSON.stringify({
        user: { uid: opts.uid || "voice_coach" },
        audio: {
          format: opts.format,
          data: opts.audio.toString("base64"),
        },
        request: {
          model_name: "bigmodel",
          enable_punc: true,
          show_utterances: true,
          result_type: "single",
          enable_ddc: true,
          enable_speaker_info: false,
          enable_channel_split: false,
          vad_segment_duration: 8000,
        },
      }),
    },
    flashTimeout,
    "asr_flash_timeout",
  )

  const statusCodeHeader = res.headers.get("X-Api-Status-Code") || res.headers.get("x-api-status-code") || ""
  if (statusCodeHeader && statusCodeHeader !== "20000000" && statusCodeHeader !== "20000003") {
    throw new Error(`asr_status_${statusCodeHeader}`)
  }

  const json = (await res.json().catch(() => null)) as
    | {
        result?: { text?: string }
        audio_info?: { duration?: number }
        utterances?: Array<{ confidence?: number }>
      }
    | null
  if (!res.ok) {
    throw new Error(`asr_http_${res.status}`)
  }

  return {
    text: typeof json?.result?.text === "string" ? json.result.text.trim() : "",
    confidence: safeNumber(json?.utterances?.[0]?.confidence),
    durationSeconds: safeNumber(json?.audio_info?.duration) ? Number(json?.audio_info?.duration) / 1000 : null,
    requestId,
  }
}

async function doubaoAsrAuc(opts: {
  audioUrl: string
  format: "mp3" | "wav" | "ogg" | "raw"
  uid?: string
}): Promise<DoubaoAsrResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const configuredResourceId = (process.env.VOLC_ASR_RESOURCE_ID || "volc.seedasr.auc").trim()
  const resourceId =
    configuredResourceId === "volc.bigasr.auc_idle" || configuredResourceId === "volc.seedasr.auc_idle"
      ? "volc.seedasr.auc"
      : configuredResourceId
  const submitTimeout = timeoutMs("VOLC_ASR_AUC_SUBMIT_TIMEOUT_MS", 8000)
  const queryTimeout = timeoutMs("VOLC_ASR_AUC_QUERY_TIMEOUT_MS", 8000)
  const maxAttempts = Math.max(1, Number(process.env.VOLC_ASR_AUC_QUERY_MAX_ATTEMPTS || 12) || 12)
  const requestId = randomUUID()

  const submitRes = await fetchWithTimeout(
    "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1",
      },
      body: JSON.stringify({
        user: { uid: opts.uid || "voice_coach" },
        audio: { format: opts.format, url: opts.audioUrl },
        request: { model_name: "bigmodel", enable_itn: true },
      }),
    },
    submitTimeout,
    "asr_auc_submit_timeout",
  )

  const submitStatus = submitRes.headers.get("X-Api-Status-Code") || submitRes.headers.get("x-api-status-code") || ""
  const submitMsg = submitRes.headers.get("X-Api-Message") || submitRes.headers.get("x-api-message") || ""
  await submitRes.arrayBuffer().catch(() => null)
  if (!submitRes.ok) throw new Error(`asr_auc_submit_http_${submitRes.status}`)
  if (submitStatus && submitStatus !== "20000000") {
    throw new Error(`asr_auc_submit_status_${submitStatus}${submitMsg ? `:${submitMsg}` : ""}`)
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(350 + attempt * 120)
    const queryRes = await fetchWithTimeout(
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-App-Key": appid,
          "X-Api-Access-Key": accessToken,
          "X-Api-Resource-Id": resourceId,
          "X-Api-Request-Id": requestId,
          "X-Api-Sequence": "-1",
        },
        body: JSON.stringify({
          user: { uid: opts.uid || "voice_coach" },
        }),
      },
      queryTimeout,
      "asr_auc_query_timeout",
    )

    const json = (await queryRes.json().catch(() => null)) as
      | {
          code?: number
          result?: { text?: string }
          audio_info?: { duration?: number }
          utterances?: Array<{ confidence?: number }>
        }
      | null
    if (!queryRes.ok) {
      throw new Error(`asr_auc_query_http_${queryRes.status}`)
    }

    const code = Number(json?.code || 0)
    if (code === 20000000) {
      return {
        text: typeof json?.result?.text === "string" ? json.result.text.trim() : "",
        confidence: safeNumber(json?.utterances?.[0]?.confidence),
        durationSeconds: safeNumber(json?.audio_info?.duration) ? Number(json?.audio_info?.duration) / 1000 : null,
        requestId,
      }
    }
  }

  throw new Error("asr_auc_query_exhausted")
}

function formatHistory(history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>) {
  if (!history.length) return "（无历史对话）"
  return history
    .map((turn) => {
      const who = turn.role === "customer" ? "顾客" : "美容师"
      const emo = turn.role === "customer" && turn.emotion ? `（情绪：${turn.emotion}）` : ""
      return `${who}${emo}：${turn.text}`
    })
    .join("\n")
}

async function llmGenerateCustomerTurn(opts: {
  scenario: ReturnType<typeof getScenario>
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  target?: string
}) {
  const apiKey = process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY
  const baseUrl =
    process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || "https://api.evolink.ai/v1"
  const model =
    process.env.APIMART_VOICE_COACH_FAST_MODEL ||
    process.env.APIMART_QUICK_MODEL ||
    process.env.APIMART_MODEL ||
    "kimi-k2-thinking-turbo"
  const timeout = Math.max(3000, Number(process.env.APIMART_FAST_TIMEOUT_MS || 6000) || 6000)
  if (!apiKey) {
    throw new Error("APIMART_API_KEY_missing")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: [
              "你在一个微信小程序里扮演“顾客”，用于训练美容师销售话术。",
              `场景：${opts.scenario.name}`,
              `商家背景：${opts.scenario.businessContext}`,
              `顾客人设：${opts.scenario.customerPersona}`,
              "要求：只输出严格 JSON，不要任何多余文字。",
              'JSON 结构：{ "text": string, "emotion": "neutral|worried|skeptical|impatient|pleased", "tag": string }',
              "约束：顾客说话要自然、口语化，长度 10-35 字。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "对话历史：",
              formatHistory(opts.history),
              "",
              `本轮目标：${opts.target || "继续追问并要求更具体证据，推动美容师给出可验证信息"}`,
              "",
              `可用话题标签：${opts.scenario.seedTopics.join(" / ")}`,
            ].join("\n"),
          },
        ],
        response_format: { type: "json_object" },
      }),
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.error || `llm_http_${res.status}`)
    }

    const content = String(json?.choices?.[0]?.message?.content || "").trim()
    if (!content) throw new Error("llm_empty_content")
    const parsed = JSON.parse(jsonrepair(content))
    return CustomerTurnSchema.parse(parsed)
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("llm_timeout")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function parseBearerToken(request: IncomingMessage): string | null {
  const auth = request.headers.authorization
  const raw = Array.isArray(auth) ? auth[0] : auth
  if (!raw) return null
  const match = String(raw).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function shouldUseFlashAsr() {
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

function shouldAllowAucFallbackWhenFlashEnabled() {
  const raw = String(process.env.VOICE_COACH_ASR_ALLOW_AUC_FALLBACK || "false")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function audioSpec(format: VoiceCoachRealtimeAudioFormat): {
  ext: string
  contentType: string
  aucFormat: "mp3" | "wav" | "ogg" | "raw"
  flashFormat: "mp3" | "wav" | "ogg" | "flac" | null
} {
  if (format === "wav") {
    return {
      ext: "wav",
      contentType: "audio/wav",
      aucFormat: "wav",
      flashFormat: "wav",
    }
  }
  if (format === "ogg") {
    return {
      ext: "ogg",
      contentType: "audio/ogg",
      aucFormat: "ogg",
      flashFormat: "ogg",
    }
  }
  if (format === "pcm16") {
    return {
      ext: "pcm",
      contentType: "application/octet-stream",
      aucFormat: "raw",
      flashFormat: null,
    }
  }

  return {
    ext: "mp3",
    contentType: "audio/mpeg",
    aucFormat: "mp3",
    flashFormat: "mp3",
  }
}

function approxAudioSeconds(state: RealtimeConnectionState) {
  return Math.max(0.2, (state.receivedChunks * Math.max(100, state.chunkMs)) / 1000)
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

function normalizeEmotion(raw: unknown): VoiceCoachEmotion {
  const value = String(raw || "").trim()
  if (value === "worried") return "worried"
  if (value === "skeptical") return "skeptical"
  if (value === "impatient") return "impatient"
  if (value === "pleased") return "pleased"
  return "neutral"
}

function fallbackCustomerTurn(text: string, scenarioId: string): CustomerTurnDraft {
  const scenario = getScenario(scenarioId)
  const pool = scenario.seedTopics || []
  if (/价格|贵|预算|优惠|折扣/.test(text)) {
    return {
      text: "价格我还是觉得偏高，你能再说具体点吗？",
      emotion: "skeptical",
      tag: "价格贵",
    }
  }
  if (/安全|风险|资质|认证|规范/.test(text)) {
    return {
      text: "你说安全我理解，但具体保障是什么？",
      emotion: "worried",
      tag: "胸部安全",
    }
  }
  if (/案例|口碑|反馈|对比/.test(text)) {
    return {
      text: "你方便给我一个更具体的真实案例吗？",
      emotion: "skeptical",
      tag: "真实案例",
    }
  }
  return {
    text: "我理解你的意思，不过我还想听更具体一点。",
    emotion: "skeptical",
    tag: String(pool[0] || "产品信任"),
  }
}

function splitTextForStreaming(text: string, targetSegmentMs: number): string[] {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return []

  const targetChars = Math.max(10, Math.min(28, Math.round(targetSegmentMs / 60)))
  const rawParts = normalized
    .split(/(?<=[。！？!?；;])/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (!rawParts.length) return [normalized]

  const segments: string[] = []
  let current = ""
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i]
    const next = current ? `${current}${part}` : part
    if (next.length <= targetChars || !current) {
      current = next
      if (current.length < targetChars && i < rawParts.length - 1) continue
    } else {
      segments.push(current)
      current = part
      continue
    }

    if (current.length >= targetChars || /[。！？!?；;]$/.test(current)) {
      segments.push(current)
      current = ""
    }
  }

  if (current) segments.push(current)
  return segments.filter(Boolean)
}

async function authenticateRealtimeRequest(request: IncomingMessage): Promise<string> {
  const token = parseBearerToken(request)
  if (!token) throw new Error("missing_bearer_token")
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) throw new Error("invalid_bearer_token")
  return String(data.user.id)
}

async function loadSessionForUser(userId: string, sessionId: string): Promise<RealtimeSessionRow | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("voice_coach_sessions")
    .select("id, user_id, scenario_id, status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single()
  if (error || !data) return null
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    scenario_id: String(data.scenario_id || "objection_safety"),
    status: String(data.status || ""),
  }
}

async function loadReplyTurn(sessionId: string, replyToTurnId: string): Promise<RealtimeTurnRow | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("voice_coach_turns")
    .select("id, turn_index, role, text, emotion")
    .eq("id", replyToTurnId)
    .eq("session_id", sessionId)
    .single()
  if (error || !data) return null
  return {
    id: String(data.id),
    turn_index: Number(data.turn_index || 0),
    role: String(data.role || ""),
    text: data.text ? String(data.text) : null,
    emotion: data.emotion ? String(data.emotion) : null,
  }
}

async function loadLatestTurn(sessionId: string): Promise<{ id: string; turn_index: number } | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("voice_coach_turns")
    .select("id, turn_index")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: false })
    .limit(1)
  if (error || !data?.[0]?.id) return null
  return {
    id: String(data[0].id),
    turn_index: Number(data[0].turn_index || 0),
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
      role: String(row.role || "") === "beautician" ? "beautician" : "customer",
      text: String(row.text || ""),
      emotion: row.emotion ? normalizeEmotion(row.emotion) : undefined,
    })) as Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
}

function sendServerMessage(
  state: RealtimeConnectionState,
  type: VoiceCoachRealtimeServerMessage["type"],
  payload: Record<string, unknown>,
) {
  if (state.closed || state.ws.readyState !== WebSocket.OPEN) return
  const message: VoiceCoachRealtimeServerMessage = {
    type,
    ts: getIsoNow(),
    trace_id: state.traceId,
    payload,
  } as VoiceCoachRealtimeServerMessage
  state.ws.send(JSON.stringify(message))
}

function sendError(state: RealtimeConnectionState, code: string, message: string, retryable = false) {
  sendServerMessage(state, "error", {
    code,
    message,
    retryable,
  })
}

function sendTurnDone(state: RealtimeConnectionState, status: "done" | "interrupted" | "error") {
  sendServerMessage(state, "turn.done", {
    turn_id: state.customerTurnId || state.serverTurnId || "",
    status,
  })
}

async function markTurnError(state: RealtimeConnectionState, code: string, message: string) {
  const turnId = state.serverTurnId
  const sessionId = state.sessionId
  if (!turnId || !sessionId) return
  const admin = createAdminSupabaseClient()
  await admin.from("voice_coach_turns").update({ status: "error" }).eq("id", turnId).eq("session_id", sessionId)
  await emitVoiceCoachEvent({
    sessionId,
    userId: state.userId,
    turnId,
    type: "turn.error",
    data: {
      code,
      message,
      ts: getIsoNow(),
    },
  }).catch(() => {})
}

async function transcribeAudio(opts: {
  userId: string
  audio: Buffer
  format: VoiceCoachRealtimeAudioFormat
  audioPath: string
}): Promise<{
  asr: DoubaoAsrResult
  inputSource: VoiceCoachRealtimeAsrInputSource
  inlineEligible: boolean
}> {
  const spec = audioSpec(opts.format)
  const inlineEligible = opts.audio.length <= INLINE_AUDIO_MAX_BYTES
  const flashEnabled = shouldUseFlashAsr() && Boolean(spec.flashFormat)
  const allowAucFallback = !flashEnabled || shouldAllowAucFallbackWhenFlashEnabled()

  let flashError: string | null = null
  if (flashEnabled && spec.flashFormat) {
    try {
      const asr = await doubaoAsrFlash({
        audio: opts.audio,
        format: spec.flashFormat,
        uid: opts.userId,
      })
      if (asr.text.trim()) {
        return {
          asr,
          inputSource: "inline",
          inlineEligible,
        }
      }
    } catch (error: any) {
      flashError = String(error?.message || error || "asr_flash_failed")
    }
  }

  if (!allowAucFallback) {
    throw new Error(flashError || "asr_empty")
  }

  const signed = await signVoiceCoachAudio(opts.audioPath)
  const asr = await doubaoAsrAuc({
    audioUrl: signed,
    format: spec.aucFormat,
    uid: opts.userId,
  })
  return {
    asr,
    inputSource: "signed_url",
    inlineEligible,
  }
}

async function maybeSendPartialPreview(state: RealtimeConnectionState) {
  if (state.partialInFlight || state.closed || state.processingStartedAtMs) return
  if (!shouldUseFlashAsr()) return
  if (state.audioFormat === "pcm16") return
  if (state.audioBytes < PARTIAL_PREVIEW_MIN_BYTES) return
  if (Date.now() - state.lastPartialAtMs < PARTIAL_PREVIEW_INTERVAL_MS) return

  const spec = audioSpec(state.audioFormat)
  if (!spec.flashFormat) return

  state.partialInFlight = true
  state.lastPartialAtMs = Date.now()
  const snapshot = Buffer.concat(state.audioChunks)
  try {
    const preview = await doubaoAsrFlash({
      audio: snapshot,
      format: spec.flashFormat,
      uid: state.userId,
    })
    const text = String(preview.text || "").trim()
    if (!text || text === state.lastPartialText) return
    state.lastPartialText = text
    sendServerMessage(state, "asr.partial", {
      turn_id: state.serverTurnId || "pending",
      text,
      is_final: false,
    })
  } catch {
    // Best-effort preview only.
  } finally {
    state.partialInFlight = false
  }
}

async function queueAnalysisJob(args: {
  sessionId: string
  userId: string
  beauticianTurnId: string
  replyToTurnId: string
  audioFormat: VoiceCoachRealtimeAudioFormat
  clientAudioSeconds: number | null
  pipelineStartedAtMs: number
  beauticianTurnIndex: number
  beauticianText: string
  beauticianAudioUrl: string | null
  beauticianAudioSeconds: number | null
  beauticianAsrConfidence: number | null
  nextCustomerTurnId?: string | null
  nextCustomerText?: string | null
  nextCustomerEmotion?: VoiceCoachEmotion | null
  nextCustomerTag?: string | null
  customerTextElapsedMs?: number | null
  customerAudioElapsedMs?: number | null
  reachedMaxTurns?: boolean
}) {
  const admin = createAdminSupabaseClient()
  const jobId = randomUUID()
  await admin.from("voice_coach_jobs").insert({
    id: jobId,
    session_id: args.sessionId,
    user_id: args.userId,
    turn_id: args.beauticianTurnId,
    status: "queued",
    stage: "analysis_pending",
    payload_json: {
      reply_to_turn_id: args.replyToTurnId,
      audio_format: args.audioFormat === "pcm16" ? "raw" : args.audioFormat,
      client_audio_seconds: args.clientAudioSeconds,
      client_attempt_id: null,
    },
    result_json: {
      pipeline_started_at_ms: args.pipelineStartedAtMs,
      reached_max_turns: Boolean(args.reachedMaxTurns),
      reply_turn_id: args.replyToTurnId,
      beautician_turn_index: args.beauticianTurnIndex,
      beautician_text: args.beauticianText,
      beautician_audio_url: args.beauticianAudioUrl,
      beautician_audio_seconds: args.beauticianAudioSeconds,
      beautician_asr_confidence: args.beauticianAsrConfidence,
      next_customer_turn_id: args.nextCustomerTurnId || undefined,
      next_customer_text: args.nextCustomerText || undefined,
      next_customer_emotion: args.nextCustomerEmotion || undefined,
      next_customer_tag: args.nextCustomerTag || undefined,
      customer_text_elapsed_ms: args.customerTextElapsedMs || undefined,
      customer_audio_elapsed_ms: args.customerAudioElapsedMs || undefined,
    },
  })
}

async function synthesizeStreamingSegments(opts: {
  userId: string
  emotion: VoiceCoachEmotion
  text: string
  targetSegmentMs: number
  streamEnabled: boolean
  onChunk: (args: { seq: number; total: number; segment: BufferedSegment }) => Promise<void>
  interrupted: () => boolean
}): Promise<{ finalAudio: BufferedSegment | null; firstChunkMs: number | null }> {
  const segmentsText = splitTextForStreaming(opts.text, opts.targetSegmentMs)
  if (!segmentsText.length) return { finalAudio: null, firstChunkMs: null }

  let firstChunkMs: number | null = null
  let firstSegment: BufferedSegment | null = null

  if (opts.streamEnabled) {
    for (let i = 0; i < segmentsText.length; i++) {
      if (opts.interrupted()) return { finalAudio: null, firstChunkMs }

      const result = await doubaoTts({
        text: segmentsText[i],
        emotion: mapEmotionToTts(opts.emotion),
        uid: opts.userId,
      })
      if (!result.audio) continue

      const segment = {
        audio: result.audio,
        durationSeconds: result.durationSeconds,
      }

      if (!firstSegment) firstSegment = segment
      await opts.onChunk({ seq: i + 1, total: segmentsText.length, segment })
      if (firstChunkMs == null) firstChunkMs = Date.now()
    }
  }

  if (opts.interrupted()) return { finalAudio: null, firstChunkMs }

  if (segmentsText.length === 1 && firstSegment) {
    return { finalAudio: firstSegment, firstChunkMs }
  }

  const full = await doubaoTts({
    text: opts.text,
    emotion: mapEmotionToTts(opts.emotion),
    uid: opts.userId,
  })

  return {
    finalAudio: full.audio
      ? {
          audio: full.audio,
          durationSeconds: full.durationSeconds,
        }
      : null,
    firstChunkMs,
  }
}

async function processRealtimeTurn(state: RealtimeConnectionState, _payload: VoiceCoachRealtimeAudioEndPayload) {
  if (state.activeTask) return

  state.activeTask = (async () => {
    const sessionId = state.sessionId
    const replyToTurnId = state.replyToTurnId
    if (!sessionId || !replyToTurnId) {
      sendError(state, "session_not_initialized", "实时语音会话未初始化", true)
      return
    }

    if (!state.receivedChunks || !state.audioChunks.length) {
      sendError(state, "audio_empty", "没有收到有效录音数据", true)
      return
    }

    if (state.audioBytes > MAX_REALTIME_AUDIO_BYTES) {
      sendError(state, "audio_too_large", "录音太长，请缩短本轮语音", true)
      return
    }

    state.processingStartedAtMs = Date.now()
    const pipelineStartedAtMs = state.processingStartedAtMs

    try {
      const session = await loadSessionForUser(state.userId, sessionId)
      if (!session || session.status !== "active") {
        sendError(state, "session_not_active", "会话已结束或不存在", false)
        return
      }

      const access = checkVoiceCoachAccess(state.userId)
      if (!access.ok) {
        sendError(state, access.error, "当前账号未开通语音教练", false)
        return
      }

      const replyTurn = await loadReplyTurn(sessionId, replyToTurnId)
      if (!replyTurn || replyTurn.role !== "customer") {
        sendError(state, "reply_turn_invalid", "当前顾客回合不存在", true)
        return
      }

      const latestTurn = await loadLatestTurn(sessionId)
      if (latestTurn?.id && latestTurn.id !== replyTurn.id) {
        sendError(state, "reply_turn_stale", "顾客回合已变化，请重新开始本轮练习", true)
        return
      }

      const audio = Buffer.concat(state.audioChunks)
      const spec = audioSpec(state.audioFormat)
      const admin = createAdminSupabaseClient()

      const beauticianTurnId = randomUUID()
      state.serverTurnId = beauticianTurnId
      const beauticianTurnIndex = Number(replyTurn.turn_index || 0) + 1
      const estimatedSeconds = approxAudioSeconds(state)
      const audioPath = `${state.userId}/${sessionId}/${beauticianTurnId}.${spec.ext}`

      await uploadVoiceCoachAudio({
        path: audioPath,
        data: audio,
        contentType: spec.contentType,
      })

      const beauticianAudioUrl = await signVoiceCoachAudio(audioPath)

      await admin.from("voice_coach_turns").insert({
        id: beauticianTurnId,
        session_id: sessionId,
        turn_index: beauticianTurnIndex,
        role: "beautician",
        text: "",
        audio_path: audioPath,
        audio_seconds: estimatedSeconds,
        status: "accepted",
      })

      await emitVoiceCoachEvent({
        sessionId,
        userId: state.userId,
        turnId: beauticianTurnId,
        type: "turn.accepted",
        data: {
          turn_id: beauticianTurnId,
          audio_url: beauticianAudioUrl,
          audio_seconds: Math.round(estimatedSeconds),
          realtime: true,
          ts: getIsoNow(),
        },
      })

      sendServerMessage(state, "session.ready", {
        session_id: sessionId,
        turn_id: beauticianTurnId,
        realtime: true,
      })

      const asrResult = await transcribeAudio({
        userId: state.userId,
        audio,
        format: state.audioFormat,
        audioPath,
      })

      const asrText = String(asrResult.asr.text || "").trim()
      if (!asrText) {
        sendError(state, "asr_empty", "未识别到有效语音，请重试", true)
        await markTurnError(state, "asr_empty", "未识别到有效语音，请重试")
        return
      }

      const audioSeconds = asrResult.asr.durationSeconds || estimatedSeconds
      const wpm = calcWpm(asrText, audioSeconds)
      const fillerRatio = calcFillerRatio(asrText)
      const reachedMaxTurns = Math.floor((beauticianTurnIndex + 1) / 2) >= access.maxTurns

      await admin
        .from("voice_coach_turns")
        .update({
          text: asrText,
          asr_confidence: asrResult.asr.confidence,
          audio_seconds: audioSeconds,
          features_json: {
            wpm,
            filler_ratio: fillerRatio,
          },
          status: "asr_ready",
        })
        .eq("id", beauticianTurnId)
        .eq("session_id", sessionId)

      const asrStageElapsedMs = Date.now() - pipelineStartedAtMs

      await emitVoiceCoachEvent({
        sessionId,
        userId: state.userId,
        turnId: beauticianTurnId,
        type: "beautician.asr_ready",
        data: {
          turn_id: beauticianTurnId,
          text: asrText,
          confidence: asrResult.asr.confidence,
          audio_seconds: audioSeconds,
          audio_url: beauticianAudioUrl,
          reached_max_turns: reachedMaxTurns,
          inline_audio_eligible: asrResult.inlineEligible,
          asr_input_source: asrResult.inputSource,
          stage_elapsed_ms: asrStageElapsedMs,
          realtime: true,
          ts: getIsoNow(),
        },
      })

      sendServerMessage(state, "asr.final", {
        turn_id: beauticianTurnId,
        text: asrText,
        is_final: true,
        audio_url: beauticianAudioUrl,
        audio_seconds: audioSeconds,
        confidence: asrResult.asr.confidence,
        stage_elapsed_ms: asrStageElapsedMs,
        reached_max_turns: reachedMaxTurns,
        inline_audio_eligible: asrResult.inlineEligible,
        asr_input_source: asrResult.inputSource,
      })

      if (reachedMaxTurns) {
        await queueAnalysisJob({
          sessionId,
          userId: state.userId,
          beauticianTurnId,
          replyToTurnId,
          audioFormat: state.audioFormat,
          clientAudioSeconds: audioSeconds,
          pipelineStartedAtMs,
          beauticianTurnIndex,
          beauticianText: asrText,
          beauticianAudioUrl,
          beauticianAudioSeconds: audioSeconds,
          beauticianAsrConfidence: asrResult.asr.confidence,
          reachedMaxTurns: true,
        })
        sendTurnDone(state, "done")
        return
      }

      const scenario = getScenario(session.scenario_id)
      const history = await buildHistory(sessionId, beauticianTurnIndex)

      let customerTurn = fallbackCustomerTurn(asrText, scenario.id)
      let llmFallbackUsed = false
      let llmFallbackReason = ""
      try {
        customerTurn = await llmGenerateCustomerTurn({
          scenario,
          history,
          target: "继续追问并要求更具体证据，推动美容师给出可验证信息",
        })
      } catch (error: any) {
        llmFallbackUsed = true
        llmFallbackReason = String(error?.message || error || "llm_failed")
      }

      const customerTurnId = randomUUID()
      state.customerTurnId = customerTurnId
      const customerTextElapsedMs = Date.now() - pipelineStartedAtMs

      await admin.from("voice_coach_turns").insert({
        id: customerTurnId,
        session_id: sessionId,
        turn_index: beauticianTurnIndex + 1,
        role: "customer",
        text: customerTurn.text,
        emotion: customerTurn.emotion,
        status: "text_ready",
        features_json: {
          tag: customerTurn.tag,
        },
      })

      await emitVoiceCoachEvent({
        sessionId,
        userId: state.userId,
        turnId: customerTurnId,
        type: "customer.text_ready",
        data: {
          turn_id: customerTurnId,
          beautician_turn_id: beauticianTurnId,
          text: customerTurn.text,
          emotion: customerTurn.emotion,
          llm_fallback_used: llmFallbackUsed,
          llm_fallback_reason: llmFallbackReason || null,
          stage_elapsed_ms: customerTextElapsedMs,
          realtime: true,
          ts: getIsoNow(),
        },
      })

      sendServerMessage(state, "customer.text_ready", {
        turn_id: customerTurnId,
        beautician_turn_id: beauticianTurnId,
        text: customerTurn.text,
        emotion: customerTurn.emotion,
        reply_source: llmFallbackUsed ? "fallback" : "llm",
        submit_fastpath_hit: false,
        stage_elapsed_ms: customerTextElapsedMs,
        asr_input_source: asrResult.inputSource,
        inline_audio_eligible: asrResult.inlineEligible,
      })

      const realtimeConfig = getVoiceCoachRealtimeConfig()
      let firstAudioChunkMs: number | null = null
      const ttsResult = await synthesizeStreamingSegments({
        userId: state.userId,
        emotion: customerTurn.emotion,
        text: customerTurn.text,
        targetSegmentMs: realtimeConfig.targetSegmentMs,
        streamEnabled: realtimeConfig.ttsStreamEnabled,
        interrupted: () => state.interrupted || state.closed,
        onChunk: async ({ seq, total, segment }) => {
          const nowMs = Date.now()
          if (firstAudioChunkMs == null) {
            firstAudioChunkMs = nowMs
            state.firstAudioChunkMs = nowMs
          }
          sendServerMessage(state, "customer.audio_chunk", {
            turn_id: customerTurnId,
            seq,
            chunk_base64: segment.audio.toString("base64"),
            duration_ms: segment.durationSeconds ? Math.round(segment.durationSeconds * 1000) : null,
            mime_type: "audio/mpeg",
            is_final: seq === total,
            first_audio_chunk_ms: nowMs - pipelineStartedAtMs,
          })
        },
      })

      if (state.interrupted || state.closed) {
        await admin
          .from("voice_coach_turns")
          .update({
            status: "text_ready",
          })
          .eq("id", customerTurnId)
          .eq("session_id", sessionId)
        sendTurnDone(state, "interrupted")
        return
      }

      let finalAudioUrl: string | null = null
      let finalAudioSeconds: number | null = null
      let ttsFailed = false

      if (ttsResult.finalAudio?.audio) {
        const customerAudioPath = `${state.userId}/${sessionId}/${customerTurnId}.mp3`
        await uploadVoiceCoachAudio({
          path: customerAudioPath,
          data: ttsResult.finalAudio.audio,
          contentType: "audio/mpeg",
        })
        finalAudioUrl = await signVoiceCoachAudio(customerAudioPath)
        finalAudioSeconds = ttsResult.finalAudio.durationSeconds
        await admin
          .from("voice_coach_turns")
          .update({
            audio_path: customerAudioPath,
            audio_seconds: finalAudioSeconds,
            status: "audio_ready",
          })
          .eq("id", customerTurnId)
          .eq("session_id", sessionId)
      } else {
        ttsFailed = true
        await admin
          .from("voice_coach_turns")
          .update({
            status: "text_ready",
          })
          .eq("id", customerTurnId)
          .eq("session_id", sessionId)
      }

      const customerAudioElapsedMs = Date.now() - pipelineStartedAtMs
      await emitVoiceCoachEvent({
        sessionId,
        userId: state.userId,
        turnId: customerTurnId,
        type: "customer.audio_ready",
        data: {
          turn_id: customerTurnId,
          beautician_turn_id: beauticianTurnId,
          audio_url: finalAudioUrl,
          audio_seconds: finalAudioSeconds,
          tts_failed: ttsFailed || !finalAudioUrl,
          text: customerTurn.text,
          first_audio_chunk_ms: firstAudioChunkMs != null ? firstAudioChunkMs - pipelineStartedAtMs : null,
          stage_elapsed_ms: customerAudioElapsedMs,
          realtime: true,
          ts: getIsoNow(),
        },
      })

      sendServerMessage(state, "customer.audio_ready", {
        turn_id: customerTurnId,
        beautician_turn_id: beauticianTurnId,
        audio_url: finalAudioUrl,
        audio_seconds: finalAudioSeconds,
        first_audio_chunk_ms: firstAudioChunkMs != null ? firstAudioChunkMs - pipelineStartedAtMs : null,
        tts_failed: ttsFailed || !finalAudioUrl,
        text: customerTurn.text,
      })

      await queueAnalysisJob({
        sessionId,
        userId: state.userId,
        beauticianTurnId,
        replyToTurnId,
        audioFormat: state.audioFormat,
        clientAudioSeconds: audioSeconds,
        pipelineStartedAtMs,
        beauticianTurnIndex,
        beauticianText: asrText,
        beauticianAudioUrl,
        beauticianAudioSeconds: audioSeconds,
        beauticianAsrConfidence: asrResult.asr.confidence,
        nextCustomerTurnId: customerTurnId,
        nextCustomerText: customerTurn.text,
        nextCustomerEmotion: customerTurn.emotion,
        nextCustomerTag: customerTurn.tag,
        customerTextElapsedMs,
        customerAudioElapsedMs,
      })

      sendTurnDone(state, "done")
    } catch (error: any) {
      const message = String(error?.message || error || "voice_coach_realtime_failed")
      sendError(state, "voice_coach_realtime_failed", message, true)
      await markTurnError(state, "voice_coach_realtime_failed", message)
      sendTurnDone(state, "error")
    } finally {
      state.activeTask = null
    }
  })()

  await state.activeTask
}

function parseClientMessage(data: RawData): VoiceCoachRealtimeClientMessage | null {
  try {
    const text =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("utf8")
          : Array.isArray(data)
            ? Buffer.concat(data).toString("utf8")
            : Buffer.from(data as ArrayBuffer).toString("utf8")
    if (!text.trim()) return null
    return JSON.parse(text) as VoiceCoachRealtimeClientMessage
  } catch {
    return null
  }
}

async function handleClientMessage(
  state: RealtimeConnectionState,
  message: VoiceCoachRealtimeClientMessage,
  request: IncomingMessage,
) {
  if (message.type === "session.start") {
    const payload = message.payload as VoiceCoachRealtimeSessionStartPayload
    const sessionId = String(payload.session_id || "").trim()
    const replyToTurnId = String(payload.reply_to_turn_id || "").trim()
    if (!sessionId || !replyToTurnId) {
      sendError(state, "session_start_invalid", "缺少实时语音会话参数", true)
      return
    }

    const session = await loadSessionForUser(state.userId, sessionId)
    if (!session || session.status !== "active") {
      sendError(state, "session_not_active", "会话已结束或不存在", false)
      return
    }

    const access = checkVoiceCoachAccess(state.userId)
    if (!access.ok) {
      sendError(state, access.error, "当前账号未开通语音教练", false)
      return
    }

    const _token = parseBearerToken(request)
    state.sessionId = sessionId
    state.replyToTurnId = replyToTurnId
    state.clientAttemptId = payload.client_attempt_id ? String(payload.client_attempt_id) : null
    state.audioFormat = payload.audio_format || "mp3"
    state.sampleRate = Number(payload.sample_rate || 16000) || 16000
    state.channels = Number(payload.channels || 1) || 1
    state.chunkMs = Number(payload.chunk_ms || getVoiceCoachRealtimeConfig().defaultChunkMs) || 200
    state.startedAtMs = Date.now()
    state.audioChunks = []
    state.audioBytes = 0
    state.receivedChunks = 0
    state.pendingChunkMeta = null
    state.serverTurnId = null
    state.customerTurnId = null
    state.processingStartedAtMs = null
    state.firstAudioChunkMs = null
    state.interrupted = false
    state.lastPartialText = ""

    sendServerMessage(state, "session.ready", {
      session_id: sessionId,
      turn_id: null,
      realtime: true,
    })
    return
  }

  if (message.type === "audio.chunk") {
    state.pendingChunkMeta = message.payload as VoiceCoachRealtimeAudioChunkPayload
    return
  }

  if (message.type === "audio.end") {
    await processRealtimeTurn(state, message.payload as VoiceCoachRealtimeAudioEndPayload)
    return
  }

  if (message.type === "interrupt") {
    state.interrupted = true
    return
  }
}

function handleBinaryFrame(state: RealtimeConnectionState, data: RawData) {
  if (!state.pendingChunkMeta) {
    sendError(state, "audio_chunk_meta_missing", "音频分片元数据丢失", true)
    return
  }

  const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
  if (!buffer.length) return

  state.audioChunks.push(buffer)
  state.audioBytes += buffer.byteLength
  state.receivedChunks += 1
  state.pendingChunkMeta = null

  void maybeSendPartialPreview(state)
}

function makeConnectionState(ws: WebSocket, userId: string): RealtimeConnectionState {
  const config = getVoiceCoachRealtimeConfig()
  return {
    ws,
    traceId: randomUUID(),
    userId,
    sessionId: null,
    replyToTurnId: null,
    clientAttemptId: null,
    audioFormat: "mp3",
    sampleRate: 16000,
    channels: 1,
    chunkMs: config.defaultChunkMs,
    audioChunks: [],
    audioBytes: 0,
    receivedChunks: 0,
    pendingChunkMeta: null,
    serverTurnId: null,
    customerTurnId: null,
    startedAtMs: null,
    processingStartedAtMs: null,
    firstAudioChunkMs: null,
    interrupted: false,
    closed: false,
    partialInFlight: false,
    lastPartialAtMs: 0,
    lastPartialText: "",
    activeTask: null,
  }
}

async function processSocketFrame(
  state: RealtimeConnectionState,
  data: RawData,
  isBinary: boolean,
  request: IncomingMessage,
) {
  if (state.closed) return
  if (isBinary) {
    handleBinaryFrame(state, data)
    return
  }

  const message = parseClientMessage(data)
  if (!message) {
    sendError(state, "realtime_message_invalid", "实时消息格式错误", true)
    return
  }
  await handleClientMessage(state, message, request)
}

export async function startVoiceCoachRealtimeGateway(): Promise<StartGatewayResult> {
  const config = getVoiceCoachRealtimeConfig()
  const server = createServer((req, res) => {
    res.statusCode = 200
    res.setHeader("content-type", "text/plain; charset=utf-8")
    res.end("voicecoach realtime gateway")
  })

  const wss = new WebSocketServer({
    server,
    path: config.realtimePath,
  })

  wss.on("connection", async (ws, request) => {
    let state: RealtimeConnectionState | null = null
    let connectionClosed = false
    let authFailed = false
    let draining = false
    const pendingFrames: Array<{ data: RawData; isBinary: boolean }> = []

    const drainPendingFrames = async () => {
      if (draining || !state || state.closed) return
      draining = true
      try {
        while (pendingFrames.length && state && !state.closed) {
          const frame = pendingFrames.shift()
          if (!frame) break
          try {
            await processSocketFrame(state, frame.data, frame.isBinary, request)
          } catch (error: any) {
            sendError(state, "realtime_message_failed", String(error?.message || error || "message_failed"), true)
          }
        }
      } finally {
        draining = false
        if (pendingFrames.length && state && !state.closed) {
          void drainPendingFrames()
        }
      }
    }

    ws.on("message", (data, isBinary) => {
      if (authFailed || connectionClosed) return
      pendingFrames.push({ data, isBinary })
      void drainPendingFrames()
    })

    ws.on("close", () => {
      connectionClosed = true
      if (!state) return
      state.closed = true
      state.interrupted = true
    })

    ws.on("error", () => {
      connectionClosed = true
      if (!state) return
      state.closed = true
      state.interrupted = true
    })

    void (async () => {
      try {
        const userId = await authenticateRealtimeRequest(request)
        if (connectionClosed) return
        state = makeConnectionState(ws, userId)
        await drainPendingFrames()
      } catch (error: any) {
        authFailed = true
        pendingFrames.length = 0
        const message = String(error?.message || error || "auth_failed")
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              ts: getIsoNow(),
              trace_id: null,
              payload: {
                code: "realtime_auth_failed",
                message,
                retryable: false,
              },
            }),
          )
        }
        ws.close(4001, "auth_failed")
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(config.realtimePort, () => {
      server.off("error", reject)
      resolve()
    })
  })

  return {
    server,
    wss,
    close: async () => {
      await new Promise<void>((resolve) => {
        wss.close(() => resolve())
      })
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

export default startVoiceCoachRealtimeGateway
