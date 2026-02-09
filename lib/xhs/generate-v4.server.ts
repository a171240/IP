import "server-only"

import { z } from "zod"

import type { BillingContext } from "@/lib/xhs/proxy.server"
import { buildXhsUpstreamUrl } from "@/lib/xhs/proxy.server"
import {
  detectBodyAndCoverFlags,
  detectPinnedCommentFlags,
  type GuardrailFlag,
} from "@/lib/xhs/guardrails"

export type ConflictLevel = "safe" | "standard" | "hard"
export type XhsContentType = "treatment" | "education" | "promotion" | "comparison"

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
}

export type GuardrailsReport = {
  rounds: number
  flags: GuardrailFlag[]
  riskLevel: string | null
  dangerCount: number | null
}

const llmOutputSchema = z.object({
  title: z.string().min(1).max(60),
  body: z.string().min(120).max(8000),
  cover_main: z.string().min(2).max(20),
  cover_sub: z.string().min(2).max(28),
  pinned_comment: z.string().min(60).max(2000),
  reply_templates: z.array(z.string().min(10).max(400)).min(3).max(5).optional(),
  tags: z.array(z.string().min(1).max(40)).min(3).max(20).optional(),
})

function contentTypeLabel(contentType: XhsContentType): string {
  if (contentType === "treatment") return "攻略"
  if (contentType === "education") return "科普"
  if (contentType === "promotion") return "避雷"
  return "对比"
}

function conflictLabel(level: ConflictLevel): string {
  if (level === "safe") return "稳健"
  if (level === "hard") return "狠"
  return "标准"
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
  if (profile.promises) parts.push(`承诺口径：${JSON.stringify(profile.promises)}`)
  if (profile.included_steps) parts.push(`流程要点：${JSON.stringify(profile.included_steps)}`)

  return parts.length ? parts.join("\n") : "（已选择门店档案，但信息不完整：请避免编造具体事实。）"
}

function buildBanana2CoverPrompt(opts: { main: string; sub: string }) {
  const { main, sub } = opts
  const prompt = [
    "竖版3:4，小红书爆款封面，高情绪冲突“文字海报”设计。",
    "极简留白，奶油白/浅米色背景，高对比黑色粗体中文排版，少量红色强调色块。",
    "文字必须完全正确、清晰可读、无错别字、无乱码、无多余文字。",
    "",
    `主标题（超大，居中，占画面60%）：《${main}》`,
    `副标题（中号，放主标题下方，占20%）：《${sub}》`,
    "",
    "风格：现代排版、干净、克制、有压迫感。",
    "禁止出现：二维码、电话、微信号、平台名、团购、地址、logo、水印。",
  ].join("\n")

  const negative = [
    "watermark, logo, QR code, phone number, extra text, messy layout,",
    "garbled Chinese characters, misspelled Chinese, blurry text, low resolution",
  ].join(" ")

  return { prompt, negative }
}

function ensureStringArray(input: unknown, len = 3): string[] {
  if (!Array.isArray(input)) return []
  const arr = input.map((v) => String(v || "").trim()).filter(Boolean)
  if (!arr.length) return []
  return arr.slice(0, Math.max(1, len))
}

function safeJsonParse(text: string): unknown {
  const trimmed = (text || "").trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

async function callApimartJson(opts: { messages: Array<{ role: string; content: string }>; maxTokens: number }) {
  const apiKey = process.env.APIMART_API_KEY
  const baseUrl = process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1"
  const model = process.env.APIMART_MODEL || "gpt-4o"

  if (!apiKey || apiKey === "your-api-key-here") {
    throw new Error("APIMART_API_KEY 未配置")
  }

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: 0.7,
      max_tokens: opts.maxTokens,
      stream: false,
    }),
  })

  const jsonText = await upstream.text().catch(() => "")
  if (!upstream.ok) {
    throw new Error(`上游 LLM 错误: ${upstream.status} ${jsonText.slice(0, 200)}`)
  }

  const parsed = safeJsonParse(jsonText)
  const content = (() => {
    if (!parsed || typeof parsed !== "object") return ""
    const choices = (parsed as Record<string, unknown>).choices
    if (!Array.isArray(choices) || choices.length === 0) return ""
    const first = choices[0]
    if (!first || typeof first !== "object") return ""
    const message = (first as Record<string, unknown>).message
    if (!message || typeof message !== "object") return ""
    const c = (message as Record<string, unknown>).content
    return typeof c === "string" ? c : ""
  })()
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("LLM 未返回有效内容")
  }

  const data = safeJsonParse(content)
  return data
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

