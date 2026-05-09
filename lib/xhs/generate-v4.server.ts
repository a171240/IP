import "server-only"

import { jsonrepair } from "jsonrepair"
import { z } from "zod"

import type { BillingContext } from "@/lib/xhs/proxy.server"
import { buildXhsUpstreamUrl } from "@/lib/xhs/proxy.server"
import {
  detectBodyAndCoverFlags,
  detectPinnedCommentFlags,
  type GuardrailFlag,
} from "@/lib/xhs/guardrails"
import {
  buildCoverStyleCatalogText,
  buildBeautyContext,
  buildBeautySourcePackText,
  buildCoverPromptRequirements,
  conflictLabel,
  contentTypeLabel,
  normalizeCoverAsset,
  type BeautyContext,
} from "@/lib/xhs/beauty-knowledge"

export type ConflictLevel = "safe" | "standard" | "hard"
export type XhsContentType = "treatment" | "education" | "promotion" | "comparison"
export type CommercialInsertMode = "none" | "soft_offer" | "store_once" | "local_category_guide" | "recommendation_reply"
export type PinnedCommentPolicy = "off" | "recommendation_only"
export type MentionStorePolicy = "none" | "offer_only" | "body_once" | "pinned_only"
export type CoverDensity = "simple" | "balanced" | "rich"

export type CommercialContext = {
  mode: CommercialInsertMode
  offerName: string
  localScope: string
  sellingPoint: string
  pinnedCommentPolicy: PinnedCommentPolicy
  mentionStorePolicy: MentionStorePolicy
}

export type StoreProfile = {
  id: string
  name: string | null
  city: string | null
  district: string | null
  landmark: string | null
  shop_type: string | null
  main_offer_name: string | null
  main_offer_duration_min: number | null
  included_steps: unknown | null
  promises: unknown | null
}

export type GenerateV4Input = {
  contentType: XhsContentType
  topic: string
  keywords: string
  shopName: string
  conflictLevel: ConflictLevel
  storeProfile: StoreProfile | null
  seedReviews: string[]
  commercialContext: CommercialContext
  coverDensity: CoverDensity
  maxRounds: number
}

export type GenerateV4Result = {
  title: string
  body: string
  coverText: { main: string; sub: string }
  pinnedComment: string
  replyTemplates: string[]
  tags: string[]
  coverPrompt: string
  coverNegative: string
  coverPoints: string[]
  coverStyleId?: string
  coverStyleLabel?: string
  coverStyleReason?: string
  entryClass?: string
  narrator?: string
  persona?: string
}

export type GuardrailsReport = {
  rounds: number
  flags: GuardrailFlag[]
  riskLevel: string | null
  dangerCount: number | null
}

const llmOutputSchema = z.object({
  entry_class: z.string().min(1).max(40).optional(),
  narrator: z.string().min(1).max(40).optional(),
  persona: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(60),
  body: z.string().min(120).max(8000),
  cover_main: z.string().min(2).max(20),
  cover_sub: z.string().min(2).max(28),
  cover_prompt: z.string().max(5000).optional(),
  cover_negative: z.string().max(1500).optional(),
  cover_points: z.array(z.string().min(1).max(24)).max(4).optional(),
  cover_style_id: z.string().min(2).max(80).optional(),
  cover_style_label: z.string().min(2).max(40).optional(),
  cover_style_reason: z.string().min(2).max(120).optional(),
  pinned_comment: z.string().max(2000).optional().default(""),
  reply_templates: z.array(z.string().min(10).max(400)).min(3).max(5).optional(),
  tags: z.array(z.string().min(1).max(40)).min(3).max(20).optional(),
})

function compactUnknownValue(value: unknown, max = 180): string {
  if (!value) return ""
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim()
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>
          return String(record.name || record.title || record.label || record.step || "").trim()
        }
        return String(item || "").trim()
      })
      .filter(Boolean)
      .slice(0, 6)
      .join("、")
      .slice(0, max)
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== false && v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `${k}:${typeof v === "boolean" ? "是" : String(v).trim()}`)
      .slice(0, 8)
      .join("、")
      .slice(0, max)
  }
  return String(value || "").trim().slice(0, max)
}

function formatStorePromises(promises: unknown) {
  if (!promises || typeof promises !== "object") return ""
  const p = promises as Record<string, unknown>
  const labels: string[] = []
  if (p.no_extra_fee !== false) labels.push("规则提前说清，不临时加价")
  if (p.no_shrink !== false) labels.push("流程尽量完整，不把主推时长缩水")
  if (p.can_refuse !== false) labels.push("顾客可拒绝升级或硬推销")
  return labels.join("；")
}

