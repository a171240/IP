import { NextRequest, NextResponse } from "next/server"

import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
  type MpAiBillingContext,
} from "@/lib/mp/ai-points.server"
import { generateGptImage2 } from "@/lib/posters/gpt-image-2.server"
import { buildXhsUpstreamUrl, trackServerEvent } from "@/lib/xhs/proxy.server"
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

function isRegenerateRequest(body: Record<string, unknown>) {
  return body.regenerate === true || body.action_code === "xhs.regenerate.cover" || body.actionCode === "xhs.regenerate.cover"
}

async function loadDraftCoverAsset(opts: {
  supabase: MpAiBillingContext["supabase"]
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
    return NextResponse.json({ success: false, ok: false, error: "无效的请求体" }, { status: 400 })
  }

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const requestBody = body as Record<string, unknown>
  const draftId = getDraftId(requestBody)
  const actionCode = isRegenerateRequest(requestBody) ? "xhs.regenerate.cover" : "xhs.generate.cover"

  const charged = await chargeMpAiPoints({
    request,
    ctx: billing.ctx,
    actionCode,
    businessObjectType: "xhs_draft",
    businessObjectId: draftId || undefined,
    metadata: {
      size: getTextField(requestBody, ["size"]) || "3:4",
      resolution: getTextField(requestBody, ["resolution"]) || "2k",
    },
  })
  if (!charged.ok) return charged.error

  const refundCharge = async (reason: string, message: string) => {
    await refundMpAiPoints({
      ctx: billing.ctx,
      charge: charged,
      reason,
      metadata: { draft_id: draftId || null, error: message.slice(0, 200) },
    }).catch(() => null)
  }

  await trackServerEvent({
    request,
    event: "mp_xhs_cover_submit",
    props: { source: "mp", cost: charged.cost, actionCode: charged.actionCode, plan: billing.ctx.plan },
  })

  let prompt = getTextField(requestBody, ["prompt", "coverPrompt", "cover_prompt"])
  let negativePrompt = getTextField(requestBody, ["negativePrompt", "coverNegative", "cover_negative"])
  const size = normalizeSize(getTextField(requestBody, ["size"]) || "3:4")
  const resolution = normalizeResolution(getTextField(requestBody, ["resolution"]) || "2k")

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
        source: "gpt-image-2",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "image_failed")
      await trackServerEvent({
        request,
        event: "mp_xhs_cover_gpt_image_fail",
        props: { source: "mp", message: message.slice(0, 180) },
      })

      if (!message.includes("APIMART_API_KEY missing")) {
        await refundCharge("xhs_cover_gpt_image_failed", message)
        return NextResponse.json(
          { success: false, ok: false, error: `GPT-Image-2生成失败：${message.slice(0, 240)}` },
          { status: 502 }
        )
      }
    }
  }

  if (!json) {
    const upstream = await requestUpstreamCover(requestBody)
    if (!upstream.ok) {
      await trackServerEvent({ request, event: "mp_xhs_cover_fail", props: { source: "mp", status: upstream.status } })
      await refundCharge("xhs_cover_upstream_failed", upstream.text || String(upstream.status))
      return NextResponse.json(
        {
          success: false,
          ok: false,
          error: upstream.status === 502 ? upstream.text : "上游服务错误",
          status: upstream.status,
          details: upstream.text.slice(0, 600),
        },
        { status: 502 }
      )
    }
    json = upstream.json
  }

  if (json && json.success !== undefined && !json.success) {
    const message = typeof json.error === "string" ? json.error : "封面生成失败"
    await refundCharge("xhs_cover_result_failed", message)
    return NextResponse.json({ ...json, ok: false }, { status: 502 })
  }

  try {
    const imageCandidate =
      typeof json?.imageBase64 === "string" && json.imageBase64.trim()
        ? json.imageBase64.trim()
        : typeof json?.imageUrl === "string"
          ? json.imageUrl.trim()
          : ""

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

      json.imageUrl = `/api/mp/xhs/covers/${draftId}`
      json.imageBase64 = null
    }
  } catch {
    // Storage is best-effort; the generated remote URL is still returned.
  }

  await trackServerEvent({
    request,
    event: "mp_xhs_cover_success",
    props: { source: "mp", cost: charged.cost, actionCode: charged.actionCode },
  })

  const res = NextResponse.json({ ...json, ok: json?.success !== false })
  setMpAiPointHeaders(res, charged)
  return res
}
