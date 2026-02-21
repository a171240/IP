import "server-only"

import { createHash, randomUUID } from "crypto"

export type DoubaoTtsEmotion = "neutral" | "happy" | "sad" | "angry"

export type DoubaoTtsResult = {
  audio: Buffer | null
  encoding: "mp3"
  durationSeconds: number | null
  requestId: string
}

export type DoubaoAsrResult = {
  text: string
  confidence: number | null
  durationSeconds: number | null
  requestId: string
  elapsedMs?: number
  resourceId?: string
  logid?: string | null
  submitLogid?: string | null
  queryLogid?: string | null
}

export type DoubaoAsrFlashSelfcheckResult = {
  status: "PASS" | "FAIL"
  errorCode: string | null
  flashRequestId: string | null
  flashLogid: string | null
  appidLast4: string | null
  resourceId: string
}

const DEFAULT_TTS_VOICE_TYPE = "zh_female_vv_uranus_bigtts"
const LEGACY_TTS_VOICE_ALIASES = new Set(["bv700_streaming", "bv700"])
const FLASH_RESOURCE_ID = "volc.bigasr.auc_turbo"
const FLASH_PERMISSION_HINT = "需要在控制台开通 volc.bigasr.auc_turbo 权限"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timeoutMs(name: string, fallback: number): number {
  const raw = Number(process.env[name] || fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(1000, Math.round(raw))
}

function ttsProfile(): "fast" | "balanced" {
  const raw = String(process.env.VOICE_COACH_TTS_PROFILE || "fast")
    .trim()
    .toLowerCase()
  return raw === "fast" ? "fast" : "balanced"
}

function normalizeTtsVoiceType(input: string): string {
  const normalized = input.trim()
  if (!normalized) return DEFAULT_TTS_VOICE_TYPE
  const lower = normalized.toLowerCase()
  if (LEGACY_TTS_VOICE_ALIASES.has(lower)) return DEFAULT_TTS_VOICE_TYPE
  if (/^bv\d+(_streaming)?$/i.test(normalized)) return DEFAULT_TTS_VOICE_TYPE
  return normalized
}

export function normalizeTtsCacheText(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
}

export function resolveConfiguredTtsVoiceType(override?: string | null): string {
  const raw = String(override || process.env.VOLC_TTS_VOICE_TYPE || DEFAULT_TTS_VOICE_TYPE)
  return normalizeTtsVoiceType(raw)
}

export function buildTtsCacheKey(opts: { voiceType?: string | null; text: string }): {
  key: string
  voiceType: string
  normalizedText: string
} {
  const normalizedText = normalizeTtsCacheText(opts.text)
  const voiceType = resolveConfiguredTtsVoiceType(opts.voiceType)
  const key = createHash("sha1").update(`${voiceType}|${normalizedText}`, "utf8").digest("hex")
  return {
    key,
    voiceType,
    normalizedText,
  }
}

export function buildTtsLineCacheKey(opts: { voiceType?: string | null; lineId: string }): {
  key: string
  voiceType: string
  lineId: string
} | null {
  const lineId = String(opts.lineId || "").trim()
  if (!lineId) return null
  const voiceType = resolveConfiguredTtsVoiceType(opts.voiceType)
  const key = createHash("sha1").update(`${voiceType}|line:${lineId}`, "utf8").digest("hex")
  return {
    key,
    voiceType,
    lineId,
  }
}

function getEnvOrThrow(name: string): string {
  const v = (process.env[name] || "").trim()
  if (!v) throw new Error(`${name}_missing`)
  return v
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function getHeaderValue(headers: Headers, key: string): string {
  return headers.get(key) || headers.get(key.toLowerCase()) || ""
}

function getSpeechLogid(headers: Headers): string {
  return (
    getHeaderValue(headers, "X-Tt-Logid") ||
    getHeaderValue(headers, "X-Logid") ||
    getHeaderValue(headers, "X-Tt-Log-Id")
  )
}

function parseServerTimingDurationMs(headers: Headers): number | null {
  const raw = getHeaderValue(headers, "Server-Timing")
  if (!raw) return null
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (!items.length) return null

  const pickDuration = (entry: string): number | null => {
    const m = entry.match(/dur\s*=\s*([0-9]+(?:\.[0-9]+)?)/i)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  const preferred = items.find((entry) => /^inner\b/i.test(entry)) || items.find((entry) => /^origin\b/i.test(entry))
  const preferredMs = preferred ? pickDuration(preferred) : null
  if (preferredMs) return preferredMs

  for (let i = 0; i < items.length; i++) {
    const n = pickDuration(items[i])
    if (n) return n
  }
  return null
}

function appidLast4(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  return raw.length <= 4 ? raw : raw.slice(-4)
}

function asrFlashDebugEnabled(): boolean {
  const raw = String(process.env.VOICE_COACH_ASR_DEBUG || "false")
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(raw)
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null) return fallback
  const value = String(raw).trim().toLowerCase()
  if (!value) return fallback
  return ["1", "true", "yes", "on"].includes(value)
}

function asrFlashVadSegmentDurationMs(): number {
  const raw = Number(process.env.VOICE_COACH_ASR_FLASH_VAD_SEGMENT_MS || 3000)
  if (!Number.isFinite(raw)) return 3000
  return Math.max(2000, Math.min(10000, Math.round(raw)))
}

function flashDebug(event: string, summary: Record<string, unknown>) {
  if (!asrFlashDebugEnabled()) return
  try {
    console.info(`[voice-coach][asr][flash][${event}]`, summary)
  } catch {
    // Debug logging must never fail ASR flow.
  }
}

function buildAsrSelfcheckAudioBase64(): string {
  const sampleRate = 16_000
  const sampleCount = sampleRate
  const channels = 1
  const bytesPerSample = 2
  const dataSize = sampleCount * channels * bytesPerSample
  const wav = Buffer.alloc(44 + dataSize)

  wav.write("RIFF", 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write("WAVE", 8)
  wav.write("fmt ", 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  wav.writeUInt16LE(channels * bytesPerSample, 32)
  wav.writeUInt16LE(16, 34)
  wav.write("data", 36)
  wav.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }

  return wav.toString("base64")
}

const ASR_SELFCHECK_AUDIO_BASE64 = buildAsrSelfcheckAudioBase64()

function createSpeechError(
  code: string,
  message: string,
  extra?: {
    provider?: "flash" | "auc" | "tts"
    httpStatus?: number | null
    apiStatus?: string | null
    apiCode?: string | null
    apiMessage?: string | null
    requestId?: string | null
    resourceId?: string | null
    logid?: string | null
    submitLogid?: string | null
    queryLogid?: string | null
    flashRequestId?: string | null
    flashLogid?: string | null
    appidLast4?: string | null
    operationHint?: string | null
  },
): Error {
  const err = new Error(message || code) as Error & Record<string, unknown>
  err.name = code
  err.code = code
  if (extra?.provider) err.provider = extra.provider
  if (typeof extra?.httpStatus === "number") err.http_status = extra.httpStatus
  if (extra?.apiStatus) err.api_status = extra.apiStatus
  if (extra?.apiCode) err.api_code = extra.apiCode
  if (extra?.apiMessage) err.api_message = extra.apiMessage
  if (extra?.requestId) err.request_id = extra.requestId
  if (extra?.resourceId) err.resource_id = extra.resourceId
  if (extra?.logid) err.logid = extra.logid
  if (extra?.submitLogid) err.submit_logid = extra.submitLogid
  if (extra?.queryLogid) err.query_logid = extra.queryLogid
  if (extra?.flashRequestId) err.flash_request_id = extra.flashRequestId
  if (extra?.flashLogid) err.flash_logid = extra.flashLogid
  if (extra?.appidLast4) err.appid_last4 = extra.appidLast4
  if (extra?.operationHint) err.operation_hint = extra.operationHint
  return err
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout: number, timeoutError: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(timeoutError)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function doubaoTts(opts: {
  text: string
  emotion?: DoubaoTtsEmotion
  uid?: string
}): Promise<DoubaoTtsResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const profile = ttsProfile()
  const isFastProfile = profile === "fast"
  const cluster = (process.env.VOLC_TTS_CLUSTER || "volcano_tts").trim()
  const configuredVoiceType = resolveConfiguredTtsVoiceType()
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
      // Per official doc: can be any non-empty string; keep consistent for debugging.
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
      const msg = json && typeof json.message === "string" ? json.message : `tts_http_${res.status}`
      throw new Error(msg)
    }

    const code = json?.code
    // Volcano returns code=3000 for success in many OpenSpeech APIs; accept 0/3000.
    if (typeof code === "number" && code !== 3000 && code !== 0) {
      throw new Error(json?.message || `tts_code_${code}`)
    }

    const b64 = json?.data
    if (!b64 || typeof b64 !== "string") {
      throw new Error("tts_missing_audio")
    }

    const audio = Buffer.from(b64, "base64")
    const durationMs = safeNumber((json as { addition?: any } | null)?.addition?.duration)
    return { audio, durationSeconds: durationMs ? durationMs / 1000 : null }
  }

  async function doRequestWithRetry(body: Record<string, unknown>, maxRetry = 1) {
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      try {
        return await doRequestOnce(body)
      } catch (err) {
        lastErr = err
        if (attempt >= maxRetry) break
        await sleep(120 * (attempt + 1))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("tts_request_failed")
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
      const { audio, durationSeconds } = await doRequestWithRetry(withEmotion, maxRetry)
      return { audio, encoding: "mp3", durationSeconds, requestId }
    } catch (err) {
      lastError = err
    }

    // Emotion is optional and voice-type dependent; retry once without emotion.
    if (opts.emotion && allowEmotionFallback) {
      const withoutEmotion = {
        ...bodyBase,
        audio: {
          ...bodyBase.audio,
          voice_type: voiceType,
        },
      }

      try {
        const { audio, durationSeconds } = await doRequestWithRetry(withoutEmotion, maxRetry)
        return { audio, encoding: "mp3", durationSeconds, requestId }
      } catch (err) {
        lastError = err
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("tts_all_fallback_failed")
}

export async function doubaoAsrFlash(opts: {
  audio: Buffer
  format: "mp3" | "wav" | "ogg" | "flac"
  uid?: string
}): Promise<DoubaoAsrResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const configuredResourceId = (process.env.VOLC_ASR_FLASH_RESOURCE_ID || FLASH_RESOURCE_ID).trim()
  const resourceId = FLASH_RESOURCE_ID
  const flashTimeout = timeoutMs("VOLC_ASR_FLASH_TIMEOUT_MS", 12000)

  const requestId = randomUUID()
  const appidTail = appidLast4(appid)
  const uid = opts.uid || "voice_coach"
  const enablePunc = readBoolEnv("VOICE_COACH_ASR_FLASH_ENABLE_PUNC", false)
  const showUtterances = readBoolEnv("VOICE_COACH_ASR_FLASH_SHOW_UTTERANCES", false)
  const enableDdc = readBoolEnv("VOICE_COACH_ASR_FLASH_ENABLE_DDC", true)
  const vadSegmentDuration = asrFlashVadSegmentDurationMs()
  const body = {
    user: { uid },
    audio: {
      format: opts.format,
      data: opts.audio.toString("base64"),
    },
    request: {
      model_name: "bigmodel",
      enable_punc: enablePunc,
      show_utterances: showUtterances,
      result_type: "single",
      enable_ddc: enableDdc,
      enable_speaker_info: false,
      enable_channel_split: false,
      // Shorter VAD segment reduces tail latency for short in-app utterances.
      vad_segment_duration: vadSegmentDuration,
    },
  }
  const headers = {
    "Content-Type": "application/json",
    "X-Api-App-Key": appid,
    "X-Api-Access-Key": accessToken,
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  } as const

  flashDebug("request", {
    endpoint: "api/v3/auc/bigmodel/recognize/flash",
    flash_request_id: requestId,
    appid_last4: appidTail || null,
    resource_id: resourceId,
    configured_resource_id:
      configuredResourceId && configuredResourceId !== resourceId ? configuredResourceId : undefined,
    headers_summary: {
      "X-Api-App-Key": appidTail ? `***${appidTail}` : "***",
      "X-Api-Access-Key": "***",
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    },
    params_summary: {
      uid,
      format: opts.format,
      audio_bytes: opts.audio.length,
      model_name: body.request.model_name,
      result_type: body.request.result_type,
      enable_punc: body.request.enable_punc,
      show_utterances: body.request.show_utterances,
      enable_ddc: body.request.enable_ddc,
      vad_segment_duration: body.request.vad_segment_duration,
    },
  })

  let res: Response
  const requestStartedAt = Date.now()
  try {
    res = await fetchWithTimeout(
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      flashTimeout,
      "asr_flash_timeout",
    )
  } catch (err: any) {
    const msg = String(err?.message || "")
    if (msg.includes("asr_flash_timeout")) {
      throw createSpeechError("asr_flash_timeout", "asr_flash_timeout", {
        provider: "flash",
        requestId,
        resourceId,
        flashRequestId: requestId,
        appidLast4: appidTail || null,
      })
    }
    throw createSpeechError("asr_flash_network", msg || "asr_flash_network", {
      provider: "flash",
      requestId,
      resourceId,
      flashRequestId: requestId,
      appidLast4: appidTail || null,
    })
  }

  const statusCodeHeader = getHeaderValue(res.headers, "X-Api-Status-Code")
  const flashLogid = getHeaderValue(res.headers, "X-Tt-Logid") || getSpeechLogid(res.headers) || null

  const json = (await res.json().catch(() => null)) as
    | {
        code?: number | string
        message?: string
        result?: { text?: string }
        audio_info?: { duration?: number }
        utterances?: Array<{ confidence?: number }>
      }
    | null

  const apiCode = typeof json?.code === "number" || typeof json?.code === "string" ? String(json?.code) : null
  const apiMessage = typeof json?.message === "string" ? json.message : null
  const permissionDenied =
    res.status === 403 &&
    (statusCodeHeader === "45000030" || apiCode === "45000030" || String(apiMessage || "").includes("45000030"))

  flashDebug("response", {
    flash_request_id: requestId,
    flash_logid: flashLogid,
    appid_last4: appidTail || null,
    resource_id: resourceId,
    http_status: res.status,
    api_status: statusCodeHeader || null,
    api_code: apiCode,
    api_message: apiMessage,
  })

  if (!res.ok) {
    if (permissionDenied) {
      console.warn(
        `[voice-coach][asr][flash] 操作提示：${FLASH_PERMISSION_HINT}; request_id=${requestId}; logid=${flashLogid || "-"}`,
      )
      throw createSpeechError("asr_flash_permission_denied", FLASH_PERMISSION_HINT, {
        provider: "flash",
        httpStatus: res.status,
        apiStatus: statusCodeHeader || null,
        apiCode,
        apiMessage,
        requestId,
        resourceId,
        logid: flashLogid,
        flashRequestId: requestId,
        flashLogid,
        appidLast4: appidTail || null,
        operationHint: FLASH_PERMISSION_HINT,
      })
    }

    throw createSpeechError(
      res.status >= 500 ? "asr_flash_http_5xx" : `asr_flash_http_${res.status}`,
      apiMessage || `asr_flash_http_${res.status}`,
      {
        provider: "flash",
        httpStatus: res.status,
        apiStatus: statusCodeHeader || null,
        apiCode,
        apiMessage,
        requestId,
        resourceId,
        logid: flashLogid,
        flashRequestId: requestId,
        flashLogid,
        appidLast4: appidTail || null,
      },
    )
  }

  if (statusCodeHeader === "45000030") {
    console.warn(
      `[voice-coach][asr][flash] 操作提示：${FLASH_PERMISSION_HINT}; request_id=${requestId}; logid=${flashLogid || "-"}`,
    )
    throw createSpeechError("asr_flash_permission_denied", FLASH_PERMISSION_HINT, {
      provider: "flash",
      httpStatus: res.status,
      apiStatus: statusCodeHeader,
      apiCode,
      apiMessage,
      requestId,
      resourceId,
      logid: flashLogid,
      flashRequestId: requestId,
      flashLogid,
      appidLast4: appidTail || null,
      operationHint: FLASH_PERMISSION_HINT,
    })
  }

  if (statusCodeHeader && statusCodeHeader !== "20000000" && statusCodeHeader !== "20000003") {
    throw createSpeechError(
      /^5/.test(statusCodeHeader) ? "asr_flash_status_5xx" : `asr_flash_status_${statusCodeHeader}`,
      apiMessage || `asr_status_${statusCodeHeader}`,
      {
        provider: "flash",
        apiStatus: statusCodeHeader,
        apiCode,
        apiMessage,
        requestId,
        resourceId,
        logid: flashLogid,
        flashRequestId: requestId,
        flashLogid,
        appidLast4: appidTail || null,
      },
    )
  }

  const text = typeof json?.result?.text === "string" ? json.result.text.trim() : ""
  const confidence = safeNumber(json?.utterances?.[0]?.confidence)
  const durationMs = safeNumber(json?.audio_info?.duration)
  const elapsedMs = parseServerTimingDurationMs(res.headers) || Math.max(1, Date.now() - requestStartedAt)

  if (!text) {
    throw createSpeechError("asr_flash_empty", "asr_flash_empty", {
      provider: "flash",
      apiStatus: statusCodeHeader || null,
      apiCode,
      apiMessage,
      requestId,
      resourceId,
      logid: flashLogid,
      flashRequestId: requestId,
      flashLogid,
      appidLast4: appidTail || null,
    })
  }

  return {
    text,
    confidence,
    durationSeconds: durationMs ? durationMs / 1000 : null,
    requestId,
    elapsedMs,
    resourceId,
    logid: flashLogid,
  }
}

export async function doubaoAsrFlashSelfcheck(opts?: {
  uid?: string
}): Promise<DoubaoAsrFlashSelfcheckResult> {
  const fallbackAppidTail = appidLast4(String(process.env.VOLC_SPEECH_APP_ID || "")) || null

  try {
    const asr = await doubaoAsrFlash({
      audio: Buffer.from(ASR_SELFCHECK_AUDIO_BASE64, "base64"),
      format: "wav",
      uid: opts?.uid || "asr_selfcheck",
    })

    return {
      status: "PASS",
      errorCode: null,
      flashRequestId: asr.requestId,
      flashLogid: asr.logid || null,
      appidLast4: fallbackAppidTail,
      resourceId: asr.resourceId || FLASH_RESOURCE_ID,
    }
  } catch (err: any) {
    const code =
      typeof err?.code === "string"
        ? String(err.code)
        : typeof err?.name === "string"
          ? String(err.name)
          : "asr_flash_selfcheck_failed"
    const httpStatus = typeof err?.http_status === "number" ? Number(err.http_status) : null
    const apiStatus = typeof err?.api_status === "string" ? String(err.api_status) : null
    const apiCode = typeof err?.api_code === "string" ? String(err.api_code) : null
    const message = typeof err?.message === "string" ? err.message : String(err || "")
    const permissionDenied =
      code === "asr_flash_permission_denied" ||
      (httpStatus === 403 && (apiStatus === "45000030" || apiCode === "45000030" || message.includes("45000030")))
    const hasTrace = Boolean(
      (typeof err?.flash_logid === "string" && err.flash_logid) ||
        (typeof err?.logid === "string" && err.logid) ||
        httpStatus !== null ||
        (apiStatus && apiStatus.length > 0) ||
        (apiCode && apiCode.length > 0),
    )

    return {
      status: !permissionDenied && hasTrace ? "PASS" : "FAIL",
      errorCode: code,
      flashRequestId:
        typeof err?.flash_request_id === "string"
          ? err.flash_request_id
          : typeof err?.request_id === "string"
            ? err.request_id
            : null,
      flashLogid:
        typeof err?.flash_logid === "string" ? err.flash_logid : typeof err?.logid === "string" ? err.logid : null,
      appidLast4: typeof err?.appid_last4 === "string" ? err.appid_last4 : fallbackAppidTail,
      resourceId: typeof err?.resource_id === "string" ? err.resource_id : FLASH_RESOURCE_ID,
    }
  }
}

export async function doubaoAsrAuc(opts: {
  audioUrl: string
  format: "mp3" | "wav" | "ogg" | "raw"
  uid?: string
}): Promise<DoubaoAsrResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  // Per official doc, resource id is either:
  // - volc.bigasr.auc (model 1.0, usually lower latency)
  // - volc.seedasr.auc (model 2.0)
  const configuredResourceId = (process.env.VOLC_ASR_RESOURCE_ID || "volc.bigasr.auc").trim()
  const fastFirstDefault =
    String(process.env.VOICE_COACH_ASR_ENABLE_FLASH || "true")
      .trim()
      .toLowerCase() === "false"
      ? "true"
      : "false"
  const speedFirst = String(process.env.VOICE_COACH_ASR_FAST_FIRST || fastFirstDefault)
    .trim()
    .toLowerCase() !== "false"
  const normalizeResource = (input: string) => {
    const v = (input || "").trim()
    if (!v) return "volc.bigasr.auc"
    if (v === "volc.bigasr.auc_idle" || v === "volc.seedasr.auc_idle") return "volc.seedasr.auc"
    return v
  }
  const primaryResource = normalizeResource(configuredResourceId)
  const alternateResource =
    primaryResource === "volc.seedasr.auc"
      ? "volc.bigasr.auc"
      : primaryResource === "volc.bigasr.auc"
        ? "volc.seedasr.auc"
        : ""
  const resourceCandidates = Array.from(
    new Set(
      speedFirst && primaryResource === "volc.seedasr.auc"
        ? ["volc.bigasr.auc", primaryResource, alternateResource]
        : [primaryResource, alternateResource],
    ),
  ).filter(Boolean)
  // Respect env-tuned slow-path latency knobs (used by C-group bench), while
  // keeping conservative lower bounds for stability.
  const submitTimeout = Math.max(1800, timeoutMs("VOLC_ASR_AUC_SUBMIT_TIMEOUT_MS", 3000))
  const queryTimeout = Math.max(1000, timeoutMs("VOLC_ASR_AUC_QUERY_TIMEOUT_MS", 1800))
  const maxAttempts = Math.max(4, Math.min(16, Number(process.env.VOLC_ASR_AUC_QUERY_MAX_ATTEMPTS || 8) || 8))

  let lastError: unknown = null

  for (let r = 0; r < resourceCandidates.length; r++) {
    const resourceId = String(resourceCandidates[r])
    const requestId = randomUUID()
    const requestStartedAt = Date.now()
    let submitLogid: string | null = null
    let latestQueryLogid: string | null = null

    try {
      let submitRes: Response
      try {
        submitRes = await fetchWithTimeout(
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
      } catch (err: any) {
        const msg = String(err?.message || err || "")
        if (msg.includes("asr_auc_submit_timeout")) {
          throw createSpeechError("asr_auc_submit_timeout", "asr_auc_submit_timeout", {
            provider: "auc",
            requestId,
            resourceId,
          })
        }
        throw createSpeechError("asr_auc_submit_network", msg || "asr_auc_submit_network", {
          provider: "auc",
          requestId,
          resourceId,
        })
      }

      submitLogid = getSpeechLogid(submitRes.headers) || null
      const submitStatus = getHeaderValue(submitRes.headers, "X-Api-Status-Code")
      const submitMsg = getHeaderValue(submitRes.headers, "X-Api-Message")
      await submitRes.arrayBuffer().catch(() => null)

      if (!submitRes.ok) {
        throw createSpeechError(`asr_auc_submit_http_${submitRes.status}`, `asr_auc_submit_http_${submitRes.status}`, {
          provider: "auc",
          httpStatus: submitRes.status,
          apiStatus: submitStatus || null,
          apiMessage: submitMsg || null,
          requestId,
          resourceId,
          logid: submitLogid,
          submitLogid,
        })
      }
      if (submitStatus && submitStatus !== "20000000") {
        throw createSpeechError(
          `asr_auc_submit_status_${submitStatus}`,
          `asr_auc_submit_status_${submitStatus}${submitMsg ? `:${submitMsg}` : ""}`,
          {
            provider: "auc",
            apiStatus: submitStatus,
            apiMessage: submitMsg || null,
            requestId,
            resourceId,
            logid: submitLogid,
            submitLogid,
          },
        )
      }

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await sleep(Math.min(280, 80 + attempt * 40))
        }

        let qRes: Response
        try {
          qRes = await fetchWithTimeout(
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
              body: "{}",
            },
            queryTimeout,
            "asr_auc_query_timeout",
          )
        } catch (err: any) {
          const msg = String(err?.message || err || "")
          if (msg.includes("asr_auc_query_timeout")) continue
          throw createSpeechError("asr_auc_query_network", msg || "asr_auc_query_network", {
            provider: "auc",
            requestId,
            resourceId,
            logid: latestQueryLogid || submitLogid,
            submitLogid,
            queryLogid: latestQueryLogid,
          })
        }

        const qLogid = getSpeechLogid(qRes.headers) || null
        if (qLogid) latestQueryLogid = qLogid
        const qStatus = getHeaderValue(qRes.headers, "X-Api-Status-Code")
        const qMsg = getHeaderValue(qRes.headers, "X-Api-Message")

        const json = (await qRes.json().catch(() => null)) as
          | {
              audio_info?: { duration?: number }
              result?: { text?: string; utterances?: Array<{ confidence?: number }> } | Array<{ text?: string }>
              utterances?: Array<{ confidence?: number }>
            }
          | null

        if (!qRes.ok) {
          if (qRes.status >= 500) continue
          throw createSpeechError(`asr_auc_query_http_${qRes.status}`, `asr_auc_query_http_${qRes.status}`, {
            provider: "auc",
            httpStatus: qRes.status,
            apiStatus: qStatus || null,
            apiMessage: qMsg || null,
            requestId,
            resourceId,
            logid: qLogid || submitLogid,
            submitLogid,
            queryLogid: qLogid,
          })
        }

        if (qStatus === "20000001" || qStatus === "20000002" || !qStatus) {
          continue
        }

        if (qStatus === "20000003") {
          throw createSpeechError("asr_auc_silence", "asr_auc_silence", {
            provider: "auc",
            apiStatus: qStatus,
            apiMessage: qMsg || null,
            requestId,
            resourceId,
            logid: qLogid || submitLogid,
            submitLogid,
            queryLogid: qLogid,
          })
        }

        if (qStatus !== "20000000") {
          throw createSpeechError(
            `asr_auc_query_status_${qStatus}`,
            `asr_auc_query_status_${qStatus}${qMsg ? `:${qMsg}` : ""}`,
            {
              provider: "auc",
              apiStatus: qStatus,
              apiMessage: qMsg || null,
              requestId,
              resourceId,
              logid: qLogid || submitLogid,
              submitLogid,
              queryLogid: qLogid,
            },
          )
        }

        let text = ""
        if (typeof (json as any)?.result?.text === "string") {
          text = String((json as any).result.text).trim()
        } else if (Array.isArray((json as any)?.result) && typeof (json as any).result?.[0]?.text === "string") {
          text = String((json as any).result[0].text).trim()
        }

        const confidence = safeNumber(
          (json as any)?.result?.utterances?.[0]?.confidence ?? (json as any)?.utterances?.[0]?.confidence,
        )
        const durationMs = safeNumber((json as any)?.audio_info?.duration)

        return {
          text,
          confidence,
          durationSeconds: durationMs ? durationMs / 1000 : null,
          requestId,
          elapsedMs: parseServerTimingDurationMs(qRes.headers) || Math.max(1, Date.now() - requestStartedAt),
          resourceId,
          logid: qLogid || submitLogid,
          submitLogid,
          queryLogid: qLogid,
        }
      }

      throw createSpeechError("asr_auc_timeout", "asr_auc_timeout", {
        provider: "auc",
        requestId,
        resourceId,
        logid: latestQueryLogid || submitLogid,
        submitLogid,
        queryLogid: latestQueryLogid,
      })
    } catch (err) {
      lastError = err
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("asr_auc_timeout"))
}
