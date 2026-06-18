import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import {
  consumeCredits,
  ensureTrialCreditsIfNeeded,
  getClientIp,
  hashIp,
  refundCredits,
  type BillingProfile,
} from "@/lib/pricing/profile.server"
import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

export const MP_AI_ACTIONS = {
  "voice.customer_profile.save": { title: "保存顾客档案", cost: 0, page: "pages/voice-coach/customer-profile-editor/index" },
  "voice.customer_profile.simulate": { title: "生成模拟顾客", cost: 0, page: "pages/voice-coach/customer-profiles/index" },
  "voice.scene_card.save": { title: "保存项目卡", cost: 0, page: "pages/voice-coach/scene-card-editor/index" },
  "voice.scene_card.pack_local": { title: "整理训练包", cost: 0, page: "pages/voice-coach/scene-card-editor/index" },
  "voice.session.start": { title: "开始话术训练", cost: 0, page: "pages/voice-coach/setup/index" },
  "voice.hint.extra": { title: "超额灵感提示", cost: 1, page: "pages/voice-coach/chat" },
  "voice.report.basic": { title: "基础训练报告", cost: 0, page: "pages/voice-coach/report" },
  "voice.report.deep": { title: "深度复盘报告", cost: 3, page: "pages/voice-coach/report", stage: "future" },
  "poster.intake": { title: "海报需求整理", cost: 0, page: "pages/poster/index" },
  "poster.generate.image": { title: "生成海报图", cost: 10, page: "pages/poster/index" },
  "poster.rewrite.text": { title: "海报修字", cost: 1, page: "pages/poster/index" },
  "poster.regenerate.image": { title: "重做海报图", cost: 6, page: "pages/poster/index" },
  "xhs.generate.text": { title: "生成小红书正文", cost: 2, page: "pages/xiaohongshu/index" },
  "xhs.regenerate.text": { title: "换一版小红书正文", cost: 1, page: "pages/xiaohongshu/index" },
  "xhs.danger_check": { title: "雷区检测", cost: 0, page: "pages/xiaohongshu/index" },
  "xhs.generate.cover": { title: "生成小红书封面", cost: 8, page: "pages/xiaohongshu/index" },
  "xhs.regenerate.cover": { title: "重做小红书封面", cost: 6, page: "pages/xiaohongshu/index" },
  "private.copy.generate": { title: "生成私域文案", cost: 1, page: "pages/private-copy/index" },
  "private.copy.regenerate": { title: "换一版私域文案", cost: 1, page: "pages/private-copy/index" },
  "private.copy.ocr": { title: "识别私域文案图片", cost: 0, page: "pages/private-copy/index", stage: "future" },
  "content.ingest": { title: "链接提取", cost: 0, page: "pages/content-studio/index" },
  "content.rewrite.video_script": { title: "改写为视频脚本", cost: 3, page: "pages/content-studio/index" },
  "content.generate.video": {
    title: "生成视频",
    cost: null,
    costLabel: "按实际成本",
    page: "pages/content-studio/index",
  },
  "content.distribute": { title: "提交分发", cost: 0, page: "pages/content-studio/index" },
  "diagnosis.basic": { title: "基础诊断", cost: 0, page: "pages/diagnosis/index" },
} as const

export type MpAiActionCode = keyof typeof MP_AI_ACTIONS
export type MpAiActionRule = (typeof MP_AI_ACTIONS)[MpAiActionCode]

const MP_SERVICE_PLAN_LABELS: Record<PlanId, string> = {
  free: "体验服务",
  basic: "AI 点轻量包",
  pro: "AI 点标准包",
  vip: "服务交付包",
}

const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  company_owner: "公司主账号",
  company_admin: "总管理员",
  merchant_owner: "商家主账号",
  merchant_admin: "商家账号",
  store_owner: "门店主账号",
  store_admin: "门店账号",
  staff: "员工账号",
  employee: "员工账号",
  service_operator: "服务顾问账号",
}

type SupabaseForRequest = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

type ProfileRow = {
  id?: string | null
  plan?: string | null
  credits_balance?: number | null
  credits_unlimited?: boolean | null
  trial_granted_at?: string | null
  nickname?: string | null
  avatar_url?: string | null
  email?: string | null
  account_role?: string | null
  company_id?: string | null
  company_name?: string | null
  store_id?: string | null
  store_name?: string | null
  service_plan_label?: string | null
}

