import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

const MP_ACCOUNT_ROLES = [
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
  "staff",
  "employee",
  "service_operator",
] as const

type MpAccountRole = (typeof MP_ACCOUNT_ROLES)[number]

type ProfileRow = {
  id: string
  email: string | null
  nickname: string | null
  avatar_url: string | null
  plan: string | null
  credits_balance: number | null
  credits_unlimited: boolean | null
  trial_granted_at: string | null
  account_role: string | null
  company_id: string | null
  company_name: string | null
  store_id: string | null
  store_name: string | null
  service_plan_label: string | null
}

type EntitlementRow = {
  plan: string | null
  pro_expires_at: string | null
}

type MembershipRow = {
  id: string
  user_id: string
  company_id: string | null
  company_name: string | null
  store_id: string | null
  store_name: string | null
  role: string | null
  status: string | null
  display_name: string | null
  accepted_at: string | null
  last_seen_at: string | null
  created_at: string | null
}

type BillingOwnerRow = {
  user_id: string | null
  store_id: string | null
  role: string | null
  id: string | null
  plan: string | null
  credits_balance: number | null
  credits_unlimited: boolean | null
  trial_granted_at: string | null
  nickname: string | null
  email: string | null
  store_name: string | null
  company_name: string | null
  service_plan_label: string | null
}

export type AppAuthUser = {
  id: string
  email?: string | null
  user_metadata?: unknown
}

export type AppAccountMembership = {
  id: string
  userId: string
  companyId: string | null
  companyName: string | null
  storeId: string | null
  storeName: string | null
  role: MpAccountRole
  roleLabel: string
  status: string
  displayName: string | null
  acceptedAt: string | null
  lastSeenAt: string | null
  createdAt: string | null
}

export type AppAccountContext = {
  userId: string
  userEmail: string | null
  membershipId: string | null
  role: MpAccountRole
  roleLabel: string
  companyId: string | null
  companyName: string | null
  storeId: string | null
  storeName: string | null
  scopeLabel: string
  memberships: AppAccountMembership[]
  isManager: boolean
  isCompanyManager: boolean
  isStoreManager: boolean
  isPlatformAdmin: boolean
}

