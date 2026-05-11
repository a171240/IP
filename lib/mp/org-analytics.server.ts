import "server-only"

import { getVoiceCoachSessionClientContext } from "@/lib/voice-coach/session-context"
import { getScenario } from "@/lib/voice-coach/scenarios"

type CollectArgs = {
  companyIds?: string[]
  storeIds?: string[]
  days?: number
  strictStoreScope?: boolean
  stores?: any[]
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

export function parseAnalyticsDays(value: unknown, fallback = 7) {
  const n = Number(value || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(30, Math.round(n)))
}

export function shanghaiDayKey(value: unknown) {
  const date = value ? new Date(String(value)) : new Date()
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
}

function rangeStartIso(days: number) {
  return new Date(Date.now() - Math.max(0, days - 1) * 24 * 60 * 60 * 1000).toISOString()
}

function scoreOf(row: any) {
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

function getSessionContext(row: any) {
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

function buildSessionTitle(row: any) {
  const scenario = getScenario(row?.scenario_id)
  const context = getSessionContext(row)
  const title = firstText(context.scene_name, context.service_name, scenario.name, "话术练习")
  const subtitle = [cleanText(context.customer_name, 50), cleanText(context.scene_kind_label, 40)].filter(Boolean).join(" · ")
  return {
    title,
    subtitle: subtitle || cleanText(context.customer_summary, 90) || scenario.goal || "",
  }
}

function mapById(rows: any[]) {
  const map = new Map<string, any>()
  for (const row of rows || []) map.set(String(row.id), row)
  return map
}

function scopedSession(row: any, args: { companyIdSet: Set<string>; storeIdSet: Set<string>; userIdSet: Set<string> }) {
  const companyId = cleanText(row.company_id, 80)
  const storeId = cleanText(row.store_id, 80)
  if (args.storeIdSet.size && storeId) return args.storeIdSet.has(storeId)
  if (args.companyIdSet.size && companyId) return args.companyIdSet.has(companyId)
  return args.userIdSet.has(String(row.user_id))
}

function scopedLedger(row: any, args: { companyIdSet: Set<string>; storeIdSet: Set<string>; strictStoreScope: boolean }) {
  const companyId = cleanText(row.company_id, 80)
  const storeId = cleanText(row.store_id, 80)
  if (args.strictStoreScope && args.storeIdSet.size) return args.storeIdSet.has(storeId)
  if (args.companyIdSet.size) return args.companyIdSet.has(companyId)
  if (args.storeIdSet.size) return args.storeIdSet.has(storeId)
  return true
}

export async function collectMpOrgAnalytics(admin: any, args: CollectArgs) {
  const days = parseAnalyticsDays(args.days, 7)
  const startAt = rangeStartIso(days)
  const companyIdSet = new Set((args.companyIds || []).map((id) => cleanText(id, 80)).filter(Boolean))
  const requestedStoreIdSet = new Set((args.storeIds || []).map((id) => cleanText(id, 80)).filter(Boolean))

  let stores = args.stores || []
  if (!stores.length) {
    let storesQuery = admin
      .from("mp_stores")
      .select("id, company_id, name, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500)
    if (companyIdSet.size === 1) storesQuery = storesQuery.eq("company_id", Array.from(companyIdSet)[0])
    if (companyIdSet.size > 1) storesQuery = storesQuery.in("company_id", Array.from(companyIdSet))
    if (requestedStoreIdSet.size === 1) storesQuery = storesQuery.eq("id", Array.from(requestedStoreIdSet)[0])
    if (requestedStoreIdSet.size > 1) storesQuery = storesQuery.in("id", Array.from(requestedStoreIdSet))
    const { data, error } = await storesQuery
    if (error) throw new Error(error.message)
    stores = data || []
  }

  const storeIdSet = new Set(
    (requestedStoreIdSet.size ? Array.from(requestedStoreIdSet) : stores.map((store: any) => store.id))
      .map((id: unknown) => cleanText(id, 80))
      .filter(Boolean),
  )
  for (const store of stores || []) {
    const companyId = cleanText(store.company_id, 80)
    if (companyId) companyIdSet.add(companyId)
  }

  let membershipQuery = admin
    .from("mp_account_memberships")
    .select("id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(2000)
  if (companyIdSet.size === 1) membershipQuery = membershipQuery.eq("company_id", Array.from(companyIdSet)[0])
  if (companyIdSet.size > 1) membershipQuery = membershipQuery.in("company_id", Array.from(companyIdSet))
  const { data: membershipRows, error: membershipError } = await membershipQuery
  if (membershipError) throw new Error(membershipError.message)

  const memberships = ((membershipRows || []) as any[]).filter((row) => {
    const storeId = cleanText(row.store_id, 80)
    if (!storeId) return !args.strictStoreScope
    if (!storeIdSet.size) return true
    return storeIdSet.has(storeId)
  })
  const userIds = Array.from(new Set(memberships.map((row) => cleanText(row.user_id, 80)).filter(Boolean)))
  const userIdSet = new Set(userIds)

  const { data: profileRows } = userIds.length
    ? await admin
        .from("profiles")
        .select("id, nickname, avatar_url, email, credits_balance, credits_unlimited, service_plan_label, account_role")
        .in("id", userIds)
    : { data: [] }
  const profileMap = mapById(profileRows || [])
  const storeMap = mapById(stores || [])

  const { data: sessionRows, error: sessionError } = userIds.length
    ? await admin
        .from("voice_coach_sessions")
        .select(
          "id, user_id, company_id, store_id, membership_id, scenario_id, status, started_at, ended_at, created_at, total_score, report_json, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
        )
        .in("user_id", userIds)
        .gte("started_at", startAt)
        .order("started_at", { ascending: false })
        .limit(5000)
    : { data: [], error: null }
  if (sessionError) throw new Error(sessionError.message)

  const sessions = ((sessionRows || []) as any[]).filter((row) => scopedSession(row, { companyIdSet, storeIdSet, userIdSet }))
  const sessionIds = sessions.map((session) => session.id).filter(Boolean)
  const { data: turnRows } = sessionIds.length
    ? await admin
        .from("voice_coach_turns")
        .select("session_id, role, text, audio_seconds, turn_index, created_at")
        .in("session_id", sessionIds)
        .limit(15000)
    : { data: [] }

  const turnsBySession = new Map<string, any[]>()
  const secondsBySession = new Map<string, number>()
  for (const turn of turnRows || []) {
    const sessionId = String(turn.session_id)
    const list = turnsBySession.get(sessionId) || []
    list.push(turn)
    turnsBySession.set(sessionId, list)
    if (turn.role === "beautician") {
      secondsBySession.set(sessionId, (secondsBySession.get(sessionId) || 0) + Number(turn.audio_seconds || 0))
    }
  }

  let ledgerQuery = admin
    .from("mp_ai_point_ledger")
    .select("id, user_id, company_id, store_id, action_code, action_title, page_path, delta, balance_after, status, reason, created_at")
    .gte("created_at", startAt)
    .order("created_at", { ascending: false })
    .limit(2000)
  if (companyIdSet.size === 1) ledgerQuery = ledgerQuery.eq("company_id", Array.from(companyIdSet)[0])
  if (companyIdSet.size > 1) ledgerQuery = ledgerQuery.in("company_id", Array.from(companyIdSet))
  const { data: ledgerRows } = await ledgerQuery
  const ledger = ((ledgerRows || []) as any[]).filter((row) =>
    scopedLedger(row, {
      companyIdSet,
      storeIdSet,
      strictStoreScope: Boolean(args.strictStoreScope),
    }),
  )

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
    const profile = profileMap.get(String(session.user_id)) || {}
    const store = session.store_id ? storeMap.get(String(session.store_id)) : null
    const title = buildSessionTitle(session)
    const turns = turnsBySession.get(String(session.id)) || []
    const beauticianTurns = turns.filter((turn) => turn.role === "beautician")
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
    const profile = profileMap.get(String(membership.user_id)) || {}
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

  const storesWithStats = (stores || []).map((store: any) => {
    const stats = storeStats.get(String(store.id)) || {}
    const avgScore = stats.scored_count ? Math.round(stats.score_sum / stats.scored_count) : null
    const ownerMembership =
      memberships.find(
        (membership) =>
          membership.store_id === store.id && (membership.role === "store_owner" || membership.role === "store_admin"),
      ) || null
    const ownerProfile = ownerMembership ? profileMap.get(String(ownerMembership.user_id)) || {} : {}
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
      const profile = profileMap.get(String(item.user_id)) || {}
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
