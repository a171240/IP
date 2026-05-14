import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  getMpAccountRoleLabel,
  requireStoreManagerContext,
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

function dayStartIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

function scoreOf(row: any) {
  const n = Number(row?.total_score ?? row?.report_json?.total_score)
  return Number.isFinite(n) ? Math.round(n) : null
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreManagerContext(request)
  if (!auth.ok) return auth.error

  const params = new URL(request.url).searchParams
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const admin = createAdminSupabaseClient()
  const companyId = auth.ctx.companyId
  if (!companyId && !auth.ctx.isPlatformAdmin) return jsonError(400, "当前账号缺少公司归属", "company_id_required")

  let storesQuery = admin
    .from("mp_stores")
    .select("id, company_id, name, status")
    .eq("status", "active")

  if (companyId) storesQuery = storesQuery.eq("company_id", companyId)
  if (auth.ctx.isStoreManager && auth.ctx.storeId) storesQuery = storesQuery.eq("id", auth.ctx.storeId)
  if (requestedStoreId) storesQuery = storesQuery.eq("id", requestedStoreId)

  const { data: storeRows, error: storesError } = await storesQuery
  if (storesError) return jsonError(500, storesError.message, "stores_query_failed")

  const storeIds = (storeRows || []).map((store: any) => store.id).filter(Boolean)
  const storeMap = new Map((storeRows || []).map((store: any) => [String(store.id), store]))

  let membershipQuery = admin
    .from("mp_account_memberships")
    .select("id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at")
    .order("created_at", { ascending: false })

  if (companyId) membershipQuery = membershipQuery.eq("company_id", companyId)
  if (auth.ctx.isStoreManager && auth.ctx.storeId) membershipQuery = membershipQuery.eq("store_id", auth.ctx.storeId)
  if (requestedStoreId) membershipQuery = membershipQuery.eq("store_id", requestedStoreId)

  const { data: membershipRows, error: membershipError } = await membershipQuery
  if (membershipError) return jsonError(500, membershipError.message, "members_query_failed")

  const scopedRows = ((membershipRows || []) as any[]).filter((row) => {
    if (!row.store_id) return auth.ctx.isCompanyManager || auth.ctx.isPlatformAdmin
    if (!storeIds.length) return false
    return storeIds.includes(row.store_id)
  })

  const userIds = Array.from(new Set(scopedRows.map((row) => row.user_id).filter(Boolean)))
  const { data: profileRows } = userIds.length
    ? await admin.from("profiles").select("id, nickname, avatar_url, email").in("id", userIds)
    : { data: [] }
  const profileMap = new Map((profileRows || []).map((row: any) => [String(row.id), row]))

  const { data: sessionRows, error: sessionError } = userIds.length
    ? await admin
        .from("voice_coach_sessions")
        .select("id, user_id, status, started_at, ended_at, total_score, report_json")
        .in("user_id", userIds)
        .gte("started_at", dayStartIso())
        .limit(1000)
    : { data: [], error: null }

  if (sessionError) return jsonError(500, sessionError.message, "sessions_query_failed")

  const sessions = (sessionRows || []) as any[]
  const sessionIds = sessions.map((item) => item.id).filter(Boolean)
  const { data: turnRows } = sessionIds.length
    ? await admin
        .from("voice_coach_turns")
        .select("session_id, role, audio_seconds")
        .in("session_id", sessionIds)
        .eq("role", "beautician")
        .limit(3000)
    : { data: [] }

  const secondsBySession = new Map<string, number>()
  for (const turn of turnRows || []) {
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
    const profile = profileMap.get(String(row.user_id)) || {}
    const store = row.store_id ? storeMap.get(String(row.store_id)) : null
    const stats = statsByUser.get(String(row.user_id)) || {}
    return {
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      role_label: getMpAccountRoleLabel(row.role),
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

  return NextResponse.json({
    ok: true,
    context: accountContextPayload(auth.ctx),
    stores: storeRows || [],
    members,
  })
}