export type MpAiBillingContext = {
  supabase: SupabaseForRequest
  userId: string
  userEmail: string | null
  userMetadata: Record<string, unknown>
  plan: PlanId
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
  deviceId: string
  ipHash: string | null
  ai_points_balance: number
  ai_points_unlimited: boolean
  account_role: string
  account_role_label: string
  company_id: string | null
  company_name: string | null
  store_id: string | null
  store_name: string | null
  service_plan_label: string
  billing_user_id?: string | null
  billing_owner_label?: string | null
  billing_scope?: string | null
}

export type MpAiChargeResult =
  | {
      ok: true
      actionCode: MpAiActionCode
      title: string
      cost: number
      quotedCost: number | null
      costLabel: string
      remaining: number
      unlimited: boolean
    }
  | { ok: false; error: Response }

const BASE_PROFILE_SELECT = "plan, credits_balance, credits_unlimited, trial_granted_at, nickname, avatar_url, email"
const EXTENDED_PROFILE_SELECT = `${BASE_PROFILE_SELECT}, account_role, company_id, company_name, store_id, store_name, service_plan_label`
const BILLING_PROFILE_SELECT =
  "id, plan, credits_balance, credits_unlimited, trial_granted_at, nickname, email, account_role, company_id, company_name, store_id, store_name, service_plan_label"
const STORE_BILLING_OWNER_ROLES = new Set(["store_owner", "store_admin"])
const COMPANY_BILLING_OWNER_ROLES = new Set(["company_owner", "company_admin", "merchant_owner", "merchant_admin"])
const BILLING_OWNER_ROLE_PRIORITY: Record<string, number> = {
  store_owner: 100,
  store_admin: 95,
  merchant_owner: 90,
  company_owner: 88,
  merchant_admin: 82,
  company_admin: 80,
}

function isMissingProfileColumn(error: { code?: string | null; message?: string | null } | null | undefined) {
  const msg = String(error?.message || "").toLowerCase()
  return error?.code === "42703" || msg.includes("column") || msg.includes("schema cache")
}

