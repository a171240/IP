import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { resolveMpAccountContextForUser, type MpAccountContext } from "@/lib/mp/account-context.server"
import { DEFAULT_TRIAL_CREDITS } from "@/lib/pricing/constants"
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
  company_admin: "公司账号",
  merchant_owner: "商家主账号",
  merchant_admin: "商家账号",
  store_owner: "门店主账号",
  store_admin: "门店账号",
  staff: "员工账号",
  employee: "员工账号",
  service_operator: "服务顾问账号",
}

type SupabaseForRequest = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
type BillingScope = "personal" | "company" | "store"

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
  billing_user_id: string
  billing_scope: BillingScope
  billing_scope_label: string
  billing_owner_role: string | null
  billing_owner_name: string | null
  billing_is_org: boolean
  can_purchase_ai_points: boolean
  account_role: string
  account_role_label: string
  company_id: string | null
  company_name: string | null
  store_id: string | null
  store_name: string | null
  service_plan_label: string
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
      billingUserId: string
      billingScope: BillingScope
      billingScopeLabel: string
    }
  | { ok: false; error: Response }

const BASE_PROFILE_SELECT = "plan, credits_balance, credits_unlimited, trial_granted_at, nickname, avatar_url, email"
const EXTENDED_PROFILE_SELECT = `${BASE_PROFILE_SELECT}, account_role, company_id, company_name, store_id, store_name, service_plan_label`
const ADMIN_PROFILE_SELECT = `id, ${EXTENDED_PROFILE_SELECT}`
const STAFF_ROLES = new Set(["staff", "employee"])
const MANAGER_ROLES = new Set([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
])
const STORE_BILLING_ROLES = ["store_owner", "store_admin"] as const
const COMPANY_BILLING_ROLES = ["company_owner", "merchant_owner", "company_admin", "merchant_admin"] as const
const BILLING_ROLE_PRIORITY: Record<string, number> = {
  company_owner: 90,
  merchant_owner: 88,
  company_admin: 80,
  merchant_admin: 78,
  store_owner: 70,
  store_admin: 65,
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

function profileDisplayName(row: ProfileRow | null | undefined, fallback = "门店账号") {
  const nickname = typeof row?.nickname === "string" ? row.nickname.trim() : ""
  return nickname || row?.email || fallback
}

function profileBalance(row: ProfileRow | null | undefined) {
  return Number(row?.credits_balance || 0)
}

function profileUnlimited(row: ProfileRow | null | undefined) {
  return Boolean(row?.credits_unlimited) || normalizePlan(row?.plan) === "vip"
}

function hasUsableBalance(row: ProfileRow | null | undefined) {
  return profileUnlimited(row) || profileBalance(row) > 0
}

function billingScopeForAccount(account: MpAccountContext): BillingScope {
  if (account.storeId) return "store"
  if (account.companyId) return "company"
  return "personal"
}

function billingScopeLabel(account: MpAccountContext, scope: BillingScope) {
  if (scope === "store") return account.storeName || account.scopeLabel || "门店服务包"
  if (scope === "company") return account.companyName || account.scopeLabel || "公司服务包"
  return "个人账号"
}

function canPurchaseAiPoints(account: MpAccountContext) {
  if (account.isPlatformAdmin) return true
  if (!account.companyId && !account.storeId) return true
  return MANAGER_ROLES.has(account.role)
}

function normalizeProfile(
  row: ProfileRow | null | undefined
): Omit<
  MpAiBillingContext,
  | "supabase"
  | "userId"
  | "userEmail"
  | "userMetadata"
  | "deviceId"
  | "ipHash"
  | "billing_user_id"
  | "billing_scope"
  | "billing_scope_label"
  | "billing_owner_role"
  | "billing_owner_name"
  | "billing_is_org"
  | "can_purchase_ai_points"
> {
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
      credits_balance: DEFAULT_TRIAL_CREDITS,
      credits_unlimited: false,
    })
    .select(BASE_PROFILE_SELECT)
    .single()
}

async function selectAdminProfileMap(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  const ids = Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)))
  const out = new Map<string, ProfileRow>()
  if (!ids.length) return out

  const selected = await admin.from("profiles").select(ADMIN_PROFILE_SELECT).in("id", ids)
  const result =
    selected.error && isMissingProfileColumn(selected.error)
      ? await admin.from("profiles").select(`id, ${BASE_PROFILE_SELECT}`).in("id", ids)
      : selected

  for (const row of (result.data || []) as ProfileRow[]) {
    if (row?.id) out.set(String(row.id), row)
  }
  return out
}

type BillingOwner = {
  userId: string
  profile: ProfileRow
  scope: BillingScope
  scopeLabel: string
  ownerRole: string | null
  ownerName: string | null
}

