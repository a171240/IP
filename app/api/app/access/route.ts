import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { getAliyunRdsAppAccessSnapshot } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const access = await getAliyunRdsAppAccessSnapshot(auth.user)
    return NextResponse.json({
      ok: true,
      ...access,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError
    if (error instanceof AliyunRdsConfigurationError) {
      return NextResponse.json(
        { ok: false, error: "rds_not_configured", code: "rds_not_configured" },
        { status: 503 },
      )
    }
    if (error instanceof Error && error.message === "app_identity_review_required") {
      return NextResponse.json(
        {
          ok: false,
          error: "identity_review_required",
          code: "identity_review_required",
        },
        {
          headers: { "Cache-Control": "private, no-store" },
          status: 409,
        },
      )
    }
    return NextResponse.json(
      { ok: false, error: "access_snapshot_failed", code: "access_snapshot_failed" },
      { status: 500 },
    )
  }
}
