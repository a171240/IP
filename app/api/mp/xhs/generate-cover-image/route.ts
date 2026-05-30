import { NextRequest, NextResponse } from "next/server"

import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
  type MpAiBillingContext,
} from "@/lib/mp/ai-points.server"
import {
  generateGptImage2,
  imageGenerationErrorStatus,
  publicImageGenerationErrorMessage,
} from "@/lib/posters/gpt-image-2.server"
import { trackServerEvent } from "@/lib/xhs/proxy.server"
import { downloadAsset, getXhsAssetsBucket, uploadDataUrlAsset, uploadRemoteAsset } from "@/lib/xhs/assets.server"
import { xhsCoverUrl, xhsCoverVersion } from "@/lib/xhs/cover-url"
import {
  buildBeautyContext,
  normalizeCoverAsset,
  XHS_COVER_PROMPT_VERSION,
  type BeautyConflictLevel,
  type BeautyXhsContentType,
} from "@/lib/xhs/beauty-knowledge"

export const runtime = "nodejs"
export const maxDuration = 300

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
  coverPoints: string[]
  styleId: string
  styleReason: string
}

type CoverReferenceKind = "style" | "logo" | "store" | "product" | "people"

type CoverReferenceAsset = {
  kind: CoverReferenceKind
  bucket: string
  path: string
  contentType: string
  usage?: string
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
const MAX_COVER_POINTS = 4

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

function getStringArrayField(body: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = body[name]
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean)
    }
  }
  return []
}

function normalizeCoverPointLabel(value: string) {
  const raw = String(value || "")
    .replace(/^\s*(?:[①②③④]|[1-4][、.)）]|第[一二三四1234][点条项]?)\s*/, "")
    .trim()
  const quoted = raw.match(/[“「『"]([^”」』"]{2,12})[”」』"]/)
  const candidate = (quoted?.[1] || raw.split(/[。！？!?；;：:，,]/)[0] || raw)
    .replace(/^(先|再)?看/, "")
    .replace(/^先确认/, "确认")
    .replace(/有没有/g, "")
    .replace(/会不会/g, "不")
    .replace(/是不是真的/g, "")
    .replace(/是否/g, "")
    .replace(/\s+/g, "")
    .trim()
  return sanitizeCoverReferenceText(candidate).slice(0, 14)
}

function normalizeCoverPointList(points: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const point of points) {
    const label = normalizeCoverPointLabel(point)
    if (!label || seen.has(label)) continue
    seen.add(label)
    result.push(label)
    if (result.length >= MAX_COVER_POINTS) break
  }
  return result
}

function extractCoverPointsFromContent(content: string) {
  const lines = String(content || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const sectionLines = lines.filter((line) =>
    /^\s*(?:[①②③④]|[1-4][、.)）]|第[一二三四1234][点条项]?)/.test(line)
  )
  return normalizeCoverPointList(sectionLines)
}

function inferPointCountFromText(text: string) {
  const match = String(text || "").match(/([2-4两二三四])\s*(?:个)?(?:点|条|项|种)/)
  if (!match) return 0
  const value = match[1]
  if (value === "2" || value === "两" || value === "二") return 2
  if (value === "3" || value === "三") return 3
  if (value === "4" || value === "四") return 4
  return 0
}

function getCoverPoints(body: Record<string, unknown>, draft?: DraftCoverAsset | null, content = "") {
  const preExtracted = getNestedRecord(body, "preExtracted")
  const direct = getStringArrayField(body, ["coverPoints", "cover_points"])
  if (direct.length) return normalizeCoverPointList(direct)
  if (preExtracted) {
    const points = normalizeCoverPointList(getStringArrayField(preExtracted, ["points", "coverPoints", "cover_points"]))
    if (points.length) return points
  }
  if (draft?.coverPoints?.length) return normalizeCoverPointList(draft.coverPoints)
  return extractCoverPointsFromContent(content)
}

function normalizeCoverDensity(value: string) {
  if (value === "simple" || value === "rich") return value
  return "balanced"
}

function coverPointTarget(density: string, text = "", availableCount = 0) {
  if (density === "simple") return 0
  if (availableCount) return Math.min(MAX_COVER_POINTS, availableCount)
  const inferred = inferPointCountFromText(text)
  if (inferred) return inferred
  if (density === "rich") return 4
  return 2
}

