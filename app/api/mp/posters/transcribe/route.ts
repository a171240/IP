import { NextRequest, NextResponse } from "next/server"

import { resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import { doubaoAsrFlash } from "@/lib/voice-coach/speech/doubao.server"

export const runtime = "nodejs"

const MAX_AUDIO_BYTES = 4 * 1024 * 1024

type AudioFormat = "mp3" | "wav" | "ogg" | "flac"

function detectFormat(file: File, rawFormat: FormDataEntryValue | null): AudioFormat {
  const raw = String(rawFormat || "").toLowerCase()
  if (raw === "mp3" || raw === "wav" || raw === "ogg" || raw === "flac") return raw

  const type = String(file.type || "").toLowerCase()
  const name = String(file.name || "").toLowerCase()
  if (type.includes("wav") || name.endsWith(".wav")) return "wav"
  if (type.includes("ogg") || name.endsWith(".ogg")) return "ogg"
  if (type.includes("flac") || name.endsWith(".flac")) return "flac"
  return "mp3"
}

function errorJson(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status })
}

export async function POST(request: NextRequest) {
  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const form = await request.formData().catch(() => null)
  if (!form) return errorJson(400, "invalid_form_data", "语音上传失败，请重试。")

  const audioFile = form.get("audio")
  if (!(audioFile instanceof File)) {
    return errorJson(400, "missing_audio", "没有收到语音文件，请重新录一遍。")
  }

  if (audioFile.size <= 0) {
    return errorJson(400, "empty_audio", "这段语音为空，请重新录一遍。")
  }

  if (audioFile.size > MAX_AUDIO_BYTES) {
    return errorJson(413, "audio_too_large", "语音太长了，请控制在 30 秒以内。")
  }

  const format = detectFormat(audioFile, form.get("format"))
  const clientAudioSeconds = Number(form.get("client_audio_seconds") || 0)

  try {
    const audio = Buffer.from(await audioFile.arrayBuffer())
    const result = await doubaoAsrFlash({
      audio,
      format,
      uid: billing.ctx.userId,
    })

    await trackServerEvent({
      request,
      event: "mp_poster_voice_transcribe",
      props: {
        userId: billing.ctx.userId,
        format,
        bytes: audioFile.size,
        clientAudioSeconds: Number.isFinite(clientAudioSeconds) ? clientAudioSeconds : undefined,
        textLength: result.text.length,
      },
    })

    return NextResponse.json({
      ok: true,
      text: result.text,
      confidence: result.confidence,
      audioSeconds: result.durationSeconds,
      requestId: result.requestId,
    })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "transcribe_failed"
    const missingConfig =
      rawMessage.includes("VOLC_SPEECH_") || rawMessage.includes("asr_flash_resource_missing")
    return errorJson(
      missingConfig ? 503 : 502,
      missingConfig ? "asr_unavailable" : "transcribe_failed",
      missingConfig ? "语音识别暂不可用，请先用文字输入。" : "这段语音没有识别成功，请再说一遍或改用文字输入。",
    )
  }
}
