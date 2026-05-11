import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  canInviteRole,
  createInviteToken,
  getMpAccountRoleLabel,
  hashInviteToken,
  isStoreScopedRole,
  requireStoreManagerContext,
  type MpAccountRole,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreManagerContext(request)
  if (!auth.ok) return auth.error

  const body = (await request.json().catch(() => null)) as any
  const requestedRole = cleanText(body?.role || "staff", 40) as MpAccountRole
  const role = requestedRole || "staff"
  if (!canInviteRole(auth.ctx, role)) {
    return jsonError(403, "当前账号不能邀请该角色", "role_not_allowed")
  }

  const admin = createAdminSupabaseClient()
  const companyId = auth.ctx.companyId || cleanText(body?.company_id || body?.companyId, 80)
  if (!companyId) return jsonError(400, "当前账号缺少公司归属", "company_id_required")

  let storeId = cleanText(body?.store_id || body?.storeId || "", 80)
  if (auth.ctx.isStoreManager && auth.ctx.storeId) storeId = auth.ctx.storeId
  if (isStoreScopedRole(role) && !storeId) {
    return jsonError(400, "邀请员工或店长时必须选择门店", "store_id_required")
  }

  const { data: company, error: companyError } = await admin
    .from("mp_companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle()

  if (companyError || !company) return jsonError(404, "公司不存在", "company_not_found")

  let store: any = null
  if (storeId) {
    const { data: storeRow, error: storeError } = await admin
      .from("mp_stores")
      .select("id, company_id, name, status")
      .eq("id", storeId)
      .eq("company_id", company.id)
      .maybeSingle()

    if (storeError || !storeRow) return jsonError(404, "门店不存在", "store_not_found")
    if (auth.ctx.isStoreManager && auth.ctx.storeId && storeRow.id !== auth.ctx.storeId) {
      return jsonError(403, "只能邀请本店成员", "store_scope_required")
    }
    store = storeRow
  }

  const token = createInviteToken()
  const maxUses = clampInt(body?.max_uses || body?.maxUses, 1, auth.ctx.isCompanyManager ? 200 : 50, 1)
  const expiresInDays = clampInt(body?.expires_in_days || body?.expiresInDays, 1, 30, 7)
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: inviteError } = await admin
    .from("mp_account_invites")
    .insert({
      company_id: company.id,
      store_id: store?.id || null,
      role,
      token_hash: hashInviteToken(token),
      invited_by_user_id: auth.user.id,
      max_uses: maxUses,
      used_count: 0,
      expires_at: expiresAt,
      status: "active",
      note: cleanText(body?.note || "", 240) || null,
      metadata: {
        created_from: "mini_program_store_admin",
      },
    })
    .select("id, company_id, store_id, role, max_uses, used_count, expires_at, status, note, created_at")
    .single()

  if (inviteError || !invite) {
    return jsonError(500, inviteError?.message || "invite_create_failed", "invite_create_failed")
  }

  const path = `/pages/store-admin/invite-accept/index?token=${encodeURIComponent(token)}`
  return NextResponse.json({
    ok: true,
    context: accountContextPayload(auth.ctx),
    invite: {
      ...invite,
      role_label: getMpAccountRoleLabel(role),
      company_name: company.name,
      store_name: store?.name || "",
    },
    token,
    path,
  })
}
