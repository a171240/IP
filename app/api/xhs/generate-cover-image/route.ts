import { NextRequest, NextResponse } from "next/server"

import { buildXhsUpstreamUrl, chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import { uploadDataUrlAsset, uploadRemoteAsset } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

type UpstreamGenerateCoverResponse = {
  success?: boolean
  imageBase64?: string | null
  imageUrl?: string | null
  [key: string]: unknown
}

function getDraftId(body: Record<string, unknown>) {
  const v = body.draft_id ?? body.draftId
  return typeof v === "string" ? v.trim() : ""
}

function isDataUrl(value: string) {
  return value.startsWith("data:")
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
    requiredPlan: "basic",
    allowCreditsOverride: true,
    baseCost: 2,
    stepId: "xhs:generate-cover",
  })
  if (!charged.ok) return charged.error

  await trackServerEvent({
    request,
    event: "xhs_cover_submit",
    props: { source: "mp", cost: charged.cost, plan: billing.ctx.plan, planOk: charged.planOk },
  })

  const upstream = await fetch(buildXhsUpstreamUrl("/api/generate-cover-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const text = await upstream.text().catch(() => "")
  if (!upstream.ok) {
    await trackServerEvent({ request, event: "xhs_cover_fail", props: { source: "mp", status: upstream.status } })
    return NextResponse.json(
      { success: false, error: "上游服务错误", status: upstream.status, details: text.slice(0, 600) },
      { status: 502 }
    )
  }

  let json: UpstreamGenerateCoverResponse
  try {
    json = JSON.parse(text) as UpstreamGenerateCoverResponse
  } catch {
    return NextResponse.json({ success: false, error: "上游返回非JSON" }, { status: 502 })
  }

  // Optional: store cover into Supabase Storage so mini-program can load it via single domain.
  try {
    const draftId = getDraftId(body as Record<string, unknown>)
    const imageCandidate =
      (typeof json?.imageBase64 === "string" && json.imageBase64.trim())
        ? json.imageBase64.trim()
        : (typeof json?.imageUrl === "string" ? json.imageUrl.trim() : "")

    if (draftId && json?.success === true && imageCandidate) {
      const uploaded = isDataUrl(imageCandidate)
        ? await uploadDataUrlAsset({
            userId: billing.ctx.userId,
            draftId,
            kind: "cover",
            dataUrl: imageCandidate,
          })
        : await uploadRemoteAsset({
            userId: billing.ctx.userId,
            draftId,
            kind: "cover",
            url: imageCandidate,
          })

      const now = new Date().toISOString()
      await billing.ctx.supabase
        .from("xhs_drafts")
        .update({
          cover_storage_path: uploaded.path,
          cover_content_type: uploaded.contentType,
          updated_at: now,
        })
        .eq("id", draftId)
        .eq("user_id", billing.ctx.userId)

      // Replace the huge base64 with a single-domain URL.
      json.imageUrl = `/api/mp/xhs/covers/${draftId}`
      json.imageBase64 = null
    }
  } catch {
    // best-effort only
  }

  await trackServerEvent({ request, event: "xhs_cover_success", props: { source: "mp", cost: charged.cost } })

  const res = NextResponse.json(json)
  res.headers.set("X-Credits-Cost", String(charged.cost))
  res.headers.set("X-Credits-Remaining", charged.unlimited ? "unlimited" : String(charged.remaining))
  res.headers.set("X-Credits-Unlimited", charged.unlimited ? "1" : "0")
  return res
}
