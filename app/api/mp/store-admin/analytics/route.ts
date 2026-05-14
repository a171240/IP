import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, requireStoreManagerContext } from "@/lib/mp/account-context.server"
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

export async function GET(request: NextRequest) {
  const auth = await requireStoreManagerContext(request)
  if (!auth.ok) return auth.error

  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  const days = parseAnalyticsDays(params.get("days"), 7)

  const companyId = auth.ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : auth.ctx.companyId
  if (!companyId) return jsonError(400, "当前账号缺少公司归属", "company_id_required")

  const admin = createAdminSupabaseClient()
  let storesQuery = admin
    .from("mp_stores")
    .select("id, company_id, name, status, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(300)

  if (auth.ctx.isStoreManager && auth.ctx.storeId) storesQuery = storesQuery.eq("id", auth.ctx.storeId)
  if (requestedStoreId) storesQuery = storesQuery.eq("id", requestedStoreId)

  const { data: stores, error: storesError } = await storesQuery
  if (storesError) return jsonError(500, storesError.message, "stores_query_failed")

  try {
    const analytics = await collectMpOrgAnalytics(admin, {
      companyIds: [companyId],
      storeIds: requestedStoreId ? [requestedStoreId] : auth.ctx.isStoreManager && auth.ctx.storeId ? [auth.ctx.storeId] : undefined,
      strictStoreScope: Boolean(requestedStoreId || auth.ctx.isStoreManager),
      stores: stores || [],
      days,
    })

    return NextResponse.json({
      ok: true,
      context: accountContextPayload(auth.ctx),
      ...analytics,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "analytics_query_failed", "analytics_query_failed")
  }
}
