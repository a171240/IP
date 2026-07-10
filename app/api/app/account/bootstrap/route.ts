import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { bootstrapAliyunRdsAppProfile } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    await bootstrapAliyunRdsAppProfile(auth.user)
    return NextResponse.json({ ok: true, profile_initialized: true })
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
        error: "account_bootstrap_failed",
        code: "account_bootstrap_failed",
      },
      { status: 500 },
    )
  }
}
