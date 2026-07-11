import "server-only"

import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError,
  queryAliyunRds,
} from "@/lib/aliyun-rds/postgres.server"
import {
  accountContextPayload,
  getAliyunRdsAppAccountContext,
  getAliyunRdsAppAccountRoleLabel,
  type AppAccountContext,
  type AppAuthUser,
} from "@/lib/aliyun-rds/repositories/account-profile.server"
import {
  appAuthorizationErrorResponse,
  requireAppFeatureAccess,
  type AppRequestedTenantScope,
} from "@/lib/aliyun-rds/app-authorization.server"
import { getVoiceCoachSessionClientContext } from "@/lib/voice-coach/session-context"
import { getScenario } from "@/lib/voice-coach/scenarios"

type StoreRow = {
  id: string
  company_id: string | null
  name: string | null
  status: string | null
  created_at?: string | null
  updated_at?: string | null
}

type MembershipRow = {
  id: string
  user_id: string
  company_id: string | null
  store_id: string | null
  role: string | null
  status: string | null
  display_name: string | null
  accepted_at: string | null
  last_seen_at: string | null
  created_at: string | null
}

type ProfileRow = {
  id: string
  nickname: string | null
  avatar_url: string | null
  email: string | null
  credits_balance?: number | null
  credits_unlimited?: boolean | null
  service_plan_label?: string | null
  account_role?: string | null
}

type VoiceSessionRow = {
  id: string
  user_id: string
  company_id: string | null
  store_id: string | null
  membership_id?: string | null
  scenario_id?: string | null
  status: string | null
  started_at: string | null
  ended_at: string | null
  created_at?: string | null
  total_score: number | null
  report_json: Record<string, any> | null
  customer_profile_id?: string | null
  scene_card_id?: string | null
  session_context_json?: Record<string, any> | null
  scenario_snapshot_json?: Record<string, any> | null
}

type VoiceTurnRow = {
  session_id: string
  role: string | null
  text?: string | null
  audio_seconds: number | null
  turn_index?: number | null
  created_at?: string | null
}

type LedgerRow = {
  id: string
  user_id: string | null
  company_id: string | null
  store_id: string | null
  action_code: string | null
  action_title: string | null
  page_path: string | null
  delta: number | null
  balance_after: number | null
  status: string | null
  reason: string | null
  created_at: string | null
}

type StoreScope = {
  companyId: string
  stores: StoreRow[]
}

export function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

export function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export function rdsStoreAdminErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  return jsonError(500, fallbackCode, fallbackCode)
}

function requestedStoreAdminScope(ctx: AppAccountContext, request: NextRequest): AppRequestedTenantScope {
  const params = new URL(request.url).searchParams
  const hasRequestedCompanyId = params.has("company_id")
  const hasRequestedStoreId = params.has("store_id")
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  if (hasRequestedCompanyId || hasRequestedStoreId) {
    return {
      ...(hasRequestedCompanyId ? { companyId: requestedCompanyId || null } : {}),
      ...(hasRequestedStoreId ? { storeId: requestedStoreId || null } : {}),
    }
  }
  return {
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(ctx.storeId ? { storeId: ctx.storeId } : {}),
  }
}

export async function resolveAliyunRdsStoreManagerAuth(request: NextRequest): Promise<
  | { ok: true; user: AppAuthUser; ctx: AppAccountContext }
  | { ok: false; error: Response }
> {
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) return { ok: false, error: appAuthRequiredResponse() }

  const authUser: AppAuthUser = auth.user
  const ctx = await getAliyunRdsAppAccountContext(authUser)
  const access = requireAppFeatureAccess(
    ctx,
    ctx.features,
    "store_admin",
    requestedStoreAdminScope(ctx, request),
  )
  if (!access.ok) {
    return { ok: false, error: NextResponse.json(access.body, { status: access.status }) }
  }
  if (!ctx.isManager || (!ctx.companyId && !ctx.isPlatformAdmin)) {
    const denial = appAuthorizationErrorResponse("role_denied", "store_admin")
    return { ok: false, error: NextResponse.json(denial.body, { status: denial.status }) }
  }

  return { ok: true, user: authUser, ctx }
}

function dayStartIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

function rangeStartIso(days: number) {
  return new Date(Date.now() - Math.max(0, days - 1) * 24 * 60 * 60 * 1000).toISOString()
}

function parseAnalyticsDays(value: unknown, fallback = 7) {
  const n = Number(value || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(30, Math.round(n)))
}

function shanghaiDayKey(value: unknown) {
  const date = value ? new Date(String(value)) : new Date()
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
}

function scoreOf(row: VoiceSessionRow) {
  const n = Number(row?.total_score ?? row?.report_json?.total_score)
  return Number.isFinite(n) ? Math.round(n) : null
}

function scoreLabel(score: number | null) {
  return score == null ? "" : `${score}分`
}

function progressLabel(delta: number | null) {
  if (delta == null) return "暂无对比"
  if (delta > 0) return `进步 ${delta} 分`
  if (delta < 0) return `下降 ${Math.abs(delta)} 分`
  return "持平"
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

function mapById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>()
  for (const row of rows || []) map.set(String(row.id), row)
  return map
}

function buildEmptyDay(date: string) {
  return {
    date,
    label: date.slice(5),
    session_count: 0,
    completed_count: 0,
    practice_seconds: 0,
    score_sum: 0,
    scored_count: 0,
    avg_score: null as number | null,
    ai_points_spent: 0,
  }
}

function buildDaySeries(days: number) {
  const map = new Map<string, ReturnType<typeof buildEmptyDay>>()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = shanghaiDayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString())
    map.set(date, buildEmptyDay(date))
  }
  return map
}

function getSessionContext(row: VoiceSessionRow) {
  try {
    return getVoiceCoachSessionClientContext({
      snapshot: row?.scenario_snapshot_json,
      customerProfileId: row?.customer_profile_id,
      sceneCardId: row?.scene_card_id,
      sessionContext: row?.session_context_json,
    })
  } catch {
    return {} as any
  }
}

function buildSessionTitle(row: VoiceSessionRow) {
  const scenario = getScenario(row?.scenario_id)
  const context = getSessionContext(row)
  const title = firstText(context.scene_name, context.service_name, scenario.name, "话术练习")
  const subtitle = [cleanText(context.customer_name, 50), cleanText(context.scene_kind_label, 40)].filter(Boolean).join(" · ")
  return {
    title,
    subtitle: subtitle || cleanText(context.customer_summary, 90) || scenario.goal || "",
  }
}

function storeWhereClause(ctx: AppAccountContext, opts: { companyId: string; storeId?: string }) {
  const clauses = ["company_id = $1", "status = 'active'"]
  const values: unknown[] = [opts.companyId]
  const storeId = ctx.isStoreManager && ctx.storeId ? ctx.storeId : opts.storeId
  if (storeId) {
    clauses.push("id = $2")
    values.push(storeId)
  }
  return { where: clauses.join(" and "), values }
}

async function resolveStores(ctx: AppAccountContext, request: NextRequest): Promise<StoreScope> {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  if (!companyId) throw new Error("company_id_required")

  const scoped = storeWhereClause(ctx, { companyId, storeId: requestedStoreId })
  const result = await queryAliyunRds<StoreRow>(
    `
      select id, company_id, name, status, created_at, updated_at
      from public.mp_stores
      where ${scoped.where}
      order by created_at asc
      limit 500
    `,
    scoped.values,
  )

  return { companyId, stores: result.rows }
}

async function listMemberships(args: {
  activeOnly: boolean
  companyId: string
  storeIds: string[]
  strictStoreScope: boolean
  limit?: number
}) {
  if (args.strictStoreScope && !args.storeIds.length) return []
  const storeScopeClause = args.strictStoreScope
    ? "store_id = any($2::uuid[])"
    : "(store_id is null or store_id = any($2::uuid[]))"
  const activeClause = args.activeOnly ? " and status = 'active'" : ""

  const result = await queryAliyunRds<MembershipRow>(
    `
      select id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at
      from public.mp_account_memberships
      where company_id = $1${activeClause}
        and ${storeScopeClause}
      order by created_at desc
      limit ${Math.max(1, Math.min(5000, args.limit || 2000))}
    `,
    [args.companyId, args.storeIds],
  )
  return result.rows
}

