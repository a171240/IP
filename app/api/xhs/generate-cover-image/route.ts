import { NextRequest, NextResponse } from "next/server"

import { generateGptImage2 } from "@/lib/posters/gpt-image-2.server"
import type { BillingContext } from "@/lib/xhs/proxy.server"
import { buildXhsUpstreamUrl, chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import { uploadDataUrlAsset, uploadRemoteAsset } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

type UpstreamGenerateCoverResponse = {
  success?: boolean
  imageBase64?: string | null
  imageUrl?: string | null
  prompt?: string | null
  negativePrompt?: string | null
  source?: string | null
  [key: string]: unknown
}

function getDraftId(body: Record<string, unknown>) {
  const v = body.draft_id ?? body.draftId
  return typeof v === "string" ? v.trim() : ""
}

function isDataUrl(value: string) {
  return value.startsWith("data:")
}

function getTextField(body: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const v = body[name]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function normalizeSize(value: string) {
  const allowed = new Set(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])
  return allowed.has(value) ? value : "3:4"
}

function normalizeResolution(value: string) {
  return value === "1k" || value === "2k" || value === "4k" ? value : "2k"
}

async function loadDraftCoverAsset(opts: {
  supabase: BillingContext["supabase"]
  userId: string
  draftId: string
}) {
  const { data } = await opts.supabase
    .from("xhs_drafts")
    .select("cover_prompt, cover_negative")
    .eq("id", opts.draftId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  return {
    prompt: typeof data?.cover_prompt === "string" ? data.cover_prompt.trim() : "",
    negativePrompt: typeof data?.cover_negative === "string" ? data.cover_negative.trim() : "",
  }
}

async function requestUpstreamCover(body: Record<string, unknown>) {
  const upstream = await fetch(buildXhsUpstreamUrl("/api/generate-cover-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const text = await upstream.text().catch(() => "")
  if (!upstream.ok) {
    return { ok: false as const, status: upstream.status, text }
  }

  try {
    return { ok: true as const, json: JSON.parse(text) as UpstreamGenerateCoverResponse }
  } catch {
    return { ok: false as const, status: 502, text: "上游返回非JSON" }
  }
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

  const requestBody = body as Record<string, unknown>
  let prompt = getTextField(requestBody, ["prompt", "coverPrompt", "cover_prompt"])
  let negativePrompt = getTextField(requestBody, ["negativePrompt", "coverNegative", "cover_negative"])
  const size = normalizeSize(getTextField(requestBody, ["size"]) || "3:4")
  const resolution = normalizeResolution(getTextField(requestBody, ["resolution"]) || "2k")
  const draftId = getDraftId(requestBody)

  if (!prompt && draftId) {
    try {
      const draftAsset = await loadDraftCoverAsset({
        supabase: billing.ctx.supabase,
        userId: billing.ctx.userId,
        draftId,
      })
      prompt = draftAsset.prompt
      negativePrompt = negativePrompt || draftAsset.negativePrompt
    } catch {
      // Keep compatibility fallback below.
    }
  }

  let json: UpstreamGenerateCoverResponse | null = null

  if (prompt) {
    try {
      const generated = await generateGptImage2({ prompt, negativePrompt, size, resolution })
      json = {
        success: true,
        imageUrl: generated.imageUrl,
        imageBase64: null,
        prompt,
        negativePrompt,
        model: generated.model,
        source: generated.model,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "image_failed")
      await trackServerEvent({
        request,
        event: "xhs_cover_gpt_image_fail",
        props: { source: "mp", message: message.slice(0, 180) },
      })

      // Missing local/staging image keys can still use the old service as a compatibility fallback.
      if (!message.includes("APIMART_API_KEY missing")) {
        return NextResponse.json(
          { success: false, error: `GPT Image生成失败：${message.slice(0, 240)}` },
          { status: 502 }
        )
      }
    }
  }

  if (!json) {
    const upstream = await requestUpstreamCover(requestBody)
    if (!upstream.ok) {
      await trackServerEvent({ request, event: "xhs_cover_fail", props: { source: "mp", status: upstream.status } })
      return NextResponse.json(
        {
          success: false,
          error: upstream.status === 502 ? upstream.text : "上游服务错误",
          status: upstream.status,
          details: upstream.text.slice(0, 600),
        },
        { status: 502 }
      )
    }
    json = upstream.json
  }

  // Optional: store cover into Supabase Storage so mini-program can load it via single domain.
  try {
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
