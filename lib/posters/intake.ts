import "server-only"

export type PosterAssetKind = "style" | "logo" | "store" | "product" | "people"

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
  resolution: "1k"
}

const TEMPLATE_STYLE: Record<
  string,
  { stylePreset: string; size: PosterRecommendation["size"]; resolution: PosterRecommendation["resolution"] }
> = {
  P01: { stylePreset: "高级新客引流", size: "4:5", resolution: "1k" },
  P02: { stylePreset: "高级促销", size: "4:5", resolution: "1k" },
  P03: { stylePreset: "爆款项目种草", size: "4:5", resolution: "1k" },
  P04: { stylePreset: "品牌大片", size: "4:5", resolution: "1k" },
  P05: { stylePreset: "会员权益", size: "4:5", resolution: "1k" },
  P06: { stylePreset: "城市开业", size: "9:16", resolution: "1k" },
  P07: { stylePreset: "真实探店", size: "4:5", resolution: "1k" },
  P08: { stylePreset: "强标题攻略", size: "3:4", resolution: "1k" },
  P09: { stylePreset: "科普信息图", size: "3:4", resolution: "1k" },
  P10: { stylePreset: "菜单价目", size: "4:5", resolution: "1k" },
  P11: { stylePreset: "电子屏大字", size: "16:9", resolution: "1k" },
  P12: { stylePreset: "朋友圈轻分享", size: "4:5", resolution: "1k" },
  P13: { stylePreset: "节日祝福杂志感", size: "4:5", resolution: "1k" },
}

