import { readFile } from "fs/promises"
import { join, normalize, sep } from "path"

export type PosterLayoutPreset = {
  id: string
  name: string
  shortName: string
  sourceLayoutIds: string[]
  description: string
  promptBlock: string
  recommendedTemplates: string[]
  defaultSize?: "4:5" | "3:4" | "9:16" | "16:9" | "1:1"
  textDensity: "low" | "medium" | "high"
  directTextRisk: "low" | "medium" | "high"
  publicReferencePath: string
  version: string
}

export type PublicPosterLayoutPreset = Pick<
  PosterLayoutPreset,
  | "id"
  | "name"
  | "shortName"
  | "description"
  | "recommendedTemplates"
  | "defaultSize"
  | "textDensity"
  | "directTextRisk"
  | "version"
>

const LAYOUT_VERSION = "20260531"
const LAYOUT_PUBLIC_DIR = `poster-layouts/${LAYOUT_VERSION}`

function referencePath(id: string) {
  return `${LAYOUT_PUBLIC_DIR}/${id}.png`
}

const POSTER_LAYOUT_PRESETS: PosterLayoutPreset[] = [
  {
    id: "editorial-whitespace",
    name: "高级留白",
    shortName: "留白",
    sourceLayoutIds: ["014"],
    description: "主视觉明确，文字放在安静留白处，适合品牌、祝福和朋友圈轻分享。",
    promptBlock: [
      "系统版式骨架：高级留白式。",
      "只保留一个明确主视觉，文字区放在安静留白处。",
      "主标题和副标题形成两级层级，底部只放必要署名、时间或一句提示。",
      "留白要有细腻材质、光影和边缘呼吸感，不要只是空白底色。",
      "不要把文字、标签、图标平均铺满画面。",
    ].join("\n"),
    recommendedTemplates: ["P04", "P12", "P13"],
    defaultSize: "4:5",
    textDensity: "low",
    directTextRisk: "low",
    publicReferencePath: referencePath("editorial-whitespace"),
    version: LAYOUT_VERSION,
  },
  {
    id: "center-square-brand",
    name: "中心主视觉",
    shortName: "中心",
    sourceLayoutIds: ["035", "089"],
    description: "主体居中或近中心聚焦，文字围绕中心建立稳定品牌感。",
    promptBlock: [
      "系统版式骨架：中心主视觉式。",
      "画面中心保留一个稳定、清楚、可识别的主视觉。",
      "标题与辅助信息围绕中心视觉上下或左右组织，不要分散成很多角标。",
      "中心主体要有真实摄影光影和材质细节，像品牌 KV，不像贴图模板。",
      "底部信息克制，保留足够呼吸空间。",
    ].join("\n"),
    recommendedTemplates: ["P03", "P04", "P13"],
    defaultSize: "4:5",
    textDensity: "low",
    directTextRisk: "low",
    publicReferencePath: referencePath("center-square-brand"),
    version: LAYOUT_VERSION,
  },
  {
    id: "grouped-service-modules",
    name: "服务模块",
    shortName: "模块",
    sourceLayoutIds: ["043", "045"],
    description: "把服务规矩、卖点和权益整理成少量模块，适合新客和知识型海报。",
    promptBlock: [
      "系统版式骨架：群组模块式。",
      "主视觉占据画面中部或上半部，信息模块围绕主视觉分组。",
      "模块数量控制在 3-4 个，每个模块只放短词或短句。",
      "模块之间要有统一间距和对齐，不要像随机贴纸。",
      "主标题仍然最大，模块是辅助，不要抢主标题层级。",
    ].join("\n"),
    recommendedTemplates: ["P01", "P05", "P09"],
    defaultSize: "4:5",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("grouped-service-modules"),
    version: LAYOUT_VERSION,
  },
  {
    id: "card-benefits",
    name: "卡片权益",
    shortName: "卡片",
    sourceLayoutIds: ["068", "049"],
    description: "用卡片承载权益、知识点或菜单分区，信息清楚但不拥挤。",
    promptBlock: [
      "系统版式骨架：卡片权益式。",
      "画面主体由 2-4 个精致卡片或信息块组成，卡片之间对齐清楚。",
      "每张卡只承载一个权益、知识点或短卖点。",
      "卡片视觉要像高端品牌服务说明，不要像廉价优惠券。",
      "主标题和主视觉优先，卡片作为第二层信息。",
    ].join("\n"),
    recommendedTemplates: ["P05", "P09", "P10"],
    defaultSize: "4:5",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("card-benefits"),
    version: LAYOUT_VERSION,
  },
  {
    id: "layered-product",
    name: "层叠质感",
    shortName: "层叠",
    sourceLayoutIds: ["049"],
    description: "主视觉、材质和文字形成前后层叠，适合产品、项目和朋友圈质感图。",
    promptBlock: [
      "系统版式骨架：层叠质感式。",
      "前景、中景、背景要形成清楚层次，主体不要贴在同一平面。",
      "文字区与主视觉可以轻微错位或叠压，但必须保持可读。",
      "使用纸张、玻璃、织物、产品瓶等材质制造真实前后关系。",
      "层叠是精致空间感，不要做成杂乱拼贴。",
    ].join("\n"),
    recommendedTemplates: ["P03", "P04", "P12"],
    defaultSize: "4:5",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("layered-product"),
    version: LAYOUT_VERSION,
  },
  {
    id: "campaign-motion-x",
    name: "活动动势",
    shortName: "动势",
    sourceLayoutIds: ["025"],
    description: "用交叉动线制造活动张力，适合促销、开业和封面，但保持高级克制。",
    promptBlock: [
      "系统版式骨架：X 形活动动势。",
      "主视觉和文字沿两条轻微交叉动线组织，形成活动张力。",
      "标题要醒目，但不要红黄爆炸贴、描边大字或廉价电商风。",
      "优惠权益只能作为精致标签出现，不要堆满角标。",
      "动势要服务阅读顺序：标题 -> 主视觉 -> 权益 -> 时间。",
    ].join("\n"),
    recommendedTemplates: ["P01", "P02", "P06", "P08"],
    defaultSize: "4:5",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("campaign-motion-x"),
    version: LAYOUT_VERSION,
  },
  {
    id: "radial-event",
    name: "节点放射",
    shortName: "放射",
    sourceLayoutIds: ["026"],
    description: "中心主题向外展开节日或开业信息，适合节点活动和祝福。",
    promptBlock: [
      "系统版式骨架：节点放射式。",
      "画面中心是节日、开业或活动主题，辅助元素从中心向外自然展开。",
      "放射感要柔和有秩序，不要爆炸贴、烟花贴纸或廉价促销气泡。",
      "文字保持 2-3 层，中心主题最大，时间和署名放在低优先级位置。",
      "整体像高端节日视觉或开业 KV，不像商场传单。",
    ].join("\n"),
    recommendedTemplates: ["P02", "P06", "P13"],
    defaultSize: "4:5",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("radial-event"),
    version: LAYOUT_VERSION,
  },
  {
    id: "grid-menu",
    name: "网格菜单",
    shortName: "网格",
    sourceLayoutIds: ["061", "002"],
    description: "用网格承载价目、菜单和知识点，优先清晰可读。",
    promptBlock: [
      "系统版式骨架：网格菜单式。",
      "主体信息按 2-3 列或 3 个横向分区排列，所有价格和项目要对齐。",
      "每个网格只放必要文字，不要塞长段落。",
      "标题、分区、价格之间要有明确层级，手机端缩略图仍能读主标题。",
      "背景和装饰必须退后，不能影响菜单可读性。",
    ].join("\n"),
    recommendedTemplates: ["P09", "P10"],
    defaultSize: "4:5",
    textDensity: "high",
    directTextRisk: "high",
    publicReferencePath: referencePath("grid-menu"),
    version: LAYOUT_VERSION,
  },
  {
    id: "diagonal-xhs-cover",
    name: "斜线封面",
    shortName: "斜线",
    sourceLayoutIds: ["081"],
    description: "用斜向动线强化标题停留感，适合探店、避坑和小红书封面。",
    promptBlock: [
      "系统版式骨架：斜线封面式。",
      "标题和主视觉沿清楚的斜向动线排列，制造停留感。",
      "标题必须短、粗、清楚，优先保证手机端可读。",
      "斜线只作为隐性动线，不要画出粗斜线或廉价分割条。",
      "下方只放副标题、标签或署名，避免信息过载。",
    ].join("\n"),
    recommendedTemplates: ["P07", "P08"],
    defaultSize: "3:4",
    textDensity: "medium",
    directTextRisk: "medium",
    publicReferencePath: referencePath("diagonal-xhs-cover"),
    version: LAYOUT_VERSION,
  },
  {
    id: "visual-center-premium",
    name: "视觉中心",
    shortName: "焦点",
    sourceLayoutIds: ["089"],
    description: "建立单一视觉中心，适合高级主推、电子屏和品牌大片。",
    promptBlock: [
      "系统版式骨架：视觉中心式。",
      "全图只有一个强视觉中心，所有文字和装饰都服务这个中心。",
      "中心主体要清楚、明亮、有高级光影，不要被小标签打散。",
      "文字放在中心周围的稳定区域，主次关系清楚。",
      "保持安静、克制和高级，不做模板拼贴。",
    ].join("\n"),
    recommendedTemplates: ["P03", "P04", "P11", "P13"],
    defaultSize: "4:5",
    textDensity: "low",
    directTextRisk: "low",
    publicReferencePath: referencePath("visual-center-premium"),
    version: LAYOUT_VERSION,
  },
]