async function listProfiles(userIds: string[], includeBilling = false) {
  if (!userIds.length) return []
  const columns = includeBilling
    ? "id, nickname, avatar_url, email, credits_balance, credits_unlimited, service_plan_label, account_role"
    : "id, nickname, avatar_url, email"
  const result = await queryAliyunRds<ProfileRow>(
    `select ${columns} from public.profiles where id = any($1::uuid[])`,
    [userIds],
  )
  return result.rows
}

async function listStoreAdminSessions(args: {
  companyId: string
  storeIds: string[]
  strictStoreScope: boolean
  userIds: string[]
  startAt: string
  limit?: number
}) {
  if (!args.userIds.length || (args.strictStoreScope && !args.storeIds.length)) return []
  const storeScopeClause = args.strictStoreScope
    ? "store_id = any($4::uuid[])"
    : "(store_id is null or store_id = any($4::uuid[]))"
  const result = await queryAliyunRds<VoiceSessionRow>(
    `
      select
        id, user_id, company_id, store_id, membership_id, scenario_id, status, started_at, ended_at, created_at,
        total_score, report_json, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json
      from public.voice_coach_sessions
      where user_id = any($1::uuid[])
        and company_id = $2
        and started_at >= $3
        and ${storeScopeClause}
      order by started_at desc
      limit ${Math.max(1, Math.min(5000, args.limit || 5000))}
    `,
    [args.userIds, args.companyId, args.startAt, args.storeIds],
  )
  return result.rows
}

async function listTurns(sessionIds: string[], onlyBeautician = false, limit = 15000) {
  if (!sessionIds.length) return []
  const roleClause = onlyBeautician ? " and role = 'beautician'" : ""
  const result = await queryAliyunRds<VoiceTurnRow>(
    `
      select session_id, role, text, audio_seconds, turn_index, created_at
      from public.voice_coach_turns
      where session_id = any($1::uuid[])${roleClause}
      limit ${Math.max(1, Math.min(15000, limit))}
    `,
    [sessionIds],
  )
  return result.rows
}

function scopedMemberships(
  rows: MembershipRow[],
  opts: { ctx: AppAccountContext; storeIds: string[]; strictStoreScope: boolean },
) {
  const storeIdSet = new Set(opts.storeIds)
  return rows.filter((row) => {
    if (row.role === "service_operator") return false
    if (!row.store_id) return !opts.strictStoreScope && (opts.ctx.isCompanyManager || opts.ctx.isPlatformAdmin)
    if (!storeIdSet.size) return false
    return storeIdSet.has(row.store_id)
  })
}

function scopedStoreAdminSessions(
  rows: VoiceSessionRow[],
  args: {
    companyId: string
    storeIds: string[]
    userIds: string[]
    strictStoreScope: boolean
  },
) {
  const storeIdSet = new Set(args.storeIds)
  const userIdSet = new Set(args.userIds)
  return rows.filter((row) => {
    if (!userIdSet.has(cleanText(row.user_id, 80))) return false
    if (cleanText(row.company_id, 80) !== args.companyId) return false
    const storeId = cleanText(row.store_id, 80)
    if (!storeId) return !args.strictStoreScope
    return storeIdSet.has(storeId)
  })
}

function scopedLedger(row: LedgerRow, args: { companyIdSet: Set<string>; storeIdSet: Set<string>; strictStoreScope: boolean }) {
  const companyId = cleanText(row.company_id, 80)
  const storeId = cleanText(row.store_id, 80)
  if (!args.companyIdSet.has(companyId)) return false
  if (args.strictStoreScope) return args.storeIdSet.has(storeId)
  if (!storeId) return true
  return args.storeIdSet.has(storeId)
}

