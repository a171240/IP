import { NextRequest, NextResponse } from "next/server"

import {
  getAliyunRdsStoreAdminAnalytics,
  rdsStoreAdminErrorResponse,
  resolveAliyunRdsStoreManagerAuth,
} from "@/lib/aliyun-rds/repositories/store-admin.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsStoreManagerAuth(request)
    if (!auth.ok) return auth.error
    const payload = await getAliyunRdsStoreAdminAnalytics(auth.ctx, request)
    if ("error" in payload) return payload.error
    return NextResponse.json(payload)
  } catch (error) {
    return rdsStoreAdminErrorResponse(error, "store_admin_analytics_failed")
  }
}
