import { NextRequest, NextResponse } from "next/server"

import { buildXhsUpstreamUrl, chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import { uploadRemoteAsset } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

type UpstreamPublishNoteData = {
  publishUrl?: string | null
  qrImageUrl?: string | null
  [key: string]: unknown
}

type UpstreamPublishNoteResponse = {
  success?: boolean
  data?: UpstreamPublishNoteData
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

  const charged = await chargeCredits({
    request,
    ctx: billing.ctx,
    requiredPlan: "pro",
    allowCreditsOverride: true,
    baseCost: 4,
    stepId: "xhs:publish-note",
  })
  if (!charged.ok) return charged.error

  await trackServerEvent({
    request,
    event: "xhs_publish_submit",
    props: { source: "mp", cost: charged.cost, plan: billing.ctx.plan, planOk: charged.planOk },
  })

  const upstream = await fetch(buildXhsUpstreamUrl("/api/publish-note"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const text = await upstream.text().catch(() => "")
  if (!upstream.ok) {
    await trackServerEvent({ request, event: "xhs_publish_fail", props: { source: "mp", status: upstream.status } })
    return NextResponse.json(
      { success: false, error: "上游服务错误", status: upstream.status, details: text.slice(0, 600) },
      { status: 502 }
    )
  }

  let json: UpstreamPublishNoteResponse
  try {
    json = JSON.parse(text) as UpstreamPublishNoteResponse
  } catch {
    return NextResponse.json({ success: false, error: "上游返回非JSON" }, { status: 502 })
  }

  // Optional: persist publish info (and proxy QR image under a single domain)
  try {
    const draftId = getDraftId(body as Record<string, unknown>)
    if (draftId && json?.success === true) {
      const data = json?.data || {}
      const publishUrl = typeof data.publishUrl === "string" ? data.publishUrl : null

      const qrImageUrl = typeof data.qrImageUrl === "string" ? data.qrImageUrl : null

      const now = new Date().toISOString()

      // Store original QR url for fallback proxying.
      await billing.ctx.supabase
        .from("xhs_drafts")
        .update({
          publish_url: publishUrl,
          publish_qr_url: qrImageUrl,
          status: "published",
          published_at: now,
          credits_cost: charged.cost,
          plan_at_generate: billing.ctx.plan,
          updated_at: now,
        })
        .eq("id", draftId)
        .eq("user_id", billing.ctx.userId)

      if (qrImageUrl) {
        try {
          const uploaded = await uploadRemoteAsset({
            userId: billing.ctx.userId,
            draftId,
            kind: "qr",
            url: qrImageUrl,
          })

          await billing.ctx.supabase
            .from("xhs_drafts")
            .update({
              publish_qr_storage_path: uploaded.path,
              publish_qr_content_type: uploaded.contentType,
              updated_at: now,
            })
            .eq("id", draftId)
            .eq("user_id", billing.ctx.userId)
        } catch {
          // ignore upload errors; qrs endpoint can proxy publish_qr_url as fallback
        }

        // Always return a single-domain QR URL.
        data.qrImageUrl = `/api/mp/xhs/qrs/${draftId}`
        json.data = data
      }
    }
  } catch {
    // best-effort only
  }

  await trackServerEvent({ request, event: "xhs_publish_success", props: { source: "mp", cost: charged.cost } })

  const res = NextResponse.json(json, { status: upstream.status })
  res.headers.set("X-Credits-Cost", String(charged.cost))
  res.headers.set("X-Credits-Remaining", charged.unlimited ? "unlimited" : String(charged.remaining))
  res.headers.set("X-Credits-Unlimited", charged.unlimited ? "1" : "0")
  return res
}