function buildStoreSummary(profile: StoreProfile | null): string {
  if (!profile) return "（未提供门店档案：请写泛内容，不要编造具体数字、具体地标、具体价格。）"

  const parts: string[] = []
  const place = [profile.city, profile.district].filter(Boolean).join(" ")
  if (place) parts.push(`城市/区域：${place}`)
  if (profile.landmark) parts.push(`地标/商圈：${profile.landmark}`)
  if (profile.shop_type) parts.push(`门店类型：${profile.shop_type}`)
  if (profile.name) parts.push(`门店昵称：${profile.name}`)
  if (profile.main_offer_name) parts.push(`主推：${profile.main_offer_name}`)
  if (typeof profile.main_offer_duration_min === "number" && profile.main_offer_duration_min > 0) {
    parts.push(`时长：约${profile.main_offer_duration_min}分钟（以团购页为准）`)
  }
  const promiseText = formatStorePromises(profile.promises) || compactUnknownValue(profile.promises)
  if (promiseText) parts.push(`承诺口径：${promiseText}`)
  const stepsText = compactUnknownValue(profile.included_steps)
  if (stepsText) parts.push(`流程要点：${stepsText}`)

  return parts.length ? parts.join("\n") : "（已选择门店档案，但信息不完整：请避免编造具体事实。）"
}


function ensureStringArray(input: unknown, len = 3): string[] {
  if (!Array.isArray(input)) return []
  const arr = input.map((v) => String(v || "").trim()).filter(Boolean)
  if (!arr.length) return []
  return arr.slice(0, Math.max(1, len))
}

function sanitizeStrictPublishText(text: string) {
  return String(text || "")
    .replace(/评论区|评论/g, "留言区")
    .replace(/私信/g, "单独问")
    .replace(/关注/g, "留意")
    .replace(/加\s*V|加v|加\s*微\s*信|加\s*vx|微信|VX|vx/gi, "联系方式")
    .replace(/电话|手机号|扫码|二维码|链接/g, "联系方式")
    .replace(/预约/g, "时间安排")
    .replace(/到店|进店/g, "进门")
    .replace(/大众点评|抖音|小红书/g, "本地平台")
    .replace(/团购|下单|买券|核销/g, "购买动作")
    .replace(/价格/g, "费用")
    .replace(/优惠/g, "划算")
    .replace(/地址|定位|导航/g, "位置线索")
    .replace(/治疗|根治|治好|包好|百分百|永久|立刻见效|立马见效|保证见效/g, "护理改善")
}

function sanitizePinnedCommentText(text: string) {
  return sanitizeStrictPublishText(text)
    .replace(/联系方式/g, "公开信息")
    .replace(/\b1\d{10}\b/g, "公开信息")
    .replace(/\b\d{7,}\b/g, "公开信息")
}

function shouldGeneratePinnedComment(ctx: CommercialContext) {
  return ctx.mode === "recommendation_reply" || ctx.pinnedCommentPolicy === "recommendation_only"
}

function coverPointTarget(density: CoverDensity) {
  if (density === "simple") return 0
  if (density === "rich") return 4
  return 3
}

function sanitizeCoverPoints(input: unknown, density: CoverDensity) {
  const target = coverPointTarget(density)
  if (!target || !Array.isArray(input)) return []
  return input
    .map((item) => sanitizeStrictPublishText(String(item || "")).replace(/[：:。.!！?？]+$/g, "").trim())
    .filter(Boolean)
    .filter((item) => item.length <= 14)
    .slice(0, target)
}