function userMetadataText(meta: unknown, key: string) {
  if (!meta || typeof meta !== "object") return null
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeAccountRole(role: unknown) {
  const value = typeof role === "string" && role.trim() ? role.trim() : "merchant_owner"
  return ACCOUNT_ROLE_LABELS[value] ? value : "merchant_owner"
}

function normalizeProfile(
  row: ProfileRow | null | undefined
): Omit<MpAiBillingContext, "supabase" | "userId" | "userEmail" | "userMetadata" | "deviceId" | "ipHash"> {
  const plan = normalizePlan(row?.plan)
  const creditsBalance = Number(row?.credits_balance || 0)
  const creditsUnlimited = Boolean(row?.credits_unlimited) || plan === "vip"
  const accountRole = normalizeAccountRole(row?.account_role)
  const servicePlanLabel = row?.service_plan_label?.trim() || MP_SERVICE_PLAN_LABELS[plan]

  return {
    plan,
    credits_balance: creditsBalance,
    credits_unlimited: creditsUnlimited,
    trial_granted_at: (row?.trial_granted_at as string | null) ?? null,
    ai_points_balance: creditsBalance,
    ai_points_unlimited: creditsUnlimited,
    account_role: accountRole,
    account_role_label: ACCOUNT_ROLE_LABELS[accountRole] || "当前账号",
    company_id: row?.company_id || null,
    company_name: row?.company_name || null,
    store_id: row?.store_id || null,
    store_name: row?.store_name || null,
    service_plan_label: servicePlanLabel,
  }
}

function shouldUseMembershipBilling(role: string) {
  return role === "staff" || role === "employee"
}

function profileDisplayName(row: ProfileRow | null | undefined) {
  return row?.nickname?.trim() || row?.store_name?.trim() || row?.company_name?.trim() || row?.email?.trim() || "门店负责人"
}

async function resolveMembershipBillingProfile(opts: {
  account: Awaited<ReturnType<typeof resolveMpAccountContextForUser>>
}): Promise<Partial<MpAiBillingContext> | null> {
  if (!shouldUseMembershipBilling(opts.account.role)) return null
  if (!opts.account.companyId) return null

  const admin = createAdminSupabaseClient()
  const roles = Array.from(new Set([...STORE_BILLING_OWNER_ROLES, ...COMPANY_BILLING_OWNER_ROLES]))
  const { data: membershipRows, error: membershipError } = await admin
    .from("mp_account_memberships")
    .select("user_id, company_id, store_id, role, status")
    .eq("company_id", opts.account.companyId)
    .eq("status", "active")
    .in("role", roles)

  if (membershipError) return null

  const scopedRows = ((membershipRows || []) as Array<{ user_id?: string | null; store_id?: string | null; role?: string | null }>).filter(
    (row) => {
      const role = String(row.role || "")
      if (opts.account.storeId && row.store_id === opts.account.storeId && STORE_BILLING_OWNER_ROLES.has(role)) {
        return true
      }
      if (!row.store_id && COMPANY_BILLING_OWNER_ROLES.has(role)) return true
      return false
    }
  )
  if (!scopedRows.length) return null

  const userIds = Array.from(new Set(scopedRows.map((row) => row.user_id).filter(Boolean))) as string[]
  if (!userIds.length) return null

  const { data: profileRows, error: profileError } = await admin.from("profiles").select(BILLING_PROFILE_SELECT).in("id", userIds)
  if (profileError) return null

  const profileMap = new Map((profileRows || []).map((row) => [String(row.id), row as ProfileRow]))
  const candidates = scopedRows
    .map((membership) => {
      const profile = membership.user_id ? profileMap.get(String(membership.user_id)) : null
      const plan = normalizePlan(profile?.plan)
      const unlimited = Boolean(profile?.credits_unlimited) || plan === "vip"
      const balance = Number(profile?.credits_balance || 0)
      return { membership, profile, plan, unlimited, balance }
    })
    .filter((item) => item.profile && (item.unlimited || item.balance > 0))

  if (!candidates.length) return null

  candidates.sort((left, right) => {
    if (left.unlimited !== right.unlimited) return left.unlimited ? -1 : 1
    const leftStoreScope = left.membership.store_id === opts.account.storeId ? 1 : 0
    const rightStoreScope = right.membership.store_id === opts.account.storeId ? 1 : 0
    if (leftStoreScope !== rightStoreScope) return rightStoreScope - leftStoreScope
    const leftRole = String(left.membership.role || "")
    const rightRole = String(right.membership.role || "")
    const roleDelta = (BILLING_OWNER_ROLE_PRIORITY[rightRole] || 0) - (BILLING_OWNER_ROLE_PRIORITY[leftRole] || 0)
    if (roleDelta) return roleDelta
    return right.balance - left.balance
  })

  const best = candidates[0]
  const profile = best.profile
  if (!profile?.id) return null

  return {
    plan: best.plan,
    credits_balance: best.balance,
    credits_unlimited: best.unlimited,
    trial_granted_at: (profile.trial_granted_at as string | null) ?? null,
    ai_points_balance: best.balance,
    ai_points_unlimited: best.unlimited,
    service_plan_label: profile.service_plan_label?.trim() || (best.unlimited ? "门店不限量服务包" : "门店 AI 点额度"),
    billing_user_id: String(profile.id),
    billing_owner_label: profileDisplayName(profile),
    billing_scope: opts.account.storeId ? "store" : "company",
  }
}

async function selectProfileRow(supabase: SupabaseForRequest, userId: string) {
  const extended = await supabase.from("profiles").select(EXTENDED_PROFILE_SELECT).eq("id", userId).single()
  if (!extended.error || !isMissingProfileColumn(extended.error)) return extended
  return supabase.from("profiles").select(BASE_PROFILE_SELECT).eq("id", userId).single()
}

async function createProfileRow(opts: {
  supabase: SupabaseForRequest
  user: { id: string; email?: string | null; user_metadata?: unknown }
}) {
  const nickname = userMetadataText(opts.user.user_metadata, "nickname") || opts.user.email?.split("@")[0] || "User"
  const avatarUrl = userMetadataText(opts.user.user_metadata, "avatar_url")

  return opts.supabase
    .from("profiles")
    .insert({
      id: opts.user.id,
      email: opts.user.email,
      nickname,
      avatar_url: avatarUrl,
      plan: "free",
      credits_balance: 30,
      credits_unlimited: false,
    })
    .select(BASE_PROFILE_SELECT)
    .single()
}

export function getMpAiAction(actionCode: string | null | undefined): MpAiActionRule | null {
  const code = String(actionCode || "") as MpAiActionCode
  return MP_AI_ACTIONS[code] || null
}

export function getMpAiActionCost(actionCode: string | null | undefined): number | null {
  const rule = getMpAiAction(actionCode)
  if (!rule) return 0
  return rule.cost
}

export function formatMpAiPointCost(actionCode: string | null | undefined) {
  const rule = getMpAiAction(actionCode)
  if (!rule) return "暂不扣 AI 点"
  if ("costLabel" in rule && rule.costLabel) return rule.costLabel
  if (rule.cost == null) return "按实际成本"
  if (rule.cost <= 0) return "暂不扣 AI 点"
  return `${rule.cost} AI 点`
}

export function buildMpAiProfilePayload(ctx: MpAiBillingContext, extra?: Pick<ProfileRow, "nickname" | "avatar_url">) {
  return {
    plan: ctx.plan,
    plan_label: ctx.service_plan_label,
    service_plan_label: ctx.service_plan_label,
    credits_balance: ctx.credits_balance,
    credits_unlimited: ctx.credits_unlimited,
    ai_points_balance: ctx.ai_points_balance,
    ai_points_unlimited: ctx.ai_points_unlimited,
    billing_owner_label: ctx.billing_owner_label ?? null,
    billing_scope: ctx.billing_scope ?? null,
    trial_granted_at: ctx.trial_granted_at,
    account_role: ctx.account_role,
    account_role_label: ctx.account_role_label,
    company_id: ctx.company_id,
    company_name: ctx.company_name,
    store_id: ctx.store_id,
    store_name: ctx.store_name,
    nickname: extra?.nickname ?? null,
    avatar_url: extra?.avatar_url ?? null,
  }
}

export async function resolveMpAiBillingContext(request: NextRequest): Promise<
  | { ok: true; ctx: MpAiBillingContext; profileRow: ProfileRow }
  | { ok: false; error: Response }
> {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: "请先登录", code: "auth_required" }, { status: 401 }),
    }
  }

  const selected = await selectProfileRow(supabase, user.id)
  let profileRow = selected.data as ProfileRow | null

  if (selected.error || !profileRow) {
    if (selected.error?.code === "PGRST116") {
      const created = await createProfileRow({ supabase, user })
      if (created.error || !created.data) {
        return {
          ok: false,
          error: NextResponse.json(
            { ok: false, error: created.error?.message || "profile create failed", code: "profile_create_failed" },
            { status: 500 }
          ),
        }
      }
      profileRow = created.data as ProfileRow
    } else {
      return {
        ok: false,
        error: NextResponse.json(
          { ok: false, error: selected.error?.message || "profile not found", code: "profile_not_found" },
          { status: 500 }
        ),
      }
    }
  }

  let profile = normalizeProfile(profileRow)
  try {
    const account = await resolveMpAccountContextForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
      profileFallback: profileRow,
    })
    profile = {
      ...profile,
      account_role: account.role,
      account_role_label: account.roleLabel,
      company_id: account.companyId,
      company_name: account.companyName,
      store_id: account.storeId,
      store_name: account.storeName,
    }
    const billingProfile = await resolveMembershipBillingProfile({
      account,
    })
    if (billingProfile) {
      profile = {
        ...profile,
        ...billingProfile,
      }
    }
  } catch {
    // Keep profile-based billing usable if the organization tables are not deployed yet.
  }

  const deviceId = request.headers.get("x-device-id") || ""
  const ip = getClientIp(request)

  return {
    ok: true,
    ctx: {
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
      ...profile,
      deviceId,
      ipHash: ip ? hashIp(ip) : null,
    },
    profileRow,
  }
}

