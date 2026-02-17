import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { emitVoiceCoachEvent } from "@/lib/voice-coach/jobs.server"
import { type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  try {
    const { sessionId, turnId } = await context.params
    if (!sessionId || !turnId) return jsonError(400, "missing_params")

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

    const { data: turn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, emotion, status, audio_path, audio_seconds")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .single()

    if (turnError || !turn) return jsonError(404, "turn_not_found")
    if (String(turn.role) !== "customer") return jsonError(400, "turn_not_customer")

    if (turn.audio_path) {
      const signed = await signVoiceCoachAudio(String(turn.audio_path))
      return NextResponse.json({
        turn_id: turnId,
        audio_url: signed,
        audio_seconds: turn.audio_seconds || null,
        cached: true,
      })
    }

    const text = String(turn.text || "").trim()
    if (!text) return jsonError(400, "turn_text_empty")

    let audioUrl: string | null = null
    let audioSeconds: number | null = null

    try {
      const tts = await doubaoTts({
        text,
        emotion: mapEmotionToTts((turn.emotion ? String(turn.emotion) : "neutral") as VoiceCoachEmotion),
        uid: user.id,
      })

      audioSeconds = tts.durationSeconds ?? null

      if (tts.audio) {
        const audioPath = `${user.id}/${sessionId}/${turnId}.mp3`
        await uploadVoiceCoachAudio({
          path: audioPath,
          data: tts.audio,
          contentType: "audio/mpeg",
        })

        audioUrl = await signVoiceCoachAudio(audioPath)

        await supabase
          .from("voice_coach_turns")
          .update({
            audio_path: audioPath,
            audio_seconds: audioSeconds,
            status: "audio_ready",
          })
          .eq("id", turnId)
      } else {
        await supabase.from("voice_coach_turns").update({ status: "text_ready" }).eq("id", turnId)
      }

      await emitVoiceCoachEvent({
        sessionId,
        userId: user.id,
        turnId,
        type: "customer.audio_ready",
        data: {
          turn_id: turnId,
          audio_url: audioUrl,
          audio_seconds: audioSeconds,
          tts_failed: !audioUrl,
          text,
          ts: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        turn_id: turnId,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: !audioUrl,
      })
    } catch {
      await supabase.from("voice_coach_turns").update({ status: "text_ready" }).eq("id", turnId)

      await emitVoiceCoachEvent({
        sessionId,
        userId: user.id,
        turnId,
        type: "customer.audio_ready",
        data: {
          turn_id: turnId,
          audio_url: null,
          audio_seconds: null,
          tts_failed: true,
          text,
          ts: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        turn_id: turnId,
        audio_url: null,
        audio_seconds: null,
        tts_failed: true,
      })
    }
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
