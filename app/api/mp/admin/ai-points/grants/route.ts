import { NextRequest, NextResponse } from "next/server"

import { requirePlatformAdminContext } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function parseInteger(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const body = (await request.json().catch(() => null)) as any
  const userId = cleanText(body?.user_id || body?.userId, 80)
  const companyId = cleanText(body?.company_id || body?.companyId, 80)
  const storeId = cleanText(body?.store_id || body?.storeId, 80)
  const note = cleanText(body?.note || body?.reason || "平台运营调整", 200)
  const servicePlanLabel = cleanText(body?.service_plan_label || body?.servicePlanLabel, 80)
  const delta = parseInteger(body?.delta)
  const setBalance = body?.set_balance === undefined && body?.setBalance === undefined
    ? null
    : parseInteger(body?.set_balance ?? body?.setBalance)

  if (!userId) return jsonError(400, "用户 ID 不能为空", "user_id_required")
  if (delta == null && setBalance == null) return jsonError(400, "请填写调整点数或目标余额", "points_required")
  if (delta != null && Math.abs(delta) > 100000) return jsonError(400, "单次调整不能超过 100000 点", "delta_too_large")
  if (setBalance != null && (setBalance < 0 || setBalance > 1000000)) {
    return jsonError(400, "目标余额需在 0 到 1000000 之间", "balance_out_of_range")
  }

  const admin = createAdminSupabaseClient()
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, nickname, credits_balance, credits_unlimited, account_role, company_id, store_id")
    .eq("id", userId)
    .maybeSingle()
  if (profileError || !profile) return jsonError(404, profileError?.message || "user_not_found", "user_not_found")

  const currentBalance = Number(profile.credits_balance || 0)
  const effectiveDelta = setBalance != null ? setBalance - currentBalance : Number(delta || 0)
  const nextBalance = Math.max(0, currentBalance + effectiveDelta)
  const updatePayload: Record<string, unknown> = { credits_balance: nextBalance }
  if (servicePlanLabel) updatePayload.service_plan_label = servicePlanLabel

  const { data: updatedProfile, error: updateError } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select("id, email, nickname, credits_balance, credits_unlimited, account_role, company_id, store_id, service_plan_label")
    .single()
  if (updateError || !updatedProfile) return jsonError(500, updateError?.message || "profile_update_failed", "profile_update_failed")

  await admin.from("mp_ai_point_ledger").insert({
    user_id: userId,
    account_role: updatedProfile.account_role || profile.account_role || null,
    company_id: companyId || updatedProfile.company_id || profile.company_id || null,
    store_id: storeId || updatedProfile.store_id || profile.store_id || null,
    action_code: "admin.ai_points.adjust",
    action_title: effectiveDelta >= 0 ? "平台发放 AI 点" : "平台扣减 AI 点",
    page_path: "web:/admin/store-accounts",
    business_object_type: storeId ? "mp_store" : companyId ? "mp_company" : "profile",
    business_object_id: storeId || companyId || userId,
    delta: effectiveDelta,
    balance_after: nextBalance,
    status: "succeeded",
    reason: note,
    metadata: {
      operator_user_id: auth.user.id,
      requested_delta: delta,
      requested_set_balance: setBalance,
      service_plan_label: servicePlanLabel || null,
    },
  })

  return NextResponse.json({
    ok: true,
    profile: updatedProfile,
    delta: effectiveDelta,
    balance_before: currentBalance,
    balance_after: nextBalance,
  })
}