function aiPointsError(opts: {
  message: string
  code: string
  status: number
  required?: number
  balance?: number
}) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: opts.message,
      message: opts.message,
      code: opts.code,
      error_code: opts.code,
      required: opts.required,
      balance: opts.balance,
    },
    { status: opts.status }
  )
}

async function recordMpAiPointLedger(opts: {
  ctx: MpAiBillingContext
  actionCode: string
  delta: number
  balanceAfter: number | null
  status: "succeeded" | "refunded" | "blocked" | "quoted"
  businessObjectType?: string
  businessObjectId?: string
  reason?: string
  metadata?: Record<string, unknown>
}) {
  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return
  }

  const rule = getMpAiAction(opts.actionCode)
  const billingUserId = opts.ctx.billing_user_id || opts.ctx.userId
  const billingMetadata =
    billingUserId && billingUserId !== opts.ctx.userId
      ? {
          billing_user_id: billingUserId,
          billing_owner_label: opts.ctx.billing_owner_label || null,
          billing_scope: opts.ctx.billing_scope || null,
        }
      : {}
  try {
    await admin.from("mp_ai_point_ledger").insert({
      user_id: opts.ctx.userId,
      account_role: opts.ctx.account_role,
      company_id: opts.ctx.company_id,
      store_id: opts.ctx.store_id,
      action_code: opts.actionCode,
      action_title: rule?.title || null,
      page_path: rule?.page || null,
      business_object_type: opts.businessObjectType || null,
      business_object_id: opts.businessObjectId || null,
      delta: opts.delta,
      balance_after: opts.balanceAfter,
      status: opts.status,
      reason: opts.reason || null,
      metadata: { ...billingMetadata, ...(opts.metadata || {}) },
    })
  } catch {
    // The migration may not be deployed yet. The balance update remains authoritative.
  }
}

