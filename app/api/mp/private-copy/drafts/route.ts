import { NextRequest, NextResponse } from "next/server"

import { resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import { PRIVATE_COPY_MODULES } from "@/lib/private-copy/types"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const url = new URL(request.url)
  const moduleParam = url.searchParams.get("module") || ""
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20))

  let query = billing.ctx.supabase
    .from("private_copy_drafts")
    .select("id, created_at, updated_at, module, status, risk_level, risk_flags, preview_text")
    .eq("user_id", billing.ctx.userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if ((PRIVATE_COPY_MODULES as readonly string[]).includes(moduleParam)) {
    query = query.eq("module", moduleParam)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, drafts: data || [] })
}
