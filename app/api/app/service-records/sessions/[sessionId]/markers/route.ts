import { NextRequest, NextResponse } from "next/server"

import {
  cleanText,
  createAliyunRdsServiceRecordMarker,
  getAliyunRdsOwnedServiceRecordSession,
  isRecord,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  toPublicMarker,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

const ALLOWED_MARKER_TYPES = new Set([
  "customer_objection",
  "deal_signal",
  "professional_question",
  "manager_joined",
  "custom",
])

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
    if (!isRecord(body)) return jsonError(400, "invalid_payload", "invalid_payload")

    const markerType = cleanText(body.marker_type, 60) || "custom"
    const normalizedType = ALLOWED_MARKER_TYPES.has(markerType) ? markerType : "custom"
    const marker = await createAliyunRdsServiceRecordMarker({
      ctx,
      session,
      markerType: normalizedType,
      label: body.label,
      offsetSeconds: body.offset_seconds,
      note: body.note,
    })
    return NextResponse.json({
      ok: true,
      marker: toPublicMarker(marker),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "marker_insert_failed")
  }
}
