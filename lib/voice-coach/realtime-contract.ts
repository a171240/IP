export const VOICE_COACH_REALTIME_CLIENT_MESSAGE_TYPES = [
  "session.start",
  "audio.chunk",
  "audio.end",
  "interrupt",
  "ping",
] as const

export const VOICE_COACH_REALTIME_SERVER_MESSAGE_TYPES = [
  "session.ready",
  "asr.partial",
  "asr.final",
  "customer.text_ready",
  "customer.audio_chunk",
  "customer.audio_ready",
  "turn.done",
  "error",
] as const

export const VOICE_COACH_REALTIME_METRIC_KEYS = [
  "inline_audio_eligible",
  "asr_input_source",
  "submit_fastpath_hit",
  "first_audio_chunk_ms",
  "first_audio_play_ms",
] as const

export const VOICE_COACH_REALTIME_ENV_KEYS = [
  "VOICE_COACH_REALTIME_ENABLED",
  "VOICE_COACH_REALTIME_URL",
  "VOICE_COACH_REALTIME_DEFAULT_CHUNK_MS",
  "VOICE_COACH_REALTIME_TARGET_SEGMENT_MS",
  "VOICE_COACH_REALTIME_INTERRUPT_MIN_CHUNKS",
  "VOICE_COACH_SUBMIT_FASTPATH_ENABLED",
  "VOICE_COACH_SUBMIT_FASTPATH_MAX_WALL_MS",
  "VOICE_COACH_SUBMIT_FASTPATH_JOB_TIMEOUT_MS",
  "VOICE_COACH_TTS_STREAM_ENABLED",
] as const

export type VoiceCoachRealtimeClientMessageType = (typeof VOICE_COACH_REALTIME_CLIENT_MESSAGE_TYPES)[number]
export type VoiceCoachRealtimeServerMessageType = (typeof VOICE_COACH_REALTIME_SERVER_MESSAGE_TYPES)[number]
export type VoiceCoachRealtimeMetricKey = (typeof VOICE_COACH_REALTIME_METRIC_KEYS)[number]
export type VoiceCoachRealtimeEnvKey = (typeof VOICE_COACH_REALTIME_ENV_KEYS)[number]

export type VoiceCoachRealtimeAudioFormat = "mp3" | "wav" | "ogg" | "pcm16"
export type VoiceCoachRealtimeAsrInputSource = "inline" | "signed_url" | "storage" | "stream"

export type VoiceCoachRealtimeBaseMessage<TType extends string, TPayload extends Record<string, unknown>> = {
  type: TType
  ts?: string
  trace_id?: string | null
  payload: TPayload
}

export type VoiceCoachRealtimeSessionStartPayload = {
  session_id: string
  reply_to_turn_id: string
  client_attempt_id?: string | null
  audio_format: VoiceCoachRealtimeAudioFormat
  sample_rate: number
  channels: number
  chunk_ms: number
}

export type VoiceCoachRealtimeAudioChunkPayload = {
  seq: number
  audio_format: VoiceCoachRealtimeAudioFormat
  chunk_ms: number
  sample_rate: number
  channels: number
  byte_length: number
  transport: "binary"
}

export type VoiceCoachRealtimeAudioEndPayload = {
  seq: number
  total_chunks: number
}

export type VoiceCoachRealtimeInterruptPayload = {
  reason: "user_barge_in" | "client_stop" | "network_recover"
}

export type VoiceCoachRealtimePingPayload = {
  client_time_ms: number
}

export type VoiceCoachRealtimeSessionReadyPayload = {
  session_id: string
  turn_id: string | null
  realtime: true
}

export type VoiceCoachRealtimeAsrPayload = {
  turn_id: string
  text: string
  is_final: boolean
}

export type VoiceCoachRealtimeCustomerTextReadyPayload = {
  turn_id: string
  beautician_turn_id: string
  text: string
  emotion?: string | null
  reply_source?: string | null
  submit_fastpath_hit?: boolean
}

export type VoiceCoachRealtimeAudioChunkReadyPayload = {
  turn_id: string
  seq: number
  chunk_base64: string
  duration_ms: number
  mime_type: "audio/mpeg"
  is_final: boolean
  first_audio_chunk_ms?: number | null
}