const PRESET_BY_ID = new Map(POSTER_LAYOUT_PRESETS.map((preset) => [preset.id, preset]))

const TEMPLATE_DEFAULT_LAYOUT: Record<string, string> = {
  P01: "grouped-service-modules",
  P02: "campaign-motion-x",
  P03: "center-square-brand",
  P04: "editorial-whitespace",
  P05: "card-benefits",
  P06: "radial-event",
  P07: "diagonal-xhs-cover",
  P08: "diagonal-xhs-cover",
  P09: "card-benefits",
  P10: "grid-menu",
  P11: "visual-center-premium",
  P12: "editorial-whitespace",
  P13: "editorial-whitespace",
}

const TEMPLATE_LAYOUT_CANDIDATES: Record<string, string[]> = {
  P01: ["grouped-service-modules", "campaign-motion-x", "editorial-whitespace"],
  P02: ["campaign-motion-x", "radial-event", "card-benefits"],
  P03: ["center-square-brand", "layered-product", "visual-center-premium"],
  P04: ["editorial-whitespace", "center-square-brand", "visual-center-premium"],
  P05: ["card-benefits", "grouped-service-modules", "editorial-whitespace"],
  P06: ["radial-event", "campaign-motion-x", "diagonal-xhs-cover"],
  P07: ["diagonal-xhs-cover", "editorial-whitespace", "layered-product"],
  P08: ["diagonal-xhs-cover", "campaign-motion-x", "card-benefits"],
  P09: ["card-benefits", "grouped-service-modules", "grid-menu"],
  P10: ["grid-menu", "card-benefits", "grouped-service-modules"],
  P11: ["visual-center-premium", "center-square-brand", "card-benefits"],
  P12: ["editorial-whitespace", "layered-product", "center-square-brand"],
  P13: ["editorial-whitespace", "center-square-brand", "radial-event"],
}

