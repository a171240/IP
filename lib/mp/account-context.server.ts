import "server-only"

import { createHash, randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const MP_ACCOUNT_ROLES = [
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

export type MpAccountRole = (typeof MP_ACCOUNT_ROLES)[number]

export type MpAccountMembership = {
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

export type MpAccountContext = {
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
  memberships: MpAccountMembership[]
  isManager: boolean
  isCompanyManager: boolean
  isStoreManager: boolean
  isPlatformAdmin: boolean
}

type ProfileLike = {
  account_role?: string | null
  company_id?: string | null
  company_name?: string | null
  store_id?: string | null
  store_name?: string | null
}

type SupabaseUserLike = {
  id: string
  email?: string | null
  user_metadata?: unknown
}

const ROLE_LABELS: Record<MpAccountRole, string> = {
  company_owner: "公司主账号",
  company_admin: "公司管理员",
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
const COMPANY_SCOPED_ROLES = new Set<MpAccountRole>([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "service_operator",
])

function normalizeRole(role: unknown): MpAccountRole {
  const text = String(role || "").trim()
  return (MP_ACCOUNT_ROLES as readonly string[]).includes(text) ? (text as MpAccountRole) : "staff"
}

export function getMpAccountRoleLabel(role: unknown) {
  return ROLE_LABELS[normalizeRole(role)] || "当前账号"
}

export function isStoreScopedRole(role: unknown) {
  return STORE_SCOPED_ROLES.has(normalizeRole(role))
}

export function isCompanyScopedRole(role: unknown) {
  return COMPANY_SCOPED_ROLES.has(normalizeRole(role))
}

export function isManagerRole(role: unknown) {
  return MANAGER_ROLES.has(normalizeRole(role))
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
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

export function createInviteToken() {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function hashInviteToken(token: string) {
  const secret = firstText(
    process.env.MP_INVITE_SECRET,
    process.env.WECHAT_LOGIN_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.AUTH_SECRET,
  )
  return createHash("sha256").update(`${secret}:${String(token || "").trim()}`).digest("hex")
}

function mapMembership(row: any, companyMap: Map<string, any>, storeMap: Map<string, any>): MpAccountMembership {
  const role = normalizeRole(row.role)
  const company = row.company_id ? companyMap.get(row.company_id) : null
  const store = row.store_id ? storeMap.get(row.store_id) : null
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id || null,
    companyName: firstText(company?.name),
    storeId: row.store_id || null,
    storeName: firstText(store?.name),
    role,
    roleLabel: ROLE_LABELS[role],
    status: firstText(row.status, "active"),
    displayName: row.display_name || null,
    acceptedAt: row.accepted_at || null,
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null,
  }
}

function choosePrimaryMembership(memberships: MpAccountMembership[], fallback?: ProfileLike | null) {
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
  profile?: ProfileLike | null
  isPlatformAdmin?: boolean
}): MpAccountContext {
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

export async function resolveMpAccountContextForUser(opts: {
  userId: string
  userEmail?: string | null
  userMetadata?: Record<string, unknown>
  profileFallback?: ProfileLike | null
}): Promise<MpAccountContext> {
  const admin = createAdminSupabaseClient()

  const { data: profileRow } = opts.profileFallback
    ? { data: opts.profileFallback }
    : await admin
        .from("profiles")
        .select("account_role, company_id, company_name, store_id, store_name")
        .eq("id", opts.userId)
        .maybeSingle()

  const email = String(opts.userEmail || "").trim().toLowerCase()
  const envAdmin =
    platformAdminUserIds().has(opts.userId.toLowerCase()) || (email ? platformAdminEmails().has(email) : false)
  const profileRole = normalizeRole((profileRow as ProfileLike | null)?.account_role || (envAdmin ? "service_operator" : "staff"))
  const isPlatformAdmin = envAdmin || profileRole === "service_operator"

  const { data: membershipRows, error: membershipError } = await admin
    .from("mp_account_memberships")
    .select("id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at")
    .eq("user_id", opts.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })

  if (membershipError) {
    return buildFallbackContext({
      userId: opts.userId,
      userEmail: opts.userEmail,
      profile: profileRow as ProfileLike | null,
      isPlatformAdmin,
    })
  }

  const rows = (membershipRows || []) as any[]
  const companyIds = Array.from(new Set(rows.map((row) => row.company_id).filter(Boolean)))
  const storeIds = Array.from(new Set(rows.map((row) => row.store_id).filter(Boolean)))
  const companyMap = new Map<string, any>()
  const storeMap = new Map<string, any>()

  if (companyIds.length) {
    const { data } = await admin.from("mp_companies").select("id, name").in("id", companyIds)
    for (const item of data || []) companyMap.set(String(item.id), item)
  }

  if (storeIds.length) {
    const { data } = await admin.from("mp_stores").select("id, name, company_id").in("id", storeIds)
    for (const item of data || []) storeMap.set(String(item.id), item)
  }

  const memberships = rows.map((row) => mapMembership(row, companyMap, storeMap))
  const primary = choosePrimaryMembership(memberships, profileRow as ProfileLike | null)

  if (!primary) {
    return buildFallbackContext({
      userId: opts.userId,
      userEmail: opts.userEmail,
      profile: profileRow as ProfileLike | null,
      isPlatformAdmin,
    })
  }

  return {
    userId: opts.userId,
    userEmail: opts.userEmail ?? null,
    membershipId: primary.id,
    role: primary.role,
    roleLabel: primary.roleLabel,
    companyId: primary.companyId,
    companyName: primary.companyName || (profileRow as ProfileLike | null)?.company_name || null,
    storeId: primary.storeId,
    storeName: primary.storeName || (profileRow as ProfileLike | null)?.store_name || null,
    scopeLabel: primary.storeName || primary.companyName || "当前账号",
    memberships,
    isManager: MANAGER_ROLES.has(primary.role) || isPlatformAdmin,
    isCompanyManager: COMPANY_MANAGER_ROLES.has(primary.role) || isPlatformAdmin,
    isStoreManager: STORE_MANAGER_ROLES.has(primary.role),
    isPlatformAdmin,
  }
}

export async function resolveMpAccountContext(request: NextRequest): Promise<
  | { ok: true; ctx: MpAccountContext; user: SupabaseUserLike }
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

  const ctx = await resolveMpAccountContextForUser({
    userId: user.id,
    userEmail: user.email ?? null,
    userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
  })

  return { ok: true, ctx, user }
}

export async function requireStoreManagerContext(request: NextRequest): Promise<
  | { ok: true; ctx: MpAccountContext; user: SupabaseUserLike }
  | { ok: false; error: Response }
> {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved

  if (!resolved.ctx.isManager || (!resolved.ctx.companyId && !resolved.ctx.isPlatformAdmin)) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: "当前账号没有门店管理权限", code: "store_admin_required" }, { status: 403 }),
    }
  }

  return resolved
}