function normalizeAssetRefs(value: unknown): CoverReferenceAsset[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<CoverReferenceKind>(["style", "logo", "store", "product", "people"])
  const refs: CoverReferenceAsset[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const item = raw as Record<string, unknown>
    const kind = String(item.kind || "").trim() as CoverReferenceKind
    const bucket = String(item.bucket || "").trim()
    const path = String(item.path || "").trim()
    const contentType = String(item.contentType || item.content_type || "").trim()
    const usage = String(item.usage || "").trim()
    if (!allowed.has(kind) || !bucket || !path || !contentType.startsWith("image/")) continue
    refs.push({ kind, bucket, path, contentType, usage })
    if (refs.length >= 5) break
  }
  return refs
}

function assetPromptBlock(assetRefs: CoverReferenceAsset[], brandVisibility: string) {
  if (!assetRefs.length) return ""
  const labels: Record<CoverReferenceKind, string> = {
    style: "风格/版式参考",
    logo: "Logo/门头",
    store: "门店环境",
    product: "项目/产品/仪器",
    people: "人物/案例",
  }
  const allowSubtleBrand = brandVisibility === "subtle"
  return [
    "",
    "【商家参考图使用规则】",
    ...assetRefs.map((ref, index) => `参考图${index + 1}：${labels[ref.kind]}素材${ref.usage ? `，用途：${ref.usage}` : ""}。`),
    assetRefs.some((ref) => ref.kind === "style")
      ? "风格参考图只学习构图、配色、字体气质和信息密度，不照抄文字、Logo、人物、产品、价格或具体版面。"
      : "",
    assetRefs.some((ref) => ref.kind === "store")
      ? "门店环境图优先作为真实空间氛围或背景质感参考，让画面更像真实美业门店。"
      : "",
    assetRefs.some((ref) => ref.kind === "product")
      ? "项目/产品/仪器图可作为局部元素或材质参考，不要变成硬广产品图。"
      : "",
    assetRefs.some((ref) => ref.kind === "people")
      ? "人物/案例图只用于皮肤状态、护理动作或人物情绪参考；不要夸大前后效果，不生成医疗疗效承诺。"
      : "",
    assetRefs.some((ref) => ref.kind === "logo")
      ? allowSubtleBrand
        ? "Logo/门头可小面积自然融入，但绝不能出现电话、地址、二维码、价格、平台入口或促销按钮。"
        : "Logo/门头默认只作品牌气质参考，不要直接把门头文字、联系方式或二维码放进封面。"
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

async function assetRefsToImageUrls(opts: {
  bucket: string
  userId: string
  assetRefs: CoverReferenceAsset[]
}) {
  const imageUrls: string[] = []
  const safePrefix = `posters/assets/${opts.userId}/`
  for (const ref of opts.assetRefs) {
    if (ref.bucket !== opts.bucket) continue
    if (!ref.path.startsWith(safePrefix)) continue
    try {
      const asset = await downloadAsset({ bucket: opts.bucket, path: ref.path })
      const contentType = asset.contentType || ref.contentType || "image/jpeg"
      if (!contentType.startsWith("image/")) continue
      const base64 = Buffer.from(asset.arrayBuffer).toString("base64")
      imageUrls.push(`data:${contentType};base64,${base64}`)
    } catch {
      // Reference images are optional; keep cover generation available if one asset is stale.
    }
  }
  return imageUrls
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
  const coverDensity = normalizeCoverDensity(getTextField(body, ["coverDensity", "cover_density"]))
  const rawCoverPoints = getCoverPoints(body, draft, content)
  const pointTarget = coverPointTarget(coverDensity, [title, sub, content].filter(Boolean).join(" "), rawCoverPoints.length)
  const coverPoints = rawCoverPoints.slice(0, pointTarget)
  const coverPointInstruction = pointTarget
    ? [
        "【短标签】",
        coverPoints.length
          ? `严格显示这${coverPoints.length}个短标签：${coverPoints.map((point) => `「${point}」`).join(" ")}。数量不要自行增减。`
          : `从正文小节提炼${pointTarget}个极短标签；若正文有编号小节，数量必须和小节一致。`,
        "短标签只占一个轻量区域，像小红书封面上的信息贴纸；不要做成表格、按钮或落地页模块。",
      ].join("\n")
    : ""
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
      coverPointInstruction,
      safeContent ? `主题语境：${compactText(safeContent, 160)}` : "",
      keywords ? `参考关键词：${compactText(keywords, 80)}` : "",
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
    "优先做精品小红书封面：主标题醒目、构图有设计感、主视觉高级、短标签克制。",
    "不要生成普通护理房素材图加大字；不要PPT、表格、App页面、商城详情页、按钮、底部导流条或联系方式。",
    "中文文字必须准确清晰，宁可减少装饰也不要乱码和错字。",
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
    .select("*")
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
          ? data.keywords.map((item: unknown) => String(item || "").trim()).filter(Boolean).join("、")
          : "",
    coverPoints: Array.isArray(data?.cover_points)
      ? data.cover_points.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [],
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
  const assetRefs = normalizeAssetRefs(requestBody.assetRefs || requestBody.asset_refs)

  const charged = await chargeMpAiPoints({
    request,
    ctx: billing.ctx,
    actionCode,
    businessObjectType: "xhs_draft",
    businessObjectId: draftId || undefined,
    metadata: {
      size: getTextField(requestBody, ["size"]) || "3:4",
      resolution: "1k",
      asset_count: assetRefs.length,
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
    props: { source: "mp", cost: charged.cost, actionCode: charged.actionCode, plan: billing.ctx.plan, assetCount: assetRefs.length },
  })

  const incomingPrompt = getTextField(requestBody, ["prompt", "coverPrompt", "cover_prompt"])
  const size = normalizeSize(getTextField(requestBody, ["size"]) || "3:4")
  const resolution = "1k"

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
  const brandVisibility = getTextField(requestBody, ["brandVisibility", "brand_visibility"])
  prompt = [prompt, assetPromptBlock(assetRefs, brandVisibility)].filter(Boolean).join("\n")
  const bucket = getXhsAssetsBucket()
  const imageUrls = assetRefs.length
    ? await assetRefsToImageUrls({ bucket, userId: billing.ctx.userId, assetRefs })
    : []

  let json: UpstreamGenerateCoverResponse | null = null

  try {
    const generated = await generateGptImage2({
      prompt,
      negativePrompt,
      size,
      resolution,
      imageUrls,
    })
    json = {
      success: true,
      imageUrl: generated.imageUrl,
      imageBase64: null,
      prompt,
      negativePrompt,
      model: generated.model,
      source: generated.model,
      coverStyleId: coverAsset.styleId || null,
      coverStyleLabel: coverAsset.styleLabel || null,
      coverStyleReason: coverAsset.styleReason || null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "image_failed")
    const publicMessage = publicImageGenerationErrorMessage(error)
    await trackServerEvent({
      request,
      event: "mp_xhs_cover_gpt_image_fail",
      props: { source: "mp", message: message.slice(0, 180) },
    })

    await refundCharge("xhs_cover_gpt_image_failed", message)
    return NextResponse.json(
      { success: false, ok: false, error: publicMessage },
      { status: imageGenerationErrorStatus(error) }
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
      const { data: updatedDraft, error: updateError } = await billing.ctx.supabase
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
        .select("id")
        .maybeSingle()

      if (updateError || !updatedDraft?.id) {
        throw new Error(updateError?.message || "cover_update_failed")
      }

      json.coverStyleId = json.coverStyleId || coverAsset.styleId || null
      json.coverStyleLabel = json.coverStyleLabel || coverAsset.styleLabel || null
      json.coverStyleReason = json.coverStyleReason || coverAsset.styleReason || null
      json.imageUrl = xhsCoverUrl(draftId, uploaded.path, now)
      json.imageBase64 = null
      json.coverVersion = xhsCoverVersion(uploaded.path, now)
    }
  } catch {
    // Storage is best-effort; the generated remote URL is still returned.
  }

  await trackServerEvent({
    request,
    event: "mp_xhs_cover_success",
    props: { source: "mp", cost: charged.cost, actionCode: charged.actionCode, assetCount: assetRefs.length, imageCount: imageUrls.length },
  })

  const res = NextResponse.json({ ...json, ok: json?.success !== false })
  setMpAiPointHeaders(res, charged)
  return res
}
