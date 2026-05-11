import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  getMpAccountRoleLabel,
  hashInviteToken,
  resolveMpAccountContextForUser,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function inviteUsable(invite: any) {
  if (!invite || invite.status !== "active") return false
  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) return false
  return new Date(invite.expires_at).getTime() > Date.now()
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = String(token || "").trim()
  if (!cleanToken) return jsonError(400, "邀请链接无效", "token_required")

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return jsonError(401, "请先登录", "auth_required")

  const admin = createAdminSupabaseClient()
  const { data: invite, error } = await admin
    .from("mp_account_invites")
    .select("id, company_id, store_id, role, max_uses, used_count, expires_at, status, note")
    .eq("token_hash", hashInviteToken(cleanToken))
    .maybeSingle()

  if (error || !invite) return jsonError(404, "邀请链接不存在或已失效", "invite_not_found")
  if (!inviteUsable(invite)) return jsonError(410, "邀请链接已过期或次数已用完", "invite_expired")

  const [{ data: company }, { data: store }] = await Promise.all([
    admin.from("mp_companies").select("id, name, status").eq("id", invite.company_id).maybeSingle(),
    invite.store_id
      ? admin.from("mp_stores").select("id, name, status").eq("id", invite.store_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!company) return jsonError(404, "公司不存在", "company_not_found")

  let existingQuery = admin
    .from("mp_account_memberships")
    .select("id, user_id, company_id, store_id, role, status")
    .eq("user_id", user.id)
    .eq("company_id", invite.company_id)
    .eq("role", invite.role)

  existingQuery = invite.store_id ? existingQuery.eq("store_id", invite.store_id) : existingQuery.is("store_id", null)
  const { data: existing } = await existingQuery.maybeSingle()

  let membership = existing
  if (membership?.id) {
    await admin
      .from("mp_account_memberships")
      .update({
        store_id: invite.store_id || null,
        status: "active",
        accepted_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", membership.id)
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("mp_account_memberships")
      .insert({
        user_id: user.id,
        company_id: invite.company_id,
        store_id: invite.store_id || null,
        role: invite.role,
        status: "active",
        accepted_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select("id, user_id, company_id, store_id, role, status, created_at")
      .single()

    if (insertError || !inserted) {
      return jsonError(500, insertError?.message || "membership_create_failed", "membership_create_failed")
    }
    membership = inserted
  }

  await admin
    .from("mp_account_invites")
    .update({ used_count: Number(invite.used_count || 0) + 1 })
    .eq("id", invite.id)

  await admin
    .from("profiles")
    .update({
      account_role: invite.role,
      company_id: company.id,
      company_name: company.name,
      store_id: store?.id || null,
      store_name: store?.name || null,
    })
    .eq("id", user.id)

  const context = await resolveMpAccountContextForUser({
    userId: user.id,
    userEmail: user.email ?? null,
    userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
  })

  return NextResponse.json({
    ok: true,
    membership,
    role_label: getMpAccountRoleLabel(invite.role),
    company,
    store,
    context: accountContextPayload(context),
  })
}
