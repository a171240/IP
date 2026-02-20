import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

export async function GET(
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

    const { data: turn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, session_id, turn_index, role, status, text, emotion, audio_path, audio_seconds, analysis_json, features_json")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .single()
    if (turnError || !turn) return jsonError(404, "turn_not_found")

    let audioUrl: string | null = null
    if (turn.audio_path) {
      try {
        audioUrl = await signVoiceCoachAudio(String(turn.audio_path))
      } catch {
        audioUrl = null
      }
    }

    return NextResponse.json({
      turn: {
        id: turn.id,
        session_id: turn.session_id,
        turn_index: turn.turn_index,
        role: turn.role,
        status: turn.status,
        text: turn.text,
        emotion: turn.emotion,
        audio_url: audioUrl,
        audio_seconds: turn.audio_seconds,
        analysis: turn.analysis_json || null,
        features: turn.features_json || null,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