function normalizeTemplateId(templateId?: string) {
  return String(templateId || "").trim().toUpperCase()
}

export function normalizeLayoutPresetId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : ""
  return PRESET_BY_ID.has(id) ? id : ""
}

export function listPosterLayoutPresets() {
  return POSTER_LAYOUT_PRESETS.slice()
}

export function publicPosterLayoutPreset(preset: PosterLayoutPreset): PublicPosterLayoutPreset {
  return {
    id: preset.id,
    name: preset.name,
    shortName: preset.shortName,
    description: preset.description,
    recommendedTemplates: preset.recommendedTemplates,
    defaultSize: preset.defaultSize,
    textDensity: preset.textDensity,
    directTextRisk: preset.directTextRisk,
    version: preset.version,
  }
}

export function listPublicPosterLayoutPresets() {
  return POSTER_LAYOUT_PRESETS.map(publicPosterLayoutPreset)
}

export function getDefaultLayoutPresetId(templateId?: string) {
  return TEMPLATE_DEFAULT_LAYOUT[normalizeTemplateId(templateId)] || "editorial-whitespace"
}

export function getPosterLayoutPreset(id?: string, templateId?: string): PosterLayoutPreset {
  const normalized = normalizeLayoutPresetId(id)
  return PRESET_BY_ID.get(normalized) || PRESET_BY_ID.get(getDefaultLayoutPresetId(templateId)) || POSTER_LAYOUT_PRESETS[0]
}