export async function getAliyunRdsStoreAdminOverview(ctx: AppAccountContext, request: NextRequest) {
  const requestedStoreId = cleanText(new URL(request.url).searchParams.get("store_id"), 80)
  const scope = await resolveStores(ctx, request).catch((error) => {
    if (error instanceof Error && error.message === "company_id_required") return null
    throw error
  })
  if (!scope) return { error: jsonError(400, "请先选择公司", "company_id_required") }

  const storeIds = scope.stores.map((store) => store.id).filter(Boolean)
  const strictStoreScope = ctx.isStoreManager || Boolean(requestedStoreId)
  const membershipRows = await listMemberships({
    activeOnly: true,
    companyId: scope.companyId,
    storeIds,
    strictStoreScope,
  })
  const memberships = scopedMemberships(membershipRows, { ctx, storeIds, strictStoreScope })
  const userIds = Array.from(new Set(memberships.map((item) => item.user_id).filter(Boolean)))
  const profiles = await listProfiles(userIds)
  const profileMap = mapById(profiles)

  const sessionRows = await listStoreAdminSessions({
    companyId: scope.companyId,
    storeIds,
    strictStoreScope,
    userIds,
    startAt: dayStartIso(),
    limit: 1000,
  })
  const sessions = scopedStoreAdminSessions(sessionRows, {
    companyId: scope.companyId,
    storeIds,
    userIds,
    strictStoreScope,
  })
  const sessionIds = sessions.map((item) => item.id).filter(Boolean)
  const turns = await listTurns(sessionIds, true, 3000)
  const secondsBySession = new Map<string, number>()
  for (const turn of turns || []) {
    secondsBySession.set(String(turn.session_id), (secondsBySession.get(String(turn.session_id)) || 0) + Number(turn.audio_seconds || 0))
  }

  let scoreSum = 0
  let scoredCount = 0
  let practiceSeconds = 0
  for (const session of sessions) {
    practiceSeconds += secondsBySession.get(String(session.id)) || 0
    const score = scoreOf(session)
    if (score !== null) {
      scoreSum += score
      scoredCount += 1
    }
  }

  const activeStoreIds = new Set(storeIds)
  const storeMembers = memberships.filter((item) => !item.store_id || activeStoreIds.has(item.store_id))
  const storesById = new Map<string, StoreRow>(scope.stores.map((store) => [String(store.id), store]))
  const membersPreview = storeMembers.slice(0, 6).map((item) => {
    const profile = profileMap.get(String(item.user_id)) || ({} as ProfileRow)
    const store = item.store_id ? storesById.get(String(item.store_id)) : null
    return {
      id: item.id,
      user_id: item.user_id,
      role: item.role,
      display_name: item.display_name || profile.nickname || profile.email || "成员",
      avatar_url: profile.avatar_url || "",
      store_id: item.store_id || null,
      store_name: store?.name || "",
    }
  })

  return {
    ok: true,
    context: accountContextPayload(ctx),
    stores: scope.stores,
    stats: {
      store_count: scope.stores.length,
      member_count: storeMembers.length,
      today_session_count: sessions.length,
      today_completed_count: sessions.filter((item) => item.status === "ended" || item.report_json).length,
      today_practice_seconds: Math.round(practiceSeconds),
      today_avg_score: scoredCount ? Math.round(scoreSum / scoredCount) : null,
    },
    members_preview: membersPreview,
  }
}

