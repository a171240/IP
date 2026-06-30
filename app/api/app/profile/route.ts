import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { getAliyunRdsAppProfileResponse } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const account = await getAliyunRdsAppProfileResponse(auth.user)

    return NextResponse.json({
      ok: true,
      user: {
        id: auth.user.id,
        email: auth.user.email ?? null,
        user_metadata: auth.user.user_metadata || {},
      },
      profile: account.profile,
      entitlements: account.entitlements,
      account: account.account,
    })
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError

    if (error instanceof AliyunRdsConfigurationError) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "profile_query_failed",
        code: "profile_query_failed",
      },
      { status: 500 },
    )
  }
}
