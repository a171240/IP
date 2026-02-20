import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import {
  createVoiceCoachTrace,
  type VoiceCoachTrace,
  withVoiceCoachTraceHeaders,
  voiceCoachJson,
} from "@/lib/voice-coach/trace.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(trace: VoiceCoachTrace, status: number, error: string, extra?: Record<string, unknown>) {
  return voiceCoachJson(trace, { error, ...extra }, status)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const trace = createVoiceCoachTrace(request)
  try {
    const { sessionId } = await context.params
    if (!sessionId) return jsonError(trace, 400, "missing_session_id")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(trace, 401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(trace, access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(trace, 404, "session_not_found")

    const search = request.nextUrl.searchParams
    const cursor = Math.max(0, Number(search.get("cursor") || 0) || 0)
    const timeoutMs = clamp(Number(search.get("timeout_ms") || 25000), 5000, 30000)

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let latestCursor = cursor
        const started = Date.now()
        let closed = false

        const push = (event: string, payload: Record<string, unknown>) => {
          if (closed) return
          // Keep stream payload ASCII-only for better Mini Program chunk parsing compatibility.
          const encoded = encodeURIComponent(JSON.stringify(payload))
          const body = `event: ${event}\ndata: ${encoded}\n\n`
          controller.enqueue(encoder.encode(body))
        }

        // Force an early chunk flush on some mobile proxies/runtimes.
        controller.enqueue(encoder.encode(`:${" ".repeat(2048)}\n\n`))

        push("ready", {
          next_cursor: latestCursor,
          trace_id: trace.traceId,
          client_build: trace.clientBuild,
          server_build: trace.serverBuild,
          ts: new Date().toISOString(),
        })

        while (!closed && Date.now() - started < timeoutMs) {
          if (request.signal.aborted) {
            closed = true
            break
          }

          const { data: events, error: eventsError } = await supabase
            .from("voice_coach_events")
            .select("id, created_at, type, turn_id, job_id, data_json")
            .eq("session_id", sessionId)
            .gt("id", latestCursor)
            .order("id", { ascending: true })
            .limit(50)

          if (eventsError) {
            push("error", { error: "events_query_failed", message: eventsError.message, ts: new Date().toISOString() })
            closed = true
            break
          }

          if (events && events.length > 0) {
            latestCursor = Number(events[events.length - 1].id || latestCursor)
            push("events", {
              events: events.map((e: any) => ({
                id: Number(e.id),
                ts: e.created_at,
                type: String(e.type || ""),
                turn_id: e.turn_id || null,
                job_id: e.job_id || null,
                data: e.data_json || {},
                stage_elapsed_ms: Number((e.data_json || {}).stage_elapsed_ms || 0) || null,
              })),
              next_cursor: latestCursor,
              has_more: events.length >= 50,
              trace_id: trace.traceId,
              client_build: trace.clientBuild,
              server_build: trace.serverBuild,
            })
            continue
          }

          await sleep(180)
        }

        if (!closed) {
          push("end", {
            timeout: true,
            next_cursor: latestCursor,
            session_status: session.status,
            trace_id: trace.traceId,
            client_build: trace.clientBuild,
            server_build: trace.serverBuild,
            ts: new Date().toISOString(),
          })
        }

        controller.close()
      },
      cancel: () => {
        // closed by client
      },
    })

    const response = new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
    withVoiceCoachTraceHeaders(response, trace)
    return response
  } catch (err: any) {
    return jsonError(trace, 500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
