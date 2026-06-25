import { NextRequest, NextResponse } from "next/server"

import { isAliyunRdsBailianAsrConfigured } from "@/lib/aliyun-rds/service-record-asr.server"
import {
  getAliyunRdsOwnedServiceRecordSession,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  toPublicSegment,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import { pollAliyunRdsServiceRecordAsrSegments } from "@/lib/aliyun-rds/repositories/service-record-processing.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")
  if (!isAliyunRdsBailianAsrConfigured()) return jsonError(400, "bailian_api_key_missing", "bailian_api_key_missing")

  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  try {
    const session = await getAliyunRdsOwnedServiceRecordSession(ctx, id)
    if (!session) return jsonError(404, "service_record_not_found", "service_record_not_found")

    const updated = await pollAliyunRdsServiceRecordAsrSegments(session.id, { pollLimit: 20 })
    return NextResponse.json({
      ok: true,
      segments: updated.map(toPublicSegment),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "asr_poll_failed")
  }
}
