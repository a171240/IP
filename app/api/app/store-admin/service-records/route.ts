import { NextRequest, NextResponse } from "next/server"

import {
  accountPayload,
  cleanText,
  listAliyunRdsServiceRecordSessions,
  rdsServiceRecordErrorResponse,
  toPublicSession,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import { resolveAliyunRdsStoreManagerAuth } from "@/lib/aliyun-rds/repositories/store-admin.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await resolveAliyunRdsStoreManagerAuth(request)
  if (!auth.ok) return auth.error

  const params = new URL(request.url).searchParams
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") || 20) || 20))
  const customerProfileId = cleanText(params.get("customer_profile_id"), 80)
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  try {
    const sessions = await listAliyunRdsServiceRecordSessions({
      ctx: auth.ctx,
      limit,
      customerProfileId,
      requestedCompanyId,
      requestedStoreId,
    })

    return NextResponse.json({
      ok: true,
      context: accountPayload(auth.ctx),
      sessions: sessions.map(toPublicSession),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "store_admin_service_records_failed")
  }
}
