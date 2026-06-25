import { NextRequest, NextResponse } from "next/server"

import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import {
  acceptAliyunRdsStoreInvite,
  StoreInviteHttpError,
} from "@/lib/aliyun-rds/repositories/store-invites.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function inviteErrorResponse(error: unknown) {
  if (error instanceof StoreInviteHttpError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status })
  }
  if (error instanceof AliyunRdsConfigurationError) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" }, { status: 503 })
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return NextResponse.json({ ok: false, error: "Aliyun RDS is not reachable", code: "rds_unavailable" }, { status: 503 })
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "invite_accept_failed", code: "invite_accept_failed" },
    { status: 500 },
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录", code: "auth_required" }, { status: 401 })

    const payload = await acceptAliyunRdsStoreInvite(token, {
      id: user.id,
      email: user.email ?? null,
      user_metadata: user.user_metadata || {},
    })
    return NextResponse.json(payload)
  } catch (error) {
    return inviteErrorResponse(error)
  }
}