type AppBillingProfile = {
  plan: PlanId
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
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

const ROLE_LABELS: Record<MpAccountRole, string> = {
  company_owner: "公司主账号",
  company_admin: "总管理员",
  merchant_owner: "商家主账号",
  merchant_admin: "商家管理员",
  store_owner: "门店主账号",
  store_admin: "门店管理员",
  staff: "员工",
  employee: "员工",
  service_operator: "服务顾问",
}

const ROLE_PRIORITY: Record<MpAccountRole, number> = {
  service_operator: 100,
  company_owner: 90,
  merchant_owner: 88,
  company_admin: 80,
  merchant_admin: 78,
  store_owner: 70,
  store_admin: 65,
  staff: 20,
  employee: 20,
}

const MP_SERVICE_PLAN_LABELS: Record<PlanId, string> = {
  free: "体验服务",
  basic: "AI 点轻量包",
  pro: "AI 点标准包",
  vip: "服务交付包",
}

const COMPANY_MANAGER_ROLES = new Set<MpAccountRole>([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "service_operator",
])
const STORE_MANAGER_ROLES = new Set<MpAccountRole>(["store_owner", "store_admin"])
const MANAGER_ROLES = new Set<MpAccountRole>([...COMPANY_MANAGER_ROLES, ...STORE_MANAGER_ROLES])
const STORE_SCOPED_ROLES = new Set<MpAccountRole>(["store_owner", "store_admin", "staff", "employee"])
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

const PROFILE_COLUMNS = [
  "id",
  "email",
  "nickname",
  "avatar_url",
  "plan",
  "credits_balance",
  "credits_unlimited",
  "trial_granted_at",
  "account_role",
  "company_id",
  "company_name",
  "store_id",
  "store_name",
  "service_plan_label",
].join(", ")

function normalizeRole(role: unknown): MpAccountRole {
  const text = String(role || "").trim()
  return (MP_ACCOUNT_ROLES as readonly string[]).includes(text) ? (text as MpAccountRole) : "staff"
}

export function getAliyunRdsAppAccountRoleLabel(role: unknown) {
  return ROLE_LABELS[normalizeRole(role)] || "当前账号"
}

export function isAliyunRdsStoreScopedRole(role: unknown) {
  return STORE_SCOPED_ROLES.has(normalizeRole(role))
}

export function canAliyunRdsInviteRole(ctx: AppAccountContext, role: MpAccountRole) {
  if (ctx.isPlatformAdmin) return true
  if (ctx.isCompanyManager) {
    return role !== "service_operator" && role !== "company_owner" && role !== "merchant_owner"
  }
  if (ctx.isStoreManager) {
    return role === "staff" || role === "employee"
  }
  return false
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function metadataText(meta: unknown, key: string) {
  if (!meta || typeof meta !== "object") return ""
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === "string" ? value.trim() : ""
}

function metadataUuid(meta: unknown, key: string) {
  const value = metadataText(meta, key)
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function parseEnvList(...keys: string[]) {
  const values = keys.flatMap((key) => String(process.env[key] || "").split(/[,\s]+/))
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
}

function platformAdminEmails() {
  return parseEnvList("MP_PLATFORM_ADMIN_EMAILS", "ADMIN_EMAILS", "PLATFORM_ADMIN_EMAILS")
}

function platformAdminUserIds() {
  return parseEnvList("MP_PLATFORM_ADMIN_USER_IDS", "ADMIN_USER_IDS", "PLATFORM_ADMIN_USER_IDS")
}

function profileDisplayName(row: Partial<ProfileRow | BillingOwnerRow> | null | undefined) {
  return row?.nickname?.trim() || row?.store_name?.trim() || row?.company_name?.trim() || row?.email?.trim() || "门店负责人"
}

function normalizeProfile(row: ProfileRow): AppBillingProfile {
  const plan = normalizePlan(row.plan)
  const creditsBalance = Number(row.credits_balance || 0)
  const creditsUnlimited = Boolean(row.credits_unlimited) || plan === "vip"
  const role = normalizeRole(row.account_role || "merchant_owner")
  const servicePlanLabel = row.service_plan_label?.trim() || MP_SERVICE_PLAN_LABELS[plan]

  return {
    plan,
    credits_balance: creditsBalance,
    credits_unlimited: creditsUnlimited,
    trial_granted_at: row.trial_granted_at ?? null,
    ai_points_balance: creditsBalance,
    ai_points_unlimited: creditsUnlimited,
    account_role: role,
    account_role_label: ROLE_LABELS[role],
    company_id: row.company_id || null,
    company_name: row.company_name || null,
    store_id: row.store_id || null,
    store_name: row.store_name || null,
    service_plan_label: servicePlanLabel,
  }
}

function mapMembership(row: MembershipRow): AppAccountMembership {
  const role = normalizeRole(row.role)
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id || null,
    companyName: firstText(row.company_name),
    storeId: row.store_id || null,
    storeName: firstText(row.store_name),
    role,
    roleLabel: ROLE_LABELS[role],
    status: firstText(row.status, "active"),
    displayName: row.display_name || null,
    acceptedAt: row.accepted_at || null,
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null,
  }
}

function choosePrimaryMembership(memberships: AppAccountMembership[], fallback?: ProfileRow | null) {
  if (!memberships.length) return null

  const fallbackCompanyId = fallback?.company_id || null
  const fallbackStoreId = fallback?.store_id || null
  if (fallbackCompanyId || fallbackStoreId) {
    const exact = memberships.find(
      (item) =>
        (!fallbackCompanyId || item.companyId === fallbackCompanyId) &&
        (!fallbackStoreId || item.storeId === fallbackStoreId),
    )
    if (exact) return exact
  }

  return memberships
    .slice()
    .sort((left, right) => (ROLE_PRIORITY[right.role] || 0) - (ROLE_PRIORITY[left.role] || 0))[0]
}

function buildFallbackContext(args: {
  userId: string
  userEmail?: string | null
  profile?: ProfileRow | null
  isPlatformAdmin?: boolean
}): AppAccountContext {
  const role = normalizeRole(args.profile?.account_role || (args.isPlatformAdmin ? "service_operator" : "staff"))
  const companyName = args.profile?.company_name || null
  const storeName = args.profile?.store_name || null
  return {
    userId: args.userId,
    userEmail: args.userEmail ?? null,
    membershipId: null,
    role,
    roleLabel: ROLE_LABELS[role],
    companyId: args.profile?.company_id || null,
    companyName,
    storeId: args.profile?.store_id || null,
    storeName,
    scopeLabel: storeName || companyName || "当前账号",
    memberships: [],
    isManager: MANAGER_ROLES.has(role),
    isCompanyManager: COMPANY_MANAGER_ROLES.has(role),
    isStoreManager: STORE_MANAGER_ROLES.has(role),
    isPlatformAdmin: Boolean(args.isPlatformAdmin || role === "service_operator"),
  }
}

export function accountContextPayload(ctx: AppAccountContext) {
  return {
    membership_id: ctx.membershipId,
    account_role: ctx.role,
    account_role_label: ctx.roleLabel,
    company_id: ctx.companyId,
    company_name: ctx.companyName,
    store_id: ctx.storeId,
    store_name: ctx.storeName,
    scope_label: ctx.scopeLabel,
    is_manager: ctx.isManager,
    is_company_manager: ctx.isCompanyManager,
    is_store_manager: ctx.isStoreManager,
    is_platform_admin: ctx.isPlatformAdmin,
    memberships: ctx.memberships,
  }
}

async function getOrCreateProfileRow(user: AppAuthUser): Promise<ProfileRow> {
  const selected = await queryAliyunRds<ProfileRow>(
    `select ${PROFILE_COLUMNS} from public.profiles where id = $1 limit 1`,
    [user.id],
  )

  const nickname = metadataText(user.user_metadata, "nickname") || user.email?.split("@")[0] || "User"
  const avatarUrl = metadataText(user.user_metadata, "avatar_url") || null
  const metadataRole = metadataText(user.user_metadata, "account_role")
  const accountRole = metadataRole ? normalizeRole(metadataRole) : null
  const companyId = metadataUuid(user.user_metadata, "company_id")
  const storeId = metadataUuid(user.user_metadata, "store_id")
  const companyName = metadataText(user.user_metadata, "company_name") || null
  const storeName = metadataText(user.user_metadata, "store_name") || null
  const servicePlanLabel = metadataText(user.user_metadata, "service_plan_label") || null

  if (selected.rows[0]) {
    const row = selected.rows[0]
    if (
      (!row.account_role && accountRole) ||
      (!row.company_id && companyId) ||
      (!row.store_id && storeId) ||
      (!row.company_name && companyName) ||
      (!row.store_name && storeName) ||
      (!row.service_plan_label && servicePlanLabel)
    ) {
      const updated = await queryAliyunRds<ProfileRow>(
        `
          update public.profiles
          set account_role = coalesce(account_role, $2),
              company_id = coalesce(company_id, $3),
              company_name = coalesce(company_name, $4),
              store_id = coalesce(store_id, $5),
              store_name = coalesce(store_name, $6),
              service_plan_label = coalesce(service_plan_label, $7),
              updated_at = now()
          where id = $1
          returning ${PROFILE_COLUMNS}
        `,
        [user.id, accountRole, companyId, companyName, storeId, storeName, servicePlanLabel],
      )
      return updated.rows[0] || row
    }
    return row
  }

  const created = await queryAliyunRds<ProfileRow>(
    `
      insert into public.profiles (
        id, email, nickname, avatar_url, plan, credits_balance, credits_unlimited,
        account_role, company_id, company_name, store_id, store_name, service_plan_label
      )
      values ($1, $2, $3, $4, 'free', 30, false, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update
        set email = coalesce(excluded.email, public.profiles.email),
            nickname = coalesce(public.profiles.nickname, excluded.nickname),
            avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
            account_role = coalesce(public.profiles.account_role, excluded.account_role),
            company_id = coalesce(public.profiles.company_id, excluded.company_id),
            company_name = coalesce(public.profiles.company_name, excluded.company_name),
            store_id = coalesce(public.profiles.store_id, excluded.store_id),
            store_name = coalesce(public.profiles.store_name, excluded.store_name),
            service_plan_label = coalesce(public.profiles.service_plan_label, excluded.service_plan_label),
            updated_at = now()
      returning ${PROFILE_COLUMNS}
    `,
    [
      user.id,
      user.email ?? null,
      nickname,
      avatarUrl,
      accountRole,
      companyId,
      companyName,
      storeId,
      storeName,
      servicePlanLabel,
    ],
  )

  if (!created.rows[0]) throw new Error("profile_create_failed")
  return created.rows[0]
}

async function getEntitlementRow(userId: string): Promise<EntitlementRow | null> {
  const result = await queryAliyunRds<EntitlementRow>(
    "select plan, pro_expires_at from public.entitlements where user_id = $1 limit 1",
    [userId],
  )
  return result.rows[0] || null
}

async function getMembershipRows(userId: string): Promise<MembershipRow[]> {
  const result = await queryAliyunRds<MembershipRow>(
    `
      select
        membership.id,
        membership.user_id,
        membership.company_id,
        company.name as company_name,
        membership.store_id,
        store.name as store_name,
        membership.role,
        membership.status,
        membership.display_name,
        membership.accepted_at,
        membership.last_seen_at,
        membership.created_at
      from public.mp_account_memberships membership
      left join public.mp_companies company on company.id = membership.company_id
      left join public.mp_stores store on store.id = membership.store_id
      where membership.user_id = $1 and membership.status = 'active'
      order by membership.created_at desc
    `,
    [userId],
  )
  return result.rows
}

function buildAccountContext(args: {
  user: AppAuthUser
  profile: ProfileRow
  membershipRows: MembershipRow[]
}): AppAccountContext {
  const email = String(args.user.email || "").trim().toLowerCase()
  const envAdmin =
    platformAdminUserIds().has(args.user.id.toLowerCase()) || (email ? platformAdminEmails().has(email) : false)
  const profileRole = normalizeRole(args.profile.account_role || (envAdmin ? "service_operator" : "staff"))
  const isPlatformAdmin = envAdmin || profileRole === "service_operator"
  const memberships = args.membershipRows.map(mapMembership)
  const primary = choosePrimaryMembership(memberships, args.profile)

  if (!primary) {
    return buildFallbackContext({
      userId: args.user.id,
      userEmail: args.user.email ?? null,
      profile: args.profile,
      isPlatformAdmin,
    })
  }

  return {
    userId: args.user.id,
    userEmail: args.user.email ?? null,
    membershipId: primary.id,
    role: primary.role,
    roleLabel: primary.roleLabel,
    companyId: primary.companyId,
    companyName: primary.companyName || args.profile.company_name || null,
    storeId: primary.storeId,
    storeName: primary.storeName || args.profile.store_name || null,
    scopeLabel: primary.storeName || primary.companyName || "当前账号",
    memberships,
    isManager: MANAGER_ROLES.has(primary.role) || isPlatformAdmin,
    isCompanyManager: COMPANY_MANAGER_ROLES.has(primary.role) || isPlatformAdmin,
    isStoreManager: STORE_MANAGER_ROLES.has(primary.role),
    isPlatformAdmin,
  }
}

function shouldUseMembershipBilling(role: string) {
  return role === "staff" || role === "employee"
}

async function resolveMembershipBillingProfile(account: AppAccountContext): Promise<Partial<AppBillingProfile> | null> {
  if (!shouldUseMembershipBilling(account.role)) return null
  if (!account.companyId) return null

  const roles = Array.from(new Set([...STORE_BILLING_OWNER_ROLES, ...COMPANY_BILLING_OWNER_ROLES]))
  const result = await queryAliyunRds<BillingOwnerRow>(
    `
      select
        membership.user_id,
        membership.store_id,
        membership.role,
        profile.id,
        profile.plan,
        profile.credits_balance,
        profile.credits_unlimited,
        profile.trial_granted_at,
        profile.nickname,
        profile.email,
        profile.store_name,
        profile.company_name,
        profile.service_plan_label
      from public.mp_account_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.company_id = $1
        and membership.status = 'active'
        and membership.role = any($2::text[])
    `,
    [account.companyId, roles],
  )

  const candidates = result.rows
    .filter((row) => {
      const role = String(row.role || "")
      if (account.storeId && row.store_id === account.storeId && STORE_BILLING_OWNER_ROLES.has(role)) return true
      return !row.store_id && COMPANY_BILLING_OWNER_ROLES.has(role)
    })
    .map((row) => {
      const plan = normalizePlan(row.plan)
      const unlimited = Boolean(row.credits_unlimited) || plan === "vip"
      const balance = Number(row.credits_balance || 0)
      return { row, plan, unlimited, balance }
    })
    .filter((item) => item.row.id && (item.unlimited || item.balance > 0))

  if (!candidates.length) return null

  candidates.sort((left, right) => {
    if (left.unlimited !== right.unlimited) return left.unlimited ? -1 : 1
    const leftStoreScope = left.row.store_id === account.storeId ? 1 : 0
    const rightStoreScope = right.row.store_id === account.storeId ? 1 : 0
    if (leftStoreScope !== rightStoreScope) return rightStoreScope - leftStoreScope
    const leftRole = String(left.row.role || "")
    const rightRole = String(right.row.role || "")
    const roleDelta = (BILLING_OWNER_ROLE_PRIORITY[rightRole] || 0) - (BILLING_OWNER_ROLE_PRIORITY[leftRole] || 0)
    if (roleDelta) return roleDelta
    return right.balance - left.balance
  })

  const best = candidates[0]
  return {
    plan: best.plan,
    credits_balance: best.balance,
    credits_unlimited: best.unlimited,
    trial_granted_at: best.row.trial_granted_at ?? null,
    ai_points_balance: best.balance,
    ai_points_unlimited: best.unlimited,
    service_plan_label: best.row.service_plan_label?.trim() || (best.unlimited ? "门店不限量服务包" : "门店 AI 点额度"),
    billing_user_id: String(best.row.id),
    billing_owner_label: profileDisplayName(best.row),
    billing_scope: account.storeId ? "store" : "company",
  }
}

function buildProfilePayload(ctx: AppBillingProfile, profile: ProfileRow) {
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
    nickname: profile.nickname ?? null,
    avatar_url: profile.avatar_url ?? null,
  }
}

export async function getAliyunRdsAppProfileResponse(user: AppAuthUser) {
  const profileRow = await getOrCreateProfileRow(user)
  const [entitlement, membershipRows] = await Promise.all([
    getEntitlementRow(user.id),
    getMembershipRows(user.id),
  ])
  const account = buildAccountContext({ user, profile: profileRow, membershipRows })
  let billingProfile: AppBillingProfile = {
    ...normalizeProfile(profileRow),
    account_role: account.role,
    account_role_label: account.roleLabel,
    company_id: account.companyId,
    company_name: account.companyName,
    store_id: account.storeId,
    store_name: account.storeName,
  }
  const membershipBilling = await resolveMembershipBillingProfile(account)
  if (membershipBilling) {
    billingProfile = {
      ...billingProfile,
      ...membershipBilling,
    }
  }

  return {
    profile: buildProfilePayload(billingProfile, profileRow),
    entitlements: entitlement
      ? {
          plan: entitlement.plan ?? null,
          pro_expires_at: entitlement.pro_expires_at ?? null,
        }
      : null,
    account: accountContextPayload(account),
  }
}

export async function getAliyunRdsAppAccountContext(user: AppAuthUser) {
  const profileRow = await getOrCreateProfileRow(user)
  const membershipRows = await getMembershipRows(user.id)
  return buildAccountContext({ user, profile: profileRow, membershipRows })
}