export async function getAliyunRdsStoreAdminMembers(ctx: AppAccountContext, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const companyId = ctx.isPlatformAdmin ? requestedCompanyId : ctx.companyId
  if (!companyId) return { error: jsonError(400, "当前账号缺少公司归属", "company_id_required") }

  const scope = await resolveStores(ctx, request)
  const storeIds = scope.stores.map((store) => store.id).filter(Boolean)
  const storeMap = mapById(scope.stores)
  const strictStoreScope = ctx.isStoreManager || Boolean(requestedStoreId)
  const membershipRows = await listMemberships({
    activeOnly: false,
    companyId,
    storeIds,
    strictStoreScope,
    limit: 2000,
  })
  const scopedRows = scopedMemberships(membershipRows, { ctx, storeIds, strictStoreScope })

  const userIds = Array.from(new Set(scopedRows.map((row) => row.user_id).filter(Boolean)))
  const profiles = await listProfiles(userIds)
  const profileMap = mapById(profiles)
  const sessionRows = await listStoreAdminSessions({
    companyId,
    storeIds,
    strictStoreScope,
    userIds,
    startAt: dayStartIso(),
    limit: 1000,
  })
  const sessions = scopedStoreAdminSessions(sessionRows, {
    companyId,
    storeIds,
    userIds,
    strictStoreScope,
  })
  const sessionIds = sessions.map((item) => item.id).filter(Boolean)
  const turns = await listTurns(sessionIds, true, 3000)

  const secondsBySession = new Map<string, number>()
  for (const turn of turns || []) {
    secondsBySession.set(String(turn.session_id), (secondsBySession.get(String(turn.session_id)) || 0) + Number(turn.audio_seconds || 0))
  }

  const statsByUser = new Map<string, any>()
  for (const session of sessions) {
    const userId = String(session.user_id)
    const current = statsByUser.get(userId) || {
      today_session_count: 0,
      today_completed_count: 0,
      today_practice_seconds: 0,
      score_sum: 0,
      scored_count: 0,
      latest_started_at: "",
    }
    current.today_session_count += 1
    if (session.status === "ended" || session.report_json) current.today_completed_count += 1
    current.today_practice_seconds += secondsBySession.get(String(session.id)) || 0
    if (!current.latest_started_at || String(session.started_at || "") > current.latest_started_at) {
      current.latest_started_at = session.started_at || ""
    }
    const score = scoreOf(session)
    if (score !== null) {
      current.score_sum += score
      current.scored_count += 1
    }
    statsByUser.set(userId, current)
  }

  const members = scopedRows.map((row) => {
    const profile = profileMap.get(String(row.user_id)) || ({} as ProfileRow)
    const store = row.store_id ? storeMap.get(String(row.store_id)) : null
    const stats = statsByUser.get(String(row.user_id)) || {}
    return {
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      role_label: getAliyunRdsAppAccountRoleLabel(row.role),
      status: row.status,
      display_name: row.display_name || profile.nickname || profile.email || "成员",
      nickname: profile.nickname || "",
      avatar_url: profile.avatar_url || "",
      email: profile.email || "",
      company_id: row.company_id || null,
      store_id: row.store_id || null,
      store_name: store?.name || "",
      accepted_at: row.accepted_at || "",
      last_seen_at: row.last_seen_at || "",
      created_at: row.created_at || "",
      today_session_count: Number(stats.today_session_count || 0),
      today_completed_count: Number(stats.today_completed_count || 0),
      today_practice_seconds: Math.round(Number(stats.today_practice_seconds || 0)),
      today_avg_score: stats.scored_count ? Math.round(stats.score_sum / stats.scored_count) : null,
      latest_started_at: stats.latest_started_at || "",
    }
  })

  return {
    ok: true,
    context: accountContextPayload(ctx),
    stores: scope.stores,
    members,
  }
}

async function listStoreAdminLedger(args: {
  companyId: string
  storeIds: string[]
  strictStoreScope: boolean
  startAt: string
}) {
  if (args.strictStoreScope && !args.storeIds.length) return []
  const storeScopeClause = args.strictStoreScope
    ? "store_id = any($3::uuid[])"
    : "(store_id is null or store_id = any($3::uuid[]))"
  const result = await queryAliyunRds<LedgerRow>(
    `
      select id, user_id, company_id, store_id, action_code, action_title, page_path, delta, balance_after, status, reason, created_at
      from public.mp_ai_point_ledger
      where company_id = $1
        and created_at >= $2
        and ${storeScopeClause}
      order by created_at desc
      limit 2000
    `,
    [args.companyId, args.startAt, args.storeIds],
  )
  return result.rows
}

