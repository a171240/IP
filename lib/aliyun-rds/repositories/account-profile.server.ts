import "server-only"

import {
  buildAppFeatureDecisions,
  normalizeAppAccountRole,
  type AppFeatureDecisions,
  type AppNormalizedRole,
} from "@/lib/aliyun-rds/app-authorization.server"
import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import {
  resolveAppCanonicalAuthorization,
  type AppCanonicalAuthorization,
} from "@/lib/aliyun-rds/repositories/app-access-control.server"
import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

const TENANT_MEMBERSHIP_ROLES = [
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
  "staff",
  "employee",
] as const

type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number]
type RecognizedMembershipRole = TenantMembershipRole | "customer"
type AppAccountRole = RecognizedMembershipRole | "platform_admin" | null
type AppAccountStatus = "bound" | "not_bound" | "role_denied" | "suspended" | "inactive"
type AppAccountScope = "company" | "store" | "customer"

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
  entitlement_source: "legacy" | "membership"
  membership_id?: string | null
  plan: string | null
  pro_expires_at: string | null
  status?: string | null
  feature_keys?: string[] | null
  authorization_version?: number | string | null
}

type MembershipRow = {
  id: string
  user_id: string
  company_id: string | null
  company_name: string | null
  company_status: string | null
  store_id: string | null
  store_name: string | null
  store_status: string | null
  store_company_id: string | null
  role: string | null
  status: string | null
  display_name: string | null
  accepted_at: string | Date | null
  last_seen_at: string | Date | null
  created_at: string | Date | null
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
  app_metadata?: unknown
  user_metadata?: unknown
}

export type AppAccountMembership = {
  id: string
  userId: string
  companyId: string | null
  companyName: string | null
  storeId: string | null
  storeName: string | null
  role: RecognizedMembershipRole
  roleLabel: string
  scope: AppAccountScope
  status: "active"
  isActive: true
  displayName: string | null
  acceptedAt: string | null
  lastSeenAt: string | null
  createdAt: string | null
  joinedAt: string | null
}

export type AppAccountContext = {
  accountStatus: AppAccountStatus
  userId: string
  userEmail: string | null
  membershipId: string | null
  role: AppAccountRole
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
  features: AppFeatureDecisions
}

type AppAccountIdentity = Omit<AppAccountContext, "features">

