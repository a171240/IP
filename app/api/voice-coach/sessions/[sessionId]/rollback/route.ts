import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
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

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const body = (await request.json().catch(() => null)) as { from_turn_id?: unknown } | null
    const fromTurnId =
      typeof body?.from_turn_id === "string" && body.from_turn_id.trim() ? body.from_turn_id.trim() : ""
    if (!fromTurnId) return jsonError(400, "missing_from_turn_id")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: fromTurn, error: fromTurnError } = await supabase
      .from("voice_coach_turns")
      .select("id, session_id, role, turn_index")
      .eq("id", fromTurnId)
      .eq("session_id", sessionId)
      .single()
    if (fromTurnError || !fromTurn) return jsonError(404, "turn_not_found")
    if (fromTurn.role !== "beautician") return jsonError(400, "turn_not_beautician")

    const { error: deleteError } = await supabase
      .from("voice_coach_turns")
      .delete()
      .eq("session_id", sessionId)
      .gte("turn_index", fromTurn.turn_index)
    if (deleteError) return jsonError(500, "rollback_failed", { message: deleteError.message })

    const { data: turns, error: turnsError } = await supabase
      .from("voice_coach_turns")
      .select("id, turn_index, role, status, text, emotion, audio_path, audio_seconds, analysis_json, features_json")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true })
    if (turnsError) return jsonError(500, "turns_query_failed", { message: turnsError.message })

    const { data: latestEventRows } = await supabase
      .from("voice_coach_events")
      .select("id")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(1)
    const lastEventCursor = latestEventRows?.[0]?.id ? Number(latestEventRows[0].id) : 0

    const enriched = await Promise.all((turns || []).map(attachSignedUrl))
    return NextResponse.json({ turns: enriched, last_event_cursor: lastEventCursor })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
