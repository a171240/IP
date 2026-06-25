import { NextRequest, NextResponse } from "next/server"

import {
  getAliyunRdsStoreAdminOverview,
  rdsStoreAdminErrorResponse,
  resolveAliyunRdsStoreManagerAuth,
} from "@/lib/aliyun-rds/repositories/store-admin.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsStoreManagerAuth(request)
    if (!auth.ok) return auth.error
    const payload = await getAliyunRdsStoreAdminOverview(auth.ctx, request)
    if ("error" in payload) return payload.error
    return NextResponse.json(payload)
  } catch (error) {
    return rdsStoreAdminErrorResponse(error, "store_admin_overview_failed")
  }
}
