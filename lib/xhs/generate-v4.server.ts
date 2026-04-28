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
  cover_prompt: z.string().min(80).max(5000).optional(),
  cover_negative: z.string().min(10).max(1500).optional(),
  pinned_comment: z.string().min(60).max(2000),
  reply_templates: z.array(z.string().min(10).max(400)).min(3).max(5).optional(),
  tags: z.array(z.string().min(1).max(40)).min(3).max(20).optional(),
})

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
    "3) 置顶评论 pinned_comment 允许给到“怎么找到门店”的路径，但不得直写平台名（大众点评/抖音），不得出现微信/手机号/二维码等联系方式收集。",
    "4) 不做医疗诊断与疗效承诺：禁用 治疗/根治/治好/百分百/立刻见效 等表述，用“舒缓/体验/因人而异/减少刺激”替代。",
    "5) 不点名攻击具体同行/个人；只描述常见行为话术与自己的边界规则。",
    "",
    "结构要求：",
    "- title：18字内，包含主关键词（若关键词为空则包含主题核心词）。",
    "- body：400-600字，短句、画面感；隐含链路为“具体顾客画像 -> 触发场景 -> 此刻情绪 -> 判断标准 -> 温和结论”。不要输出画像表。",
    "- body 必须包含至少3个“可核实细节”。若缺少门店档案信息，则改为“可验证判断标准/自检清单”，不要编造具体事实。",
    "- body 结尾可以留一个开放问题，但不能出现“评论区/私信/找我/来店”等动作词。",
    "- body 不写模板腔，不使用完整的“不是A，是B / 你要的不是X，是Y / 真正的X不是Y，是Z / 更扎心的是 / 换句话说 / 也就是说”。",
    "- cover_main：<=12字，冲突最大；cover_sub：<=16字，给答案/承诺（但不含CTA）。",
    "- cover_prompt：直接给 GPT-Image-2 使用的完整提示词，必须包含画幅、版式、文字、字体、风格、约束；不得只给一句描述。",
    "- cover_negative：单独给负面提示词。",
    "- pinned_comment：给两条路径（本地生活平台优先/短视频平台备用），都用“搜索门店昵称+地标/商圈”的方式表达；最后给出三条承诺口径（不加价/不缩水/可拒绝）。",
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
    '  "cover_prompt": "string",',
    '  "cover_negative": "string",',
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
    seed.length ? "差评/吐槽原话（可用来提炼冲突）：\n" + seed.join("\n") : "差评/吐槽原话：未提供（请用通用冲突种子）。",
    "",
    "本次自动路由结果：",
    buildBeautySourcePackText(beautyContext),
    "",
    "生成前请先在内部完成：选择一个具体顾客主角，判断她处在千机塔第4-6层的触发场景与即时情绪，再把内容写成可发布笔记；不要输出分析过程。",
    "封面提示词要直接可用于 GPT-Image-2，不能只输出主副标题。",
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
    "2) pinned_comment：不得出现 大众点评/抖音 字样；不得出现微信/手机号/二维码。",
    "3) 医疗合规：不得承诺疗效，不使用治疗/根治类词。",
    "4) 若当前档位为 hard 仍无法降风险，请把语气降到 standard 或 safe（更克制，不引战）。",
    "5) 保留具体顾客场景、即时情绪和判断标准，不要改成空泛广告腔。",
    "6) 同步重写 cover_prompt/cover_negative，仍然直接可用于 GPT-Image-2。",
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
      ctx: beautyContext,
    })

    current = {
      title: data.title.trim(),
      body: sanitizeStrictPublishText(data.body).trim(),
      coverText: cover,
      pinnedComment: sanitizePinnedCommentText(data.pinned_comment).trim(),
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3).map(sanitizePinnedCommentText) : [],
      tags: tags.length ? tags : [],
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
      entryClass: data.entry_class || beautyContext.entryLabel,
      narrator: data.narrator || beautyContext.narratorName,
      persona: data.persona || beautyContext.personaHint,
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
      ctx: beautyContext,
    })

    current = {
      title: d.title.trim(),
      body: sanitizeStrictPublishText(d.body).trim(),
      coverText: cover,
      pinnedComment: sanitizePinnedCommentText(d.pinned_comment).trim(),
      replyTemplates: replyTemplates.length >= 3 ? replyTemplates.slice(0, 3).map(sanitizePinnedCommentText) : current.replyTemplates,
      tags: tags.length ? tags : current.tags,
      coverPrompt: coverAsset.prompt,
      coverNegative: coverAsset.negative,
      entryClass: d.entry_class || current.entryClass || beautyContext.entryLabel,
      narrator: d.narrator || current.narrator || beautyContext.narratorName,
      persona: d.persona || current.persona || beautyContext.personaHint,
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
