import { NextRequest, NextResponse } from "next/server"

import { processServiceRecordSession } from "@/lib/service-records/processing.server"
import {
  getOwnedServiceRecordSession,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
  toPublicMarker,
  toPublicSegment,
  toPublicSession,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

function resumeWindowExpired(session: any) {
  const deadline = session.resume_deadline_at ? new Date(session.resume_deadline_at).getTime() : 0
  return !deadline || Number.isNaN(deadline) || Date.now() >= deadline
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getOwnedServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error

  const body = await request.json().catch(() => null)
  const payload = isRecord(body) ? body : {}
  const session = loaded.session
  const status = String(session.status || "")

  if (status === "recording" || status === "paused") {
    return jsonError(409, "service_record_not_ended", "service_record_not_ended")
  }
  if (status === "failed" || status === "cancelled") {
    return jsonError(409, "service_record_closed", "service_record_closed")
  }
  if (status === "ended_pending" && payload.client_confirmed !== true && !resumeWindowExpired(session)) {
    return jsonError(409, "resume_window_active", "resume_window_active", {
      resume_deadline_at: session.resume_deadline_at || null,
    })
  }

  try {
    const result = await processServiceRecordSession(admin, session)
    return NextResponse.json({
      ok: true,
      session: toPublicSession(result.session),
      segments: result.segments.map(toPublicSegment),
      markers: result.markers.map(toPublicMarker),
      result: result.result,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "service_record_process_failed", "service_record_process_failed")
  }
}