export async function requirePlatformAdminContext(request: NextRequest): Promise<
  | { ok: true; ctx: MpAccountContext; user: SupabaseUserLike }
  | { ok: false; error: Response }
> {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved

  if (!resolved.ctx.isPlatformAdmin) {
    return {
      ok: false,
      error: NextResponse.json({ ok: false, error: "当前账号没有平台管理权限", code: "platform_admin_required" }, { status: 403 }),
    }
  }

  return resolved
}

export function canManageStore(ctx: MpAccountContext, store: { id?: string | null; company_id?: string | null } | null) {
  if (!store) return false
  if (ctx.isPlatformAdmin) return true
  if (ctx.isCompanyManager && ctx.companyId && store.company_id === ctx.companyId) return true
  if (ctx.isStoreManager && ctx.storeId && store.id === ctx.storeId) return true
  return false
}

export function canInviteRole(ctx: MpAccountContext, role: MpAccountRole) {
  if (ctx.isPlatformAdmin) return true
  if (ctx.isCompanyManager) {
    return role !== "service_operator" && role !== "company_owner" && role !== "merchant_owner"
  }
  if (ctx.isStoreManager) {
    return role === "staff" || role === "employee"
  }
  return false
}

export function accountContextPayload(ctx: MpAccountContext) {
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
