import { NextRequest, NextResponse } from "next/server"

import {
  getAliyunRdsOwnedServiceRecordSession,
  isRecord,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  toPublicMarker,
  toPublicSegment,
  toPublicSession,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import { processAliyunRdsServiceRecordSession } from "@/lib/aliyun-rds/repositories/service-record-processing.server"

export const runtime = "nodejs"

function resumeWindowExpired(session: { resume_deadline_at?: string | null }) {
  const deadline = session.resume_deadline_at ? new Date(session.resume_deadline_at).getTime() : 0
  return !deadline || Number.isNaN(deadline) || Date.now() >= deadline
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  try {
    const session = await getAliyunRdsOwnedServiceRecordSession(ctx, id)
    if (!session) return jsonError(404, "service_record_not_found", "service_record_not_found")

    const body = await request.json().catch(() => null)
    const payload = isRecord(body) ? body : {}
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

    const result = await processAliyunRdsServiceRecordSession(session)
    return NextResponse.json({
      ok: true,
      session: toPublicSession(result.session),
      segments: result.segments.map(toPublicSegment),
      markers: result.markers.map(toPublicMarker),
      result: result.result,
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "service_record_process_failed")
  }
}