export async function getAliyunRdsStoreAdminAnalytics(ctx: AppAccountContext, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const days = parseAnalyticsDays(params.get("days"), 7)
  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  if (!companyId) return { error: jsonError(400, "当前账号缺少公司归属", "company_id_required") }

  const scope = await resolveStores(ctx, request)
  const startAt = rangeStartIso(days)
  const companyIdSet = new Set([companyId])
  const storeIds = scope.stores.map((store) => cleanText(store.id, 80)).filter(Boolean)
  const storeIdSet = new Set(storeIds)
  const strictStoreScope = Boolean(requestedStoreId || ctx.isStoreManager)

  const membershipRows = await listMemberships({
    activeOnly: true,
    companyId,
    storeIds,
    strictStoreScope,
    limit: 2000,
  })
  const memberships = scopedMemberships(membershipRows, { ctx, storeIds, strictStoreScope })
  const userIds = Array.from(new Set(memberships.map((row) => cleanText(row.user_id, 80)).filter(Boolean)))
  const profiles = await listProfiles(userIds, true)
  const profileMap = mapById(profiles)
  const storeMap = mapById(scope.stores)
  const allSessions = await listStoreAdminSessions({
    companyId,
    storeIds,
    strictStoreScope,
    userIds,
    startAt,
    limit: 5000,
  })
  const sessions = scopedStoreAdminSessions(allSessions, {
    companyId,
    storeIds,
    strictStoreScope,
    userIds,
  })
  const sessionIds = sessions.map((session) => session.id).filter(Boolean)
  const turns = await listTurns(sessionIds, false, 15000)
  const ledgerRows = await listStoreAdminLedger({ companyId, storeIds, strictStoreScope, startAt })
  const ledger = ledgerRows.filter((row) =>
    scopedLedger(row, {
      companyIdSet,
      storeIdSet,
      strictStoreScope,
    }),
  )

  const turnsBySession = new Map<string, VoiceTurnRow[]>()
  const secondsBySession = new Map<string, number>()
  for (const turn of turns || []) {
    const sessionId = String(turn.session_id)
    const list = turnsBySession.get(sessionId) || []
    list.push(turn)
    turnsBySession.set(sessionId, list)
    if (turn.role === "beautician") {
      secondsBySession.set(sessionId, (secondsBySession.get(sessionId) || 0) + Number(turn.audio_seconds || 0))
    }
  }

  const dailyMap = buildDaySeries(days)
  const memberStats = new Map<string, any>()
  const storeStats = new Map<string, any>()
  const previousScoreByUser = new Map<string, number>()
  const sessionWithProgress = sessions
    .slice()
    .sort((left, right) => String(left.started_at || left.created_at || "").localeCompare(String(right.started_at || right.created_at || "")))
    .map((session) => {
      const userId = String(session.user_id)
      const score = scoreOf(session)
      const previous = previousScoreByUser.has(userId) ? previousScoreByUser.get(userId)! : null
      const delta = score != null && previous != null ? score - previous : null
      if (score != null) previousScoreByUser.set(userId, score)
      return { session, score, delta }
    })

  for (const item of sessionWithProgress) {
    const session = item.session
    const userId = String(session.user_id)
    const storeId = cleanText(session.store_id, 80)
    const seconds = Math.round(secondsBySession.get(String(session.id)) || 0)
    const completed = session.status === "ended" || Boolean(session.report_json)
    const day = shanghaiDayKey(session.started_at || session.created_at)
    const dayItem = dailyMap.get(day) || buildEmptyDay(day)
    dayItem.session_count += 1
    if (completed) dayItem.completed_count += 1
    dayItem.practice_seconds += seconds
    if (item.score != null) {
      dayItem.score_sum += item.score
      dayItem.scored_count += 1
    }
    dailyMap.set(day, dayItem)

    const member = memberStats.get(userId) || {
      user_id: userId,
      session_count: 0,
      completed_count: 0,
      practice_seconds: 0,
      score_sum: 0,
      scored_count: 0,
      latest_started_at: "",
      last_score: null,
      score_delta: null,
    }
    member.session_count += 1
    if (completed) member.completed_count += 1
    member.practice_seconds += seconds
    if (item.score != null) {
      member.score_sum += item.score
      member.scored_count += 1
      member.last_score = item.score
      member.score_delta = item.delta
    }
    if (!member.latest_started_at || String(session.started_at || "") > member.latest_started_at) {
      member.latest_started_at = session.started_at || session.created_at || ""
    }
    memberStats.set(userId, member)

    const storeKey = storeId || "__company__"
    const store = storeStats.get(storeKey) || {
      store_id: storeId || null,
      session_count: 0,
      completed_count: 0,
      practice_seconds: 0,
      score_sum: 0,
      scored_count: 0,
      active_member_ids: new Set<string>(),
    }
    store.session_count += 1
    if (completed) store.completed_count += 1
    store.practice_seconds += seconds
    store.active_member_ids.add(userId)
    if (item.score != null) {
      store.score_sum += item.score
      store.scored_count += 1
    }
    storeStats.set(storeKey, store)
  }

  for (const item of dailyMap.values()) {
    item.practice_seconds = Math.round(item.practice_seconds)
    item.avg_score = item.scored_count ? Math.round(item.score_sum / item.scored_count) : null
    delete (item as any).score_sum
    delete (item as any).scored_count
  }

  let aiPointsSpent = 0
  let aiPointsRefunded = 0
  let aiPointsBlocked = 0
  for (const item of ledger) {
    const delta = Number(item.delta || 0)
    if (item.status === "blocked") aiPointsBlocked += 1
    if (delta < 0) aiPointsSpent += Math.abs(delta)
    if (delta > 0) aiPointsRefunded += delta
    const day = shanghaiDayKey(item.created_at)
    const dayItem = dailyMap.get(day)
    if (dayItem && delta < 0) dayItem.ai_points_spent += Math.abs(delta)
  }

  const sessionById = new Map(sessionWithProgress.map((item) => [String(item.session.id), item]))
  const recentSessions = sessions.slice(0, 20).map((session) => {
    const progress = sessionById.get(String(session.id))
    const profile = profileMap.get(String(session.user_id)) || ({} as ProfileRow)
    const store = session.store_id ? storeMap.get(String(session.store_id)) : null
    const title = buildSessionTitle(session)
    const sessionTurns = turnsBySession.get(String(session.id)) || []
    const beauticianTurns = sessionTurns.filter((turn) => turn.role === "beautician")
    return {
      id: session.id,
      user_id: session.user_id,
      display_name: firstText(profile.nickname, profile.email, "员工"),
      avatar_url: profile.avatar_url || "",
      store_id: session.store_id || null,
      store_name: firstText(store?.name, ""),
      title: title.title,
      subtitle: title.subtitle,
      status: session.status,
      status_label: session.status === "ended" || session.report_json ? "已完成" : "练习中",
      started_at: session.started_at || session.created_at || "",
      ended_at: session.ended_at || "",
      practice_seconds: Math.round(secondsBySession.get(String(session.id)) || 0),
      beautician_turn_count: beauticianTurns.length,
      score: progress?.score ?? null,
      score_label: scoreLabel(progress?.score ?? null),
      score_delta: progress?.delta ?? null,
      progress_label: progressLabel(progress?.delta ?? null),
      report_available: Boolean(session.report_json) || session.status === "ended",
    }
  })

  const members = memberships.map((membership) => {
    const profile = profileMap.get(String(membership.user_id)) || ({} as ProfileRow)
    const store = membership.store_id ? storeMap.get(String(membership.store_id)) : null
    const stats = memberStats.get(String(membership.user_id)) || {}
    const avgScore = stats.scored_count ? Math.round(stats.score_sum / stats.scored_count) : null
    return {
      id: membership.id,
      user_id: membership.user_id,
      role: membership.role,
      status: membership.status,
      display_name: firstText(membership.display_name, profile.nickname, profile.email, "员工"),
      avatar_url: profile.avatar_url || "",
      email: profile.email || "",
      company_id: membership.company_id || null,
      store_id: membership.store_id || null,
      store_name: firstText(store?.name, ""),
      accepted_at: membership.accepted_at || "",
      last_seen_at: membership.last_seen_at || "",
      credits_balance: Number(profile.credits_balance || 0),
      credits_unlimited: Boolean(profile.credits_unlimited),
      service_plan_label: profile.service_plan_label || "",
      session_count: Number(stats.session_count || 0),
      completed_count: Number(stats.completed_count || 0),
      practice_seconds: Math.round(Number(stats.practice_seconds || 0)),
      avg_score: avgScore,
      avg_score_label: scoreLabel(avgScore),
      latest_started_at: stats.latest_started_at || "",
      last_score: stats.last_score ?? null,
      score_delta: stats.score_delta ?? null,
      progress_label: progressLabel(stats.score_delta ?? null),
    }
  })

  const storesWithStats = scope.stores.map((store) => {
    const stats = storeStats.get(String(store.id)) || {}
    const avgScore = stats.scored_count ? Math.round(stats.score_sum / stats.scored_count) : null
    const ownerMembership =
      memberships.find(
        (membership) =>
          membership.store_id === store.id && (membership.role === "store_owner" || membership.role === "store_admin"),
      ) || null
    const ownerProfile = ownerMembership ? profileMap.get(String(ownerMembership.user_id)) || ({} as ProfileRow) : ({} as ProfileRow)
    return {
      ...store,
      owner_user_id: ownerMembership?.user_id || null,
      owner_display_name: ownerMembership
        ? firstText(ownerMembership.display_name, ownerProfile.nickname, ownerProfile.email, ownerMembership.user_id)
        : "",
      owner_credits_balance: ownerMembership ? Number(ownerProfile.credits_balance || 0) : null,
      owner_credits_unlimited: ownerMembership ? Boolean(ownerProfile.credits_unlimited) : false,
      service_plan_label: ownerMembership ? ownerProfile.service_plan_label || "" : "",
      member_count: memberships.filter((membership) => membership.store_id === store.id).length,
      active_member_count: stats.active_member_ids?.size || 0,
      session_count: Number(stats.session_count || 0),
      completed_count: Number(stats.completed_count || 0),
      practice_seconds: Math.round(Number(stats.practice_seconds || 0)),
      avg_score: avgScore,
      ai_points_spent: ledger
        .filter((item) => item.store_id === store.id && Number(item.delta || 0) < 0)
        .reduce((sum, item) => sum + Math.abs(Number(item.delta || 0)), 0),
    }
  })

  const scoredSessions = sessionWithProgress.filter((item) => item.score != null)
  const avgScore = scoredSessions.length
    ? Math.round(scoredSessions.reduce((sum, item) => sum + Number(item.score || 0), 0) / scoredSessions.length)
    : null

  return {
    ok: true,
    context: accountContextPayload(ctx),
    range: {
      days,
      start_at: startAt,
      end_at: new Date().toISOString(),
    },
    stores: storesWithStats,
    members,
    daily: Array.from(dailyMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
    recent_sessions: recentSessions,
    ai_ledger: ledger.slice(0, 30).map((item) => {
      const profile = item.user_id ? profileMap.get(String(item.user_id)) || ({} as ProfileRow) : ({} as ProfileRow)
      const store = item.store_id ? storeMap.get(String(item.store_id)) : null
      return {
        id: item.id,
        user_id: item.user_id,
        display_name: firstText(profile.nickname, profile.email, "账号"),
        store_id: item.store_id || null,
        store_name: firstText(store?.name, ""),
        action_code: item.action_code,
        action_title: item.action_title || item.action_code,
        page_path: item.page_path || "",
        delta: Number(item.delta || 0),
        balance_after: item.balance_after,
        status: item.status,
        reason: item.reason || "",
        created_at: item.created_at || "",
      }
    }),
    stats: {
      member_count: members.length,
      active_member_count: members.filter((item) => item.session_count > 0).length,
      session_count: sessions.length,
      completed_count: sessions.filter((item) => item.status === "ended" || item.report_json).length,
      practice_seconds: Array.from(secondsBySession.values()).reduce((sum, value) => sum + Math.round(value || 0), 0),
      avg_score: avgScore,
      ai_points_spent: aiPointsSpent,
      ai_points_refunded: aiPointsRefunded,
      ai_points_blocked: aiPointsBlocked,
      ledger_count: ledger.length,
    },
  }
}
