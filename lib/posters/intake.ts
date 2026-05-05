import "server-only"

export type PosterAssetKind = "logo" | "store" | "product" | "people"

export type PosterAssetRef = {
  kind: PosterAssetKind
  bucket: string
  path: string
  contentType: string
}

export type StoreProfileForPoster = {
  id?: string
  name?: string | null
  city?: string | null
  district?: string | null
  landmark?: string | null
  shop_type?: string | null
  main_offer_name?: string | null
  promises?: unknown
}

export type PosterIntakeAnswers = {
  storeName?: string
  cityArea?: string
  industry?: string
  shopType?: string
  posterGoal?: string
  campaignTitle?: string
  projectName?: string
  headline?: string
  subline?: string
  audience?: string
  sellingPoints?: string
  offerText?: string
  dateRange?: string
  cta?: string
  constraints?: string
  templateId?: string
  stylePreset?: string
}

export type PosterBrief = Required<
  Pick<PosterIntakeAnswers, "storeName" | "cityArea" | "industry" | "shopType" | "posterGoal">
> &
  Omit<PosterIntakeAnswers, "storeName" | "cityArea" | "industry" | "shopType" | "posterGoal"> & {
    serviceRule: string
    sourceSummary: string
  }

export type PosterRecommendation = {
  templateId: string
  stylePreset: string
  confidence: number
  reason: string
  size: "4:5" | "3:4" | "9:16" | "16:9" | "1:1"
  resolution: "1k" | "2k"
}

const TEMPLATE_STYLE: Record<
  string,
  { stylePreset: string; size: PosterRecommendation["size"]; resolution: PosterRecommendation["resolution"] }
> = {
  P01: { stylePreset: "高级新客引流", size: "4:5", resolution: "2k" },
  P02: { stylePreset: "高级促销", size: "4:5", resolution: "2k" },
  P03: { stylePreset: "爆款项目种草", size: "4:5", resolution: "2k" },
  P04: { stylePreset: "品牌大片", size: "4:5", resolution: "2k" },
  P05: { stylePreset: "会员权益", size: "4:5", resolution: "2k" },
  P06: { stylePreset: "城市开业", size: "9:16", resolution: "2k" },
  P07: { stylePreset: "真实探店", size: "4:5", resolution: "2k" },
  P08: { stylePreset: "强标题攻略", size: "3:4", resolution: "2k" },
  P09: { stylePreset: "科普信息图", size: "3:4", resolution: "2k" },
  P10: { stylePreset: "菜单价目", size: "4:5", resolution: "2k" },
  P11: { stylePreset: "电子屏大字", size: "16:9", resolution: "2k" },
  P12: { stylePreset: "朋友圈轻分享", size: "4:5", resolution: "2k" },
}

const TEMPLATE_KEYWORDS: Array<{ id: string; words: string[]; reason: string }> = [
  { id: "P06", words: ["开业", "新店", "试营业", "入驻"], reason: "识别到开业/新店目标" },
  { id: "P11", words: ["电子屏", "大屏", "横版", "电视", "展架"], reason: "识别到店内屏幕/横版展示目标" },
  { id: "P10", words: ["菜单", "价目", "价格表", "服务清单", "项目表"], reason: "识别到菜单/价目表目标" },
  { id: "P08", words: ["避坑", "避雷", "攻略", "踩坑", "注意"], reason: "识别到攻略/避坑封面目标" },
  { id: "P09", words: ["科普", "知识", "一张图", "讲清楚", "信息图"], reason: "识别到科普信息图目标" },
  { id: "P07", words: ["探店", "打卡", "本地", "门店环境", "宝藏店"], reason: "识别到本地探店目标" },
  { id: "P05", words: ["会员", "办卡", "储值", "复购", "老客"], reason: "识别到会员/复购目标" },
  { id: "P12", words: ["朋友圈", "转发", "私域", "社群", "分享", "祝福", "节日快乐", "老顾客"], reason: "识别到朋友圈/私域分享目标" },
  { id: "P04", words: ["品牌", "形象", "高级", "信任", "调性"], reason: "识别到品牌形象目标" },
  { id: "P02", words: ["节日", "活动", "五一", "520", "七夕", "周年", "618", "双11"], reason: "识别到节日/活动促销目标" },
  { id: "P01", words: ["新客", "首单", "体验", "团购", "引流"], reason: "识别到新客引流目标" },
  { id: "P03", words: ["爆款", "项目", "产品", "套餐", "主推", "上新"], reason: "识别到主推项目/产品目标" },
]

