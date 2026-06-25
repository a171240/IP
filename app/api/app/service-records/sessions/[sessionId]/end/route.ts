import { NextRequest, NextResponse } from "next/server"

import {
  cleanText,
  endAliyunRdsServiceRecordSession,
  getAliyunRdsOwnedServiceRecordSession,
  isRecord,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
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
    if (["processing", "completed", "failed", "cancelled"].includes(String(session.status || ""))) {
      return jsonError(409, "service_record_closed", "service_record_closed")
    }

    const body = await request.json().catch(() => null)
    const payload = isRecord(body) ? body : {}
    if (payload.client_confirmed !== true) return jsonError(400, "end_confirmation_required", "end_confirmation_required")

    const updated = await endAliyunRdsServiceRecordSession({
      session,
      endedReason: cleanText(payload.ended_reason, 120),
      mode: cleanText(payload.mode, 80),
    })
    return NextResponse.json({
      ok: true,
      session: toPublicSession(updated),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "session_end_failed")
  }
}