function buildCommercialContextText(input: GenerateV4Input) {
  const ctx = input.commercialContext
  const storeName = input.storeProfile?.name || input.shopName || ""
  const offer = ctx.offerName || input.storeProfile?.main_offer_name || input.keywords || ""
  const localScope = ctx.localScope || [input.storeProfile?.city, input.storeProfile?.district, input.storeProfile?.landmark].filter(Boolean).join(" ")
  const pinned = shouldGeneratePinnedComment(ctx)
  const hasCommercialAnchor = ctx.mode !== "none" && Boolean(storeName || offer || localScope || ctx.sellingPoint || input.storeProfile)

  const lines = [
    "本次门店/项目上下文（系统自动处理，不需要用户选择植入方式）：",
    `- 自动内容策略：${ctx.mode}`,
    offer ? `- 主推项目/服务：${offer}` : "- 主推项目/服务：未指定，按主题和关键词自然判断，不要编造项目。",
    localScope ? `- 本地范围：${localScope}` : "- 本地范围：未指定，不要编造城市、商圈或地标。",
    storeName ? `- 可用门店昵称：${storeName}` : "- 未提供门店昵称，正文不得编造具体门店。",
    ctx.sellingPoint ? `- 本次一句话卖点：${ctx.sellingPoint}` : "- 本次一句话卖点：未指定，按门店档案和主题提炼，不要编造承诺。",
  ]

  if (hasCommercialAnchor) {
    lines.push("- 门店锚点要求：正文必须让读者看出这不是泛泛品类文章，而是以本次门店/项目为样本写出的判断内容。")
    if (storeName) {
      lines.push(`- 正文必须自然出现门店昵称“${storeName}”至少1次、最多2次；建议放在中段作为服务样本，不要放成广告结尾。`)
    }
    if (offer) {
      lines.push(`- 主推项目/服务“${offer}”必须成为全文主线，正文至少出现2次：开头承接需求一次，判断标准或服务细节里再出现一次。`)
    }
    lines.push("- 至少写出1-2个可验证门店锚点：时长、流程、力度/温度确认、少打扰、不硬推销、不缩水、适合人群；没有资料的点不要编。")
    lines.push("- 写法像“拿一家真实门店做样本解释怎么选”，不要像广告口号；禁止欢迎、快来、立即、预约、到店等动作引导。")
  }

  if (ctx.mode === "none") {
    lines.push("- 门店信息不足时，正文只写通用干货，不出现店名，不做项目销售，不生成置顶评论。")
  } else if (ctx.mode === "soft_offer") {
    lines.push("- 正文围绕主推项目能解决什么问题来写；若有门店昵称，必须用“以本店/本项目为样本”的方式轻轻带出一次，像给选择标准，不像广告。")
  } else if (ctx.mode === "store_once") {
    lines.push("- 正文至少自然出现一次门店昵称，用于说明服务边界、流程或适合人群；整体不超过两次，不能出现引导动作。")
  } else if (ctx.mode === "local_category_guide") {
    lines.push("- 正文写成本地选择攻略：优先使用“三类门店适合不同人”的结构；不得虚构其他门店名称、评分、价格或案例。")
    lines.push("- 如果有门店昵称，必须把本店定位为其中一类门店的代表/适合人群，不要写成唯一推荐。")
  } else if (ctx.mode === "recommendation_reply") {
    lines.push("- 正文保持干货或本地选择逻辑；可把本店作为一种适合人群样本轻带一次，主要承接放在置顶评论。")
  }

  lines.push(pinned ? "- pinned_comment 必须输出，可写公开搜索路径，但不得写平台名、联系方式、二维码、电话、微信。" : "- pinned_comment 必须输出空字符串。")

  return lines.join("\n")
}

function buildCoverDensityText(density: CoverDensity) {
  const target = coverPointTarget(density)
  if (!target) {
    return "封面信息密度：simple。只输出主标题和副标题，不强制辅助信息点。"
  }
  return [
    `封面信息密度：${density}。`,
    `cover_points 必须输出 ${target} 个短信息点，每个不超过14个字。`,
    "这些点用于首图上的小标签/短清单，必须来自正文核心判断，不得包含CTA、平台名、门店地址、价格或联系方式。",
    "cover_points 不要写抽象情绪口号，要写成可直接上图的判断点、避坑点、流程点或适合人群点。",
    "封面版式必须有主标题区、副标题区、短信息点区和主视觉区；不得只生成氛围背景+大标题。",
  ].join("\n")
}

function fallbackPinnedComment(input: GenerateV4Input) {
  if (!shouldGeneratePinnedComment(input.commercialContext)) return ""
  const storeName = input.storeProfile?.name || input.shopName || ""
  const place = input.commercialContext.localScope || [input.storeProfile?.city, input.storeProfile?.district, input.storeProfile?.landmark].filter(Boolean).join(" ")
  if (!storeName) return ""
  return sanitizePinnedCommentText(
    `如果是想自己核对门店，可以用“${storeName}${place ? " " + place : ""}”去公开平台搜公开信息。重点看三件事：是否提前说清流程、是否临时加费用、是否允许你拒绝升级。`
  ).trim()
}

function getStoreAnchorName(input: GenerateV4Input) {
  return (input.storeProfile?.name || input.shopName || "").trim()
}

function getOfferAnchorName(input: GenerateV4Input) {
  return (input.storeProfile?.main_offer_name || input.commercialContext.offerName || "").trim()
}

function buildStoreAnchorSentence(input: GenerateV4Input) {
  const storeName = getStoreAnchorName(input)
  const offerName = getOfferAnchorName(input)
  const detailBits: string[] = []
  const duration = input.storeProfile?.main_offer_duration_min
  if (typeof duration === "number" && duration > 0) detailBits.push(`约${duration}分钟流程是否完整`)
  const promiseText = formatStorePromises(input.storeProfile?.promises)
  if (promiseText) detailBits.push(promiseText)
  if (!detailBits.length) detailBits.push("服务边界、流程细节和顾客节奏是否说清楚")

  if (storeName && offerName) {
    return `如果拿${storeName}的${offerName}做样本看，重点不是项目名本身，而是${detailBits.join("；")}。`
  }
  if (storeName) {
    return `如果拿${storeName}这类门店做样本看，重点是${detailBits.join("；")}。`
  }
  if (offerName) {
    return `拿${offerName}这类项目来说，重点不只是项目名，而是${detailBits.join("；")}。`
  }
  return ""
}

