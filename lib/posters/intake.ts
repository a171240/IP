import "server-only"

import {
  getDefaultLayoutPresetId,
  getPosterLayoutPreset,
  getTemplateLayoutCandidateIds,
  inferLayoutPresetFromText,
  normalizeLayoutPresetId,
} from "./layout-presets"

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
  layoutPresetId?: string
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
  layoutPresetId: string
  layoutCandidates: string[]
}

export type PosterVisibleCopy = {
  title: string
  subtitle: string
  tags: string[]
  offer: string
  dateRange: string
  cta: string
  storeSignature: string
}

export type PosterPlan = {
  intent: {
    goal: string
    scene: string
    festivalName: string
    templateId: string
    userCommand: string
  }
  visibleCopy: PosterVisibleCopy
  hiddenContext: {
    storeProfileId: string
    storeName: string
    cityArea: string
    industry: string
    shopType: string
    projectName: string
    audience: string
    stylePreset: string
    constraints: string
    layoutPresetId: string
    layoutName: string
    layoutPresetVersion: string
    assetKinds: string[]
  }
  safety: {
    sanitizedFields: string[]
    autoGenerateBlocked: boolean
    visibleCopyWarnings: string[]
  }
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
  { id: "P13", words: ["祝福", "问候", "安康", "不卖东西", "不促销", "不卖货", "客户群问候"], reason: "识别到非促销节日祝福/客户关怀目标" },
  { id: "P05", words: ["会员", "办卡", "储值", "复购", "老客"], reason: "识别到会员/复购目标" },
  { id: "P12", words: ["朋友圈", "转发", "私域", "社群", "分享"], reason: "识别到朋友圈/私域分享目标" },
  { id: "P02", words: ["节日", "活动", "五一", "520", "七夕", "周年", "618", "双11"], reason: "识别到节日/活动促销目标" },
  { id: "P01", words: ["新客", "首单", "体验", "团购", "引流"], reason: "识别到新客引流目标" },
  { id: "P04", words: ["品牌", "形象", "信任", "调性"], reason: "识别到品牌形象目标" },
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

function compactText(value: unknown, max = 220) {
  return asText(value, max).replace(/\s+/g, "")
}

const POSTER_COMMAND_PATTERN =
  /(?:请|麻烦|帮我|给我|我要|我想|想要|需要|帮忙)?(?:生成|做|制作|设计|出|来|搞|弄|开做|出图|做图).{0,28}(?:海报|图片|图|封面)|(?:宣传海报|生成海报|做海报|出图|做图)/

export function containsPosterCommandText(value: unknown) {
  const text = compactText(value)
  if (!text) return false
  return POSTER_COMMAND_PATTERN.test(text) || /(?:请|麻烦|帮我|给我|我要|我想|想要|需要|帮忙).{0,18}(?:海报|图片|图|封面)/.test(text)
}

export function stripPosterCommandText(value: unknown) {
  let text = asText(value, 220)
  if (!text) return ""

  text = text
    .replace(/^(?:请|麻烦|帮我|给我|我要|我想|想要|需要|帮忙)?\s*(?:生成|做|制作|设计|出|来|搞|弄|开做|出图|做图)?\s*(?:一张|一个|一份|张)?\s*/g, "")
    .replace(/(?:给我|帮我|我要|我想|想要|需要|请|麻烦|帮忙)/g, "")
    .replace(/(?:直接|现在|马上|立即|开始)?(?:生成|出图|做图|开做)(?:吧|呀|哦)?/g, "")
    .replace(/(?:的)?(?:宣传|活动|门店|节日|小红书)?海报/g, "")
    .replace(/(?:图片|配图|封面)/g, "")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[，。！？、,.!?~～\s]+|[，。！？、,.!?~～\s]+$/g, "")
    .trim()

  return text.slice(0, 120)
}

function extractFestivalName(...values: Array<string | undefined>) {
  const text = values.map((value) => asText(value)).join(" ")
  if (/五一|劳动节/.test(text)) return "五一"
  if (/端午/.test(text)) return "端午"
  if (/中秋/.test(text)) return "中秋"
  if (/春节|新年/.test(text)) return /新年/.test(text) ? "新年" : "春节"
  if (/520/.test(text)) return "520"
  if (/七夕/.test(text)) return "七夕"
  if (/女神节/.test(text)) return "女神节"
  if (/周年/.test(text)) return "周年"
  if (/618/.test(text)) return "618"
  return ""
}