export function getTemplateLayoutCandidateIds(templateId?: string) {
  const normalized = normalizeTemplateId(templateId)
  return (TEMPLATE_LAYOUT_CANDIDATES[normalized] || [getDefaultLayoutPresetId(normalized), "editorial-whitespace", "center-square-brand"]).filter(
    (id, index, arr) => PRESET_BY_ID.has(id) && arr.indexOf(id) === index
  )
}

export function getTemplateLayoutCandidates(templateId?: string) {
  return getTemplateLayoutCandidateIds(templateId).map((id) => PRESET_BY_ID.get(id)).filter(Boolean) as PosterLayoutPreset[]
}

export function getTemplateLayoutMap() {
  return Object.fromEntries(
    Object.keys(TEMPLATE_DEFAULT_LAYOUT).map((templateId) => [templateId, getTemplateLayoutCandidateIds(templateId)])
  )
}

export function inferLayoutPresetFromText(text: string, templateId?: string) {
  const value = String(text || "")
  if (!value.trim()) return ""
  const nonPromotionalGreeting = /祝福|问候|安康|不卖东西|不卖货|不促销|不要促销/.test(value)
  if (normalizeTemplateId(templateId) === "P13" && nonPromotionalGreeting) return "editorial-whitespace"
  if (/菜单|价目|价格表|服务清单|项目表|网格|九宫格/.test(value)) return "grid-menu"
  if (/避坑|避雷|攻略|小红书封面|强标题|醒目标题|斜线/.test(value)) return "diagonal-xhs-cover"
  if (/会员|权益|福利|办卡|储值|四个|卡片|模块/.test(value)) return "card-benefits"
  if (/留白|极简|高级感|品牌感|形象|克制|安静/.test(value)) return "editorial-whitespace"
  if (/中心|主视觉|视觉中心|焦点|单品/.test(value)) return "center-square-brand"
  if (/层叠|质感|产品|材质|前后/.test(value)) return "layered-product"
  if (/放射|周年|节点|节日氛围|开业/.test(value)) return "radial-event"
  if (!nonPromotionalGreeting && /活动|促销|动势|冲击|张力|新客|首单/.test(value)) return "campaign-motion-x"
  return getDefaultLayoutPresetId(templateId)
}

export function layoutReferencePromptBlock(opts: { preset: PosterLayoutPreset; hasReferenceImage: boolean }) {
  const base = [
    "",
    "系统版式参考图使用规则：",
    opts.hasReferenceImage
      ? "- 第 1 张参考图是系统线框图，只用于学习空间分区、主次关系、动线和留白比例。"
      : "- 本次没有可用的系统线框图，请严格按系统版式骨架的文字规则设计空间结构。",
    "- 不要复制线框图里的灰色色块、边框样式或占位形状。",
    "- 不要在画面里出现线框、占位符、示意框、灰色模板底图。",
    "- 最终海报必须是完整商业视觉，不是设计稿截图。",
    `- 当前版式名称：${opts.preset.name}。`,
  ]
  return base.join("\n")
}

export async function readLayoutReferenceDataUrl(preset: PosterLayoutPreset): Promise<string | null> {
  const publicRoot = join(process.cwd(), "public")
  const expectedRoot = join(publicRoot, LAYOUT_PUBLIC_DIR)
  const absolute = normalize(join(publicRoot, preset.publicReferencePath))
  const normalizedRoot = normalize(expectedRoot)
  const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`

  if (!absolute.startsWith(rootWithSep)) return null
  try {
    const buffer = await readFile(absolute)
    return `data:image/png;base64,${buffer.toString("base64")}`
  } catch {
    return null
  }
}