function insertParagraphAfterOpening(body: string, sentence: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!paragraphs.length) return sentence
  if (paragraphs.some((item) => item.includes(sentence))) return body
  const index = paragraphs.length > 1 ? 1 : paragraphs.length
  paragraphs.splice(index, 0, sentence)
  return paragraphs.join("\n\n")
}

function ensureStoreAnchor(result: GenerateV4Result, input: GenerateV4Input): GenerateV4Result {
  if (input.commercialContext.mode === "none") return result
  const storeName = getStoreAnchorName(input)
  const offerName = getOfferAnchorName(input)
  if (!storeName && !offerName) return result

  const body = result.body || ""
  const missingStore = Boolean(storeName && !body.includes(storeName))
  const missingOffer = Boolean(offerName && !body.includes(offerName))
  if (!missingStore && !missingOffer) return result

  const sentence = buildStoreAnchorSentence(input)
  if (!sentence) return result

  return {
    ...result,
    body: insertParagraphAfterOpening(body, sentence),
  }
}

function extractBalancedJsonObject(text: string) {
  const start = text.indexOf("{")
  if (start < 0) return ""

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === "\\") {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === "{") {
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  const end = text.lastIndexOf("}")
  return end > start ? text.slice(start, end + 1) : ""
}

function parseJsonCandidate(candidate: string): unknown {
  const text = candidate.trim()
  if (!text) return null

  for (const v of [text, text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()]) {
    if (!v) continue
    try {
      const parsed = JSON.parse(v)
      return typeof parsed === "string" ? safeJsonParse(parsed) : parsed
    } catch {
      try {
        const repaired = jsonrepair(v)
        const parsed = JSON.parse(repaired)
        return typeof parsed === "string" ? safeJsonParse(parsed) : parsed
      } catch {
        // try next candidate
      }
    }
  }

  return null
}

function safeJsonParse(text: string): unknown {
  const trimmed = (text || "").trim()
  if (!trimmed) return null

  const direct = parseJsonCandidate(trimmed)
  if (direct) return direct

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  if (fenced) {
    const parsed = parseJsonCandidate(fenced)
    if (parsed) return parsed
  }

  const balanced = extractBalancedJsonObject(trimmed)
  return balanced ? parseJsonCandidate(balanced) : null
}

async function callDeepSeekJson(opts: { messages: Array<{ role: string; content: string }>; maxTokens: number }) {
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim()
  const baseUrl = (process.env.DEEPSEEK_XHS_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim()
  const model = (process.env.DEEPSEEK_XHS_MODEL || process.env.DEEPSEEK_PRO_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat").trim()
  const thinkingMode = (process.env.DEEPSEEK_XHS_THINKING || (model.includes("v4") ? "disabled" : "")).trim()

  if (!apiKey || apiKey === "your-api-key-here") {
    throw new Error("DEEPSEEK_API_KEY missing")
  }

  async function doRequest(payload: Record<string, unknown>) {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    const jsonText = await upstream.text().catch(() => "")
    return { ok: upstream.ok, status: upstream.status, text: jsonText }
  }

  const basePayload: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: 0.7,
    max_tokens: opts.maxTokens,
    stream: false,
    response_format: { type: "json_object" },
  }
  if (thinkingMode) {
    basePayload.thinking = { type: thinkingMode }
  }

  let res = await doRequest(basePayload)

  if (!res.ok && res.status === 400) {
    const lower = res.text.slice(0, 500).toLowerCase()
    if (lower.includes("response_format") || lower.includes("json_object")) {
      const fallbackPayload = { ...basePayload }
      delete fallbackPayload.response_format
      res = await doRequest(fallbackPayload)
    } else if (lower.includes("thinking")) {
      const fallbackPayload = { ...basePayload }
      delete fallbackPayload.thinking
      res = await doRequest(fallbackPayload)
    }
  }

  if (!res.ok) {
    throw new Error(`DeepSeek LLM error: ${res.status} ${res.text.slice(0, 200)}`)
  }

  const parsed = safeJsonParse(res.text)

  const extracted = (() => {
    if (!parsed || typeof parsed !== "object") return null
    const choices = (parsed as Record<string, unknown>).choices
    if (!Array.isArray(choices) || choices.length === 0) return null
    const first = choices[0]
    if (!first || typeof first !== "object") return null
    const message = (first as Record<string, unknown>).message
    if (!message || typeof message !== "object") return null

    const content = (message as Record<string, unknown>).content
    if (typeof content === "string" && content.trim()) {
      const v = safeJsonParse(content)
      if (v) return v
    }

    const reasoning = (message as Record<string, unknown>).reasoning_content
    if (typeof reasoning === "string" && reasoning.trim()) {
      const v = safeJsonParse(reasoning)
      if (v) return v
    }

    return null
  })()

  if (!extracted) {
    throw new Error("DeepSeek did not return valid JSON")
  }

  return extracted
}
async function callDangerCheck(opts: { content: string; draftId?: string; billing: BillingContext }) {
  const upstream = await fetch(buildXhsUpstreamUrl("/api/content/danger-check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: opts.content,
      ...(opts.draftId ? { draft_id: opts.draftId } : {}),
    }),
  })

  const text = await upstream.text().catch(() => "")
  if (!upstream.ok) return { riskLevel: null as string | null, dangerCount: null as number | null }

  const json = safeJsonParse(text)
  const danger = (() => {
    if (!json || typeof json !== "object") return null
    const d = (json as Record<string, unknown>).data
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null
  })()
  const riskLevel = typeof danger?.riskLevel === "string" ? danger.riskLevel : null
  const dangerCount = Number.isFinite(Number(danger?.dangerCount)) ? Number(danger?.dangerCount) : null

  // best-effort persist to xhs_drafts
  try {
    if (opts.draftId) {
      const now = new Date().toISOString()
      await opts.billing.supabase
        .from("xhs_drafts")
        .update({ danger_risk_level: riskLevel, danger_count: dangerCount, updated_at: now })
        .eq("id", opts.draftId)
        .eq("user_id", opts.billing.userId)
    }
  } catch {
    // ignore
  }

  return { riskLevel, dangerCount }
}

