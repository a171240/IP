import { NextRequest, NextResponse } from "next/server"

import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import {
  assertAliyunRdsStoreInviteUsable,
  StoreInviteHttpError,
} from "@/lib/aliyun-rds/repositories/store-invites.server"
import { createMiniProgramCode } from "@/lib/wechat/mini-program.server"

export const runtime = "nodejs"

const INVITE_ACCEPT_PAGE = "pages/store-admin/invite-accept/index"
const VALID_ENV_VERSIONS = new Set(["release", "trial", "develop"])

function inviteErrorResponse(error: unknown) {
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
  return NextResponse.json({ ok: false, code: "qrcode_create_failed" }, { status: 500 })
}

function resolveEnvVersion(request: NextRequest) {
  const urlValue = new URL(request.url).searchParams.get("env_version")
  const envValue = process.env.WECHAT_INVITE_QR_ENV_VERSION
  const value = String(urlValue || envValue || "release").trim()
  return VALID_ENV_VERSIONS.has(value) ? (value as "release" | "trial" | "develop") : "release"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    await assertAliyunRdsStoreInviteUsable(token)
    const width = Number(new URL(request.url).searchParams.get("width") || 430)
    const { bytes, contentType } = await createMiniProgramCode({
      scene: token,
      page: INVITE_ACCEPT_PAGE,
      width,
      checkPath: false,
      envVersion: resolveEnvVersion(request),
    })

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return inviteErrorResponse(error)
  }
}
