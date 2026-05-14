import { NextRequest, NextResponse } from "next/server"

import { getMpAccountRoleLabel, hashInviteToken } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function inviteUsable(invite: any) {
  if (!invite || invite.status !== "active") return false
  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) return false
  return new Date(invite.expires_at).getTime() > Date.now()
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  void request
  const { token } = await params
  const cleanToken = String(token || "").trim()
  if (!cleanToken) return jsonError(400, "邀请链接无效", "token_required")

  const admin = createAdminSupabaseClient()
  const { data: invite, error } = await admin
    .from("mp_account_invites")
    .select("id, company_id, store_id, role, max_uses, used_count, expires_at, status, note, created_at")
    .eq("token_hash", hashInviteToken(cleanToken))
    .maybeSingle()

  if (error || !invite) return jsonError(404, "邀请链接不存在或已失效", "invite_not_found")

  const [{ data: company }, { data: store }] = await Promise.all([
    admin.from("mp_companies").select("id, name, status").eq("id", invite.company_id).maybeSingle(),
    invite.store_id
      ? admin.from("mp_stores").select("id, name, status").eq("id", invite.store_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    ok: true,
    usable: inviteUsable(invite),
    invite: {
      id: invite.id,
      role: invite.role,
      role_label: getMpAccountRoleLabel(invite.role),
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      status: invite.status,
      note: invite.note || "",
      company_id: invite.company_id,
      company_name: company?.name || "",
      store_id: invite.store_id || null,
      store_name: store?.name || "",
    },
  })
}