function shouldRewrite(riskLevel: string | null, flags: GuardrailFlag[]) {
  if (flags.length) return true
  return riskLevel === "medium" || riskLevel === "high" || riskLevel === "critical"
}

function compactFlags(flags: GuardrailFlag[]) {
  return flags.map((f) => `${f.field}:${f.rule}:${f.match}`).slice(0, 20)
}

function buildSystemPrompt(opts: { contentType: XhsContentType; conflictLevel: ConflictLevel; beautyContext: BeautyContext }) {
  const typeLabel = contentTypeLabel(opts.contentType)
  const cLabel = conflictLabel(opts.conflictLevel)
  const typeStrategy = opts.beautyContext.contentStrategy

  // IMPORTANT:
  // - 正文与首图文案严格禁CTA
  // - 置顶评论不写平台名（大众点评/抖音）
  // - 只怼行为话术，不点名攻击
  return [
    "你是“美容行业小红书图文增长策略师 + 情绪冲突文案导演”。",
    "你的表达基础：像懂一线门店、懂顾客异议的经营者，说人话，给判断标准，不卖焦虑。",
    "",
    `当前任务：生成一条【${typeLabel}】笔记（中文），冲突强度档位：${cLabel}。`,
    "",
    "底层方法论：富贵千机塔人群洞察（必须内化，不要输出分析表）：",
    "1) 拒绝单一画像：不要写“25-35岁女性”这种空泛标签；先在心里拆出3-5种不同顾客，再选最适合本主题的一种作为主角。",
    "2) 至少爬到第6层：自然属性/社会属性只作背景，正文必须落到消费模式、行为场景、生活方式、此刻情绪；能触及长期情感和价值观更好。",
    "3) 用5W1H翻译成内容：WHO她是谁，WHEN她处在什么阶段，WHY她真正想解决什么，WHERE需求在哪个场景最强，WHAT她该看什么服务/标准，HOW她会用什么词搜索或比较。",
    "4) 三条铁律：别猜，优先看门店档案、关键词、差评/吐槽原话；骂点就是买点，把抱怨翻译成可验证卖点；拆到能给她起名字为止，写出一天里的具体画面。",
    "5) 没有真实资料时，只能写“通用判断标准/自检清单”，不得编造顾客原话、成交数据、效果案例、地标和价格。",
    "",
    "美业常见情绪种子（仅作选题方向，不当作真实引语）：怕被推销、怕加价、怕敏感红痒、怕服务缩水、想比较、想看同类案例、担心效果承诺、担心门店不稳定、讨厌被现场施压。",
    "",
    "本次美容知识包：",
    buildBeautySourcePackText(opts.beautyContext),
    "",
    "本类目策略：",
    typeStrategy,
    "",
    "封面生图提示词规则：",
    buildCoverPromptRequirements(opts.beautyContext),
    "",
    "硬性规则（必须遵守）：",
    "1) 正文 body 严格禁CTA：不得出现 评论/私信/关注/加V/微信/VX/电话/扫码/链接/预约/到店 等导流动作；不得出现 大众点评/抖音/团购/下单/买券/核销/价格/优惠/地址/定位/导航 等交易/平台词。",
    "2) 首图文案 cover_main/cover_sub 同样严格禁CTA与平台/交易词。",
    "3) 置顶评论 pinned_comment 只在本次门店植入规则明确要求时输出；否则必须为空字符串。若输出，允许给到“怎么找到门店”的公开路径，但不得直写平台名（大众点评/抖音），不得出现微信/手机号/二维码等联系方式收集。",
    "4) 不做医疗诊断与疗效承诺：禁用 治疗/根治/治好/百分百/立刻见效 等表述，用“舒缓/体验/因人而异/减少刺激”替代。",
    "5) 不点名攻击具体同行/个人；只描述常见行为话术与自己的边界规则。",
    "",
    "结构要求：",
    "- title：18字内，包含主关键词（若关键词为空则包含主题核心词）。",
    "- body：400-600字，短句、画面感；隐含链路为“具体顾客画像 -> 触发场景 -> 此刻情绪 -> 判断标准 -> 温和结论”。不要输出画像表。",
    "- 若本次提供门店档案或门店/项目上下文，body 必须出现清楚的门店锚点：读者能看出是哪家店/哪个项目的服务样本，而不是只写通用品类知识。",
    "- body 自然加入 2-4 个 emoji，让语气更像小红书真实笔记；不要每段都放，不要在严肃风险提醒里堆表情，标题不强制放 emoji。",
    "- body 必须包含至少3个“可核实细节”。若缺少门店档案信息，则改为“可验证判断标准/自检清单”，不要编造具体事实。",
    "- body 结尾可以留一个开放问题，但不能出现“评论区/私信/找我/来店”等动作词。",
    "- body 不写模板腔，不使用完整的“不是A，是B / 你要的不是X，是Y / 真正的X不是Y，是Z / 更扎心的是 / 换句话说 / 也就是说”。",
    "- cover_main：<=12字，冲突最大；cover_sub：<=16字，给答案/承诺（但不含CTA）。",
    "- cover_points：按本次封面信息密度输出短信息点，用于首图小标签/短清单；不得包含CTA、平台名、价格、地址、联系方式。",
    "- cover_style_id：必须从以下风格ID中选择一个，并且要根据你刚写出的正文内容选择，不要按内容类型机械套模板。",
    buildCoverStyleCatalogText(),
    "- cover_style_label：输出对应中文风格名；cover_style_reason：一句话说明为什么这篇正文适合这个视觉风格。",
    "- cover_prompt：可留空；最终生图提示词由后端根据 cover_main/cover_sub/cover_style_id 统一生成，避免信息卡模板污染。",
    "- cover_negative：可留空；后端会补充统一负面词。",
    "- pinned_comment：默认输出空字符串；只有门店植入规则要求 recommendation_reply 时，才给公开搜索路径和三条承诺口径（不加价/不缩水/可拒绝）。",
    "- reply_templates：3条（反推销/敏感肌合规/本地怎么找店，不写平台名）。",
    "- tags：8-12个，含本地词+服务词+情绪词；避免敏感词与平台名。",
    "",
    "输出格式：只输出一个JSON对象，且必须能被 JSON.parse 解析；不得输出多余解释文本。",
    "",
    "JSON schema：",
    "{",
    '  "entry_class": "问题修复|信任怀疑|放松养护|本地找店|边界风险词",',
    '  "narrator": "本次实际使用的叙述者",',
    '  "persona": "一句话具体人，不要空泛年龄段",',
    '  "title": "string",',
    '  "body": "string",',
    '  "cover_main": "string",',
    '  "cover_sub": "string",',
    '  "cover_style_id": "string",',
    '  "cover_style_label": "string",',
    '  "cover_style_reason": "string",',
    '  "cover_prompt": "",',
    '  "cover_negative": "",',
    '  "cover_points": ["短点1","短点2","短点3"],',
    '  "pinned_comment": "string",',
    '  "reply_templates": ["string","string","string"],',
    '  "tags": ["#tag1", "#tag2"]',
    "}",
  ].join("\n")
}

