import { NextRequest, NextResponse } from "next/server"

import {
  getMpAccountRoleLabel,
  requirePlatformAdminContext,
  type MpAccountRole,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const COMPANY_SCOPE_ROLES = new Set<MpAccountRole>([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "service_operator",
])

function cleanText(value: unknown, max = 120) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isCompanyScopeRole(role: unknown): role is MpAccountRole {
  return COMPANY_SCOPE_ROLES.has(String(role || "").trim() as MpAccountRole)
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const companyId = cleanText(new URL(request.url).searchParams.get("company_id"), 80)
  const admin = createAdminSupabaseClient()
  let query = admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(300)

  if (companyId) query = query.eq("company_id", companyId)

  const { data, error } = await query
  if (error) return jsonError(500, error.message, "stores_query_failed")

  return NextResponse.json({ ok: true, stores: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const body = (await request.json().catch(() => null)) as any
  const companyId = cleanText(body?.company_id || body?.companyId, 80)
  const name = cleanText(body?.name)
  const ownerUserId = cleanText(body?.owner_user_id || body?.ownerUserId, 80)
  const ownerRole = cleanText(body?.owner_role || body?.ownerRole || "store_admin") as MpAccountRole

  if (!companyId) return jsonError(400, "公司 ID 不能为空", "company_id_required")
  if (!name) return jsonError(400, "门店名称不能为空", "name_required")

  const admin = createAdminSupabaseClient()
  const { data: company, error: companyError } = await admin
    .from("mp_companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle()

  if (companyError || !company) {
    return jsonError(404, companyError?.message || "company_not_found", "company_not_found")
  }

  let companyScopeMembership: { role: MpAccountRole } | null = null
  if (ownerUserId) {
    const { data: ownerProfile, error: ownerError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", ownerUserId)
      .maybeSingle()

    if (ownerError || !ownerProfile) {
      return jsonError(404, ownerError?.message || "owner_user_not_found", "owner_user_not_found")
    }

    const { data: existingCompanyScopeMembership } = await admin
      .from("mp_account_memberships")
      .select("role")
      .eq("user_id", ownerUserId)
      .eq("company_id", company.id)
      .is("store_id", null)
      .eq("status", "active")
      .in("role", Array.from(COMPANY_SCOPE_ROLES))
      .limit(1)
      .maybeSingle()

    companyScopeMembership = existingCompanyScopeMembership as { role: MpAccountRole } | null
  }

  const { data: store, error: storeError } = await admin
    .from("mp_stores")
    .insert({
      company_id: company.id,
      name,
      status: cleanText(body?.status, 20) || "active",
    })
    .select("id, company_id, name, status, created_at, updated_at")
    .single()

  if (storeError || !store) {
    return jsonError(500, storeError?.message || "store_create_failed", "store_create_failed")
  }

  let membership: any = null
  if (ownerUserId) {
    const { data: existingMembership } = await admin
      .from("mp_account_memberships")
      .select("id, user_id, company_id, store_id, role, status, created_at")
      .eq("user_id", ownerUserId)
      .eq("company_id", company.id)
      .eq("store_id", store.id)
      .eq("role", ownerRole)
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
            store_id: store.id,
            role: ownerRole,
            status: "active",
            accepted_at: new Date().toISOString(),
            invited_by_user_id: auth.user.id,
          })
          .select("id, user_id, company_id, store_id, role, status, created_at")
          .single()

    if (membershipResult.error) {
      return jsonError(500, membershipResult.error.message, "membership_create_failed", { store })
    }

    membership = membershipResult.data
    const shouldKeepCompanyScope = isCompanyScopeRole(companyScopeMembership?.role) || isCompanyScopeRole(ownerRole)
    const profileRole = shouldKeepCompanyScope ? companyScopeMembership?.role || ownerRole : ownerRole
    const profileScope = shouldKeepCompanyScope
      ? {
          account_role: profileRole,
          company_id: company.id,
          company_name: company.name,
          store_id: null,
          store_name: null,
          credits_unlimited: true,
          service_plan_label: "门店不限量服务包",
        }
      : {
          account_role: ownerRole,
          company_id: company.id,
          company_name: company.name,
          store_id: store.id,
          store_name: store.name,
          credits_unlimited: true,
          service_plan_label: "门店不限量服务包",
        }

    await admin
      .from("profiles")
      .update(profileScope)
      .eq("id", ownerUserId)
  }

  return NextResponse.json({
    ok: true,
    company,
    store,
    membership,
    owner_role_label: getMpAccountRoleLabel(ownerRole),
  })
}
