import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { getScenario } from "@/lib/voice-coach/scenarios"
import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

async function attachSignedUrl(turn: any) {
  const audioPath = typeof turn.audio_path === "string" && turn.audio_path ? turn.audio_path : null
  const audioUrl = audioPath ? await signVoiceCoachAudio(audioPath) : null
  return {
    ...turn,
    audio_url: audioUrl,
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, scenario_id, status, started_at, ended_at, total_score")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { data: turns, error: turnsError } = await supabase
      .from("voice_coach_turns")
      .select("id, turn_index, role, text, emotion, audio_path, audio_seconds, analysis_json, features_json")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true })
    if (turnsError) return jsonError(500, "turns_query_failed", { message: turnsError.message })

    const enriched = await Promise.all((turns || []).map(attachSignedUrl))
    const scenario = getScenario(session.scenario_id)

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        scenario: {
          id: scenario.id,
          name: scenario.name,
        },
      },
      turns: enriched,
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
