import { NextRequest, NextResponse } from "next/server"

import { hashInviteToken } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createMiniProgramCode } from "@/lib/wechat/mini-program.server"

export const runtime = "nodejs"

const INVITE_ACCEPT_PAGE = "pages/store-admin/invite-accept/index"
const VALID_ENV_VERSIONS = new Set(["release", "trial", "develop"])

type InviteRow = {
  max_uses: number | null
  used_count: number | null
  expires_at: string | null
  status: string | null
}

function jsonError(status: number, error: string, code = error) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

function inviteUsable(invite: InviteRow | null | undefined) {
  if (!invite || invite.status !== "active") return false
  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) return false
  if (!invite.expires_at) return false
  return new Date(invite.expires_at).getTime() > Date.now()
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
  const { token } = await params
  const cleanToken = String(token || "").trim()
  if (!cleanToken) return jsonError(400, "门店入口无效", "token_required")

  const admin = createAdminSupabaseClient()
  const { data: invite, error } = await admin
    .from("mp_account_invites")
    .select("id, max_uses, used_count, expires_at, status")
    .eq("token_hash", hashInviteToken(cleanToken))
    .maybeSingle()

  if (error || !invite) return jsonError(404, "门店入口不存在或已失效", "invite_not_found")
  if (!inviteUsable(invite)) return jsonError(410, "门店入口已过期或次数已用完", "invite_expired")

  try {
    const width = Number(new URL(request.url).searchParams.get("width") || 430)
    const { bytes, contentType } = await createMiniProgramCode({
      scene: cleanToken,
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
    const message = error instanceof Error ? error.message : "qrcode_create_failed"
    return jsonError(500, message, "qrcode_create_failed")
  }
}
