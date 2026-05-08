import { NextRequest, NextResponse } from "next/server"

import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
  type MpAiBillingContext,
} from "@/lib/mp/ai-points.server"
import { generateGptImage2 } from "@/lib/posters/gpt-image-2.server"
import { trackServerEvent } from "@/lib/xhs/proxy.server"
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

function getNestedRecord(body: Record<string, unknown>, name: string) {
  const value = body[name]
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function compactText(value: string, max = 900) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function getFallbackCoverTitle(body: Record<string, unknown>) {
  const preExtracted = getNestedRecord(body, "preExtracted")
  const title =
    getTextField(body, ["coverTitle", "cover_title", "title"]) ||
    (preExtracted ? getTextField(preExtracted, ["title"]) : "")
  return title || "补水前先看这3点"
}

function buildPromptFromContent(body: Record<string, unknown>) {
  const content = getTextField(body, ["content", "resultContent", "body", "text"])
  if (!content) return ""

  const title = getFallbackCoverTitle(body)
  const preExtracted = getNestedRecord(body, "preExtracted")
  const rawKeywords = preExtracted?.keywords
  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8).join("、")
    : ""

  return [
    "画幅比例3:4竖版。",
    "为生活美容/皮肤管理小红书笔记生成一张可直接发布的首图封面。",
    "",
    "【必须原样显示的中文文字】",
    `主标题：${title}`,
    "副标题：不红不干，安心出门",
    "",
    "【根据正文提炼视觉】",
    compactText(content),
    keywords ? `参考关键词：${keywords}` : "",
    "",
    "【设计要求】",
    "选择 clean-info-card 或高级杂志信息卡方向，不要生成空白水彩模板。",
    "主标题必须最大、最清楚；副标题更小；手机端缩略图也能一眼读清。",
    "画面必须有明确设计层次：信息卡、细线分隔、材质背景或局部护理场景至少两项。",
    "暖米白/浅杏/奶油色为主，少量陶土色或薄荷绿点缀；高级、干净、专业，不要廉价促销感。",
    "不要人物脸、产品瓶、logo、二维码、电话、微信、价格、优惠、平台名。",
  ]
    .filter(Boolean)
    .join("\n")
}

function strengthenMiniProgramCoverPrompt(prompt: string) {
  return [
    prompt.trim(),
    "",
    "【小程序封面质量底线】",
    "这张图必须是完成度高的小红书首图设计，不是背景图。",
    "不要空白水彩模板、淡色抽象弧形堆叠、纯背景加大字、廉价Canva模板、素材站样图。",
    "必须有明确版式、文字层级、视觉焦点和美业质感；手机端缩略图里主标题也要清楚。",
    "如果标题是清单/几点/先看/判断标准，请做成高级信息卡或克制警示卡，而不是温柔空白海报。",
    "中文文字必须严格按提示词原样显示，不要错字、乱码、多余文字。",
  ].join("\n")
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
      // Fall back to prompt synthesis from the request content below.
    }
  }

  if (!prompt) {
    prompt = buildPromptFromContent(requestBody)
  }

  if (!prompt) {
    await refundCharge("xhs_cover_prompt_missing", "missing cover prompt/content")
    return NextResponse.json(
      { success: false, ok: false, error: "缺少封面提示词或正文内容，无法生成高质量封面" },
      { status: 400 }
    )
  }

  prompt = strengthenMiniProgramCoverPrompt(prompt)

  let json: UpstreamGenerateCoverResponse | null = null

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
      event: "mp_xhs_cover_gpt_image_fail",
      props: { source: "mp", message: message.slice(0, 180) },
    })

    await refundCharge("xhs_cover_gpt_image_failed", message)
    return NextResponse.json(
      { success: false, ok: false, error: `封面高质量生图失败：${message.slice(0, 240)}` },
      { status: 502 }
    )
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