export type VoiceCoachRealtimeAudioReadyPayload = {
  turn_id: string
  audio_url: string | null
  audio_seconds: number | null
  first_audio_chunk_ms?: number | null
  first_audio_play_ms?: number | null
}

export type VoiceCoachRealtimeTurnDonePayload = {
  turn_id: string
  status: "done" | "interrupted" | "error"
}

export type VoiceCoachRealtimeErrorPayload = {
  code: string
  message: string
  retryable?: boolean
}

export type VoiceCoachRealtimeClientMessage =
  | VoiceCoachRealtimeBaseMessage<"session.start", VoiceCoachRealtimeSessionStartPayload>
  | VoiceCoachRealtimeBaseMessage<"audio.chunk", VoiceCoachRealtimeAudioChunkPayload>
  | VoiceCoachRealtimeBaseMessage<"audio.end", VoiceCoachRealtimeAudioEndPayload>
  | VoiceCoachRealtimeBaseMessage<"interrupt", VoiceCoachRealtimeInterruptPayload>
  | VoiceCoachRealtimeBaseMessage<"ping", VoiceCoachRealtimePingPayload>

export type VoiceCoachRealtimeServerMessage =
  | VoiceCoachRealtimeBaseMessage<"session.ready", VoiceCoachRealtimeSessionReadyPayload>
  | VoiceCoachRealtimeBaseMessage<"asr.partial", VoiceCoachRealtimeAsrPayload>
  | VoiceCoachRealtimeBaseMessage<"asr.final", VoiceCoachRealtimeAsrPayload>
  | VoiceCoachRealtimeBaseMessage<"customer.text_ready", VoiceCoachRealtimeCustomerTextReadyPayload>
  | VoiceCoachRealtimeBaseMessage<"customer.audio_chunk", VoiceCoachRealtimeAudioChunkReadyPayload>
  | VoiceCoachRealtimeBaseMessage<"customer.audio_ready", VoiceCoachRealtimeAudioReadyPayload>
  | VoiceCoachRealtimeBaseMessage<"turn.done", VoiceCoachRealtimeTurnDonePayload>
  | VoiceCoachRealtimeBaseMessage<"error", VoiceCoachRealtimeErrorPayload>

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback
  const normalized = String(raw).trim().toLowerCase()
  if (!normalized) return fallback
  return !["0", "false", "off", "no"].includes(normalized)
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function getVoiceCoachRealtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    realtimeEnabled: parseBool(env.VOICE_COACH_REALTIME_ENABLED, false),
    realtimeUrl: String(env.VOICE_COACH_REALTIME_URL || "").trim() || null,
    defaultChunkMs: parseIntEnv(env.VOICE_COACH_REALTIME_DEFAULT_CHUNK_MS, 200, 100, 1000),
    targetSegmentMs: parseIntEnv(env.VOICE_COACH_REALTIME_TARGET_SEGMENT_MS, 800, 300, 2000),
    interruptMinChunks: parseIntEnv(env.VOICE_COACH_REALTIME_INTERRUPT_MIN_CHUNKS, 2, 1, 8),
    submitFastpathEnabled: parseBool(env.VOICE_COACH_SUBMIT_FASTPATH_ENABLED, false),
    submitFastpathMaxWallMs: parseIntEnv(env.VOICE_COACH_SUBMIT_FASTPATH_MAX_WALL_MS, 900, 0, 5000),
    submitFastpathJobTimeoutMs: parseIntEnv(env.VOICE_COACH_SUBMIT_FASTPATH_JOB_TIMEOUT_MS, 700, 0, 5000),
    ttsStreamEnabled: parseBool(env.VOICE_COACH_TTS_STREAM_ENABLED, false),
  }
}

export const voiceCoachRealtimeContract = {
  VOICE_COACH_REALTIME_CLIENT_MESSAGE_TYPES,
  VOICE_COACH_REALTIME_SERVER_MESSAGE_TYPES,
  VOICE_COACH_REALTIME_METRIC_KEYS,
  VOICE_COACH_REALTIME_ENV_KEYS,
  getVoiceCoachRealtimeConfig,
}

export default voiceCoachRealtimeContract
