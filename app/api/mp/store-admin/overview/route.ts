import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
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

function localDayStartIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

function scoreOf(row: any) {
  const n = Number(row?.total_score ?? row?.report_json?.total_score)
  return Number.isFinite(n) ? Math.round(n) : null
}

function buildMemberProfileMap(rows: any[]) {
  const map = new Map<string, any>()
  for (const row of rows || []) map.set(String(row.id), row)
  return map
}

async function resolveStores(admin: any, ctx: any, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  if (!companyId) return { error: jsonError(400, "请先选择公司", "company_id_required") }

  let query = admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (ctx.isStoreManager && ctx.storeId) query = query.eq("id", ctx.storeId)
  if (requestedStoreId) query = query.eq("id", requestedStoreId)

  const { data, error } = await query
  if (error) return { error: jsonError(500, error.message, "stores_query_failed") }
  return { companyId, stores: data || [] }
}

export async function GET(request: NextRequest) {
  const auth = await requireStoreManagerContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const scope = await resolveStores(admin, auth.ctx, request)
  if ("error" in scope) return scope.error

  const storeIds = (scope.stores || []).map((store: any) => store.id).filter(Boolean)
  let membershipQuery = admin
    .from("mp_account_memberships")
    .select("id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at")
    .eq("company_id", scope.companyId)
    .eq("status", "active")

  if (auth.ctx.isStoreManager && auth.ctx.storeId) {
    membershipQuery = membershipQuery.eq("store_id", auth.ctx.storeId)
  }

  const { data: membershipRows, error: membershipError } = await membershipQuery
  if (membershipError) return jsonError(500, membershipError.message, "members_query_failed")

  const memberships = ((membershipRows || []) as any[]).filter((item) => item.role !== "service_operator")
  const userIds = Array.from(new Set(memberships.map((item) => item.user_id).filter(Boolean)))
  const { data: profileRows } = userIds.length
    ? await admin.from("profiles").select("id, nickname, avatar_url, email").in("id", userIds)
    : { data: [] }
  const profileMap = buildMemberProfileMap(profileRows || [])

  const dayStart = localDayStartIso()
  const { data: sessionRows, error: sessionError } = userIds.length
    ? await admin
        .from("voice_coach_sessions")
        .select("id, user_id, status, started_at, ended_at, total_score, report_json")
        .in("user_id", userIds)
        .gte("started_at", dayStart)
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
  const storesById = new Map<string, any>((scope.stores || []).map((store: any) => [String(store.id), store]))
  const membersPreview = storeMembers.slice(0, 6).map((item) => {
    const profile = profileMap.get(String(item.user_id)) || {}
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

  return NextResponse.json({
    ok: true,
    context: accountContextPayload(auth.ctx),
    stores: scope.stores || [],
    stats: {
      store_count: (scope.stores || []).length,
      member_count: storeMembers.length,
      today_session_count: sessions.length,
      today_completed_count: sessions.filter((item) => item.status === "ended" || item.report_json).length,
      today_practice_seconds: Math.round(practiceSeconds),
      today_avg_score: scoredCount ? Math.round(scoreSum / scoredCount) : null,
    },
    members_preview: membersPreview,
  })
}
