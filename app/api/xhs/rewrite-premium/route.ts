import { NextRequest, NextResponse } from "next/server"

import { buildXhsUpstreamUrl, chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

function parseLastSseEvent(rawText: string) {
  if (!rawText || typeof rawText !== "string") return null

  const lines = rawText.split("\n")
  let lastEvent: unknown = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue

    const payload = trimmed.replace(/^data:\s*/, "")
    if (!payload || payload === "[DONE]") continue

    try {
      lastEvent = JSON.parse(payload)
    } catch {
      // Ignore partial JSON chunks.
    }
  }

  return lastEvent
}

function getDraftId(body: Record<string, unknown>) {
  const v = body.draft_id ?? body.draftId
  return typeof v === "string" ? v.trim() : ""
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 })
  }

  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const charged = await chargeCredits({
    request,
    ctx: billing.ctx,
    requiredPlan: "basic",
    allowCreditsOverride: true,
    baseCost: 3,
    stepId: "xhs:rewrite-premium",
  })
  if (!charged.ok) return charged.error

  await trackServerEvent({
    request,
    event: "xhs_generate_submit",
    props: {
      source: "mp",
      cost: charged.cost,
      plan: billing.ctx.plan,
      planOk: charged.planOk,
      contentType: (body as { contentType?: unknown }).contentType,
    },
  })

  const upstream = await fetch(buildXhsUpstreamUrl("/api/rewrite-premium"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const upstreamText = await upstream.text().catch(() => "")

  if (!upstream.ok) {
    await trackServerEvent({
      request,
      event: "xhs_generate_fail",
      props: { source: "mp", status: upstream.status },
    })

    return NextResponse.json(
      { error: "上游服务错误", status: upstream.status, details: upstreamText.slice(0, 600) },
      { status: 502 }
    )
  }

  // Optional: persist to xhs_drafts when draft_id is provided by the client.
  try {
    const draftId = getDraftId(body as Record<string, unknown>)
    if (draftId) {
      const lastEvent = parseLastSseEvent(upstreamText)
      const result = (lastEvent as { data?: unknown } | null)?.data ?? lastEvent
      const r = (result || {}) as Record<string, unknown>

      const title = typeof r.title === "string" ? r.title : null
      const content = typeof r.content === "string" ? r.content : null
      const coverTitle = typeof r.coverTitle === "string" ? r.coverTitle : null
      const tags = Array.isArray(r.tags) ? r.tags : null

      const now = new Date().toISOString()

      await billing.ctx.supabase
        .from("xhs_drafts")
        .update({
          content_type:
            typeof (body as { contentType?: unknown }).contentType === "string"
              ? (body as { contentType: string }).contentType
              : null,
          topic: typeof (body as { topic?: unknown }).topic === "string" ? (body as { topic: string }).topic : null,
          keywords:
            typeof (body as { keywords?: unknown }).keywords === "string" ? (body as { keywords: string }).keywords : null,
          shop_name:
            typeof (body as { shopName?: unknown }).shopName === "string" ? (body as { shopName: string }).shopName : null,
          result_title: title,
          result_content: content,
          cover_title: coverTitle,
          tags,
          credits_cost: charged.cost,
          plan_at_generate: billing.ctx.plan,
          updated_at: now,
        })
        .eq("id", draftId)
        .eq("user_id", billing.ctx.userId)
    }
  } catch {
    // Best-effort only.
  }

  const headers = new Headers()
  headers.set("Content-Type", upstream.headers.get("content-type") || "text/plain; charset=utf-8")
  headers.set("Cache-Control", "no-cache")
  headers.set("Connection", "keep-alive")
  headers.set("X-Credits-Cost", String(charged.cost))
  headers.set("X-Credits-Remaining", charged.unlimited ? "unlimited" : String(charged.remaining))
  headers.set("X-Credits-Unlimited", charged.unlimited ? "1" : "0")

  await trackServerEvent({
    request,
    event: "xhs_generate_proxy_ok",
    props: { source: "mp", cost: charged.cost },
  })

  return new Response(upstreamText, { status: 200, headers })
}