function asText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function joinClean(parts: Array<string | null | undefined>, sep = "") {
  return parts.map((part) => asText(part)).filter(Boolean).join(sep)
}

function normalizeTemplateId(value: unknown) {
  const id = asText(value, 8).toUpperCase()
  return TEMPLATE_STYLE[id] ? id : ""
}

function promisesToRule(promises: unknown) {
  if (!promises || typeof promises !== "object") return ""
  const p = promises as Record<string, unknown>
  const items: string[] = []
  if (p.no_extra_charge || p.noUpsell || p.no_extra) items.push("不硬推")
  if (p.no_shrink || p.noShrink) items.push("不缩水")
  if (p.can_refuse || p.canRefuse) items.push("可拒绝")
  return items.join(" · ")
}

export function answersFromStoreProfile(profile: StoreProfileForPoster | null): PosterIntakeAnswers {
  if (!profile) return {}
  const cityArea = joinClean([profile.city, profile.district, profile.landmark], " ")
  return {
    storeName: asText(profile.name),
    cityArea,
    industry: asText(profile.shop_type) || "本地生活门店",
    shopType: asText(profile.shop_type),
    projectName: asText(profile.main_offer_name),
  }
}

function parseLineAnswers(message: string): PosterIntakeAnswers {
  const out: PosterIntakeAnswers = {}
  const map: Record<string, keyof PosterIntakeAnswers> = {
    店名: "storeName",
    门店: "storeName",
    品牌: "storeName",
    行业: "industry",
    品类: "industry",
    类型: "shopType",
    目标: "posterGoal",
    用途: "posterGoal",
    活动: "campaignTitle",
    项目: "projectName",
    产品: "projectName",
    标题: "headline",
    副标题: "subline",
    人群: "audience",
    卖点: "sellingPoints",
    优惠: "offerText",
    价格: "offerText",
    时间: "dateRange",
    日期: "dateRange",
    CTA: "cta",
    口令: "cta",
    禁忌: "constraints",
    不要: "constraints",
    商圈: "cityArea",
    地址: "cityArea",
  }

  for (const rawLine of message.split(/\n|；|;/)) {
    const line = rawLine.trim()
    const match = line.match(/^([^:：]{1,8})[:：]\s*(.+)$/)
    if (!match) continue
    const key = Object.keys(map).find((item) => match[1].includes(item))
    if (!key) continue
    out[map[key]] = asText(match[2], 160)
  }
  return out
}

function inferAnswers(message: string): PosterIntakeAnswers {
  const text = message.trim()
  const out = parseLineAnswers(text)
  if (!text) return out

  const storeName = inferStoreName(text)
  if (storeName) out.storeName ||= storeName

  const goalHit = TEMPLATE_KEYWORDS.find((item) => item.words.some((word) => text.includes(word)))
  if (goalHit) {
    out.templateId = goalHit.id
    out.posterGoal ||= goalHit.reason.replace(/^识别到/, "").replace(/目标$/, "")
  }

  const industryWords = ["美容", "美甲", "美睫", "皮肤管理", "餐饮", "火锅", "咖啡", "茶饮", "烘焙", "教培", "瑜伽", "健身", "宠物", "摄影", "家政", "养生", "零售"]
  const industry = industryWords.find((word) => text.includes(word))
  if (industry) {
    out.industry ||= industry
    out.shopType ||= industry
  }

  const audience = inferAudience(text)
  if (audience) out.audience ||= audience

  const offer = inferOfferText(text)
  if (offer) out.offerText ||= offer

  const date = inferDateRange(text)
  if (date) out.dateRange ||= date

  const topic = inferTopic(text, storeName)
  if (!out.campaignTitle && ["P02", "P05", "P06", "P12"].includes(goalHit?.id || "")) out.campaignTitle = topic
  if (!out.projectName && ["P01", "P03", "P10", "P11"].includes(goalHit?.id || "")) out.projectName = topic
  if (/不卖东西|不做促销|祝福|节日快乐/.test(text)) out.posterGoal ||= "节日祝福/客户维护"
  if (!out.headline) out.headline = topic
  return out
}