function buildSystemPrompt(opts: { contentType: XhsContentType; conflictLevel: ConflictLevel }) {
  const typeLabel = contentTypeLabel(opts.contentType)
  const cLabel = conflictLabel(opts.conflictLevel)

  // IMPORTANT:
  // - 正文与首图文案严格禁CTA
  // - 置顶评论不写平台名（大众点评/抖音）
  // - 只怼行为话术，不点名攻击
  return [
    "你是“美容行业小红书图文增长策略师 + 情绪冲突文案导演”。",
    "",
    `当前任务：生成一条【${typeLabel}】笔记（中文），冲突强度档位：${cLabel}。`,
    "",
    "硬性规则（必须遵守）：",
    "1) 正文 body 严格禁CTA：不得出现 评论/私信/关注/加V/微信/VX/电话/扫码/链接/预约/到店 等导流动作；不得出现 大众点评/抖音/团购/下单/买券/核销/价格/优惠/地址/定位/导航 等交易/平台词。",
    "2) 首图文案 cover_main/cover_sub 同样严格禁CTA与平台/交易词。",
    "3) 置顶评论 pinned_comment 允许给到“怎么找到门店”的路径，但不得直写平台名（大众点评/抖音），不得出现微信/手机号/二维码等联系方式收集。",
    "4) 不做医疗诊断与疗效承诺：禁用 治疗/根治/治好/百分百/立刻见效 等表述，用“舒缓/体验/因人而异/减少刺激”替代。",
    "5) 不点名攻击具体同行/个人；只描述常见行为话术与自己的边界规则。",
    "",
    "结构要求：",
    "- title：18字内，包含主关键词（若关键词为空则包含主题核心词）。",
    "- body：400-600字，短句、画面感；必须包含至少3个“可核实细节”。若缺少门店档案信息，则改为“可验证判断标准/自检清单”，不要编造具体事实。",
    "- cover_main：<=12字，冲突最大；cover_sub：<=16字，给答案/承诺（但不含CTA）。",
    "- pinned_comment：给两条路径（本地生活平台优先/短视频平台备用），都用“搜索门店昵称+地标/商圈”的方式表达；最后给出三条承诺口径（不加价/不缩水/可拒绝）。",
    "- reply_templates：3条（反推销/敏感肌合规/本地怎么找店，不写平台名）。",
    "- tags：8-12个，含本地词+服务词+情绪词；避免敏感词与平台名。",
    "",
    "输出格式：只输出一个JSON对象，且必须能被 JSON.parse 解析；不得输出多余解释文本。",
    "",
    "JSON schema：",
    "{",
    '  "title": "string",',
    '  "body": "string",',
    '  "cover_main": "string",',
    '  "cover_sub": "string",',
    '  "pinned_comment": "string",',
    '  "reply_templates": ["string","string","string"],',
    '  "tags": ["#tag1", "#tag2"]',
    "}",
  ].join("\n")
}

function buildUserPrompt(input: GenerateV4Input) {
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
    seed.length ? "差评/吐槽原话（可用来提炼冲突）：\n" + seed.join("\n") : "差评/吐槽原话：未提供（请用通用冲突种子）。",
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
    "2) pinned_comment：不得出现 大众点评/抖音 字样；不得出现微信/手机号/二维码。",
    "3) 医疗合规：不得承诺疗效，不使用治疗/根治类词。",
    "4) 若当前档位为 hard 仍无法降风险，请把语气降到 standard 或 safe（更克制，不引战）。",
    "",
    "只输出 JSON（同 schema）。",
  ].join("\n")
}

export async function generateXhsV4(opts: { billing: BillingContext; draftId: string; input: GenerateV4Input }) {
  const { billing, draftId, input } = opts

  const systemPrompt = buildSystemPrompt({ contentType: input.contentType, conflictLevel: input.conflictLevel })

  let rounds = 0
  let flags: GuardrailFlag[] = []
  let riskLevel: string | null = null
  let dangerCount: number | null = null

  let current: GenerateV4Result | null = null

  const maxRounds = Math.max(1, Math.min(3, input.maxRounds || 2))

  // Round 0: generate
  {
    const raw = await callApimartJson({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(input) },
      ],
      maxTokens: 2600,
    })
    const parsed = llmOutputSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error("LLM 输出结构不符合预期（JSON schema）")
    }

    const data = parsed.data
    const replyTemplates = ensureStringArray(data.reply_templates, 3)
    const tags = ensureStringArray(data.tags, 12)
    const cover = { main: data.cover_main.trim(), sub: data.cover_sub.trim() }
    const coverAsset = buildBanana2CoverPrompt(cover)

    current = {
      title: data.title.trim(),
      body: data.body.trim(),
      coverText: cover,
      pinnedComment: data.pinned_comment.trim(),
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3) : [],
      tags: tags.length ? tags : [],
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
    }
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
      ...detectPinnedCommentFlags(current.pinnedComment),
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
    const revRaw = await callApimartJson({
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
          }),
        },
      ],
      maxTokens: 2600,
    })

    const revParsed = llmOutputSchema.safeParse(revRaw)
    if (!revParsed.success) {
      // If revise failed, keep previous and exit.
      break
    }

    const d = revParsed.data
    const replyTemplates = ensureStringArray(d.reply_templates, 3)
    const tags = ensureStringArray(d.tags, 12)
    const cover = { main: d.cover_main.trim(), sub: d.cover_sub.trim() }
    const coverAsset = buildBanana2CoverPrompt(cover)

    current = {
      title: d.title.trim(),
      body: d.body.trim(),
      coverText: cover,
      pinnedComment: d.pinned_comment.trim(),
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3) : current.replyTemplates,
      tags: tags.length ? tags : current.tags,
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
    }
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
