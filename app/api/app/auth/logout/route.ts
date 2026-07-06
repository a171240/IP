import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  getAliyunRdsAppAuthBearerTokenHash,
  getAliyunRdsAppAuthDeviceId,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { revokeAliyunRdsAppAuthToken } from "@/lib/aliyun-rds/app-auth-revocations.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()
    const tokenHash = getAliyunRdsAppAuthBearerTokenHash(request)
    if (!tokenHash) throw new Error("app_auth_logout_token_hash_required")
    await revokeAliyunRdsAppAuthToken({
      deviceId: getAliyunRdsAppAuthDeviceId(request),
      source: auth.source,
      tokenHash,
      userId: auth.user.id,
    })
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError
    throw error
  }

  return NextResponse.json({ ok: true })
}
