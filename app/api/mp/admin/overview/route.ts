import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, requirePlatformAdminContext } from "@/lib/mp/account-context.server"
import { collectMpOrgAnalytics, parseAnalyticsDays } from "@/lib/mp/org-analytics.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function cleanText(value: unknown, max = 120) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const params = new URL(request.url).searchParams
  const companyId = cleanText(params.get("company_id"), 80)
  const days = parseAnalyticsDays(params.get("days"), 7)
  const admin = createAdminSupabaseClient()

  let companiesQuery = admin
    .from("mp_companies")
    .select("id, name, owner_user_id, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)
  if (companyId) companiesQuery = companiesQuery.eq("id", companyId)

  let storesQuery = admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (companyId) storesQuery = storesQuery.eq("company_id", companyId)

  const [companiesResult, storesResult] = await Promise.all([companiesQuery, storesQuery])
  if (companiesResult.error) return jsonError(500, companiesResult.error.message, "companies_query_failed")
  if (storesResult.error) return jsonError(500, storesResult.error.message, "stores_query_failed")

  const companies = companiesResult.data || []
  const stores = storesResult.data || []
  const companyIds = companyId ? [companyId] : companies.map((company: any) => company.id).filter(Boolean)

  try {
    const analytics = await collectMpOrgAnalytics(admin, {
      companyIds,
      stores,
      days,
    })

    const ownerIds = Array.from(new Set(companies.map((company: any) => company.owner_user_id).filter(Boolean)))
    const { data: ownerRows } = ownerIds.length
      ? await admin
          .from("profiles")
          .select("id, nickname, email, avatar_url, credits_balance, credits_unlimited, service_plan_label")
          .in("id", ownerIds)
      : { data: [] }
    const ownerMap = new Map((ownerRows || []).map((row: any) => [String(row.id), row]))
    const storeStatsMap = new Map((analytics.stores || []).map((store: any) => [String(store.id), store]))

    const companiesWithStats = companies.map((company: any) => {
      const companyStores = stores.filter((store: any) => store.company_id === company.id)
      const storeStats = companyStores.map((store: any) => storeStatsMap.get(String(store.id)) || {})
      const owner = company.owner_user_id ? ownerMap.get(String(company.owner_user_id)) : null
      const scoreValues = storeStats.map((store: any) => Number(store.avg_score)).filter((score) => Number.isFinite(score))
      return {
        ...company,
        owner_display_name: firstText(owner?.nickname, owner?.email, company.owner_user_id, "未设置"),
        owner_credits_balance: owner ? Number(owner.credits_balance || 0) : null,
        owner_credits_unlimited: Boolean(owner?.credits_unlimited),
        service_plan_label: owner?.service_plan_label || "",
        store_count: companyStores.length,
        member_count: storeStats.reduce((sum: number, store: any) => sum + Number(store.member_count || 0), 0),
        active_member_count: storeStats.reduce((sum: number, store: any) => sum + Number(store.active_member_count || 0), 0),
        session_count: storeStats.reduce((sum: number, store: any) => sum + Number(store.session_count || 0), 0),
        practice_seconds: storeStats.reduce((sum: number, store: any) => sum + Number(store.practice_seconds || 0), 0),
        avg_score: scoreValues.length ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length) : null,
        ai_points_spent: storeStats.reduce((sum: number, store: any) => sum + Number(store.ai_points_spent || 0), 0),
      }
    })

    return NextResponse.json({
      ok: true,
      context: accountContextPayload(auth.ctx),
      companies: companiesWithStats,
      stores: analytics.stores,
      stats: {
        company_count: companies.length,
        store_count: stores.length,
        ...analytics.stats,
      },
      range: analytics.range,
      daily: analytics.daily,
      recent_sessions: analytics.recent_sessions,
      ai_ledger: analytics.ai_ledger,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "overview_query_failed", "overview_query_failed")
  }
}