function currentUserBillingOwner(args: {
  userId: string
  profileRow: ProfileRow
  account: MpAccountContext | null
}): BillingOwner {
  const scope = args.account ? billingScopeForAccount(args.account) : "personal"
  return {
    userId: args.userId,
    profile: args.profileRow,
    scope,
    scopeLabel: args.account ? billingScopeLabel(args.account, scope) : "个人账号",
    ownerRole: args.account?.role || args.profileRow.account_role || null,
    ownerName: profileDisplayName(args.profileRow, args.account?.scopeLabel || "当前账号"),
  }
}

async function pickMembershipBillingOwner(opts: {
  admin: ReturnType<typeof createAdminSupabaseClient>
  account: MpAccountContext
  roles: readonly string[]
  scope: BillingScope
  storeId?: string | null
}): Promise<BillingOwner | null> {
  if (!opts.account.companyId) return null

  let query = opts.admin
    .from("mp_account_memberships")
    .select("user_id, role, display_name, accepted_at, created_at")
    .eq("company_id", opts.account.companyId)
    .eq("status", "active")
    .in("role", Array.from(opts.roles))

  query = opts.storeId ? query.eq("store_id", opts.storeId) : query.is("store_id", null)

  const { data } = await query
  const rows = (data || []) as Array<{
    user_id?: string | null
    role?: string | null
    display_name?: string | null
    accepted_at?: string | null
    created_at?: string | null
  }>
  const profileMap = await selectAdminProfileMap(
    opts.admin,
    rows.map((row) => String(row.user_id || ""))
  )

  const candidates = rows
    .map((row) => {
      const userId = String(row.user_id || "")
      const profile = profileMap.get(userId)
      if (!userId || !profile) return null
      return {
        userId,
        profile,
        role: String(row.role || ""),
        displayName: row.display_name || profileDisplayName(profile),
        timestamp: Date.parse(row.accepted_at || row.created_at || "") || 0,
      }
    })
    .filter(Boolean) as Array<{
    userId: string
    profile: ProfileRow
    role: string
    displayName: string
    timestamp: number
  }>

  candidates.sort((left, right) => {
    const balanceRank = Number(hasUsableBalance(right.profile)) - Number(hasUsableBalance(left.profile))
    if (balanceRank) return balanceRank
    const roleRank = (BILLING_ROLE_PRIORITY[right.role] || 0) - (BILLING_ROLE_PRIORITY[left.role] || 0)
    if (roleRank) return roleRank
    return right.timestamp - left.timestamp
  })

  const picked = candidates[0]
  if (!picked) return null

  return {
    userId: picked.userId,
    profile: picked.profile,
    scope: opts.scope,
    scopeLabel: billingScopeLabel(opts.account, opts.scope),
    ownerRole: picked.role || null,
    ownerName: picked.displayName || null,
  }
}

async function resolveBillingOwner(opts: {
  userId: string
  profileRow: ProfileRow
  account: MpAccountContext | null
}): Promise<BillingOwner> {
  const account = opts.account
  if (!account || account.isPlatformAdmin || (!account.companyId && !account.storeId)) {
    return currentUserBillingOwner(opts)
  }

  const currentOwner = currentUserBillingOwner(opts)
  const admin = createAdminSupabaseClient()

  if (MANAGER_ROLES.has(account.role) && hasUsableBalance(opts.profileRow)) {
    return currentOwner
  }

  if (account.storeId) {
    const storeOwner = await pickMembershipBillingOwner({
      admin,
      account,
      roles: STORE_BILLING_ROLES,
      scope: "store",
      storeId: account.storeId,
    })
    if (storeOwner && (!MANAGER_ROLES.has(account.role) || hasUsableBalance(storeOwner.profile))) return storeOwner
  }

  const companyOwner = await pickMembershipBillingOwner({
    admin,
    account,
    roles: COMPANY_BILLING_ROLES,
    scope: "company",
  })
  if (companyOwner && (!MANAGER_ROLES.has(account.role) || hasUsableBalance(companyOwner.profile))) return companyOwner

  if (STAFF_ROLES.has(account.role)) {
    return storeOwnerFallback({
      userId: opts.userId,
      profileRow: opts.profileRow,
      account,
    })
  }

  return currentOwner
}

