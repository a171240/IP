import { NextRequest, NextResponse } from "next/server"

import { generateGptImage2 } from "@/lib/posters/gpt-image-2.server"
import type { BillingContext } from "@/lib/xhs/proxy.server"
import { buildXhsUpstreamUrl, chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
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
    styleId: getTextField(body, ["coverStyleId", "cover_style_id", "styleId"]) || draft?.styleId || "",
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

async function loadDraftCoverAsset(opts: {
  supabase: BillingContext["supabase"]
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
  const incomingPrompt = getTextField(requestBody, ["prompt", "coverPrompt", "cover_prompt"])
  const size = normalizeSize(getTextField(requestBody, ["size"]) || "3:4")
  const resolution = normalizeResolution("")
  const draftId = getDraftId(requestBody)

  let draftAsset: DraftCoverAsset | null = null
  if (draftId) {
    try {
      draftAsset = await loadDraftCoverAsset({
        supabase: billing.ctx.supabase,
        userId: billing.ctx.userId,
        draftId,
      })
    } catch {
      // Keep compatibility fallback below.
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

  let json: UpstreamGenerateCoverResponse | null = null

  if (prompt) {
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
          cover_prompt: prompt,
          cover_negative: negativePrompt,
          cover_style_id: coverAsset.styleId || null,
          cover_style_label: coverAsset.styleLabel || null,
          cover_style_reason: coverAsset.styleReason || null,
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
