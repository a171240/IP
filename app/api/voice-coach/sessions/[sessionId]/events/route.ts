import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { pumpVoiceCoachQueuedJobs } from "@/lib/voice-coach/jobs.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const DEFAULT_TIMEOUT_MS = 5000
const MIN_TIMEOUT_MS = 150
const MAX_TIMEOUT_MS = 25000
const EMPTY_POLL_SLEEP_MS = 150
// Return as soon as the first interactive event is available instead of
// draining multiple stages (for example analysis) in one long-poll request.
const MAX_JOBS_PER_TICK = 1

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

async function fetchEventsAfterCursor(args: {
  supabase: any
  sessionId: string
  cursor: number
}) {
  const { data: events, error } = await args.supabase
    .from("voice_coach_events")
    .select("id, created_at, type, turn_id, job_id, data_json")
    .eq("session_id", args.sessionId)
    .gt("id", args.cursor)
    .order("id", { ascending: true })
    .limit(50)

  if (error) {
    return {
      error,
      events: null as any,
    }
  }

  return {
    error: null,
    events: events || [],
  }
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
    const timeoutMs = clamp(
      Number(search.get("timeout_ms") || DEFAULT_TIMEOUT_MS),
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    )
    const started = Date.now()

    while (true) {
      const initialFetch = await fetchEventsAfterCursor({
        supabase,
        sessionId,
        cursor,
      })
      if (initialFetch.error) {
        return jsonError(500, "events_query_failed", { message: initialFetch.error.message })
      }

      if (initialFetch.events.length > 0) {
        const nextCursor = Number(initialFetch.events[initialFetch.events.length - 1].id || cursor)
        return NextResponse.json({
          events: initialFetch.events.map((e: any) => ({
            id: Number(e.id),
            ts: e.created_at,
            type: String(e.type || ""),
            turn_id: e.turn_id || null,
            job_id: e.job_id || null,
            data: e.data_json || {},
            stage_elapsed_ms: Number((e.data_json || {}).stage_elapsed_ms || 0) || null,
          })),
          next_cursor: nextCursor,
          has_more: initialFetch.events.length >= 50,
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

      // Drive the queue in small steps so we can return immediately once
      // customer.text_ready / customer.audio_ready is emitted, instead of
      // waiting for slower follow-up stages like analysis.
      const processed = await pumpVoiceCoachQueuedJobs({
        sessionId,
        userId: user.id,
        maxJobs: MAX_JOBS_PER_TICK,
      })

      const postPumpFetch = await fetchEventsAfterCursor({
        supabase,
        sessionId,
        cursor,
      })
      if (postPumpFetch.error) {
        return jsonError(500, "events_query_failed", { message: postPumpFetch.error.message })
      }

      if (postPumpFetch.events.length > 0) {
        const nextCursor = Number(postPumpFetch.events[postPumpFetch.events.length - 1].id || cursor)
        return NextResponse.json({
          events: postPumpFetch.events.map((e: any) => ({
            id: Number(e.id),
            ts: e.created_at,
            type: String(e.type || ""),
            turn_id: e.turn_id || null,
            job_id: e.job_id || null,
            data: e.data_json || {},
            stage_elapsed_ms: Number((e.data_json || {}).stage_elapsed_ms || 0) || null,
          })),
          next_cursor: nextCursor,
          has_more: postPumpFetch.events.length >= 50,
        })
      }

      if (!processed) {
        await sleep(EMPTY_POLL_SLEEP_MS)
      }
    }
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
