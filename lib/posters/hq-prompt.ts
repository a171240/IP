import type { PosterAssetRef, PosterFieldSourceState, PosterQrState } from "./intake"
import { getDefaultPosterNegativePrompt, type PosterOverlay } from "./templates"
import {
  miniProgramPromptBlock,
  sourceMotherPromptBlock,
  type PosterVisualStylePreset,
} from "./visual-style-presets"

export const POSTER_HQ_PROMPT_VERSION = "poster-hq-v2-mother-first" as const

const REAL_FIELD_SOURCES = new Set(["store_profile", "user_voice", "user_text", "uploaded_asset"])
const CRITICAL_OVERLAY_FIELD_KEYS = new Set([
  "storeName",
  "cityArea",
  "offerText",
  "dateRange",
  "addressLine",
  "bookingLine",
  "bottomLine",
  "shareOffer",
  "giftLine",
  "openingGift",
  "cta",
  "signature",
])
const BUSINESS_FIELD_ORDER = [
  "storeName",
  "shopType",
  "industry",
  "cityArea",
  "projectName",
  "campaignTitle",
  "headline",
  "menuTitle",
  "festivalName",
  "blessingTitle",
  "subline",
  "blessingSubtitle",
  "audience",
  "sellingPoints",
  "menuItems",
  "offerText",
  "dateRange",
  "addressLine",
  "cta",
  "footerNote",
  "signature",
]

const FIELD_LABELS: Record<string, string> = {
  storeName: "门店",
  shopType: "门店类型",
  industry: "行业",
  cityArea: "地点/商圈",
  projectName: "项目",
  campaignTitle: "活动",
  headline: "主题",
  menuTitle: "菜单主题",
  festivalName: "节日",
  blessingTitle: "祝福主题",
  subline: "副标题",
  blessingSubtitle: "祝福副标题",
  audience: "目标人群",
  sellingPoints: "卖点",
  menuItems: "项目清单",
  offerText: "价格/权益",
  dateRange: "时间",
  addressLine: "地址",
  cta: "行动提示",
  footerNote: "补充说明",
  signature: "署名",
}

type BuildPosterHqPromptInput = {
  templateId: string
  templateTitle?: string
  visualStylePreset: PosterVisualStylePreset
  businessTheme: string
  visibleFields: Record<string, string>
  fieldSources: Record<string, PosterFieldSourceState>
  qrState: PosterQrState
  assetRefs: PosterAssetRef[]
  size: "4:5" | "16:9"
  overlayPlan: PosterOverlay
}

function cleanText(value: unknown, max = 80) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

function hiddenValue(fields: Record<string, string>, key: string, max = 80) {
  return cleanText(fields[key], max)
}

function canUseVisibleField(key: string, value: string, fieldSources: Record<string, PosterFieldSourceState>) {
  if (!value || key.startsWith("_")) return false
  const state = fieldSources[key]
  if (!state) return true
  if (!state.visible) return false
  return REAL_FIELD_SOURCES.has(state.source)
}

function visibleFieldLines(
  fields: Record<string, string>,
  fieldSources: Record<string, PosterFieldSourceState>,
  options: { excludeCriticalOverlayFields?: boolean } = {}
) {
  const seen = new Set<string>()
  const lines: string[] = []

  for (const key of BUSINESS_FIELD_ORDER) {
    if (options.excludeCriticalOverlayFields && CRITICAL_OVERLAY_FIELD_KEYS.has(key)) continue
    const value = cleanText(fields[key], 120)
    if (!canUseVisibleField(key, value, fieldSources)) continue
    seen.add(key)
    lines.push(`${FIELD_LABELS[key] || key}：${value}`)
  }

  for (const [key, raw] of Object.entries(fields)) {
    if (seen.has(key) || key.startsWith("_")) continue
    if (options.excludeCriticalOverlayFields && CRITICAL_OVERLAY_FIELD_KEYS.has(key)) continue
    const value = cleanText(raw, 120)
    if (!canUseVisibleField(key, value, fieldSources)) continue
    lines.push(`${FIELD_LABELS[key] || key}：${value}`)
  }

  return lines.slice(0, 12)
}