const TEMPLATE_KEYWORDS: Array<{ id: string; words: string[]; reason: string }> = [
  { id: "P06", words: ["开业", "新店", "试营业", "入驻"], reason: "识别到开业/新店目标" },
  { id: "P11", words: ["电子屏", "大屏", "横版", "电视", "展架"], reason: "识别到店内屏幕/横版展示目标" },
  { id: "P10", words: ["菜单", "价目", "价格表", "服务清单", "项目表"], reason: "识别到菜单/价目表目标" },
  { id: "P08", words: ["避坑", "避雷", "攻略", "踩坑", "注意"], reason: "识别到攻略/避坑封面目标" },
  { id: "P09", words: ["科普", "知识", "一张图", "讲清楚", "信息图"], reason: "识别到科普信息图目标" },
  { id: "P07", words: ["探店", "打卡", "本地", "门店环境", "宝藏店"], reason: "识别到本地探店目标" },
  { id: "P05", words: ["会员", "办卡", "储值", "复购", "老客"], reason: "识别到会员/复购目标" },
  { id: "P13", words: ["祝福", "问候", "安康", "不卖东西", "不促销", "不卖货", "客户群问候"], reason: "识别到非促销节日祝福/客户关怀目标" },
  { id: "P12", words: ["朋友圈", "转发", "私域", "社群", "分享"], reason: "识别到朋友圈/私域分享目标" },
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

function hasBeautySignal(...values: Array<string | undefined>) {
  const text = values.map((value) => asText(value)).join(" ")
  return /美容|皮肤|护肤|美甲|美睫|养生|面部|补水|清洁|舒缓|提亮|焕颜/.test(text)
}

function defaultCampaignDate(...values: Array<string | undefined>) {
  const text = values.map((value) => asText(value)).join(" ")
  if (/五一|劳动节/.test(text)) return "五一期间"
  if (/端午/.test(text)) return "端午期间"
  if (/中秋/.test(text)) return "中秋期间"
  if (/春节|新年/.test(text)) return "春节期间"
  if (/520/.test(text)) return "520期间"
  if (/七夕/.test(text)) return "七夕期间"
  if (/女神节/.test(text)) return "女神节期间"
  if (/周年/.test(text)) return "周年庆期间"
  return "近期可约"
}

function defaultSubline(opts: {
  industry: string
  shopType: string
  campaignTitle: string
  dateRange: string
  audience?: string
}) {
  const haystack = `${opts.industry} ${opts.shopType} ${opts.campaignTitle} ${opts.dateRange} ${opts.audience || ""}`
  if (/五一|劳动节/.test(haystack)) return "假期前，把好状态养回来"
  if (/520|七夕/.test(haystack)) return "把好状态留给重要时刻"
  if (/女神节/.test(haystack)) return "把今天的好状态送给自己"
  if (hasBeautySignal(haystack)) return "把好状态留给重要时刻"
  return "把到店体验安排得更清楚"
}

function defaultSellingPoints(industry: string, shopType: string) {
  if (hasBeautySignal(industry, shopType)) return "补水｜清洁｜舒缓｜提亮"
  return "真实到店｜服务清楚｜新手友好"
}

function defaultOfferText(industry: string, shopType: string) {
  if (hasBeautySignal(industry, shopType)) return "到店护理体验礼"
  return "到店专属体验"
}

function inferStylePreset(text: string) {
  const styleHits = [
    "高级感",
    "杂志感",
    "高端",
    "轻奢",
    "极简",
    "留白",
    "温暖",
    "清冷",
    "奶油风",
    "法式",
    "国风",
    "东方美学",
    "小红书",
    "真实摄影",
    "商业摄影",
    "品牌大片",
  ].filter((word) => text.includes(word))

  const explicit = text.match(/(?:风格|感觉|调性|参考|类似|像)(?:要|想要|做成|做得)?([^，。！？\n]{2,28})/)
  const phrase = explicit?.[1]?.trim().replace(/^(一点|一些|这种|这个|那种|那个)/, "")
  return [phrase, ...styleHits].filter(Boolean).slice(0, 4).join("，")
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
  const wantsThemeChange = /(?:主题|标题).{0,8}(?:不好|不对|不合适|换|改)|换个主题|重新定主题|不要这个主题/.test(text)

  const goalHit = TEMPLATE_KEYWORDS.find((item) => item.words.some((word) => text.includes(word)))
  if (goalHit) {
    out.templateId = goalHit.id
    out.posterGoal ||= goalHit.reason.replace(/^识别到/, "").replace(/目标$/, "")
    if (goalHit.id === "P13") {
      const blessing = inferFestivalBlessing(text)
      out.campaignTitle ||= `${blessing.festivalName}祝福`
      out.headline ||= blessing.headline
      out.subline ||= blessing.subline
      out.dateRange ||= blessing.festivalName
      out.constraints ||= "不卖东西，不做促销，只做节日问候和老客关怀"
    }
  }

  const industryWords = ["美容", "美甲", "美睫", "皮肤管理", "餐饮", "火锅", "咖啡", "茶饮", "烘焙", "教培", "瑜伽", "健身", "宠物", "摄影", "家政", "养生", "零售"]
  const industry = industryWords.find((word) => text.includes(word))
  if (industry) {
    out.industry ||= industry
    out.shopType ||= industry
  }

  const stylePreset = inferStylePreset(text)
  if (stylePreset) out.stylePreset ||= stylePreset

  if (/女性|女士|女客|女生|姐姐|宝妈|妈妈|宝妈群体/.test(text)) {
    out.audience ||= "女性顾客"
  } else if (/男性|男士|男客|男生/.test(text)) {
    out.audience ||= "男性顾客"
  }

  const price = text.match(/(?:¥|￥)?\s*\d{1,5}\s*(?:元|起|\/人|\/次)?/)
  if (price) out.offerText ||= price[0].trim()

  const date = text.match(/(?:\d{1,2}[./月-]\d{1,2}(?:[日号])?(?:\s*[-~到至]\s*\d{1,2}[./月-]\d{1,2}(?:[日号])?)?|本周|本月|周末|今天|明天|五一|端午|中秋|春节|暑假)/)
  if (date) out.dateRange ||= date[0].trim()

  if (!out.campaignTitle && goalHit?.id === "P02") out.campaignTitle = firstShortPhrase(text)
  if (!out.projectName && ["P01", "P03", "P10", "P11"].includes(goalHit?.id || "")) out.projectName = firstShortPhrase(text)
  if (wantsThemeChange) {
    out.constraints ||= "不要沿用上一版主题，重新换一个更合适的主题"
  } else if (!out.headline && !out.audience && !out.industry) {
    out.headline = firstShortPhrase(text)
  }
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

function inferFestivalBlessing(text: string) {
  if (/端午/.test(text)) return { festivalName: "端午", headline: "端午安康", subline: "愿你清爽一夏" }
  if (/中秋/.test(text)) return { festivalName: "中秋", headline: "中秋安康", subline: "愿你团圆顺遂" }
  if (/春节|新年/.test(text)) return { festivalName: /新年/.test(text) ? "新年" : "春节", headline: "新春安康", subline: "愿新一年皆是好状态" }
  if (/七夕/.test(text)) return { festivalName: "七夕", headline: "七夕快乐", subline: "把好状态留给重要时刻" }
  if (/520/.test(text)) return { festivalName: "520", headline: "愿你被温柔以待", subline: "把好状态送给自己" }
  if (/女神节/.test(text)) return { festivalName: "女神节", headline: "女神节快乐", subline: "把今天的好状态送给自己" }
  return { festivalName: "节日", headline: "节日安康", subline: "愿你平安顺遂" }
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
    return {
      templateId: explicit,
      ...style,
      stylePreset: asText(answers.stylePreset) || style.stylePreset,
      confidence: 0.95,
      reason: "用户或模型已明确模板",
    }
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
    stylePreset: asText(answers.stylePreset) || style.stylePreset,
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
  const dateRange = merged.dateRange || defaultCampaignDate(campaignTitle, merged.posterGoal, merged.constraints)
  const subline = merged.subline || defaultSubline({ industry, shopType, campaignTitle, dateRange, audience: merged.audience })
  const sellingPoints = merged.sellingPoints || defaultSellingPoints(industry, shopType)
  const offerText = merged.offerText || defaultOfferText(industry, shopType)
  const cta = merged.cta || "预约到店"
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
    offerText,
    dateRange,
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
    festivalName: brief.dateRange || brief.campaignTitle || "节日",
    blessingTitle: brief.headline || brief.campaignTitle || "节日安康",
    blessingSubtitle: brief.subline || "愿你平安顺遂",
    signature: brief.storeName,
  }

  return { ...base, ...common }
}

export function buildAssistantMessage(brief: PosterBrief, missingFields: string[], recommendation: PosterRecommendation) {
  if (missingFields.length) {
    return `我理解了，方向先按「${brief.headline || brief.campaignTitle}」来。还差 ${missingFields.slice(0, 2).join("、")}。如果有 Logo、门头图或项目图，也可以点加号上传，我会一起参考。`
  }

  return `信息够了，我会按「${brief.headline || brief.campaignTitle}」和「${recommendation.stylePreset}」方向生成。你可以直接生成，也可以继续补 Logo、门头图或想避开的风格。`
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
    storeName: asText(raw.storeName) || asText(raw._storeName),
    cityArea: asText(raw.cityArea) || asText(raw._cityArea) || asText(raw.addressLine),
    industry: asText(raw.industry) || asText(raw._industry),
    shopType: asText(raw.shopType) || asText(raw._businessType) || asText(raw.storeType),
    posterGoal: asText(raw.posterGoal),
    campaignTitle: asText(raw.campaignTitle),
    projectName: asText(raw.projectName) || asText(raw.topic),
    headline: asText(raw.headline),
    subline: asText(raw.subline),
    audience: asText(raw.audience) || asText(raw._targetAudience),
    sellingPoints: asText(raw.sellingPoints, 180) || asText(raw.highlights, 180) || asText(raw.benefits, 180) || asText(raw.tags, 180),
    offerText: asText(raw.offerText) || asText(raw.giftLine) || asText(raw.openingGift) || asText(raw.shareOffer),
    dateRange: asText(raw.dateRange),
    cta: asText(raw.cta) || asText(raw._cta) || asText(raw.bookingLine) || asText(raw.bottomLine),
    constraints: asText(raw.constraints, 180) || asText(raw._constraints, 180),
    templateId: normalizeTemplateId(raw.templateId),
    stylePreset: asText(raw.stylePreset),
  }
}