function buildUserPrompt(input: GenerateV4Input, beautyContext: BeautyContext) {
  const storeSummary = buildStoreSummary(input.storeProfile)
  const seed = (input.seedReviews || []).map((s) => `- ${String(s || "").trim()}`).filter(Boolean).slice(0, 12)
  return [
    `内容类型：${contentTypeLabel(input.contentType)}`,
    `主题：${input.topic}`,
    `主关键词：${input.keywords || "（空）"}`,
    input.shopName ? `门店信息（用户输入）：${input.shopName}` : "",
    "",
    "门店档案：",
    storeSummary,
    "",
    buildCommercialContextText(input),
    "",
    buildCoverDensityText(input.coverDensity),
    "",
    seed.length ? "差评/吐槽原话（可用来提炼冲突）：\n" + seed.join("\n") : "差评/吐槽原话：未提供（请用通用冲突种子）。",
    "",
    "本次自动路由结果：",
    buildBeautySourcePackText(beautyContext),
    "",
    "生成前请先在内部完成：选择一个具体顾客主角，判断她处在千机塔第4-6层的触发场景与即时情绪，再把内容写成可发布笔记；不要输出分析过程。",
    "封面只需要选择视觉风格ID，并按信息密度输出 cover_points；最终生图提示词由后端统一拼接，不要输出旧版信息卡模板提示词。",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildRevisionPrompt(opts: {
  prev: GenerateV4Result
  flags: GuardrailFlag[]
  riskLevel: string | null
  dangerCount: number | null
  conflictLevel: ConflictLevel
  contentType: XhsContentType
  topic: string
  keywords: string
  beautyContext: BeautyContext
  commercialContext: CommercialContext
  coverDensity: CoverDensity
}) {
  const compact = compactFlags(opts.flags)
  const risk = opts.riskLevel ? `${opts.riskLevel}(${opts.dangerCount ?? "?"})` : "unknown"
  return [
    "你需要对上一版结果进行“可发布化改写”。要求：保留主题与核心冲突，但必须通过禁CTA与合规规则。",
    `当前风险：${risk}`,
    `命中项：${compact.length ? compact.join(", ") : "（无）"}`,
    "",
    "上一版 JSON：",
    JSON.stringify(
      {
        title: opts.prev.title,
        body: opts.prev.body,
        cover_main: opts.prev.coverText.main,
        cover_sub: opts.prev.coverText.sub,
        cover_style_id: opts.prev.coverStyleId,
        cover_style_label: opts.prev.coverStyleLabel,
        cover_style_reason: opts.prev.coverStyleReason,
        cover_points: opts.prev.coverPoints,
        cover_prompt: opts.prev.coverPrompt,
        cover_negative: opts.prev.coverNegative,
        pinned_comment: opts.prev.pinnedComment,
        reply_templates: opts.prev.replyTemplates,
        tags: opts.prev.tags,
      },
      null,
      2
    ),
    "",
    "改写要求（必须遵守）：",
    "1) body/cover_main/cover_sub：严格移除任何 CTA 动作词、平台名、交易词（见系统规则）。",
    shouldGeneratePinnedComment(opts.commercialContext)
      ? "2) pinned_comment：保留公开搜索路径，但不得出现 大众点评/抖音 字样；不得出现微信/手机号/二维码。"
      : "2) pinned_comment：必须改为空字符串。",
    "3) 医疗合规：不得承诺疗效，不使用治疗/根治类词。",
    "4) 若当前档位为 hard 仍无法降风险，请把语气降到 standard 或 safe（更克制，不引战）。",
    "5) 保留具体顾客场景、即时情绪和判断标准，不要改成空泛广告腔。",
    "6) 同步保留 cover_style_id/cover_style_reason；cover_prompt/cover_negative 可留空，由后端统一生成。",
    `7) ${buildCoverDensityText(opts.coverDensity)}`,
    "",
    "封面提示词规则：",
    buildCoverPromptRequirements(opts.beautyContext),
    "",
    "只输出 JSON（同 schema）。",
  ].join("\n")
}

export async function generateXhsV4(opts: { billing: BillingContext; draftId: string; input: GenerateV4Input }) {
  const { billing, draftId, input } = opts

  const beautyContext = buildBeautyContext({
    contentType: input.contentType,
    conflictLevel: input.conflictLevel,
    topic: input.topic,
    keywords: input.keywords,
    shopName: input.shopName,
  })
  const systemPrompt = buildSystemPrompt({
    contentType: input.contentType,
    conflictLevel: input.conflictLevel,
    beautyContext,
  })

  let rounds = 0
  let flags: GuardrailFlag[] = []
  let riskLevel: string | null = null
  let dangerCount: number | null = null

  let current: GenerateV4Result | null = null

  const maxRounds = Math.max(1, Math.min(3, input.maxRounds || 2))

  // Round 0: generate
  {
    const raw = await callDeepSeekJson({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(input, beautyContext) },
      ],
      maxTokens: 3600,
    })
    const parsed = llmOutputSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error("LLM 输出结构不符合预期（JSON schema）")
    }

    const data = parsed.data
    const replyTemplates = ensureStringArray(data.reply_templates, 3)
    const tags = ensureStringArray(data.tags, 12)
    const cover = {
      main: sanitizeStrictPublishText(data.cover_main).trim(),
      sub: sanitizeStrictPublishText(data.cover_sub).trim(),
    }
    const coverAsset = normalizeCoverAsset({
      ...cover,
      prompt: data.cover_prompt,
      negative: data.cover_negative,
      styleId: data.cover_style_id,
      styleReason: data.cover_style_reason,
      ctx: beautyContext,
    })
    const pinnedComment = shouldGeneratePinnedComment(input.commercialContext)
      ? (sanitizePinnedCommentText(data.pinned_comment || "").trim() || fallbackPinnedComment(input))
      : ""
    const coverPoints = sanitizeCoverPoints(data.cover_points, input.coverDensity)

    current = {
      title: data.title.trim(),
      body: sanitizeStrictPublishText(data.body).trim(),
      coverText: cover,
      pinnedComment,
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3).map(sanitizePinnedCommentText) : [],
      tags: tags.length ? tags : [],
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
      coverPoints,
      coverStyleId: coverAsset.styleId,
      coverStyleLabel: data.cover_style_label || coverAsset.styleLabel,
      coverStyleReason: data.cover_style_reason || coverAsset.styleReason,
      entryClass: data.entry_class || beautyContext.entryLabel,
      narrator: data.narrator || beautyContext.narratorName,
      persona: data.persona || beautyContext.personaHint,
    }
    current = ensureStoreAnchor(current, input)
  }

  for (rounds = 1; rounds <= maxRounds; rounds++) {
    if (!current) break

    // 1) self guardrails
    flags = [
      ...detectBodyAndCoverFlags({
        body: current.body,
        coverMain: current.coverText.main,
        coverSub: current.coverText.sub,
      }),
      ...(current.pinnedComment ? detectPinnedCommentFlags(current.pinnedComment) : []),
    ]

    // 2) upstream danger-check (best-effort)
    const danger = await callDangerCheck({ content: current.body, draftId, billing })
    riskLevel = danger.riskLevel
    dangerCount = danger.dangerCount

    if (!shouldRewrite(riskLevel, flags)) {
      break
    }

    if (rounds >= maxRounds) {
      break
    }

    // Revision round
    const revRaw = await callDeepSeekJson({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildRevisionPrompt({
            prev: current,
            flags,
            riskLevel,
            dangerCount,
            conflictLevel: input.conflictLevel,
            contentType: input.contentType,
            topic: input.topic,
            keywords: input.keywords,
            beautyContext,
            commercialContext: input.commercialContext,
            coverDensity: input.coverDensity,
          }),
        },
      ],
      maxTokens: 3600,
    })

    const revParsed = llmOutputSchema.safeParse(revRaw)
    if (!revParsed.success) {
      // If revise failed, keep previous and exit.
      break
    }

    const d = revParsed.data
    const replyTemplates = ensureStringArray(d.reply_templates, 3)
    const tags = ensureStringArray(d.tags, 12)
    const cover = {
      main: sanitizeStrictPublishText(d.cover_main).trim(),
      sub: sanitizeStrictPublishText(d.cover_sub).trim(),
    }
    const coverAsset = normalizeCoverAsset({
      ...cover,
      prompt: d.cover_prompt,
      negative: d.cover_negative,
      styleId: d.cover_style_id,
      styleReason: d.cover_style_reason,
      ctx: beautyContext,
    })
    const nextPinnedComment: string = shouldGeneratePinnedComment(input.commercialContext)
      ? (sanitizePinnedCommentText(d.pinned_comment || "").trim() || current.pinnedComment || fallbackPinnedComment(input))
      : ""
    const coverPoints = sanitizeCoverPoints(d.cover_points, input.coverDensity)

    current = {
      title: d.title.trim(),
      body: sanitizeStrictPublishText(d.body).trim(),
      coverText: cover,
      pinnedComment: nextPinnedComment,
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3).map(sanitizePinnedCommentText) : current.replyTemplates,
      tags: tags.length ? tags : current.tags,
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
      coverPoints: coverPoints.length ? coverPoints : current.coverPoints,
      coverStyleId: coverAsset.styleId,
      coverStyleLabel: d.cover_style_label || coverAsset.styleLabel,
      coverStyleReason: d.cover_style_reason || coverAsset.styleReason,
      entryClass: d.entry_class || current.entryClass || beautyContext.entryLabel,
      narrator: d.narrator || current.narrator || beautyContext.narratorName,
      persona: d.persona || current.persona || beautyContext.personaHint,
    }
    current = ensureStoreAnchor(current, input)
  }

  if (!current) {
    throw new Error("生成失败：无结果")
  }

  const guardrails: GuardrailsReport = {
    rounds,
    flags,
    riskLevel,
    dangerCount,
  }

  return { result: current, guardrails }
}
