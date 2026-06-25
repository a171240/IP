import { NextRequest, NextResponse } from "next/server"

import {
  getAliyunRdsOwnedServiceRecordSession,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  resumeAliyunRdsServiceRecordSession,
  toPublicSession,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

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

    if (String(session.status || "") !== "ended_pending") {
      return jsonError(409, "service_record_not_resumable", "service_record_not_resumable")
    }

    const deadline = session.resume_deadline_at ? new Date(String(session.resume_deadline_at)).getTime() : 0
    if (!deadline || deadline < Date.now()) {
      return jsonError(409, "resume_window_expired", "resume_window_expired")
    }

    const updated = await resumeAliyunRdsServiceRecordSession(session.id)
    return NextResponse.json({
      ok: true,
      session: toPublicSession(updated),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "session_resume_failed")
  }
}