function fallbackCampaignTitleFromText(text: string, answers: PosterIntakeAnswers = {}) {
  const festival = extractFestivalName(text, answers.campaignTitle, answers.headline)
  const haystack = `${text} ${answers.industry || ""} ${answers.shopType || ""} ${answers.projectName || ""}`
  if (festival === "五一") return hasBeautySignal(haystack) ? "五一焕颜季" : "五一焕新季"
  if (festival === "520" || festival === "七夕") return `${festival}心动焕颜礼`
  if (festival === "女神节") return "女神节宠爱季"
  if (festival) return `${festival}焕新季`
  if (/新客|首单|体验/.test(haystack)) return "新客体验礼"
  if (/会员|老客|复购/.test(haystack)) return "会员宠粉礼"
  return ""
}

function refineCampaignTitleForContext(title: string, ...values: Array<string | undefined>) {
  const haystack = [title, ...values].map((value) => asText(value)).join(" ")
  if (title === "五一焕新季" && hasBeautySignal(haystack)) return "五一焕颜季"
  return title
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
  const copyText = stripPosterCommandText(text)
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
  const layoutPresetId = inferLayoutPresetFromText(text, out.templateId)
  if (layoutPresetId) out.layoutPresetId ||= layoutPresetId

  if (/女性|女士|女客|女生|姐姐|宝妈|妈妈|宝妈群体/.test(text)) {
    out.audience ||= "女性顾客"
  } else if (/男性|男士|男客|男生/.test(text)) {
    out.audience ||= "男性顾客"
  }

  const price = text.match(/(?:¥|￥)?\s*\d{1,5}\s*(?:元|起|\/人|\/次)?/)
  if (price) out.offerText ||= price[0].trim()

  const date = text.match(/(?:\d{1,2}[./月-]\d{1,2}(?:[日号])?(?:\s*[-~到至]\s*\d{1,2}[./月-]\d{1,2}(?:[日号])?)?|本周|本月|周末|今天|明天|五一|端午|中秋|春节|暑假)/)
  if (date) out.dateRange ||= date[0].trim()

  if (!out.campaignTitle && goalHit?.id === "P02") {
    out.campaignTitle = fallbackCampaignTitleFromText(text, out) || firstShortPhrase(copyText || text)
  }
  if (!out.projectName && ["P01", "P03", "P10", "P11"].includes(goalHit?.id || "")) {
    out.projectName = firstShortPhrase(copyText || text)
  }
  if (wantsThemeChange) {
    out.constraints ||= "不要沿用上一版主题，重新换一个更合适的主题"
  } else if (!out.headline && !out.audience && !out.industry && copyText && !containsPosterCommandText(copyText)) {
    out.headline = firstShortPhrase(copyText)
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

const TITLE_LIKE_FIELDS = new Set([
  "headline",
  "campaignTitle",
  "projectName",
  "brandPromise",
  "topic",
  "blessingTitle",
])

const VISIBLE_COPY_FIELDS = new Set([
  "storeName",
  "cityArea",
  "headline",
  "subline",
  "projectName",
  "campaignTitle",
  "sellingPoints",
  "offerText",
  "dateRange",
  "serviceRule",
  "trustRules",
  "audience",
  "highlights",
  "bookingLine",
  "brandPromise",
  "proofLine",
  "benefits",
  "giftLine",
  "openingGift",
  "addressLine",
  "storeType",
  "reason",
  "tags",
  "topic",
  "point1",
  "point2",
  "point3",
  "point4",
  "category1",
  "category2",
  "category3",
  "bottomLine",
  "shareOffer",
  "festivalName",
  "blessingTitle",
  "blessingSubtitle",
  "signature",
])

function splitCopyTags(value: string) {
  return value
    .split(/[|｜、，,~～·・]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
}

function isWeakTitleLikeCopy(key: string, value: string) {
  if (!TITLE_LIKE_FIELDS.has(key)) return false
  const text = value.trim()
  if (!text) return false
  if (/^(五一|劳动节|端午|中秋|春节|新年|520|七夕|女神节|618|周年)$/.test(text)) return true
  return /(?:宣传)?海报|图片|配图|封面/.test(text)
}

function fallbackVisibleField(key: string, templateId: string, fields: Record<string, string>) {
  const haystack = Object.values(fields).join(" ")
  const industry = fields._industry || fields._businessType || fields.industry || ""
  const shopType = fields._businessType || fields.storeType || industry || "门店服务"
  const festival = extractFestivalName(haystack)
  const campaignTitle = fallbackCampaignTitleFromText(haystack, {
    industry,
    shopType,
    projectName: fields.projectName || fields.topic,
    campaignTitle: fields.campaignTitle,
    headline: fields.headline,
  })

  if (key === "storeName" || key === "signature") return fields._storeName || "你的门店"
  if (key === "campaignTitle") return campaignTitle || `${shopType}活动`
  if (key === "headline" || key === "brandPromise" || key === "topic") return campaignTitle || fields.projectName || `${shopType}推荐`
  if (key === "projectName") return fields.projectName || fields.topic || `${shopType}项目`
  if (key === "subline") {
    if (festival === "五一") return "假期也要美美的"
    if (templateId === "P13") return inferFestivalBlessing(haystack).subline
    return hasBeautySignal(haystack) ? "把好状态留给重要时刻" : "到店体验安排得更清楚"
  }
  if (key === "sellingPoints" || key === "highlights" || key === "benefits" || key === "tags") {
    return defaultSellingPoints(industry, shopType)
  }
  if (key === "offerText" || key === "giftLine" || key === "openingGift" || key === "shareOffer") {
    return defaultOfferText(industry, shopType)
  }
  if (key === "dateRange") return defaultCampaignDate(haystack)
  if (key === "festivalName") return festival || "节日"
  if (key === "blessingTitle") return inferFestivalBlessing(haystack).headline
  if (key === "blessingSubtitle") return inferFestivalBlessing(haystack).subline
  if (key === "bookingLine" || key === "bottomLine" || key === "point4") return fields._cta || "预约到店"
  if (key === "cityArea" || key === "addressLine") return fields._cityArea || "本地商圈"
  if (key === "storeType") return shopType
  if (key === "reason" || key === "proofLine" || key === "serviceRule" || key === "trustRules") {
    return "先了解，再决定"
  }
  if (/^point\d$/.test(key)) return "真实到店"
  if (/^category\d$/.test(key)) return `${shopType}：到店咨询`
  return ""
}

export function sanitizePosterTemplateFields(templateId: string, inputFields: Record<string, string>) {
  const fields = { ...inputFields }
  const sanitizedFields: string[] = []
  const warnings: string[] = []

  for (const key of Object.keys(fields)) {
    if (key.startsWith("_") || !VISIBLE_COPY_FIELDS.has(key)) continue
    const raw = asText(fields[key], 220)
    if (!raw) continue

    const shouldSanitize = containsPosterCommandText(raw) || isWeakTitleLikeCopy(key, raw)
    if (!shouldSanitize) continue

    const stripped = stripPosterCommandText(raw)
    const fallback = fallbackVisibleField(key, templateId, fields)
    const replacement =
      stripped && stripped.length >= 3 && !containsPosterCommandText(stripped) && !isWeakTitleLikeCopy(key, stripped)
        ? stripped
        : fallback

    if (replacement && replacement !== raw) {
      fields[key] = replacement.slice(0, 180)
      sanitizedFields.push(key)
      warnings.push(`${key}: ${raw.slice(0, 24)} -> ${replacement.slice(0, 24)}`)
    }
  }

  if (sanitizedFields.length) {
    fields._copySanitized = Array.from(new Set(sanitizedFields)).join(",")
    fields._copyWarnings = warnings.join("；").slice(0, 180)
  } else {
    delete fields._copySanitized
    delete fields._copyWarnings
  }

  return {
    fields,
    sanitizedFields: Array.from(new Set(sanitizedFields)),
    warnings,
  }
}

function visibleCopyFromFields(templateId: string, fields: Record<string, string>): PosterVisibleCopy {
  const title =
    (templateId === "P02" && fields.campaignTitle) ||
    (templateId === "P13" && fields.blessingTitle) ||
    fields.headline ||
    fields.campaignTitle ||
    fields.projectName ||
    fields.topic ||
    "门店海报"
  const subtitle =
    (templateId === "P13" && fields.blessingSubtitle) ||
    fields.subline ||
    fields.reason ||
    "把到店体验安排得更清楚"
  const tags = splitCopyTags(fields.sellingPoints || fields.highlights || fields.benefits || fields.tags || "")
  return {
    title,
    subtitle,
    tags,
    offer: fields.offerText || fields.giftLine || fields.openingGift || fields.shareOffer || "",
    dateRange: fields.dateRange || fields.festivalName || "",
    cta: fields.bookingLine || fields.bottomLine || fields._cta || "",
    storeSignature: fields.signature || fields.storeName || fields._storeName || "",
  }
}

export function buildPosterPlan(opts: {
  templateId: string
  brief: PosterBrief
  fields: Record<string, string>
  message?: string
  storeProfileId?: string
  assetRefs?: unknown[]
}): PosterPlan {
  const sanitizedFields = String(opts.fields._copySanitized || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const festivalName = extractFestivalName(opts.message, opts.brief.campaignTitle, opts.brief.dateRange, opts.brief.headline)
  const assetKinds = (opts.assetRefs || [])
    .map((item) => (item && typeof item === "object" ? asText((item as { kind?: unknown }).kind, 24) : ""))
    .filter(Boolean)

  return {
    intent: {
      goal: opts.brief.posterGoal || "",
      scene: opts.brief.campaignTitle || opts.brief.projectName || opts.brief.headline || "",
      festivalName,
      templateId: opts.templateId,
      userCommand: containsPosterCommandText(opts.message || "") ? asText(opts.message, 160) : "",
    },
    visibleCopy: visibleCopyFromFields(opts.templateId, opts.fields),
    hiddenContext: {
      storeProfileId: opts.storeProfileId || "",
      storeName: opts.brief.storeName || "",
      cityArea: opts.brief.cityArea || "",
      industry: opts.brief.industry || "",
      shopType: opts.brief.shopType || "",
      projectName: opts.brief.projectName || "",
      audience: opts.brief.audience || "",
      stylePreset: opts.brief.stylePreset || opts.fields._stylePreset || "",
      constraints: opts.brief.constraints || "",
      layoutPresetId: opts.fields._layoutPresetId || opts.brief.layoutPresetId || "",
      layoutName: opts.fields._layoutName || "",
      layoutPresetVersion: opts.fields._layoutPresetVersion || "",
      assetKinds,
    },
    safety: {
      sanitizedFields,
      autoGenerateBlocked: sanitizedFields.length > 0,
      visibleCopyWarnings: String(opts.fields._copyWarnings || "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean),
    },
  }
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
  const resolveLayout = (templateId: string) => {
    const haystack = [
      answers.posterGoal,
      answers.campaignTitle,
      answers.projectName,
      answers.headline,
      answers.sellingPoints,
      answers.constraints,
      answers.stylePreset,
    ]
      .filter(Boolean)
      .join(" ")
    const requested = normalizeLayoutPresetId(answers.layoutPresetId)
    const inferred = requested || inferLayoutPresetFromText(haystack, templateId) || getDefaultLayoutPresetId(templateId)
    const preset = getPosterLayoutPreset(inferred, templateId)
    const candidates = [preset.id, ...getTemplateLayoutCandidateIds(templateId)].filter((id, index, arr) => arr.indexOf(id) === index)
    return { layoutPresetId: preset.id, layoutCandidates: candidates.slice(0, 3) }
  }

  const explicit = normalizeTemplateId(answers.templateId)
  if (explicit) {
    const style = TEMPLATE_STYLE[explicit]
    const layout = resolveLayout(explicit)
    return {
      templateId: explicit,
      ...style,
      stylePreset: asText(answers.stylePreset) || style.stylePreset,
      ...layout,
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
  const layout = resolveLayout(id)
  return {
    templateId: id,
    ...style,
    stylePreset: asText(answers.stylePreset) || style.stylePreset,
    ...layout,
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
  const campaignTitle = refineCampaignTitleForContext(
    merged.campaignTitle || merged.headline || `${storeName}活动`,
    industry,
    shopType,
    projectName,
  )
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
  const layoutPreset = getPosterLayoutPreset(brief.layoutPresetId, templateId)
  const common = {
    _industry: brief.industry,
    _businessType: brief.shopType,
    _stylePreset: brief.stylePreset || TEMPLATE_STYLE[templateId]?.stylePreset || "商业海报",
    _targetAudience: brief.audience || "",
    _cta: brief.cta || "",
    _constraints: brief.constraints || "",
    _cityArea: brief.cityArea,
    _storeName: brief.storeName,
    _layoutPresetId: layoutPreset.id,
    _layoutName: layoutPreset.name,
    _layoutPresetVersion: layoutPreset.version,
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

  return sanitizePosterTemplateFields(templateId, { ...base, ...common }).fields
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
    layoutPresetId: normalizeLayoutPresetId(raw.layoutPresetId) || normalizeLayoutPresetId(raw._layoutPresetId),
  }
}
