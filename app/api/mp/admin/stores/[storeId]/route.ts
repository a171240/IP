import { NextRequest, NextResponse } from "next/server"

import {
  getMpAccountRoleLabel,
  isCompanyScopedRole,
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

function normalizeStoreStatus(value: unknown) {
  const text = cleanText(value, 30).toLowerCase()
  if (!text) return ""
  if (["active", "suspended", "disabled", "inactive"].includes(text)) return text
  return ""
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const { storeId } = await context.params
  const id = cleanText(storeId, 80)
  if (!id) return jsonError(400, "门店 ID 不能为空", "store_id_required")

  const body = (await request.json().catch(() => null)) as any
  const nextName = cleanText(body?.name)
  const nextStatus = normalizeStoreStatus(body?.status)
  const ownerUserId = cleanText(body?.owner_user_id || body?.ownerUserId, 80)
  const ownerRole = cleanText(body?.owner_role || body?.ownerRole || "store_admin", 40) as MpAccountRole
  const servicePlanLabel = cleanText(body?.service_plan_label || body?.servicePlanLabel, 80)

  const admin = createAdminSupabaseClient()
  const { data: store, error: storeError } = await admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (storeError || !store) return jsonError(404, storeError?.message || "store_not_found", "store_not_found")

  const { data: company, error: companyError } = await admin
    .from("mp_companies")
    .select("id, name, status")
    .eq("id", store.company_id)
    .maybeSingle()
  if (companyError || !company) return jsonError(404, companyError?.message || "company_not_found", "company_not_found")

  const updates: Record<string, unknown> = {}
  if (nextName) updates.name = nextName
  if (nextStatus) updates.status = nextStatus
  if (Object.keys(updates).length) updates.updated_at = new Date().toISOString()

  let nextStore = store
  if (Object.keys(updates).length) {
    const { data, error } = await admin
      .from("mp_stores")
      .update(updates)
      .eq("id", id)
      .select("id, company_id, name, status, created_at, updated_at")
      .single()
    if (error || !data) return jsonError(500, error?.message || "store_update_failed", "store_update_failed")
    nextStore = data
  }

  let membership: any = null
  if (ownerUserId) {
    const { data: ownerProfile, error: ownerError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", ownerUserId)
      .maybeSingle()
    if (ownerError || !ownerProfile) {
      return jsonError(404, ownerError?.message || "owner_user_not_found", "owner_user_not_found", { store: nextStore })
    }

    const { data: existingCompanyScopeMembership } = await admin
      .from("mp_account_memberships")
      .select("role")
      .eq("user_id", ownerUserId)
      .eq("company_id", company.id)
      .is("store_id", null)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()

    const { data: existingMembership } = await admin
      .from("mp_account_memberships")
      .select("id, user_id, company_id, store_id, role, status, created_at")
      .eq("user_id", ownerUserId)
      .eq("company_id", company.id)
      .eq("store_id", nextStore.id)
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
            store_id: nextStore.id,
            role: ownerRole,
            status: "active",
            accepted_at: new Date().toISOString(),
            invited_by_user_id: auth.user.id,
          })
          .select("id, user_id, company_id, store_id, role, status, created_at")
          .single()

    if (membershipResult.error) {
      return jsonError(500, membershipResult.error.message, "membership_upsert_failed", { store: nextStore })
    }

    membership = membershipResult.data
    const shouldKeepCompanyScope = isCompanyScopedRole(existingCompanyScopeMembership?.role) || isCompanyScopedRole(ownerRole)
    const profileUpdate: Record<string, unknown> = shouldKeepCompanyScope
      ? {
          account_role: existingCompanyScopeMembership?.role || ownerRole,
          company_id: company.id,
          company_name: company.name,
          store_id: null,
          store_name: null,
        }
      : {
          account_role: ownerRole,
          company_id: company.id,
          company_name: company.name,
          store_id: nextStore.id,
          store_name: nextStore.name,
        }
    if (servicePlanLabel) profileUpdate.service_plan_label = servicePlanLabel

    await admin.from("profiles").update(profileUpdate).eq("id", ownerUserId)
  }

  return NextResponse.json({
    ok: true,
    company,
    store: nextStore,
    membership,
    owner_role_label: ownerUserId ? getMpAccountRoleLabel(ownerRole) : null,
  })
}
