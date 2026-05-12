import { NextRequest, NextResponse } from "next/server"

import {
  createInviteToken,
  getMpAccountRoleLabel,
  hashInviteToken,
  type MpAccountRole,
} from "@/lib/mp/account-context.server"
import { collectMpOrgAnalytics } from "@/lib/mp/org-analytics.server"
import { requireAdminUser } from "@/lib/admin/auth.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const OWNER_ROLE: MpAccountRole = "store_admin"

type CompanyRow = {
  id: string
  name: string
  owner_user_id?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type StoreRow = {
  id: string
  company_id: string
  name: string
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type InviteRow = {
  id: string
  company_id: string
  store_id?: string | null
  role: string
  max_uses: number
  used_count: number
  expires_at: string
  status: string
  note?: string | null
  created_at?: string | null
  updated_at?: string | null
  metadata?: Record<string, unknown> | null
}

type MembershipRow = {
  id: string
  user_id: string
  company_id?: string | null
  store_id?: string | null
  role: string
  status?: string | null
  accepted_at?: string | null
  last_seen_at?: string | null
  created_at?: string | null
}

type ProfileRow = {
  id: string
  email?: string | null
  nickname?: string | null
  avatar_url?: string | null
  credits_balance?: number | null
  credits_unlimited?: boolean | null
  service_plan_label?: string | null
}

type AnalyticsStoreStats = {
  id: string
  session_count?: number | null
  practice_seconds?: number | null
  avg_score?: number | null
  ai_points_spent?: number | null
}

type AnalyticsPayload = {
  stores?: AnalyticsStoreStats[]
}

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

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

function compactId(value: unknown) {
  const text = cleanText(value, 80)
  if (!text) return ""
  if (text.length <= 12) return text
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

function profileLabel(profile: ProfileRow | null | undefined, fallbackId?: string | null) {
  return firstText(profile?.nickname, profile?.email, compactId(fallbackId), "未设置")
}

function inviteStatus(invite: Pick<InviteRow, "status" | "expires_at" | "used_count" | "max_uses"> | null | undefined) {
  if (!invite) return "none"
  if (invite.status === "revoked") return "revoked"
  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) return "used"
  const expiresAt = new Date(invite.expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return "expired"
  return "active"
}

function inviteStatusLabel(status: string) {
  if (status === "active") return "未使用"
  if (status === "used") return "已使用"
  if (status === "expired") return "已过期"
  if (status === "revoked") return "已撤销"
  return "无入口"
}

function miniProgramPath(token: string) {
  return `/pages/store-admin/invite-accept/index?token=${encodeURIComponent(token)}`
}

function qrCodeUrl(token: string) {
  return `/api/mp/store-admin/invites/${encodeURIComponent(token)}/qrcode`
}

async function listStoreAccounts() {
  const admin = createAdminSupabaseClient()

  const [companiesResult, storesResult, invitesResult, membershipsResult] = await Promise.all([
    admin
      .from("mp_companies")
      .select("id, name, owner_user_id, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("mp_stores")
      .select("id, company_id, name, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(800),
    admin
      .from("mp_account_invites")
      .select("id, company_id, store_id, role, max_uses, used_count, expires_at, status, note, metadata, created_at, updated_at")
      .in("role", ["store_admin", "store_owner"])
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("mp_account_memberships")
      .select("id, user_id, company_id, store_id, role, status, accepted_at, last_seen_at, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ])

  if (companiesResult.error) return { ok: false as const, response: jsonError(500, companiesResult.error.message, "companies_query_failed") }
  if (storesResult.error) return { ok: false as const, response: jsonError(500, storesResult.error.message, "stores_query_failed") }
  if (invitesResult.error) return { ok: false as const, response: jsonError(500, invitesResult.error.message, "invites_query_failed") }
  if (membershipsResult.error) return { ok: false as const, response: jsonError(500, membershipsResult.error.message, "memberships_query_failed") }

  const companies = (companiesResult.data || []) as CompanyRow[]
  const stores = (storesResult.data || []) as StoreRow[]
  const invites = (invitesResult.data || []) as InviteRow[]
  const memberships = (membershipsResult.data || []) as MembershipRow[]

  const userIds = Array.from(
    new Set([
      ...companies.map((company) => company.owner_user_id).filter(Boolean),
      ...memberships.map((membership) => membership.user_id).filter(Boolean),
    ] as string[]),
  )
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select("id, email, nickname, avatar_url, credits_balance, credits_unlimited, service_plan_label")
        .in("id", userIds)
    : { data: [] }

  const profileMap = new Map<string, ProfileRow>()
  for (const profile of (profiles || []) as ProfileRow[]) profileMap.set(String(profile.id), profile)

  const companyMap = new Map(companies.map((company) => [String(company.id), company]))
  const invitesByStore = new Map<string, InviteRow[]>()
  const activeMemberships = memberships.filter((membership) => (membership.status || "active") === "active")
  const membershipsByStore = new Map<string, MembershipRow[]>()
  for (const invite of invites) {
    if (!invite.store_id) continue
    const key = String(invite.store_id)
    invitesByStore.set(key, [...(invitesByStore.get(key) || []), invite])
  }
  for (const membership of activeMemberships) {
    if (!membership.store_id) continue
    const key = String(membership.store_id)
    membershipsByStore.set(key, [...(membershipsByStore.get(key) || []), membership])
  }

  const companyIds = companies.map((company) => company.id).filter(Boolean)
  const analytics = companyIds.length
    ? await collectMpOrgAnalytics(admin, { companyIds, stores, days: 7 }).catch(() => null)
    : null
  const analyticsStores = ((analytics as AnalyticsPayload | null)?.stores || []).filter((store) => store.id)
  const analyticsStoreMap = new Map<string, AnalyticsStoreStats>(
    analyticsStores.map((store) => [String(store.id), store]),
  )

  const normalizedStores = stores.map((store) => {
    const company = companyMap.get(String(store.company_id))
    const storeMemberships = membershipsByStore.get(String(store.id)) || []
    const owners = storeMemberships.filter((membership) => membership.role === "store_admin" || membership.role === "store_owner")
    const staff = storeMemberships.filter((membership) => membership.role === "staff" || membership.role === "employee")
    const latestInvite = (invitesByStore.get(String(store.id)) || [])[0] || null
    const latestInviteStatus = inviteStatus(latestInvite)
    const stat = analyticsStoreMap.get(String(store.id))

    return {
      id: store.id,
      company_id: store.company_id,
      company_name: company?.name || "",
      name: store.name,
      status: store.status || "active",
      created_at: store.created_at || null,
      owner_count: owners.length,
      owner_names: owners.map((owner) => profileLabel(profileMap.get(String(owner.user_id)), owner.user_id)).slice(0, 3),
      staff_count: staff.length,
      member_count: storeMemberships.length,
      session_count: Number(stat?.session_count || 0),
      practice_seconds: Number(stat?.practice_seconds || 0),
      avg_score: stat?.avg_score ?? null,
      ai_points_spent: Number(stat?.ai_points_spent || 0),
      latest_owner_invite: latestInvite
        ? {
            id: latestInvite.id,
            status: latestInviteStatus,
            status_label: inviteStatusLabel(latestInviteStatus),
            max_uses: latestInvite.max_uses,
            used_count: latestInvite.used_count,
            expires_at: latestInvite.expires_at,
            created_at: latestInvite.created_at || null,
          }
        : null,
    }
  })

  const storesByCompany = new Map<string, typeof normalizedStores>()
  for (const store of normalizedStores) {
    storesByCompany.set(store.company_id, [...(storesByCompany.get(store.company_id) || []), store])
  }

  const normalizedCompanies = companies.map((company) => {
    const companyStores = storesByCompany.get(String(company.id)) || []
    const ownerProfile = company.owner_user_id ? profileMap.get(String(company.owner_user_id)) : null
    return {
      id: company.id,
      name: company.name,
      status: company.status || "active",
      owner_user_id: company.owner_user_id || null,
      owner_display_name: profileLabel(ownerProfile, company.owner_user_id),
      created_at: company.created_at || null,
      store_count: companyStores.length,
      member_count: companyStores.reduce((sum, store) => sum + store.member_count, 0),
      session_count: companyStores.reduce((sum, store) => sum + store.session_count, 0),
      ai_points_spent: companyStores.reduce((sum, store) => sum + store.ai_points_spent, 0),
    }
  })

  const normalizedInvites = invites.slice(0, 80).map((invite) => {
    const status = inviteStatus(invite)
    const company = companyMap.get(String(invite.company_id))
    const store = invite.store_id ? stores.find((item) => item.id === invite.store_id) : null
    return {
      id: invite.id,
      company_id: invite.company_id,
      company_name: company?.name || "",
      store_id: invite.store_id || null,
      store_name: store?.name || "",
      role: invite.role,
      role_label: getMpAccountRoleLabel(invite.role),
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      created_at: invite.created_at || null,
      status,
      status_label: inviteStatusLabel(status),
      note: invite.note || "",
    }
  })

  return {
    ok: true as const,
    response: NextResponse.json({
      ok: true,
      stats: {
        company_count: normalizedCompanies.length,
        store_count: normalizedStores.length,
        owner_bound_store_count: normalizedStores.filter((store) => store.owner_count > 0).length,
        active_invite_count: normalizedInvites.filter((invite) => invite.status === "active").length,
        session_count: normalizedStores.reduce((sum, store) => sum + store.session_count, 0),
        ai_points_spent: normalizedStores.reduce((sum, store) => sum + store.ai_points_spent, 0),
      },
      companies: normalizedCompanies,
      stores: normalizedStores,
      invites: normalizedInvites,
    }),
  }
}

export async function GET() {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const result = await listStoreAccounts()
  return result.response
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = cleanText(body?.action, 40)
  const admin = createAdminSupabaseClient()

  if (action === "create_company") {
    const name = cleanText(body?.name)
    if (!name) return jsonError(400, "请填写客户名称", "name_required")

    const { data: company, error } = await admin
      .from("mp_companies")
      .insert({ name, status: "active" })
      .select("id, name, owner_user_id, status, created_at, updated_at")
      .single()

    if (error || !company) return jsonError(500, error?.message || "company_create_failed", "company_create_failed")
    return NextResponse.json({ ok: true, company })
  }

  if (action === "create_store") {
    const companyId = cleanText(body?.company_id || body?.companyId, 80)
    const name = cleanText(body?.name)
    if (!companyId) return jsonError(400, "请选择客户主体", "company_id_required")
    if (!name) return jsonError(400, "请填写门店名称", "name_required")

    const { data: company, error: companyError } = await admin
      .from("mp_companies")
      .select("id, name, status")
      .eq("id", companyId)
      .maybeSingle()
    if (companyError || !company) return jsonError(404, companyError?.message || "客户不存在", "company_not_found")

    const { data: store, error } = await admin
      .from("mp_stores")
      .insert({ company_id: company.id, name, status: "active" })
      .select("id, company_id, name, status, created_at, updated_at")
      .single()

    if (error || !store) return jsonError(500, error?.message || "store_create_failed", "store_create_failed")
    return NextResponse.json({ ok: true, company, store })
  }

  if (action === "create_owner_invite") {
    const storeId = cleanText(body?.store_id || body?.storeId, 80)
    if (!storeId) return jsonError(400, "请选择门店", "store_id_required")

    const { data: store, error: storeError } = await admin
      .from("mp_stores")
      .select("id, company_id, name, status")
      .eq("id", storeId)
      .maybeSingle()
    if (storeError || !store) return jsonError(404, storeError?.message || "门店不存在", "store_not_found")

    const { data: company, error: companyError } = await admin
      .from("mp_companies")
      .select("id, name, status")
      .eq("id", store.company_id)
      .maybeSingle()
    if (companyError || !company) return jsonError(404, companyError?.message || "客户不存在", "company_not_found")

    const token = createInviteToken()
    const maxUses = 1
    const expiresInDays = clampInt(body?.expires_in_days || body?.expiresInDays, 1, 30, 30)
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: invite, error } = await admin
      .from("mp_account_invites")
      .insert({
        company_id: company.id,
        store_id: store.id,
        role: OWNER_ROLE,
        token_hash: hashInviteToken(token),
        invited_by_user_id: auth.user.id,
        max_uses: maxUses,
        used_count: 0,
        expires_at: expiresAt,
        status: "active",
        note: cleanText(body?.note || "负责人绑定入口", 240) || "负责人绑定入口",
        metadata: { created_from: "web_admin_store_accounts" },
      })
      .select("id, company_id, store_id, role, max_uses, used_count, expires_at, status, note, created_at")
      .single()

    if (error || !invite) return jsonError(500, error?.message || "invite_create_failed", "invite_create_failed")

    return NextResponse.json({
      ok: true,
      invite: {
        ...invite,
        role_label: getMpAccountRoleLabel(OWNER_ROLE),
        company_name: company.name,
        store_name: store.name,
        status_label: "未使用",
      },
      token,
      path: miniProgramPath(token),
      qrcode_url: qrCodeUrl(token),
    })
  }

  if (action === "revoke_invite") {
    const inviteId = cleanText(body?.invite_id || body?.inviteId, 80)
    if (!inviteId) return jsonError(400, "请选择要撤销的入口", "invite_id_required")

    const { data: invite, error } = await admin
      .from("mp_account_invites")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("status", "active")
      .select("id, status")
      .maybeSingle()

    if (error) return jsonError(500, error.message, "invite_revoke_failed")
    return NextResponse.json({ ok: true, invite })
  }

  return jsonError(400, "未知操作", "unknown_action")
}
