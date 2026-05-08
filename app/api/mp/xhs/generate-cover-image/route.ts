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
import {
  buildBeautyContext,
  normalizeCoverAsset,
  XHS_COVER_PROMPT_VERSION,
  type BeautyConflictLevel,
  type BeautyXhsContentType,
} from "@/lib/xhs/beauty-knowledge"

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

type DraftCoverAsset = {
  prompt: string
  negativePrompt: string
  coverMain: string
  coverSub: string
  resultContent: string
  contentType: string
  topic: string
  keywords: string
  styleId: string
  styleReason: string
}

const ALT_STYLE_BY_CURRENT: Record<string, string> = {
  "premium-still-life": "editorial-magazine",
  "editorial-magazine": "premium-still-life",
  "contrast-warning-poster": "clean-info-card",
  "clean-info-card": "editorial-magazine",
  "warm-dialog-card": "editorial-magazine",
  "comparison-split-card": "premium-still-life",
  "lifestyle-spa-scene": "premium-still-life",
  "soft-minimal-poster": "editorial-magazine",
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
  return value === "1k" || value === "2k" || value === "4k" ? value : ""
}

function getNestedRecord(body: Record<string, unknown>, name: string) {
  const value = body[name]
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function compactText(value: string, max = 900) {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

const COVER_REFERENCE_CTA_LINE_RE =
  /(关注|私信|评论|留言|点击|收藏|点赞|转发|扫码|二维码|加微信|微信|VX|vx|领取|咨询|预约|进群|小程序|主页|链接|回复|下方|底部|立即进入|解锁)/i
const COVER_REFERENCE_CTA_WORD_RE =
  /(关注|私信|评论|留言|点击|收藏|点赞|转发|扫码|二维码|加微信|微信|VX|vx|领取|咨询|预约|进群|小程序|主页|链接|回复|下方|底部|立即进入|解锁)/gi

function sanitizeCoverReferenceText(value: string) {
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !COVER_REFERENCE_CTA_LINE_RE.test(line))
    .join(" ")
    .replace(COVER_REFERENCE_CTA_WORD_RE, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeContentType(value: string): BeautyXhsContentType {
  if (value === "education" || value === "promotion" || value === "comparison") return value
  return "treatment"
}

function normalizeConflictLevel(value: string): BeautyConflictLevel {
  if (value === "safe" || value === "hard") return value
  return "standard"
}

function isCurrentCoverPrompt(prompt: string) {
  return prompt.includes(XHS_COVER_PROMPT_VERSION)
}

function getFallbackCoverTitle(body: Record<string, unknown>, draft?: DraftCoverAsset | null) {
  const preExtracted = getNestedRecord(body, "preExtracted")
  const title =
    getTextField(body, ["coverTitle", "cover_title", "title"]) ||
    (preExtracted ? getTextField(preExtracted, ["title"]) : "") ||
    draft?.coverMain ||
    getTextField(body, ["resultTitle"]) ||
    draft?.topic
  return title || "补水前先看这3点"
}

function getFallbackCoverSub(body: Record<string, unknown>, draft?: DraftCoverAsset | null) {
  const preExtracted = getNestedRecord(body, "preExtracted")
  const sub =
    getTextField(body, ["coverSub", "coverSubtitle", "cover_sub", "cover_text_sub", "subTitle"]) ||
    (preExtracted ? getTextField(preExtracted, ["sub", "subtitle", "coverSub"]) : "") ||
    draft?.coverSub
  return sub || "少走弯路，安心护理"
}

function getKeywordText(body: Record<string, unknown>, draft?: DraftCoverAsset | null) {
  const preExtracted = getNestedRecord(body, "preExtracted")
  const rawKeywords = preExtracted?.keywords
  const fromArray = Array.isArray(rawKeywords)
    ? rawKeywords.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8).join("、")
    : ""
  return fromArray || getTextField(body, ["keywords"]) || draft?.keywords || ""
}

function getRequestedStyleId(body: Record<string, unknown>, draft?: DraftCoverAsset | null) {
  const requested = getTextField(body, ["coverStyleId", "cover_style_id", "styleId"])
  const avoid = getTextField(body, ["avoidStyleId", "avoid_style_id"])
  if (avoid) {
    if (requested && requested !== avoid) return requested
    return ALT_STYLE_BY_CURRENT[avoid] || ""
  }
  return requested || draft?.styleId || ""
}

function buildPromptFromContent(body: Record<string, unknown>, draft?: DraftCoverAsset | null) {
  const content = getTextField(body, ["content", "resultContent", "body", "text"]) || draft?.resultContent || ""
  const safeContent = sanitizeCoverReferenceText(content)
  const preExtracted = getNestedRecord(body, "preExtracted")
  const hasTitleSource = Boolean(
    getTextField(body, ["coverTitle", "cover_title", "title"]) ||
      (preExtracted ? getTextField(preExtracted, ["title"]) : "") ||
      draft?.coverMain ||
      getTextField(body, ["resultTitle"]) ||
      draft?.topic
  )
  if (!content && !hasTitleSource) {
    return { prompt: "", negativePrompt: "", styleId: "", styleLabel: "", styleReason: "" }
  }

  const title = getFallbackCoverTitle(body, draft)
  const sub = getFallbackCoverSub(body, draft)
  const keywords = getKeywordText(body, draft)
  const contentType = normalizeContentType(getTextField(body, ["contentType", "content_type"]) || draft?.contentType || "")
  const conflictLevel = normalizeConflictLevel(getTextField(body, ["conflictLevel", "conflict_level"]))
  const styleReason = getTextField(body, ["coverStyleReason", "cover_style_reason"]) || draft?.styleReason || ""
  const ctx = buildBeautyContext({
    contentType,
    conflictLevel,
    topic: [title, draft?.topic || "", compactText(content, 180)].filter(Boolean).join(" "),
    keywords,
  })
  const asset = normalizeCoverAsset({
    main: title,
    sub,
    prompt: null,
    negative: null,
    styleId: getRequestedStyleId(body, draft),
    styleReason,
    ctx,
  })

  return {
    prompt: [
      asset.prompt,
      "",
      safeContent ? "【正文参考，仅用于理解主题和情绪，不要把正文拆成小字放进画面】" : "",
      safeContent ? compactText(safeContent, 650) : "",
      keywords ? `参考关键词：${keywords}` : "",
    ].filter(Boolean).join("\n"),
    negativePrompt: asset.negative,
    styleId: asset.styleId,
    styleLabel: asset.styleLabel,
    styleReason: asset.styleReason,
  }
}

function strengthenMiniProgramCoverPrompt(prompt: string) {
  return [
    prompt.trim(),
    "",
    "【小程序封面质量底线】",
    "这张图必须是完成度高的小红书首图设计，不是背景图，也不是营销落地页。",
    "可以有人脸、护理场景、局部对比、少量清单或辅助说明，但画面底部必须保持干净。",
    "禁止底部导流组件、转化按钮、互动引导、私域联系方式、平台入口、可扫码联系元素。",
    "必须有明确视觉焦点、美业质感和手机端可读标题；中文文字不要错字、乱码。",
  ].join("\n")
}

function isRegenerateRequest(body: Record<string, unknown>) {
  return body.regenerate === true || body.action_code === "xhs.regenerate.cover" || body.actionCode === "xhs.regenerate.cover"
}

async function loadDraftCoverAsset(opts: {
  supabase: MpAiBillingContext["supabase"]
  userId: string
  draftId: string
}): Promise<DraftCoverAsset> {
  const { data } = await opts.supabase
    .from("xhs_drafts")
    .select("cover_prompt, cover_negative, cover_title, cover_text_main, cover_text_sub, result_title, result_content, content_type, topic, keywords, cover_style_id, cover_style_reason")
    .eq("id", opts.draftId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  return {
    prompt: typeof data?.cover_prompt === "string" ? data.cover_prompt.trim() : "",
    negativePrompt: typeof data?.cover_negative === "string" ? data.cover_negative.trim() : "",
    coverMain:
      typeof data?.cover_text_main === "string" && data.cover_text_main.trim()
        ? data.cover_text_main.trim()
        : typeof data?.cover_title === "string" && data.cover_title.trim()
          ? data.cover_title.trim()
          : typeof data?.result_title === "string"
            ? data.result_title.trim()
            : "",
    coverSub: typeof data?.cover_text_sub === "string" ? data.cover_text_sub.trim() : "",
    resultContent: typeof data?.result_content === "string" ? data.result_content.trim() : "",
    contentType: typeof data?.content_type === "string" ? data.content_type.trim() : "",
    topic: typeof data?.topic === "string" ? data.topic.trim() : "",
    keywords:
      typeof data?.keywords === "string"
        ? data.keywords.trim()
        : Array.isArray(data?.keywords)
          ? data.keywords.map((item) => String(item || "").trim()).filter(Boolean).join("、")
          : "",
    styleId: typeof data?.cover_style_id === "string" ? data.cover_style_id.trim() : "",
    styleReason: typeof data?.cover_style_reason === "string" ? data.cover_style_reason.trim() : "",
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
      resolution: "default",
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

  const incomingPrompt = getTextField(requestBody, ["prompt", "coverPrompt", "cover_prompt"])
  const size = normalizeSize(getTextField(requestBody, ["size"]) || "3:4")
  const resolution = normalizeResolution("")

  let draftAsset: DraftCoverAsset | null = null
  if (draftId) {
    try {
      draftAsset = await loadDraftCoverAsset({
        supabase: billing.ctx.supabase,
        userId: billing.ctx.userId,
        draftId,
      })
    } catch {
      // Fall back to prompt synthesis from the request content below.
    }
  }

  const coverAsset = buildPromptFromContent(requestBody, draftAsset)
  let prompt = coverAsset.prompt
  let negativePrompt = coverAsset.negativePrompt

  if (!prompt && isCurrentCoverPrompt(incomingPrompt)) {
    prompt = incomingPrompt
    negativePrompt =
      getTextField(requestBody, ["negativePrompt", "coverNegative", "cover_negative"]) ||
      draftAsset?.negativePrompt ||
      negativePrompt
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
    const generated = await generateGptImage2({
      prompt,
      negativePrompt,
      size,
      ...(resolution ? { resolution } : {}),
    })
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
      { success: false, ok: false, error: `封面生图失败：${message.slice(0, 240)}` },
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
          cover_prompt: prompt,
          cover_negative: negativePrompt,
          cover_style_id: coverAsset.styleId || null,
          cover_style_label: coverAsset.styleLabel || null,
          cover_style_reason: coverAsset.styleReason || null,
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
