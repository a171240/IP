import { NextRequest, NextResponse } from "next/server"

import { buildXhsUpstreamUrl, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

type UpstreamDangerCheckData = {
  riskLevel?: unknown
  dangerCount?: unknown
  [key: string]: unknown
}

type UpstreamDangerCheckResponse = {
  data?: UpstreamDangerCheckData
  [key: string]: unknown
}

function getDraftId(body: Record<string, unknown>) {
  const v = body.draft_id ?? body.draftId
  return typeof v === "string" ? v.trim() : ""
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "无效的请求体" }, { status: 400 })
  }

  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  await trackServerEvent({ request, event: "xhs_danger_check_submit", props: { source: "mp", plan: billing.ctx.plan } })

  const upstream = await fetch(buildXhsUpstreamUrl("/api/content/danger-check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const text = await upstream.text().catch(() => "")
  if (!upstream.ok) {
    await trackServerEvent({ request, event: "xhs_danger_check_fail", props: { source: "mp", status: upstream.status } })
    return NextResponse.json(
      { success: false, error: "上游服务错误", status: upstream.status, details: text.slice(0, 600) },
      { status: 502 }
    )
  }

  try {
    const json = JSON.parse(text) as UpstreamDangerCheckResponse

    // Optional: persist risk info into xhs_drafts
    try {
      const draftId = getDraftId(body as Record<string, unknown>)
      if (draftId) {
        const danger = json?.data
        const riskLevel = typeof danger?.riskLevel === "string" ? danger.riskLevel : null
        const dangerCountRaw = danger?.dangerCount
        const dangerCount = Number.isFinite(Number(dangerCountRaw)) ? Number(dangerCountRaw) : null

        const now = new Date().toISOString()
        await billing.ctx.supabase
          .from("xhs_drafts")
          .update({
            danger_risk_level: riskLevel,
            danger_count: dangerCount,
            updated_at: now,
          })
          .eq("id", draftId)
          .eq("user_id", billing.ctx.userId)
      }
    } catch {
      // best-effort only
    }

    await trackServerEvent({ request, event: "xhs_danger_check_success", props: { source: "mp" } })
    return NextResponse.json(json)
  } catch {
    return NextResponse.json({ success: false, error: "上游返回非JSON" }, { status: 502 })
  }
}
