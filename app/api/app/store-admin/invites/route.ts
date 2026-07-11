import { NextRequest, NextResponse } from "next/server"

import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import {
  createAliyunRdsStoreInvite,
  StoreInviteHttpError,
} from "@/lib/aliyun-rds/repositories/store-invites.server"
import { resolveAliyunRdsStoreManagerAuth } from "@/lib/aliyun-rds/repositories/store-admin.server"

export const runtime = "nodejs"

function inviteErrorResponse(error: unknown) {
  if (error instanceof StoreInviteHttpError) {
    return NextResponse.json({ ok: false, code: error.code }, { status: error.status })
  }
  if (error instanceof AliyunRdsConfigurationError) {
    return NextResponse.json({ ok: false, code: "rds_not_configured" }, { status: 503 })
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return NextResponse.json({ ok: false, code: "rds_unavailable" }, { status: 503 })
  }
  return NextResponse.json({ ok: false, code: "invite_create_failed" }, { status: 500 })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsStoreManagerAuth(request)
    if (!auth.ok) return auth.error
    const body = await request.json().catch(() => null)
    const payload = await createAliyunRdsStoreInvite({ ctx: auth.ctx, user: auth.user, body })
    return NextResponse.json({
      ok: payload.ok,
      invite: payload.invite,
      token: payload.token,
      path: payload.path,
    })
  } catch (error) {
    return inviteErrorResponse(error)
  }
}