type AppBillingProfile = {
  plan: PlanId
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
  ai_points_balance: number
  ai_points_unlimited: boolean
  account_role: AppAccountRole
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

const ROLE_LABELS: Record<Exclude<AppAccountRole, null>, string> = {
  company_owner: "公司主账号",
  company_admin: "总管理员",
  merchant_owner: "商家主账号",
  merchant_admin: "商家管理员",
  store_owner: "门店主账号",
  store_admin: "门店管理员",
  staff: "员工",
  employee: "员工",
  customer: "顾客",
  platform_admin: "平台管理员",
}

const NORMALIZED_ROLE_LABELS: Record<Exclude<AppNormalizedRole, "guest">, string> = {
  employee: "员工",
  store_manager: "店长",
  company_admin: "公司管理员",
  customer: "顾客",
  platform_admin: "平台管理员",
}

const ROLE_PRIORITY: Record<TenantMembershipRole, number> = {
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

const COMPANY_MANAGER_ROLES = new Set<TenantMembershipRole>([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
])
const STORE_MANAGER_ROLES = new Set<TenantMembershipRole>(["store_owner", "store_admin"])
const MANAGER_ROLES = new Set<TenantMembershipRole>([...COMPANY_MANAGER_ROLES, ...STORE_MANAGER_ROLES])
const STORE_SCOPED_ROLES = new Set<TenantMembershipRole>(["store_owner", "store_admin", "staff", "employee"])
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
const APP_BOOTSTRAP_NICKNAME_MAX_LENGTH = 120
const APP_BOOTSTRAP_AVATAR_URL_MAX_LENGTH = 2_048

function boundedAuthMetadataText(metadata: unknown, key: "nickname" | "avatar_url", maxLength: number) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  if (!Object.prototype.hasOwnProperty.call(metadata, key)) return null
  const value = (metadata as Record<string, unknown>)[key]
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function parseTenantMembershipRole(role: unknown): TenantMembershipRole | null {
  const text = String(role || "").trim()
  return (TENANT_MEMBERSHIP_ROLES as readonly string[]).includes(text) ? (text as TenantMembershipRole) : null
}

function parseRecognizedMembershipRole(role: unknown): RecognizedMembershipRole | null {
  const tenantRole = parseTenantMembershipRole(role)
  if (tenantRole) return tenantRole
  return String(role || "").trim() === "customer" ? "customer" : null
}

function accountRoleLabel(role: AppAccountRole) {
  return role ? ROLE_LABELS[role] : "当前账号"
}

export function getAliyunRdsAppAccountRoleLabel(role: unknown) {
  return accountRoleLabel(parseRecognizedMembershipRole(role))
}

export function isAliyunRdsStoreScopedRole(role: unknown) {
  const tenantRole = parseTenantMembershipRole(role)
  return tenantRole ? STORE_SCOPED_ROLES.has(tenantRole) : false
}

export function canAliyunRdsInviteRole(ctx: AppAccountContext, role: unknown) {
  const tenantRole = parseTenantMembershipRole(role)
  if (!tenantRole) return false
  if (ctx.isPlatformAdmin) return true
  if (ctx.isCompanyManager) {
    return tenantRole !== "company_owner" && tenantRole !== "merchant_owner"
  }
  if (ctx.isStoreManager) {
    return tenantRole === "staff" || tenantRole === "employee"
  }
  return false
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

function isPlatformAdminUser(user: AppAuthUser) {
  const email = String(user.email || "").trim().toLowerCase()
  return (
    platformAdminUserIds().has(user.id.toLowerCase()) ||
    Boolean(email && platformAdminEmails().has(email))
  )
}

function profileDisplayName(row: Partial<ProfileRow | BillingOwnerRow> | null | undefined) {
  return row?.nickname?.trim() || row?.store_name?.trim() || row?.company_name?.trim() || row?.email?.trim() || "门店负责人"
}

function nullableText(value: unknown) {
  const text = String(value || "").trim()
  return text || null
}

function membershipTimestampText(value: string | Date | null) {
  if (value === null || value === "") return null
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`invalid membership timestamp: ${String(value)}`)
  return new Date(timestamp).toISOString()
}

function emptyProfileRow(user: AppAuthUser): ProfileRow {
  return {
    id: user.id,
    email: user.email ?? null,
    nickname: null,
    avatar_url: null,
    plan: "free",
    credits_balance: 0,
    credits_unlimited: false,
    trial_granted_at: null,
    account_role: null,
    company_id: null,
    company_name: null,
    store_id: null,
    store_name: null,
    service_plan_label: null,
  }
}

function identityReviewProfileRow(profile: ProfileRow): ProfileRow {
  return {
    ...profile,
    plan: "free",
    credits_balance: 0,
    credits_unlimited: false,
    trial_granted_at: null,
    account_role: null,
    company_id: null,
    company_name: null,
    store_id: null,
    store_name: null,
    service_plan_label: null,
  }
}

function normalizeProfile(row: ProfileRow): AppBillingProfile {
  const plan = normalizePlan(row.plan)
  const creditsBalance = Number(row.credits_balance || 0)
  const creditsUnlimited = Boolean(row.credits_unlimited)
  const servicePlanLabel = row.service_plan_label?.trim() || MP_SERVICE_PLAN_LABELS[plan]

  return {
    plan,
    credits_balance: creditsBalance,
    credits_unlimited: creditsUnlimited,
    trial_granted_at: row.trial_granted_at ?? null,
    ai_points_balance: creditsBalance,
    ai_points_unlimited: creditsUnlimited,
    account_role: null,
    account_role_label: "当前账号",
    company_id: null,
    company_name: null,
    store_id: null,
    store_name: null,
    service_plan_label: servicePlanLabel,
  }
}

function mapMembership(row: MembershipRow, role: RecognizedMembershipRole): AppAccountMembership {
  const isCustomer = role === "customer"
  const isStoreScoped = role !== "customer" && STORE_SCOPED_ROLES.has(role)
  const companyId = isCustomer ? null : row.company_id || null
  const storeId = isStoreScoped ? row.store_id || null : null
  const acceptedAt = membershipTimestampText(row.accepted_at)
  const lastSeenAt = membershipTimestampText(row.last_seen_at)
  const createdAt = membershipTimestampText(row.created_at)
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId,
    companyName: isCustomer ? null : nullableText(row.company_name),
    storeId,
    storeName: isStoreScoped ? nullableText(row.store_name) : null,
    role,
    roleLabel: ROLE_LABELS[role],
    scope: isCustomer ? "customer" : storeId ? "store" : "company",
    status: "active",
    isActive: true,
    displayName: row.display_name || null,
    acceptedAt,
    lastSeenAt,
    createdAt,
    joinedAt: acceptedAt || createdAt,
  }
}

function isActiveStatus(value: unknown) {
  return String(value || "").trim().toLowerCase() === "active"
}

function hasValidTenantParents(row: MembershipRow) {
  const role = parseTenantMembershipRole(row.role)
  if (!role) return false
  if (!row.company_id || !isActiveStatus(row.company_status)) return false
  if (row.store_id && (!isActiveStatus(row.store_status) || row.store_company_id !== row.company_id)) return false
  return STORE_SCOPED_ROLES.has(role) ? Boolean(row.store_id) : true
}

function validTenantMembership(row: MembershipRow) {
  return Boolean(parseTenantMembershipRole(row.role) && isActiveStatus(row.status) && hasValidTenantParents(row))
}

function validCustomerMembership(row: MembershipRow) {
  return parseRecognizedMembershipRole(row.role) === "customer" && isActiveStatus(row.status)
}

function compareMembershipPriority(left: AppAccountMembership, right: AppAccountMembership) {
  const leftRole = left.role === "customer" ? null : left.role
  const rightRole = right.role === "customer" ? null : right.role
  const priorityDelta = (rightRole ? ROLE_PRIORITY[rightRole] : 0) - (leftRole ? ROLE_PRIORITY[leftRole] : 0)
  if (priorityDelta) return priorityDelta
  const createdDelta = (right.createdAt ? Date.parse(right.createdAt) : 0) - (left.createdAt ? Date.parse(left.createdAt) : 0)
  if (createdDelta) return createdDelta
  return left.id.localeCompare(right.id)
}

function choosePrimaryMembership(memberships: AppAccountMembership[], fallback?: ProfileRow | null) {
  if (!memberships.length) return null

  const fallbackCompanyId = fallback?.company_id || null
  const fallbackStoreId = fallback?.store_id || null
  if (fallbackCompanyId || fallbackStoreId) {
    const exact = memberships.find(
      (item) => item.companyId === fallbackCompanyId && item.storeId === fallbackStoreId,
    )
    if (exact) return exact
  }

  return memberships.slice().sort(compareMembershipPriority)[0]
}

function unavailableAccountStatus(rows: MembershipRow[], profile: ProfileRow | null): AppAccountStatus {
  if (rows.some((row) => String(row.status || "").trim().toLowerCase() === "suspended")) return "suspended"
  if (
    rows.some(
      (row) =>
        !isActiveStatus(row.status) ||
        Boolean(parseTenantMembershipRole(row.role) && !hasValidTenantParents(row)),
    )
  ) {
    return "inactive"
  }
  if (rows.some((row) => isActiveStatus(row.status))) return "role_denied"
  if (String(profile?.account_role || "").trim() === "service_operator") return "role_denied"
  return "not_bound"
}

function buildUnavailableContext(args: {
  user: AppAuthUser
  accountStatus: AppAccountStatus
  customerMemberships?: AppAccountMembership[]
}): AppAccountIdentity {
  const customerMembership = args.customerMemberships?.[0] || null
  return {
    accountStatus: args.accountStatus,
    userId: args.user.id,
    userEmail: args.user.email ?? null,
    membershipId: null,
    role: customerMembership ? "customer" : null,
    roleLabel: customerMembership ? customerMembership.roleLabel : "当前账号",
    companyId: null,
    companyName: null,
    storeId: null,
    storeName: null,
    scopeLabel: "当前账号",
    memberships: args.accountStatus === "role_denied" ? args.customerMemberships || [] : [],
    isManager: false,
    isCompanyManager: false,
    isStoreManager: false,
    isPlatformAdmin: false,
  }
}

function platformAccountContext(user: AppAuthUser): AppAccountIdentity {
  return {
    accountStatus: "bound",
    userId: user.id,
    userEmail: user.email ?? null,
    membershipId: null,
    role: "platform_admin",
    roleLabel: ROLE_LABELS.platform_admin,
    companyId: null,
    companyName: null,
    storeId: null,
    storeName: null,
    scopeLabel: "平台账号",
    memberships: [],
    isManager: true,
    isCompanyManager: true,
    isStoreManager: false,
    isPlatformAdmin: true,
  }
}

function membershipSnapshot(
  membership: AppAccountMembership,
  authorizedUserId = membership.userId,
) {
  return {
    id: membership.id,
    user_id: authorizedUserId,
    role: membership.role,
    role_label: membership.roleLabel,
    scope: membership.scope,
    status: membership.status,
    is_active: membership.isActive,
    company_id: membership.companyId,
    company_name: membership.companyName,
    store_id: membership.storeId,
    store_name: membership.storeName,
    joined_at: membership.joinedAt,
  }
}

export function accountContextPayload(ctx: AppAccountContext) {
  return {
    account_status: ctx.accountStatus,
    active_membership_id: ctx.membershipId,
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
    memberships: ctx.memberships.map((membership) =>
      membershipSnapshot(membership, ctx.userId),
    ),
  }
}

async function findProfileRow(userId: string): Promise<ProfileRow | null> {
  const result = await queryAliyunRds<ProfileRow>(
    `select ${PROFILE_COLUMNS} from public.profiles where id = $1 limit 1`,
    [userId],
  )
  return result.rows[0] || null
}

async function getLegacyEntitlementRow(
  userId: string,
): Promise<EntitlementRow | null> {
  const result = await queryAliyunRds<EntitlementRow>(
    `
      select
        'legacy'::text as entitlement_source,
        null::uuid as membership_id,
        entitlement.plan,
        entitlement.pro_expires_at,
        null::text as status,
        null::text[] as feature_keys,
        null::bigint as authorization_version
      from public.entitlements entitlement
      where entitlement.user_id = $1
      limit 1
    `,
    [userId],
  )
  return result.rows[0] || null
}

async function getMembershipEntitlementRow(args: {
  canonicalUserId: string
  membershipId: string
}): Promise<EntitlementRow | null> {
  const result = await queryAliyunRds<EntitlementRow>(
    `
      select
        'membership'::text as entitlement_source,
        entitlement.membership_id,
        entitlement.plan,
        null::timestamptz as pro_expires_at,
        entitlement.status,
        entitlement.feature_keys,
        entitlement.authorization_version
      from public.app_membership_entitlements entitlement
      where entitlement.membership_id = $1
        and entitlement.canonical_user_id = $2
      limit 1
    `,
    [args.membershipId, args.canonicalUserId],
  )
  return result.rows[0] || null
}

async function getMembershipRows(
  userId: string,
  canonicalUserId: string,
): Promise<MembershipRow[]> {
  const result = await queryAliyunRds<MembershipRow>(
    `
      select
        membership.id,
        membership.user_id,
        membership.company_id,
        company.name as company_name,
        company.status as company_status,
        membership.store_id,
        store.name as store_name,
        store.status as store_status,
        store.company_id as store_company_id,
        membership.role,
        membership.status,
        membership.display_name,
        membership.accepted_at,
        membership.last_seen_at,
        membership.created_at
      from public.mp_account_memberships membership
      left join public.mp_companies company on company.id = membership.company_id
      left join public.mp_stores store on store.id = membership.store_id
      where membership.canonical_user_id = $2
         or (
           membership.canonical_user_id is null
           and membership.user_id = $1
         )
      order by membership.created_at desc, membership.id asc
    `,
    [userId, canonicalUserId],
  )
  return result.rows
}

function buildAccountContext(args: {
  user: AppAuthUser
  profile: ProfileRow | null
  membershipRows: MembershipRow[]
}): AppAccountIdentity {
  if (isPlatformAdminUser(args.user)) return platformAccountContext(args.user)

  const memberships = args.membershipRows
    .filter(validTenantMembership)
    .map((row) => mapMembership(row, parseTenantMembershipRole(row.role)!))
  const customerMemberships = args.membershipRows
    .filter(validCustomerMembership)
    .map((row) => mapMembership(row, "customer"))
  const primary = choosePrimaryMembership(memberships, args.profile)

  if (!primary) {
    return buildUnavailableContext({
      user: args.user,
      accountStatus: unavailableAccountStatus(args.membershipRows, args.profile),
      customerMemberships,
    })
  }

  return {
    accountStatus: "bound",
    userId: args.user.id,
    userEmail: args.user.email ?? null,
    membershipId: primary.id,
    role: primary.role,
    roleLabel: primary.roleLabel,
    companyId: primary.companyId,
    companyName: primary.companyName,
    storeId: primary.storeId,
    storeName: primary.storeName,
    scopeLabel: primary.storeName || primary.companyName || "当前账号",
    memberships: [...memberships, ...customerMemberships],
    isManager: primary.role !== "customer" && MANAGER_ROLES.has(primary.role),
    isCompanyManager: primary.role !== "customer" && COMPANY_MANAGER_ROLES.has(primary.role),
    isStoreManager: primary.role !== "customer" && STORE_MANAGER_ROLES.has(primary.role),
    isPlatformAdmin: false,
  }
}

function shouldUseMembershipBilling(account: AppAccountIdentity) {
  return (
    account.accountStatus === "bound" &&
    Boolean(account.membershipId) &&
    (account.role === "staff" || account.role === "employee")
  )
}

async function resolveMembershipBillingProfile(account: AppAccountIdentity): Promise<Partial<AppBillingProfile> | null> {
  if (!shouldUseMembershipBilling(account)) return null
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
      const unlimited = Boolean(row.credits_unlimited)
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

function entitlementPayload(entitlement: EntitlementRow | null) {
  return {
    plan: entitlement?.plan ?? null,
    pro_expires_at: entitlement?.pro_expires_at ?? null,
  }
}

function normalizedProfileRole(account: AppAccountIdentity) {
  const normalizedRole = normalizeAppAccountRole(account.role, account.isPlatformAdmin)
  return normalizedRole === "guest" ? null : normalizedRole
}

function normalizedProfileRoleLabel(role: Exclude<AppNormalizedRole, "guest"> | null) {
  return role ? NORMALIZED_ROLE_LABELS[role] : "当前账号"
}

type AppAccountReadSnapshot = {
  authorization: AppCanonicalAuthorization
  profileRow: ProfileRow
  entitlement: EntitlementRow | null
  account: AppAccountContext
  billingProfile: AppBillingProfile
}

async function loadAppAccountReadSnapshot(user: AppAuthUser): Promise<AppAccountReadSnapshot> {
  const authorization = await resolveAppCanonicalAuthorization(user)
  const storedProfile = await findProfileRow(user.id)
  const identityReviewRequired =
    authorization.identityState === "review_required"
  const profileRow = identityReviewRequired
    ? identityReviewProfileRow(storedProfile || emptyProfileRow(user))
    : storedProfile || emptyProfileRow(user)
  const membershipRows = identityReviewRequired
    ? []
    : await getMembershipRows(user.id, authorization.canonicalUserId)
  const account = buildAccountContext({ user, profile: profileRow, membershipRows })
  const membershipEntitlement =
    authorization.identityState === "resolved" && account.membershipId
      ? await getMembershipEntitlementRow({
          canonicalUserId: authorization.canonicalUserId,
          membershipId: account.membershipId,
        })
      : null
  const legacyEntitlement =
    authorization.identityState === "resolved" && !membershipEntitlement
      ? await getLegacyEntitlementRow(user.id)
      : null
  const entitlement = membershipEntitlement || legacyEntitlement
  let billingProfile: AppBillingProfile = {
    ...normalizeProfile(profileRow),
    account_role: account.role,
    account_role_label: accountRoleLabel(account.role),
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

  const baseFeatures = buildAppFeatureDecisions(account, {
    aiPointsBalance: billingProfile.ai_points_balance,
    aiPointsUnlimited: billingProfile.ai_points_unlimited,
  })
  const features = applyExplicitEntitlementFeatures(
    baseFeatures,
    entitlement,
    account,
  )

  return {
    authorization,
    profileRow,
    entitlement,
    account: { ...account, features },
    billingProfile,
  }
}

function applyExplicitEntitlementFeatures(
  baseFeatures: AppFeatureDecisions,
  entitlement: EntitlementRow | null,
  account: AppAccountIdentity,
): AppFeatureDecisions {
  if (account.isPlatformAdmin || account.accountStatus !== "bound") {
    return baseFeatures
  }
  if (entitlement?.entitlement_source === "legacy") return baseFeatures

  const grantedFeatures = new Set(
    entitlement?.status === "active" &&
    Array.isArray(entitlement.feature_keys)
      ? entitlement.feature_keys
      : [],
  )
  return Object.fromEntries(
    Object.entries(baseFeatures).map(([featureKey, decision]) => {
      if (featureKey === "auth" || featureKey === "account") {
        return [featureKey, decision]
      }
      if (
        decision.reason === "role_denied" ||
        decision.reason === "not_bound" ||
        decision.reason === "suspended" ||
        decision.reason === "inactive"
      ) {
        return [featureKey, decision]
      }
      if (grantedFeatures.has(featureKey)) {
        return [
          featureKey,
          { enabled: true, reason: "ok", source: "membership" },
        ]
      }
      return [
        featureKey,
        {
          enabled: false,
          reason: "entitlement_denied",
          source: "membership",
        },
      ]
    }),
  ) as AppFeatureDecisions
}

export async function getAliyunRdsAppProfileResponse(user: AppAuthUser) {
  const snapshot = await loadAppAccountReadSnapshot(user)

  return {
    profile: buildProfilePayload(snapshot.billingProfile, snapshot.profileRow),
    entitlements: snapshot.entitlement ? entitlementPayload(snapshot.entitlement) : null,
    account: accountContextPayload(snapshot.account),
  }
}

export async function getAliyunRdsAppProfileContractResponse(user: AppAuthUser) {
  const snapshot = await loadAppAccountReadSnapshot(user)
  const accountRole = normalizedProfileRole(snapshot.account)

  return {
    ok: true as const,
    user: { id: user.id },
    account_status: snapshot.account.accountStatus,
    active_membership_id: snapshot.account.membershipId,
    memberships: snapshot.account.memberships.map((membership) =>
      membershipSnapshot(membership, user.id),
    ),
    entitlements: entitlementPayload(snapshot.entitlement),
    features: snapshot.account.features,
    profile: {
      account_status: snapshot.account.accountStatus,
      membership_id: snapshot.account.membershipId,
      account_role: accountRole,
      account_role_label: normalizedProfileRoleLabel(accountRole),
      company_id: snapshot.account.companyId,
      company_name: snapshot.account.companyName,
      store_id: snapshot.account.storeId,
      store_name: snapshot.account.storeName,
      plan: snapshot.billingProfile.plan,
      plan_label: snapshot.billingProfile.service_plan_label,
      service_plan_label: snapshot.billingProfile.service_plan_label,
      ai_points_balance: snapshot.billingProfile.ai_points_balance,
      ai_points_unlimited: snapshot.billingProfile.ai_points_unlimited,
      nickname: snapshot.profileRow.nickname ?? null,
      avatar_url: snapshot.profileRow.avatar_url ?? null,
    },
    ...appAccessContractPayload(snapshot),
  }
}

export async function getAliyunRdsAppAccessSnapshot(user: AppAuthUser) {
  const snapshot = await loadAppAccountReadSnapshot(user)
  if (snapshot.authorization.identityState === "review_required") {
    throw new Error("app_identity_review_required")
  }
  return appAccessContractPayload(snapshot)
}

export async function getAliyunRdsAppEntitlementsResponse(user: AppAuthUser) {
  const snapshot = await loadAppAccountReadSnapshot(user)
  const entitlement = entitlementPayload(snapshot.entitlement)
  return {
    ok: true as const,
    plan: entitlement.plan,
    pro_expires_at: entitlement.pro_expires_at,
    features: snapshot.account.features,
  }
}

export async function bootstrapAliyunRdsAppProfile(user: AppAuthUser) {
  const nickname = boundedAuthMetadataText(
    user.user_metadata,
    "nickname",
    APP_BOOTSTRAP_NICKNAME_MAX_LENGTH,
  )
  const avatarUrl = boundedAuthMetadataText(
    user.user_metadata,
    "avatar_url",
    APP_BOOTSTRAP_AVATAR_URL_MAX_LENGTH,
  )

  await queryAliyunRds(
    `
      insert into public.profiles (id, email, nickname, avatar_url, account_role, plan, credits_balance, credits_unlimited)
      values ($1, $2, $3, $4, 'guest', 'free', 0, false)
      on conflict (id) do nothing
    `,
    [user.id, user.email ?? null, nickname, avatarUrl],
  )
}

export async function getAliyunRdsAppAccountContext(user: AppAuthUser) {
  if (isPlatformAdminUser(user)) {
    const account = platformAccountContext(user)
    return {
      ...account,
      features: buildAppFeatureDecisions(account, {
        aiPointsBalance: 0,
        aiPointsUnlimited: true,
      }),
    }
  }
  return (await loadAppAccountReadSnapshot(user)).account
}

function appAccessContractPayload(snapshot: AppAccountReadSnapshot) {
  const formalMembershipEntitlement =
    snapshot.entitlement?.entitlement_source === "legacy" ||
    (
      snapshot.entitlement?.entitlement_source === "membership" &&
      snapshot.entitlement.status === "active" &&
      snapshot.entitlement.membership_id === snapshot.account.membershipId
    )
  const accessMode =
    snapshot.authorization.identityState === "resolved" &&
    (
      snapshot.account.isPlatformAdmin ||
      (
        snapshot.account.accountStatus === "bound" &&
        formalMembershipEntitlement
      )
    )
      ? "formal"
      : "personal_trial"
  const trial = snapshot.authorization.trial
  return {
    canonical_user_id: snapshot.authorization.canonicalUserId,
    identity_state: snapshot.authorization.identityState,
    access_mode: accessMode as "formal" | "personal_trial",
    authorization_version: snapshot.authorization.authorizationVersion,
    trial: {
      kind: trial.kind,
      data_domain: trial.dataDomain,
      status: trial.status,
      ai_coach_session_limit: trial.sessionLimit,
      ai_coach_sessions_used: trial.sessionsUsed,
      ai_coach_sessions_remaining: trial.sessionsRemaining,
    },
  }
}
