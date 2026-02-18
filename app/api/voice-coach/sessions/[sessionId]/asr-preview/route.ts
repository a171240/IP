import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { doubaoAsrFlash } from "@/lib/voice-coach/speech/doubao.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function parseFormat(raw: unknown): "mp3" | "wav" | "ogg" | "flac" {
  const v = String(raw || "mp3").toLowerCase().trim()
  if (v === "wav") return "wav"
  if (v === "ogg") return "ogg"
  if (v === "flac") return "flac"
  return "mp3"
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    if (!sessionId) return jsonError(400, "missing_session_id")

    const previewEnabledRaw = String(process.env.VOICE_COACH_STREAMING_PREVIEW_ENABLED ?? "false")
      .trim()
      .toLowerCase()
    const previewEnabled = !["0", "false", "off", "no"].includes(previewEnabledRaw)
    if (!previewEnabled) {
      return NextResponse.json({
        text: "",
        confidence: null,
        audio_seconds: null,
        request_id: null,
        degraded: true,
        error: "voice_coach_stream_preview_disabled",
      })
    }

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")
    if (session.status !== "active") return jsonError(400, "session_not_active")

    if (!(process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim()) {
      return NextResponse.json({
        text: "",
        confidence: null,
        audio_seconds: null,
        request_id: null,
        degraded: true,
        error: "asr_flash_resource_missing",
      })
    }

    const body = (await request.json().catch(() => null)) as
      | {
          audio_b64?: unknown
          format?: unknown
        }
      | null

    const b64 = String(body?.audio_b64 || "").trim()
    if (!b64) return jsonError(400, "missing_audio")

    const format = parseFormat(body?.format)
    const audio = Buffer.from(b64, "base64")
    if (!audio.length) return jsonError(400, "empty_audio")

    if (audio.length > 512 * 1024) {
      return jsonError(400, "audio_too_large")
    }

    const asr = await doubaoAsrFlash({
      audio,
      format,
      uid: user.id,
    })

    return NextResponse.json({
      text: asr.text || "",
      confidence: asr.confidence,
      audio_seconds: asr.durationSeconds,
      request_id: asr.requestId,
    })
  } catch (err: any) {
    // Preview is a best-effort optimization. Never block the main flow on preview failure.
    return NextResponse.json({
      text: "",
      confidence: null,
      audio_seconds: null,
      request_id: null,
      degraded: true,
      error: "preview_unavailable",
      message: err?.message || String(err),
    })
  }
}
