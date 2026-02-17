import "server-only"

import { randomUUID } from "crypto"

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
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

export async function doubaoTts(opts: {
  text: string
  emotion?: DoubaoTtsEmotion
  uid?: string
}): Promise<DoubaoTtsResult> {
  const appid = getEnvOrThrow("VOLC_SPEECH_APP_ID")
  const accessToken = getEnvOrThrow("VOLC_SPEECH_ACCESS_TOKEN")
  const cluster = (process.env.VOLC_TTS_CLUSTER || "volcano_tts").trim()
  const configuredVoiceType = (process.env.VOLC_TTS_VOICE_TYPE || "BV700_streaming").trim()
  const fallbackVoiceTypes = String(process.env.VOLC_TTS_FALLBACK_VOICES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const voiceTypeCandidates = Array.from(new Set([configuredVoiceType, ...fallbackVoiceTypes])).filter(Boolean)
  const language = (process.env.VOLC_TTS_LANGUAGE || "cn").trim()

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
    const res = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer;${accessToken}`,
      },
      body: JSON.stringify(body),
    })

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
      const { audio, durationSeconds } = await doRequestWithRetry(withEmotion, 1)
      return { audio, encoding: "mp3", durationSeconds, requestId }
    } catch (err) {
      lastError = err
    }

    // Emotion is optional and voice-type dependent; retry once without emotion.
    if (opts.emotion) {
      const withoutEmotion = {
        ...bodyBase,
        audio: {
          ...bodyBase.audio,
          voice_type: voiceType,
        },
      }

      try {
        const { audio, durationSeconds } = await doRequestWithRetry(withoutEmotion, 1)
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
  const resourceId = (process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim()
  if (!resourceId) throw new Error("asr_flash_resource_missing")

  const requestId = randomUUID()
  const body = {
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
      // 8s VAD segment is enough for short utterances and keeps latency lower.
      vad_segment_duration: 8000,
    },
  }

  const res = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Key": appid,
      "X-Api-Access-Key": accessToken,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    },
    body: JSON.stringify(body),
  })

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

  const text = typeof json?.result?.text === "string" ? json.result.text.trim() : ""
  const confidence = safeNumber(json?.utterances?.[0]?.confidence)
  const durationMs = safeNumber(json?.audio_info?.duration)

  return {
    text,
    confidence,
    durationSeconds: durationMs ? durationMs / 1000 : null,
    requestId,
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
  // - volc.bigasr.auc (model 1.0)
  // - volc.seedasr.auc (model 2.0)
  const resourceId = (process.env.VOLC_ASR_RESOURCE_ID || "volc.seedasr.auc").trim()

  const requestId = randomUUID()

  const submitRes = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit", {
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
  })

  const submitStatus = submitRes.headers.get("X-Api-Status-Code") || submitRes.headers.get("x-api-status-code") || ""
  const submitMsg = submitRes.headers.get("X-Api-Message") || submitRes.headers.get("x-api-message") || ""
  // Submit response body is expected to be empty.
  await submitRes.arrayBuffer().catch(() => null)

  if (!submitRes.ok) {
    throw new Error(`asr_auc_submit_http_${submitRes.status}`)
  }
  if (submitStatus && submitStatus !== "20000000") {
    throw new Error(`asr_auc_submit_status_${submitStatus}${submitMsg ? `:${submitMsg}` : ""}`)
  }

  // Poll query until done. Typical latency is a few seconds for short audios.
  for (let attempt = 0; attempt < 12; attempt++) {
    // Faster polling for short utterances.
    await sleep(350 + attempt * 120)

    const qRes = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/query", {
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
    })

    const qStatus = qRes.headers.get("X-Api-Status-Code") || qRes.headers.get("x-api-status-code") || ""
    const qMsg = qRes.headers.get("X-Api-Message") || qRes.headers.get("x-api-message") || ""

    const json = (await qRes.json().catch(() => null)) as
      | {
          audio_info?: { duration?: number }
          result?: { text?: string; utterances?: Array<{ confidence?: number }> } | Array<{ text?: string }>
          utterances?: Array<{ confidence?: number }>
        }
      | null

    if (!qRes.ok) {
      throw new Error(`asr_auc_query_http_${qRes.status}`)
    }

    if (qStatus === "20000001" || qStatus === "20000002" || !qStatus) {
      continue
    }

    if (qStatus === "20000003") {
      // Silence audio: according to doc, caller should resubmit.
      throw new Error("asr_auc_silence")
    }

    if (qStatus !== "20000000") {
      throw new Error(`asr_auc_query_status_${qStatus}${qMsg ? `:${qMsg}` : ""}`)
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
    }
  }

  throw new Error("asr_auc_timeout")
}
