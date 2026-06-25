import { NextRequest, NextResponse } from "next/server"

import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import {
  getAliyunRdsStoreInvitePreview,
  StoreInviteHttpError,
} from "@/lib/aliyun-rds/repositories/store-invites.server"

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
    { ok: false, error: error instanceof Error ? error.message : "invite_preview_failed", code: "invite_preview_failed" },
    { status: 500 },
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  void request
  try {
    const { token } = await params
    return NextResponse.json(await getAliyunRdsStoreInvitePreview(token))
  } catch (error) {
    return inviteErrorResponse(error)
  }
}