function storeOwnerFallback(args: {
  userId: string
  profileRow: ProfileRow
  account: MpAccountContext
}): BillingOwner {
  const scope = billingScopeForAccount(args.account)
  return {
    userId: args.userId,
    profile: args.profileRow,
    scope,
    scopeLabel: billingScopeLabel(args.account, scope),
    ownerRole: args.account.role,
    ownerName: profileDisplayName(args.profileRow, args.account.scopeLabel),
  }
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
  const aiPointsLabel = ctx.ai_points_unlimited
    ? `${ctx.billing_scope_label} 服务包不限量`
    : `${ctx.billing_scope_label} AI 点 ${ctx.ai_points_balance}`
  const servicePackageLabel = ctx.ai_points_unlimited
    ? `${ctx.billing_scope_label} 服务包不限量`
    : ctx.billing_is_org
      ? `${ctx.billing_scope_label} 服务包待开通`
      : `${ctx.billing_scope_label} 体验点 ${ctx.ai_points_balance}`

  return {
    plan: ctx.plan,
    plan_label: ctx.service_plan_label,
    service_plan_label: ctx.service_plan_label,
    credits_balance: ctx.credits_balance,
    credits_unlimited: ctx.credits_unlimited,
    ai_points_balance: ctx.ai_points_balance,
    ai_points_unlimited: ctx.ai_points_unlimited,
    ai_points_label: aiPointsLabel,
    service_package_label: servicePackageLabel,
    service_package_unlimited: ctx.ai_points_unlimited,
    ai_points_scope: ctx.billing_scope,
    ai_points_scope_label: ctx.billing_scope_label,
    ai_points_owner_label: ctx.billing_owner_name,
    billing_user_id: ctx.billing_user_id,
    billing_scope: ctx.billing_scope,
    billing_scope_label: ctx.billing_scope_label,
    billing_owner_role: ctx.billing_owner_role,
    billing_owner_name: ctx.billing_owner_name,
    billing_is_org: ctx.billing_is_org,
    can_purchase_ai_points: ctx.can_purchase_ai_points,
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
  let accountContext: MpAccountContext | null = null
  try {
    const account = await resolveMpAccountContextForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
      profileFallback: profileRow,
    })
    accountContext = account
    profile = {
      ...profile,
      account_role: account.role,
      account_role_label: account.roleLabel,
      company_id: account.companyId,
      company_name: account.companyName,
      store_id: account.storeId,
      store_name: account.storeName,
    }
  } catch {
    // Keep profile-based billing usable if the organization tables are not deployed yet.
  }

  let billingOwner = currentUserBillingOwner({ userId: user.id, profileRow, account: accountContext })
  try {
    billingOwner = await resolveBillingOwner({ userId: user.id, profileRow, account: accountContext })
  } catch {
    // Keep personal-wallet billing usable if organization owner lookup fails.
  }

  const billingProfile = normalizeProfile(billingOwner.profile)
  profile = {
    ...billingProfile,
    account_role: profile.account_role,
    account_role_label: profile.account_role_label,
    company_id: profile.company_id,
    company_name: profile.company_name,
    store_id: profile.store_id,
    store_name: profile.store_name,
    service_plan_label: billingProfile.service_plan_label,
  }

  const deviceId = request.headers.get("x-device-id") || ""
  const ip = getClientIp(request)
  const billingIsOrg = billingOwner.scope !== "personal"

  return {
    ok: true,
    ctx: {
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
      ...profile,
      billing_user_id: billingOwner.userId,
      billing_scope: billingOwner.scope,
      billing_scope_label: billingOwner.scopeLabel,
      billing_owner_role: billingOwner.ownerRole,
      billing_owner_name: billingOwner.ownerName,
      billing_is_org: billingIsOrg,
      can_purchase_ai_points: accountContext ? canPurchaseAiPoints(accountContext) : true,
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
  extra?: Record<string, unknown>
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
      ...(opts.extra || {}),
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
      metadata: {
        ...(opts.metadata || {}),
        billing_user_id: opts.ctx.billing_user_id,
        billing_scope: opts.ctx.billing_scope,
        billing_scope_label: opts.ctx.billing_scope_label,
        billing_owner_role: opts.ctx.billing_owner_role,
        billing_owner_name: opts.ctx.billing_owner_name,
      },
    })
  } catch {
    // The migration may not be deployed yet. The balance update remains authoritative.
  }
}

