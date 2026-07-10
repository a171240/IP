import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import {
  acceptAliyunRdsStoreInvite,
  StoreInviteHttpError,
} from "@/lib/aliyun-rds/repositories/store-invites.server"

export const runtime = "nodejs"

function inviteErrorResponse(error: unknown) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof StoreInviteHttpError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        ...(error.code === "invite_unusable" && error.reason ? { reason: error.reason } : {}),
      },
      { status: error.status },
    )
  }
  if (error instanceof AliyunRdsConfigurationError) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" }, { status: 503 })
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return NextResponse.json({ ok: false, error: "Aliyun RDS is not reachable", code: "rds_unavailable" }, { status: 503 })
  }
  return NextResponse.json({ ok: false, code: "invite_accept_failed" }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()
    const { token } = await params

    const payload = await acceptAliyunRdsStoreInvite(token, auth.user)
    return NextResponse.json(payload)
  } catch (error) {
    return inviteErrorResponse(error)
  }
}
