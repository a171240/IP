import { NextRequest, NextResponse } from "next/server"

import {
  accountPayload,
  cleanText,
  createAliyunRdsServiceRecordSession,
  isRecord,
  jsonError,
  listAliyunRdsServiceRecordSessions,
  normalizeJsonArray,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  toPublicSession,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  const params = new URL(request.url).searchParams
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") || 20) || 20))
  const customerProfileId = cleanText(params.get("customer_profile_id"), 80)
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  try {
    const sessions = await listAliyunRdsServiceRecordSessions({
      ctx,
      limit,
      customerProfileId,
      requestedCompanyId,
      requestedStoreId,
    })
    return NextResponse.json({
      ok: true,
      context: accountPayload(ctx),
      sessions: sessions.map(toPublicSession),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "query_failed")
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) return jsonError(400, "invalid_payload", "invalid_payload")

  const clientSessionId = cleanText(body.client_session_id, 120)
  const consentConfirmed = body.consent_confirmed === true
  if (!clientSessionId) return jsonError(400, "missing_client_session_id", "missing_client_session_id")
  if (!consentConfirmed) return jsonError(400, "请先确认录音知情", "consent_required")

  try {
    const result = await createAliyunRdsServiceRecordSession(ctx, {
      ...body,
      client_session_id: clientSessionId,
      participants: normalizeJsonArray(body.participants),
    })
    if ("errorCode" in result) {
      if (result.errorCode === "customer_profile_not_found") {
        return jsonError(404, "customer_profile_not_found", "customer_profile_not_found")
      }
      return jsonError(404, "scene_card_not_found", "scene_card_not_found")
    }
    return NextResponse.json({
      ok: true,
      context: accountPayload(ctx),
      session: toPublicSession(result.session),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "insert_failed")
  }
}