function firstShortPhrase(text: string) {
  const cleaned = text
    .replace(/[，。！？、]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 4 && part.length <= 18)
  return cleaned || text.slice(0, 16)
}

function splitClauses(text: string) {
  return text
    .split(/[\n，,。；;！!？?]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function inferStoreName(text: string) {
  const explicit = text.match(/(?:店名|门店|品牌|店叫|叫做|名字是)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9·&-]{2,18})/)
  if (explicit?.[1]) return explicit[1].trim()

  const first = splitClauses(text)[0] || ""
  if (
    first.length >= 2 &&
    first.length <= 14 &&
    !/(海报|活动|通知|祝福|第二杯|半价|折|元|优惠)/.test(first) &&
    /(咖啡|茶|茶饮|养生|美容|美甲|美睫|皮肤管理|瑜伽|健身|餐厅|火锅|烘焙|摄影|宠物|门店|店|馆|社|中心|工作室)$/.test(first)
  ) {
    return first
  }

  return ""
}

function inferAudience(text: string) {
  const giveMatch = text.match(/给([\u4e00-\u9fa5A-Za-z0-9·]{2,12})(?:发|看|用|送)/)
  if (giveMatch?.[1]) return giveMatch[1].trim()
  if (/老客|老顾客|会员/.test(text)) return "老顾客"
  if (/新客|新顾客|第一次/.test(text)) return "新顾客"
  const direct = text.match(/宝妈|学生|上班族|白领|情侣|亲子/)
  return direct?.[0] || ""
}

function inferOfferText(text: string) {
  const offer = text.match(
    /(?:第[一二三四五六七八九十\d]+杯半价|买[一二三四五六七八九十\d]+送[一二三四五六七八九十\d]+|满\s*\d{1,5}\s*减\s*\d{1,5}|[一二三四五六七八九十\d](?:\.\d)?\s*折|(?:¥|￥)\s*\d{1,5}(?:\.\d+)?\s*元?|(?:^|[^\d])\d{1,5}(?:\.\d+)?\s*元(?:起|\/人|\/次)?|免费|免单|赠送|立减\s*\d{1,5})/,
  )
  if (offer?.[0]) return offer[0].replace(/^[^\d¥￥一二三四五六七八九十买满第免赠立]+/, "").trim()
  if (/不卖东西|不做促销|祝福|节日快乐/.test(text)) return "节日祝福，不做促销"
  return ""
}

function inferDateRange(text: string) {
  const numeric = text.match(/\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?(?:\s*(?:到|至|[-~—])\s*\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?)?/)
  if (numeric?.[0]) return numeric[0].replace(/\s+/g, "")
  const festival = text.match(/本周|本月|周末|今天|明天|五一|端午|中秋|春节|暑假|国庆|七夕|520|母亲节|父亲节/)
  return festival?.[0] || ""
}

function inferTopic(text: string, storeName = "") {
  const clauses = splitClauses(text).filter((item) => item !== storeName)
  const topic =
    clauses.find((item) => /(活动|祝福|节日|通知|半价|折|优惠|新客|开业|上新|朋友圈)/.test(item)) ||
    clauses.find((item) => item.length >= 4 && item.length <= 22)
  return topic || firstShortPhrase(text)
}

function mergeAnswers(...items: Array<PosterIntakeAnswers | null | undefined>) {
  const out: PosterIntakeAnswers = {}
  for (const item of items) {
    if (!item) continue
    for (const [key, value] of Object.entries(item) as Array<[keyof PosterIntakeAnswers, string | undefined]>) {
      const text = asText(value, 180)
      if (text) out[key] = text
    }
  }
  return out
}