export async function chargeMpAiPoints(opts: {
  request: NextRequest
  ctx: MpAiBillingContext
  actionCode: MpAiActionCode
  businessObjectType?: string
  businessObjectId?: string
  metadata?: Record<string, unknown>
}): Promise<MpAiChargeResult> {
  const rule = MP_AI_ACTIONS[opts.actionCode]
  const quotedCost = rule.cost
  const numericCost = typeof quotedCost === "number" ? Math.max(0, Math.floor(quotedCost)) : 0
  const costLabel = formatMpAiPointCost(opts.actionCode)

  if (numericCost <= 0) {
    return {
      ok: true,
      actionCode: opts.actionCode,
      title: rule.title,
      cost: 0,
      quotedCost,
      costLabel,
      remaining: opts.ctx.ai_points_balance,
      unlimited: opts.ctx.ai_points_unlimited,
    }
  }

  if (opts.ctx.ai_points_unlimited) {
    return {
      ok: true,
      actionCode: opts.actionCode,
      title: rule.title,
      cost: 0,
      quotedCost,
      costLabel,
      remaining: opts.ctx.ai_points_balance,
      unlimited: true,
    }
  }

  let currentProfile: BillingProfile = {
    plan: opts.ctx.plan,
    credits_balance: opts.ctx.credits_balance,
    credits_unlimited: opts.ctx.credits_unlimited,
    trial_granted_at: opts.ctx.trial_granted_at,
  }

  if (!currentProfile.credits_unlimited && !currentProfile.trial_granted_at && currentProfile.credits_balance <= 0) {
    if (!opts.ctx.deviceId || opts.ctx.deviceId.trim().length < 8) {
      return {
        ok: false,
        error: aiPointsError({
          message: "缺少设备标识，请刷新后重试",
          code: "device_id_required",
          status: 400,
        }),
      }
    }

    try {
      currentProfile = await ensureTrialCreditsIfNeeded({
        supabase: opts.ctx.supabase,
        userId: opts.ctx.userId,
        profile: currentProfile,
        deviceId: opts.ctx.deviceId,
        ipHash: opts.ctx.ipHash,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 点试用额度发放失败"
      return { ok: false, error: aiPointsError({ message, code: "trial_grant_failed", status: 500 }) }
    }
  }

  try {
    const billingUserId = opts.ctx.billing_user_id || opts.ctx.userId
    const consumed = await consumeCredits({
      supabase: opts.ctx.supabase,
      userId: billingUserId,
      currentBalance: currentProfile.credits_balance,
      amount: numericCost,
      stepId: opts.actionCode,
    })
    await recordMpAiPointLedger({
      ctx: opts.ctx,
      actionCode: opts.actionCode,
      delta: -numericCost,
      balanceAfter: consumed.credits_balance,
      status: "succeeded",
      businessObjectType: opts.businessObjectType,
      businessObjectId: opts.businessObjectId,
      metadata: opts.metadata,
    })
    return {
      ok: true,
      actionCode: opts.actionCode,
      title: rule.title,
      cost: numericCost,
      quotedCost,
      costLabel,
      remaining: consumed.credits_balance,
      unlimited: consumed.credits_unlimited,
    }
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_credits") {
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      const required = meta?.required ?? numericCost
      const balance = meta?.balance ?? currentProfile.credits_balance
      await recordMpAiPointLedger({
        ctx: opts.ctx,
        actionCode: opts.actionCode,
        delta: 0,
        balanceAfter: balance,
        status: "blocked",
        businessObjectType: opts.businessObjectType,
        businessObjectId: opts.businessObjectId,
        reason: "insufficient_ai_points",
        metadata: { ...(opts.metadata || {}), required, balance },
      })
      return {
        ok: false,
        error: aiPointsError({
          message: `AI 点不足：本次需要 ${required} 点，当前余额 ${balance} 点。`,
          code: "insufficient_ai_points",
          status: 402,
          required,
          balance,
        }),
      }
    }

    const message = error instanceof Error ? error.message : "AI 点扣减失败"
    return { ok: false, error: aiPointsError({ message, code: "ai_points_charge_failed", status: 500 }) }
  }
}

export async function refundMpAiPoints(opts: {
  ctx: MpAiBillingContext
  charge: Extract<MpAiChargeResult, { ok: true }>
  reason: string
  metadata?: Record<string, unknown>
}) {
  if (opts.charge.cost <= 0 || opts.charge.unlimited) return null

  const billingUserId = opts.ctx.billing_user_id || opts.ctx.userId
  const refunded = await refundCredits({
    userId: billingUserId,
    amount: opts.charge.cost,
    stepId: opts.charge.actionCode,
    reason: opts.reason,
    metadata: {
      action_code: opts.charge.actionCode,
      action_title: opts.charge.title,
      ...(opts.metadata || {}),
    },
  })

  await recordMpAiPointLedger({
    ctx: opts.ctx,
    actionCode: opts.charge.actionCode,
    delta: opts.charge.cost,
    balanceAfter: refunded?.credits_balance ?? null,
    status: "refunded",
    reason: opts.reason,
    metadata: opts.metadata,
  })

  return refunded
}

export function setMpAiPointHeaders(response: NextResponse, charge: Extract<MpAiChargeResult, { ok: true }>) {
  response.headers.set("X-AI-Points-Action", charge.actionCode)
  response.headers.set("X-AI-Points-Cost", String(charge.cost))
  response.headers.set("X-AI-Points-Quoted-Cost", charge.quotedCost == null ? "variable" : String(charge.quotedCost))
  response.headers.set("X-AI-Points-Remaining", charge.unlimited ? "unlimited" : String(charge.remaining))
  response.headers.set("X-AI-Points-Unlimited", charge.unlimited ? "1" : "0")

  // Keep the old headers for clients that have not switched names yet.
  response.headers.set("X-Credits-Cost", String(charge.cost))
  response.headers.set("X-Credits-Remaining", charge.unlimited ? "unlimited" : String(charge.remaining))
  response.headers.set("X-Credits-Unlimited", charge.unlimited ? "1" : "0")
}

export function quoteMpAiAction(opts: { ctx: MpAiBillingContext; actionCode: string }) {
  const rule = getMpAiAction(opts.actionCode)
  const cost = rule?.cost ?? 0
  const numericCost = typeof cost === "number" ? Math.max(0, cost) : null
  const canRun =
    numericCost == null || numericCost <= 0 || opts.ctx.ai_points_unlimited || opts.ctx.ai_points_balance >= numericCost

  return {
    action_code: opts.actionCode,
    action_title: rule?.title || null,
    page_path: rule?.page || null,
    cost_points: numericCost,
    cost_label: formatMpAiPointCost(opts.actionCode),
    balance_points: opts.ctx.ai_points_balance,
    ai_points_balance: opts.ctx.ai_points_balance,
    ai_points_unlimited: opts.ctx.ai_points_unlimited,
    can_run: canRun,
  }
}
