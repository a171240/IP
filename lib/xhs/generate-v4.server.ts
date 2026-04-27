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

function contentTypeStrategy(contentType: XhsContentType): string {
  if (contentType === "treatment") {
    return [
      "【攻略】写给“想做但怕踩坑”的顾客：从具体触发场景进入，拆出选择标准、流程判断和可核实细节。",
      "内容路径：她为什么现在需要 -> 最怕哪里不透明 -> 3-4条判断标准 -> 哪些情况建议先缓一缓。",
      "不要写成项目广告；像一线经营者在帮她做消费决策。",
    ].join("\n")
  }

  if (contentType === "education") {
    return [
      "【科普】写给“听过很多术语但还是不放心”的顾客：把专业知识翻译成生活场景和可理解边界。",
      "内容路径：常见误区/误会 -> 为什么会这样 -> 她能自己观察什么 -> 什么情况要谨慎。",
      "不制造容貌焦虑，不把护理说成医疗治疗，不承诺确定效果。",
    ].join("\n")
  }

  if (contentType === "promotion") {
    return [
      "【避雷】写给“被推销、加价、缩水体验伤过”的顾客：用骂点反推买点，只拆常见行为，不攻击具体人或店。",
      "内容路径：真实吐槽/顾虑 -> 这件事背后的风险 -> 识别方法 -> 门店应有的边界。",
      "冲突可以尖锐，但立场必须是替顾客降低决策成本。",
    ].join("\n")
  }

  return [
    "【对比】写给“正在两种方案之间纠结”的顾客：对比标准、适合人群、时间成本和风险边界。",
    "内容路径：同一个需求下的两类人 -> 各自更适合什么 -> 怎么判断自己是哪类 -> 别只看表面卖点。",
    "不点名拉踩同行，不做绝对优劣结论。",
  ].join("\n")
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

function pickCoverTemplate(main: string, sub: string): "warm-poster" | "hand-note" | "dialog-bubble" {
  const text = `${main}${sub}`
  if (/记到现在|说了句话|三个字|笑了一下|不用回消息|睡着了|日记/.test(text)) return "hand-note"
  if (/她说|他说|问我|跟我说|消息|发来|聊起来|原话/.test(text)) return "dialog-bubble"
  return "warm-poster"
}

function coverTemplateBrief(template: ReturnType<typeof pickCoverTemplate>) {
  if (template === "hand-note") {
    return [
      "【图片类型】小红书单张封面，手写感便签文字海报。",
      "【版式】像门店老板随手记下来的真心话，标题居中偏上，整句完整可读，留白充足。",
      "【视觉风格】奶油色便签纸、轻微纸张阴影、暖光晕染、真实纸张纹理，情绪安静但有停顿感。",
      "【中文字体描述】略带倾斜的手写体或行楷风格，保留一点不完美感，但每个字都必须清晰端正。",
      "【画面元素】一张奶油色便签纸，可有轻微胶带或阴影质感，不要复杂贴纸拼贴。",
    ].join("\n")
  }

  if (template === "dialog-bubble") {
    return [
      "【图片类型】小红书单张封面，对话气泡文字海报。",
      "【版式】单个主气泡承接标题，像聊天截图里的重点句，但不要做成真实平台界面。",
      "【视觉风格】浅米色背景，白色圆角气泡，柔和阴影，画面干净，只保留一个核心气泡。",
      "【中文字体描述】圆润的现代无衬线黑体，加粗，手机端一眼可读。",
      "【画面元素】只保留单个对话气泡和柔和背景，避免头像、时间戳、消息列表、平台 UI 元素。",
    ].join("\n")
  }

  return [
    "【图片类型】小红书单张封面，暖调强标题文字海报。",
    "【版式】三行冲突式或单句大字式，标题居中偏上，大字短句，整句先可读再做局部强调。",
    "【视觉风格】暖米白到浅杏色渐变背景，轻纸质肌理，留白 40-50%，不要信息图报告感。",
    "【中文字体描述】圆润的现代无衬线黑体，加粗，字距略松，主标题稳，重点词可用暖棕色强调。",
    "【画面元素】背景只保留暖调渐变、纸张肌理和轻微投影，不放人物、产品、门店陈列。",
  ].join("\n")
}

function buildBanana2CoverPrompt(opts: { main: string; sub: string }) {
  const { main, sub } = opts
  const template = pickCoverTemplate(main, sub)
  const prompt = [
    "画幅比例3:4竖版。",
    "为生活美容/皮肤管理门店生成一张小红书首图封面。",
    coverTemplateBrief(template),
    "",
    "【封面文字】",
    `主标题：${main}`,
    `副标题：${sub}`,
    "",
    "【文字规则】所有文字必须为清晰、准确、简体中文；严格按上面的主标题和副标题原样显示；不要自动改写，不要添加额外标语；不要乱码、错别字、英文或多余文字。",
    "【结构约束】只做小红书单张封面，保持单页表达，不放门店信息、价格、优惠、地址、平台名、二维码、电话、微信号、logo、水印。",
    "【输出目标】手机端高可读、情绪停顿感强、适合小红书封面点击。",
  ].join("\n")

  const negative = [
    "文字乱码，错别字，英文字母，多余文字，标题不清楚，小字糊掉，二维码，电话，微信号，平台名，团购，价格，优惠，地址，logo，水印，",
    "廉价促销风，土味红黄配色，信息过载，复杂背景，文字遮挡，人物照片，产品图，3D效果，卡通风格",
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

async function callDeepSeekJson(opts: { messages: Array<{ role: string; content: string }>; maxTokens: number }) {
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim()
  const baseUrl = (process.env.DEEPSEEK_XHS_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").trim()
  const model = (process.env.DEEPSEEK_XHS_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat").trim()

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

  let res = await doRequest({
    model,
    messages: opts.messages,
    temperature: 0.7,
    max_tokens: opts.maxTokens,
    stream: false,
    response_format: { type: "json_object" },
  })

  if (!res.ok && res.status === 400) {
    const lower = res.text.slice(0, 500).toLowerCase()
    if (lower.includes("response_format") || lower.includes("json_object")) {
      res = await doRequest({
        model,
        messages: opts.messages,
        temperature: 0.7,
        max_tokens: opts.maxTokens,
        stream: false,
      })
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

function buildSystemPrompt(opts: { contentType: XhsContentType; conflictLevel: ConflictLevel }) {
  const typeLabel = contentTypeLabel(opts.contentType)
  const cLabel = conflictLabel(opts.conflictLevel)
  const typeStrategy = contentTypeStrategy(opts.contentType)

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
    "本类目策略：",
    typeStrategy,
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
    "",
    "生成前请先在内部完成：选择一个具体顾客主角，判断她处在千机塔第4-6层的触发场景与即时情绪，再把内容写成可发布笔记；不要输出分析过程。",
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
    "5) 保留具体顾客场景、即时情绪和判断标准，不要改成空泛广告腔。",
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
    const raw = await callDeepSeekJson({
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