async function consumeMpBillingCredits(opts: {
  ctx: MpAiBillingContext
  currentProfile: BillingProfile
  amount: number
  stepId: string
}) {
  if (opts.ctx.billing_user_id === opts.ctx.userId && opts.ctx.billing_scope === "personal") {
    return consumeCredits({
      supabase: opts.ctx.supabase,
      userId: opts.ctx.userId,
      currentBalance: opts.currentProfile.credits_balance,
      amount: opts.amount,
      stepId: opts.stepId,
    })
  }

  if (opts.ctx.billing_is_org && STAFF_ROLES.has(opts.ctx.account_role) && opts.ctx.billing_user_id === opts.ctx.userId) {
    const err = new Error("insufficient_credits")
    ;(err as unknown as { meta?: Record<string, unknown> }).meta = {
      required: opts.amount,
      balance: 0,
    }
    throw err
  }

  const admin = createAdminSupabaseClient()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("credits_balance, credits_unlimited")
      .eq("id", opts.ctx.billing_user_id)
      .single()

    if (profileError || !profileRow) {
      throw new Error(profileError?.message || "无法读取门店服务包余额")
    }

    const latestBalance = Number(profileRow.credits_balance ?? opts.currentProfile.credits_balance)
    const latestUnlimited = Boolean(profileRow.credits_unlimited)

    if (latestUnlimited) {
      return { credits_balance: latestBalance, credits_unlimited: true }
    }

    if (latestBalance < opts.amount) {
      const err = new Error("insufficient_credits")
      ;(err as unknown as { meta?: Record<string, unknown> }).meta = {
        required: opts.amount,
        balance: latestBalance,
      }
      throw err
    }

    const { data: updatedRows, error: updateError } = await admin
      .from("profiles")
      .update({ credits_balance: latestBalance - opts.amount })
      .eq("id", opts.ctx.billing_user_id)
      .eq("credits_balance", latestBalance)
      .gte("credits_balance", opts.amount)
      .select("credits_balance, credits_unlimited")

    if (updateError) throw new Error(updateError.message || "门店服务包扣减失败")

    const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows
    if (!updated) continue

    try {
      await admin.from("credit_transactions").insert({
        user_id: opts.ctx.billing_user_id,
        step_id: opts.stepId,
        delta: -opts.amount,
        reason: opts.ctx.billing_scope === "personal" ? "consume" : "mp_org_consume",
        metadata: {
          amount: opts.amount,
          actor_user_id: opts.ctx.userId,
          actor_role: opts.ctx.account_role,
          company_id: opts.ctx.company_id,
          store_id: opts.ctx.store_id,
          billing_scope: opts.ctx.billing_scope,
        },
      })
    } catch {
      // Best-effort audit log; mp_ai_point_ledger records the actor-facing event.
    }

    return {
      credits_balance: Number((updated as { credits_balance?: number | null }).credits_balance ?? latestBalance - opts.amount),
      credits_unlimited: Boolean((updated as { credits_unlimited?: boolean | null }).credits_unlimited ?? false),
    }
  }

  throw new Error("门店服务包扣减失败，请重试")
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
      billingUserId: opts.ctx.billing_user_id,
      billingScope: opts.ctx.billing_scope,
      billingScopeLabel: opts.ctx.billing_scope_label,
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
      billingUserId: opts.ctx.billing_user_id,
      billingScope: opts.ctx.billing_scope,
      billingScopeLabel: opts.ctx.billing_scope_label,
    }
  }

  let currentProfile: BillingProfile = {
    plan: opts.ctx.plan,
    credits_balance: opts.ctx.credits_balance,
    credits_unlimited: opts.ctx.credits_unlimited,
    trial_granted_at: opts.ctx.trial_granted_at,
  }

  if (
    opts.ctx.billing_scope === "personal" &&
    opts.ctx.billing_user_id === opts.ctx.userId &&
    !currentProfile.credits_unlimited &&
    !currentProfile.trial_granted_at &&
    currentProfile.credits_balance <= 0
  ) {
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
    const consumed = await consumeMpBillingCredits({
      ctx: opts.ctx,
      currentProfile,
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
      billingUserId: opts.ctx.billing_user_id,
      billingScope: opts.ctx.billing_scope,
      billingScopeLabel: opts.ctx.billing_scope_label,
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
      const orgMessage = opts.ctx.billing_is_org
        ? `${opts.ctx.billing_scope_label} AI 点不足：本次需要 ${required} 点，当前余额 ${balance} 点。请联系店长或负责人补充服务包。`
        : `AI 点不足：本次需要 ${required} 点，当前余额 ${balance} 点。`
      return {
        ok: false,
        error: aiPointsError({
          message: orgMessage,
          code: "insufficient_ai_points",
          status: 402,
          required,
          balance,
          extra: {
            billing_scope: opts.ctx.billing_scope,
            billing_scope_label: opts.ctx.billing_scope_label,
            can_purchase_ai_points: opts.ctx.can_purchase_ai_points,
          },
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

  const refunded = await refundCredits({
    userId: opts.charge.billingUserId || opts.ctx.billing_user_id,
    amount: opts.charge.cost,
    stepId: opts.charge.actionCode,
    reason: opts.reason,
    metadata: {
      action_code: opts.charge.actionCode,
      action_title: opts.charge.title,
      actor_user_id: opts.ctx.userId,
      billing_scope: opts.charge.billingScope,
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
  response.headers.set("X-AI-Points-Billing-Scope", charge.billingScope)
  response.headers.set("X-AI-Points-Billing-Label", encodeURIComponent(charge.billingScopeLabel))

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
    billing_scope: opts.ctx.billing_scope,
    billing_scope_label: opts.ctx.billing_scope_label,
    can_purchase_ai_points: opts.ctx.can_purchase_ai_points,
    can_run: canRun,
  }
}