function criticalOverlayLabels(fields: Record<string, string>, fieldSources: Record<string, PosterFieldSourceState>) {
  const labels: string[] = []
  for (const key of CRITICAL_OVERLAY_FIELD_KEYS) {
    const value = cleanText(fields[key], 120)
    if (!canUseVisibleField(key, value, fieldSources)) continue
    const label = FIELD_LABELS[key] || key
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

function firstValue(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = cleanText(fields[key], 80)
    if (value) return value
  }
  return ""
}

function businessBrief(input: BuildPosterHqPromptInput) {
  const fields = input.visibleFields
  const theme =
    cleanText(input.businessTheme, 100) ||
    firstValue(fields, ["campaignTitle", "headline", "projectName", "menuTitle", "blessingTitle"]) ||
    input.templateTitle ||
    "美业门店海报"
  const industry = hiddenValue(fields, "_industry") || cleanText(fields.industry) || hiddenValue(fields, "_businessType") || "美业门店"
  const target = hiddenValue(fields, "_targetAudience") || cleanText(fields.audience) || "到店顾客"
  const coreObject = firstValue(fields, ["projectName", "menuTitle", "campaignTitle", "headline", "blessingTitle"]) || theme
  const posterUse = input.templateTitle ? `${input.templateId} ${input.templateTitle}` : input.templateId

  return [
    `类型：${input.size === "16:9" ? "横版门店屏幕海报" : "4:5 竖版商业海报"}`,
    `业务场景：${posterUse}`,
    `行业：${industry}`,
    `本次主题：${theme}`,
    `核心对象：${coreObject}`,
    `目标人群：${target}`,
    `画幅：${input.size}`,
  ]
}

function textStrategyBlock(fields: Record<string, string>, fieldSources: Record<string, PosterFieldSourceState>) {
  const visualCopy = visibleFieldLines(fields, fieldSources, { excludeCriticalOverlayFields: true })
  const overlayLabels = criticalOverlayLabels(fields, fieldSources)
  return [
    "默认采用 canvas_overlay：模型主要生成视觉、主体、材质、留白和版式气质。",
    "可以让主标题成为画面气质或大字结构，但不要在模型图里写具体门店名、价格数字、日期、地址、电话、二维码或行动号召。",
    "关键商业文字由小程序或服务端后合成，模型只需要为这些文字预留干净、可读、不会遮挡主体的安全区域。",
    overlayLabels.length ? `后合成关键字段：${overlayLabels.join("、")}。不要把这些字段的具体值画进图里。` : "",
    "不要生成随机英文、网址、手机号、平台标志、字段名、说明句或未经提供的联系方式。",
    visualCopy.length ? "可参考这些非关键业务信息组织画面氛围：" : "",
    ...visualCopy.map((line) => `- ${line}`),
  ].filter(Boolean)
}

function assetRuleBlock(assetRefs: PosterAssetRef[]) {
  const kinds = new Set(assetRefs.map((ref) => ref.kind))
  return [
    kinds.has("style") ? "风格参考图只用于学习构图、色彩、留白、材质和高级感，不照抄文字、Logo、价格或具体人物。" : "",
    kinds.has("store") ? "门店图可以作为空间、质感和真实行业场景参考，自然融入画面。" : "",
    kinds.has("product") ? "产品图可以作为主视觉参考；如果包装文字必须精确，应留待后合成，不要让模型重绘小字。" : "",
    kinds.has("people") ? "人物或案例图只作为气质、姿态和服务场景参考，避免夸张前后对比和医疗承诺。" : "",
    kinds.has("logo") ? "Logo 可以作为品牌氛围参考；若要求标识完全准确，应保留干净区域后合成。" : "",
    "不要新增未上传的品牌标识、平台标志、联系方式或无关行业元素。",
  ].filter(Boolean)
}

function qrRuleBlock(qrState: PosterQrState) {
  if (!qrState?.hasQr) {
    return [
      "不要二维码、不要二维码框、不要扫码提示、不要空白二维码占位、不要联系方式。",
      "画面不需要为了二维码预留固定角标。",
    ]
  }

  return [
    "右下角或底部预留一块干净浅色安全区域，但不要生成二维码图案。",
    "安全区域不要有纹理、人物、文字穿过；真实二维码将由系统后合成。",
  ]
}

function timeRuleBlock(fields: Record<string, string>) {
  const visibleValues = Object.entries(fields)
    .filter(([key]) => !key.startsWith("_"))
    .map(([, value]) => String(value || ""))
    .join(" ")
  const hasExplicitYear = /(?:19|20)\d{2}/.test(visibleValues)

  if (hasExplicitYear) {
    return [
      "只允许使用业务字段里已经明确提供的年份、日期或时间。",
      "不要把母提示词中的年份感、时间痕迹或 metadata 当成真实日期。",
    ]
  }

  return [
    "没有明确年份时，不要生成任何四位年份、完整年月日或随机时间数字。",
    "如果字段只有“本周可约”“端午期间”“6.1 起”这类表达，只保留这种无年份语义，不要自行补全年份。",
    "母提示词中的年份感、时间痕迹或 metadata 只表示版式气质，不是可见文字。",
  ]
}

function compactPrompt(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
}

export function buildPosterHqPrompt(input: BuildPosterHqPromptInput) {
  const motherPrompt = sourceMotherPromptBlock(input.visualStylePreset)
  const miniProgramSemantics = miniProgramPromptBlock(input.visualStylePreset)
  const businessLines = [
    ...businessBrief(input),
    ...visibleFieldLines(input.visibleFields, input.fieldSources, { excludeCriticalOverlayFields: true }),
  ]
    .filter(Boolean)
    .slice(0, 12)
  const prompt = compactPrompt([
    "【视觉母提示词】",
    motherPrompt,
    "【本次业务主题】",
    ...businessLines,
    "【小程序适配语义】",
    miniProgramSemantics
      ? "沿用该风格的小程序适配语义，但不要照搬其中的变量名、占位符、示例品牌或示例文案。"
      : "按视觉母提示词处理本次商业海报，不照搬示例文案。",
    "【文字策略】",
    ...textStrategyBlock(input.visibleFields, input.fieldSources),
    "【素材使用规则】",
    ...assetRuleBlock(input.assetRefs.filter((ref) => ref.kind !== "qr")),
    "【二维码规则】",
    ...qrRuleBlock(input.qrState),
    "【时间和年份规则】",
    ...timeRuleBlock(input.visibleFields),
    "【输出约束】",
    `固定画幅：${input.size}。`,
    "画面质感优先遵循最前面的视觉母提示词；业务字段只作为短变量，不要把海报拉回普通模板广告。",
    "避免廉价促销传单、AI 模板拼贴、随机贴纸、过度磨皮、夸张医美承诺和信息过载。",
    "尤其不要把价格画成错误数字，也不要自行补写日期、年份、门店地址或预约方式。",
  ])
  const negativePrompt = [
    getDefaultPosterNegativePrompt(),
    ...(input.visualStylePreset.negativeAdditions || []),
    "二维码变形",
    "虚假年份",
    "随机四位年份",
    "错误价格",
    "随机价格",
    "错误日期",
    "随机日期",
    "默认门店名",
    "默认地址",
  ]
    .filter(Boolean)
    .join("，")

  return {
    prompt,
    negativePrompt,
    overlayPlan: input.overlayPlan,
    promptVersion: POSTER_HQ_PROMPT_VERSION,
    diagnostics: {
      promptLength: prompt.length,
      motherPromptLength: motherPrompt.length,
      businessLineCount: businessLines.length,
      hasQr: Boolean(input.qrState?.hasQr),
    },
  }
}