export function recommendPosterTemplate(answers: PosterIntakeAnswers): PosterRecommendation {
  const explicit = normalizeTemplateId(answers.templateId)
  if (explicit) {
    const style = TEMPLATE_STYLE[explicit]
    return { templateId: explicit, ...style, confidence: 0.95, reason: "用户或模型已明确模板" }
  }

  const haystack = [
    answers.posterGoal,
    answers.campaignTitle,
    answers.projectName,
    answers.headline,
    answers.sellingPoints,
    answers.constraints,
  ]
    .filter(Boolean)
    .join(" ")

  const hit = TEMPLATE_KEYWORDS.find((item) => item.words.some((word) => haystack.includes(word)))
  const id = hit?.id || "P03"
  const style = TEMPLATE_STYLE[id]
  return {
    templateId: id,
    ...style,
    confidence: hit ? 0.82 : 0.58,
    reason: hit?.reason || "信息较泛，默认按主推项目/产品海报处理",
  }
}

export function buildPosterBrief(opts: {
  profile: StoreProfileForPoster | null
  answers?: PosterIntakeAnswers
  message?: string
  llmAnswers?: PosterIntakeAnswers
}): PosterBrief {
  const profileAnswers = answersFromStoreProfile(opts.profile)
  const inferred = inferAnswers(opts.message || "")
  const merged = mergeAnswers(profileAnswers, opts.answers, inferred, opts.llmAnswers)
  const industry = merged.industry || merged.shopType || "本地生活门店"
  const shopType = merged.shopType || industry
  const cityArea =
    merged.cityArea || joinClean([opts.profile?.city, opts.profile?.district, opts.profile?.landmark], " ") || "本地商圈"
  const storeName = merged.storeName || asText(opts.profile?.name) || "你的门店"
  const projectName = merged.projectName || asText(opts.profile?.main_offer_name) || `${shopType}主推项目`
  const campaignTitle = merged.campaignTitle || merged.headline || `${storeName}活动`
  const headline = merged.headline || campaignTitle || projectName
  const subline = merged.subline || `适合想了解${shopType}的本地用户`
  const sellingPoints = merged.sellingPoints || "真实到店｜服务清楚｜新手友好"
  const cta = merged.cta || "立即预约"
  const serviceRule = promisesToRule(opts.profile?.promises) || "先了解 · 再决定"

  return {
    ...merged,
    storeName,
    cityArea,
    industry,
    shopType,
    posterGoal: merged.posterGoal || "生成一张可直接转发的商业海报",
    campaignTitle,
    projectName,
    headline,
    subline,
    audience: merged.audience || "本地潜在顾客",
    sellingPoints,
    offerText: merged.offerText || "到店专属权益",
    dateRange: merged.dateRange || "近期可约",
    cta,
    constraints: merged.constraints || "不要夸大承诺，不要低价土味风",
    serviceRule,
    sourceSummary: `${industry}｜${cityArea}｜${storeName}`,
  }
}

export function getPosterMissingFields(brief: PosterBrief) {
  const missing: string[] = []
  if (!brief.storeName || brief.storeName === "你的门店") missing.push("门店/品牌名称")
  if (!brief.industry || brief.industry === "本地生活门店") missing.push("行业/品类")
  if (!brief.posterGoal) missing.push("海报目标")
  if (!brief.projectName && !brief.campaignTitle && !brief.headline) missing.push("活动、项目、产品或主题")
  if (!brief.audience || brief.audience === "本地潜在顾客") missing.push("目标人群/适合对象")
  if (!brief.sellingPoints) missing.push("3-4个卖点")
  if (!brief.offerText || brief.offerText === "到店专属权益") missing.push("优惠/权益/价格")
  if (!brief.dateRange || brief.dateRange === "近期可约") missing.push("活动时间/有效期")
  if (!brief.cta) missing.push("行动号召")
  return missing.slice(0, 9)
}

