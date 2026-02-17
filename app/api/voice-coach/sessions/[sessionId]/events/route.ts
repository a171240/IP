import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { pumpVoiceCoachQueuedJobs } from "@/lib/voice-coach/jobs.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    if (!sessionId) return jsonError(400, "missing_session_id")

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

    const search = request.nextUrl.searchParams
    const cursor = Math.max(0, Number(search.get("cursor") || 0) || 0)
    const timeoutMs = clamp(Number(search.get("timeout_ms") || 10000), 1000, 15000)
    const started = Date.now()

    while (true) {
      // Drive queue processing while client is polling.
      await pumpVoiceCoachQueuedJobs({ sessionId, userId: user.id, maxJobs: 1 })

      const { data: events, error: eventsError } = await supabase
        .from("voice_coach_events")
        .select("id, created_at, type, turn_id, job_id, data_json")
        .eq("session_id", sessionId)
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(50)
      if (eventsError) return jsonError(500, "events_query_failed", { message: eventsError.message })

      if (events && events.length > 0) {
        const nextCursor = Number(events[events.length - 1].id || cursor)
        return NextResponse.json({
          events: events.map((e: any) => ({
            id: Number(e.id),
            ts: e.created_at,
            type: String(e.type || ""),
            turn_id: e.turn_id || null,
            job_id: e.job_id || null,
            data: e.data_json || {},
          })),
          next_cursor: nextCursor,
          has_more: events.length >= 50,
        })
      }

      if (Date.now() - started >= timeoutMs) {
        return NextResponse.json({
          events: [],
          next_cursor: cursor,
          has_more: false,
          session_status: session.status,
        })
      }

      await sleep(220)
    }
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
