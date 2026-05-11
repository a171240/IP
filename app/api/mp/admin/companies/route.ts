import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  getMpAccountRoleLabel,
  requirePlatformAdminContext,
  type MpAccountRole,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function cleanText(value: unknown, max = 120) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("mp_companies")
    .select("id, name, owner_user_id, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return jsonError(500, error.message, "companies_query_failed")

  return NextResponse.json({
    ok: true,
    context: accountContextPayload(auth.ctx),
    companies: data || [],
  })
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const body = (await request.json().catch(() => null)) as any
  const name = cleanText(body?.name)
  const ownerUserId = cleanText(body?.owner_user_id || body?.ownerUserId, 80)
  const ownerRole = cleanText(body?.owner_role || body?.ownerRole || "company_owner") as MpAccountRole

  if (!name) return jsonError(400, "公司名称不能为空", "name_required")

  const admin = createAdminSupabaseClient()
  if (ownerUserId) {
    const { data: ownerProfile, error: ownerError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", ownerUserId)
      .maybeSingle()

    if (ownerError || !ownerProfile) {
      return jsonError(404, ownerError?.message || "owner_user_not_found", "owner_user_not_found")
    }
  }

  const { data: company, error: companyError } = await admin
    .from("mp_companies")
    .insert({
      name,
      owner_user_id: ownerUserId || null,
      status: cleanText(body?.status, 20) || "active",
    })
    .select("id, name, owner_user_id, status, created_at, updated_at")
    .single()

  if (companyError || !company) {
    return jsonError(500, companyError?.message || "company_create_failed", "company_create_failed")
  }

  let membership: any = null
  if (ownerUserId) {
    const { data: existingMembership } = await admin
      .from("mp_account_memberships")
      .select("id, user_id, company_id, store_id, role, status, created_at")
      .eq("user_id", ownerUserId)
      .eq("company_id", company.id)
      .eq("role", ownerRole)
      .is("store_id", null)
      .maybeSingle()

    const membershipResult = existingMembership?.id
      ? await admin
          .from("mp_account_memberships")
          .update({
            status: "active",
            accepted_at: new Date().toISOString(),
            invited_by_user_id: auth.user.id,
          })
          .eq("id", existingMembership.id)
          .select("id, user_id, company_id, store_id, role, status, created_at")
          .single()
      : await admin
          .from("mp_account_memberships")
          .insert({
            user_id: ownerUserId,
            company_id: company.id,
            store_id: null,
            role: ownerRole,
            status: "active",
            accepted_at: new Date().toISOString(),
            invited_by_user_id: auth.user.id,
          })
          .select("id, user_id, company_id, store_id, role, status, created_at")
          .single()

    if (membershipResult.error) {
      return jsonError(500, membershipResult.error.message, "membership_create_failed", { company })
    }

    membership = membershipResult.data
    await admin
      .from("profiles")
      .update({
        account_role: ownerRole,
        company_id: company.id,
        company_name: company.name,
        store_id: null,
        store_name: null,
      })
      .eq("id", ownerUserId)
  }

  return NextResponse.json({
    ok: true,
    company,
    membership,
    owner_role_label: getMpAccountRoleLabel(ownerRole),
  })
}
