import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { doubaoAsrAuc, doubaoAsrFlash, type DoubaoAsrResult } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

const MAX_AUDIO_BYTES = 8 * 1024 * 1024

type AudioFormat = "mp3" | "wav" | "ogg" | "flac"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status })
}

function normalizeFormat(value: unknown): AudioFormat | null {
  const format = String(value || "")
    .trim()
    .toLowerCase()
  if (format === "mp3" || format === "wav" || format === "ogg" || format === "flac") return format
  return null
}

function detectAudio(file: File, formFormat: unknown): { format: AudioFormat; ext: string; contentType: string } | null {
  const requested = normalizeFormat(formFormat)
  if (requested) {
    return {
      format: requested,
      ext: requested,
      contentType:
        requested === "wav"
          ? "audio/wav"
          : requested === "ogg"
            ? "audio/ogg"
            : requested === "flac"
              ? "audio/flac"
              : "audio/mpeg",
    }
  }

  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  if (type.includes("mpeg") || name.endsWith(".mp3")) return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (type.includes("wav") || name.endsWith(".wav")) return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (type.includes("ogg") || name.endsWith(".ogg")) return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (type.includes("flac") || name.endsWith(".flac")) return { format: "flac", ext: "flac", contentType: "audio/flac" }

  // The mini program records mp3 and WeChat may upload it without a useful name or content-type.
  return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
}

function isAsrSilenceError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  return msg.includes("asr_auc_silence") || msg.includes("asr_silence")
}

function shouldUseFlashAsr(): boolean {
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

async function transcribeAudio(opts: {
  audio: Buffer
  format: AudioFormat
  contentType: string
  userId: string
}): Promise<DoubaoAsrResult> {
  if (shouldUseFlashAsr()) {
    try {
      const flashAsr = await doubaoAsrFlash({
        audio: opts.audio,
        format: opts.format,
        uid: opts.userId,
      })
      if (flashAsr.text) return flashAsr
    } catch {
      // Fall back to AUC below; this keeps poster voice input usable if flash is unavailable.
    }
  }

  if (opts.format === "flac") throw new Error("unsupported_audio_format")

  const path = `posters/transcribe/${opts.userId}/${Date.now()}-${randomUUID()}.${opts.format}`
  await uploadVoiceCoachAudio({
    path,
    data: opts.audio,
    contentType: opts.contentType,
  })

  const audioUrl = await signVoiceCoachAudio(path)
  return doubaoAsrAuc({
    audioUrl,
    format: opts.format,
    uid: opts.userId,
  })
}

export async function POST(request: NextRequest) {
  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const form = await request.formData().catch(() => null)
  if (!form) return jsonError(400, "invalid_form_data", { message: "语音上传失败，请再试一次。" })

  const audioFile = form.get("audio")
  if (!(audioFile instanceof File)) {
    return jsonError(400, "missing_audio", { message: "没有收到语音，请按住重新说一遍。" })
  }

  if (audioFile.size <= 0) {
    return jsonError(400, "empty_audio", { message: "没有收到有效语音，请按住重新说一遍。" })
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return jsonError(400, "audio_too_large", { message: "语音太长了，请控制在 30 秒内。", maxBytes: MAX_AUDIO_BYTES })
  }

  const detected = detectAudio(audioFile, form.get("format"))
  if (!detected) {
    return jsonError(400, "unsupported_audio_format", { message: "当前语音格式暂不支持，请直接打字或重新录音。" })
  }

  const audio = Buffer.from(await audioFile.arrayBuffer())
  if (!audio.length) return jsonError(400, "empty_audio", { message: "没有收到有效语音，请按住重新说一遍。" })

  try {
    const asr = await transcribeAudio({
      audio,
      format: detected.format,
      contentType: detected.contentType,
      userId: billing.ctx.userId,
    })

    const text = String(asr.text || "").trim()
    if (!text) {
      return jsonError(400, "asr_empty", {
        message: "没有听清楚，请靠近麦克风再说一遍。",
        request_id: asr.requestId,
      })
    }

    await trackServerEvent({
      request,
      event: "poster_voice_transcribe",
      props: {
        source: "mp",
        format: detected.format,
        bytes: audioFile.size,
        textLength: text.length,
        confidence: asr.confidence,
      },
    })

    return NextResponse.json({
      ok: true,
      text,
      confidence: asr.confidence,
      audio_seconds: asr.durationSeconds || null,
      request_id: asr.requestId,
    })
  } catch (err) {
    if (isAsrSilenceError(err)) {
      return jsonError(400, "asr_silence", { message: "没有识别到有效语音，请靠近麦克风再说一遍。" })
    }

    const message = err instanceof Error ? err.message : "asr_failed"
    return jsonError(502, "asr_failed", {
      message: "语音识别服务暂时不可用，请再试一次或直接打字。",
      detail: message,
    })
  }
}