function listToText(input: string, fallback: string) {
  return input
    .split(/[|｜,，、/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("｜") || fallback
}

export function buildPosterFieldsFromBrief(templateId: string, brief: PosterBrief): Record<string, string> {
  const tags = listToText(brief.sellingPoints || "", "真实到店｜服务清楚｜新手友好")
  const common = {
    _industry: brief.industry,
    _businessType: brief.shopType,
    _stylePreset: brief.stylePreset || TEMPLATE_STYLE[templateId]?.stylePreset || "商业海报",
    _targetAudience: brief.audience || "",
    _cta: brief.cta || "",
    _constraints: brief.constraints || "",
    _cityArea: brief.cityArea,
    _storeName: brief.storeName,
  }

  const base: Record<string, string> = {
    storeName: brief.storeName,
    cityArea: brief.cityArea,
    headline: brief.headline || brief.campaignTitle || brief.projectName || `${brief.shopType}推荐`,
    subline: brief.subline || `适合${brief.audience}`,
    projectName: brief.projectName || brief.campaignTitle || `${brief.shopType}项目`,
    campaignTitle: brief.campaignTitle || brief.headline || `${brief.storeName}活动`,
    sellingPoints: tags,
    offerText: brief.offerText || "到店专属权益",
    dateRange: brief.dateRange || "近期可约",
    serviceRule: brief.serviceRule || brief.cta || "先了解 · 再决定",
    trustRules: brief.serviceRule || "先了解 · 再决定",
    audience: brief.audience || "本地潜在顾客",
    highlights: tags,
    bookingLine: brief.cta || "立即预约",
    brandPromise: brief.headline || `${brief.storeName}，值得信任`,
    proofLine: brief.serviceRule || "信息透明，服务清楚",
    benefits: tags,
    giftLine: brief.offerText || "到店专属权益",
    openingGift: brief.offerText || "开业专属礼",
    addressLine: brief.cityArea,
    storeType: brief.shopType,
    reason: brief.subline || "值得收藏的本地好店",
    tags,
    topic: brief.projectName || brief.campaignTitle || brief.industry,
    point1: tags.split("｜")[0] || "先了解",
    point2: tags.split("｜")[1] || "看清楚",
    point3: tags.split("｜")[2] || "再决定",
    point4: brief.cta || "到店咨询",
    category1: `${brief.projectName || brief.shopType}：${brief.offerText || "到店咨询"}`,
    category2: `${tags.split("｜")[0] || "服务亮点"}：${tags.split("｜")[1] || "清楚透明"}`,
    category3: `${tags.split("｜")[2] || "预约方式"}：${brief.cta || "立即预约"}`,
    bottomLine: brief.cta || "到店咨询",
    shareOffer: brief.offerText || "转发可享到店礼",
  }

  return { ...base, ...common }
}

export function buildAssistantMessage(brief: PosterBrief, missingFields: string[], recommendation: PosterRecommendation) {
  if (missingFields.length) {
    const missing = missingFields.slice(0, 3).join("、")
    const topic = brief.campaignTitle || brief.projectName || brief.headline || brief.posterGoal
    return `我先抓到「${topic}」。还差 ${missing}，你直接一句话补上就行。`
  }

  const checks = [brief.headline, brief.offerText, brief.dateRange, brief.cta].filter(Boolean).slice(0, 3).join("｜")
  return `信息够了，适合做「${recommendation.stylePreset}」。先核对 ${checks}，没问题就点生成。`
}

export function shouldUseLlmFallback(answers: PosterIntakeAnswers, message: string, recommendation: PosterRecommendation) {
  if (!message.trim()) return false
  if (recommendation.confidence < 0.7) return true
  const provided = Object.values(answers).filter((value) => asText(value)).length
  return provided < 4 && message.trim().length > 18
}

export function safeJsonParseObject(input: string): Record<string, unknown> | null {
  const trimmed = input.trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function coercePosterAnswers(input: unknown): PosterIntakeAnswers {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const raw = input as Record<string, unknown>
  return {
    storeName: asText(raw.storeName),
    cityArea: asText(raw.cityArea),
    industry: asText(raw.industry),
    shopType: asText(raw.shopType),
    posterGoal: asText(raw.posterGoal),
    campaignTitle: asText(raw.campaignTitle),
    projectName: asText(raw.projectName),
    headline: asText(raw.headline),
    subline: asText(raw.subline),
    audience: asText(raw.audience),
    sellingPoints: asText(raw.sellingPoints, 180),
    offerText: asText(raw.offerText),
    dateRange: asText(raw.dateRange),
    cta: asText(raw.cta),
    constraints: asText(raw.constraints, 180),
    templateId: normalizeTemplateId(raw.templateId),
    stylePreset: asText(raw.stylePreset),
  }
}
