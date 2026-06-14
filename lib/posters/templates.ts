export type PosterTemplateGroup = "acquire" | "deal" | "trust" | "retain" | "local" | "menu"
export type PosterImageSize =
  | "auto"
  | "1:1"
  | "3:2"
  | "2:3"
  | "4:3"
  | "3:4"
  | "5:4"
  | "4:5"
  | "16:9"
  | "9:16"
  | "2:1"
  | "1:2"
  | "21:9"
  | "9:21"

export type PosterTemplateField = {
  key: string
  label: string
  placeholder: string
  required?: boolean
  defaultValue?: string
  maxLength?: number
  help?: string
  inputType?: "text" | "textarea"
}

export type PosterTextSlot = {
  key: string
  label: string
  x: number
  y: number
  width: number
  fontSize: number
  lineHeight: number
  color: string
  align: "left" | "center" | "right"
  weight?: "normal" | "bold"
  maxLines?: number
  background?: string
}

export type PosterOverlay = {
  canvas: { width: number; height: number; size: PosterImageSize }
  slots: Array<PosterTextSlot & { text: string }>
}

export type PosterPresetTextDensity = "low" | "medium" | "high"
export type PosterDirectTextRisk = "low" | "medium" | "high"

export type PosterLayoutPreset = {
  id: string
  name: string
  shortName: string
  description: string
  textDensity: PosterPresetTextDensity
  directTextRisk: PosterDirectTextRisk
  version: string
  prompt: string
}

export type PosterVisualStylePreset = {
  id: string
  name: string
  shortName: string
  description: string
  textDensity: PosterPresetTextDensity
  directTextRisk: PosterDirectTextRisk
}

type InternalPosterVisualStylePreset = PosterVisualStylePreset & {
  prompt: string
  negativePrompt?: string
}

export type PosterQrState = {
  hasQr?: boolean
  source?: string
  reserveArea?: boolean
  compositeRequired?: boolean
}

type InternalPosterTemplate = {
  id: string
  group: PosterTemplateGroup
  title: string
  scenario: string
  goal: string
  description: string
  useCase: string
  outputHint: string
  previewImage: string
  defaultSize: PosterImageSize
  defaultResolution: "1k"
  requiredFields: PosterTemplateField[]
  textSlots: PosterTextSlot[]
  previewStyle: string
  styleTags: string[]
  textRules: string[]
  promptBuilder: (fields: Record<string, string>) => string
  negativePrompt: string
}

const DEFAULT_LAYOUT_PRESET_ID = "editorial-whitespace"
const DEFAULT_VISUAL_STYLE_PRESET_ID = "frosted-glass-archive-cover"

const layoutPresets: PosterLayoutPreset[] = [
  {
    id: "editorial-whitespace",
    name: "高级留白",
    shortName: "留白",
    description: "主视觉明确，文字放在安静留白处。",
    textDensity: "low",
    directTextRisk: "low",
    version: "poster-layout-v1",
    prompt: "采用品牌杂志式留白：一处主视觉、一处安静文字区、强对齐、少标签，避免画面被信息塞满。",
  },
  {
    id: "center-square-brand",
    name: "中心主视觉",
    shortName: "中心",
    description: "主体居中聚焦，品牌感稳定。",
    textDensity: "low",
    directTextRisk: "low",
    version: "poster-layout-v1",
    prompt: "主体居中或略偏上，背景干净，品牌名和主标题形成稳定中轴，适合高级主推和形象页。",
  },
  {
    id: "grouped-service-modules",
    name: "服务模块",
    shortName: "模块",
    description: "卖点和权益分组展示。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "把卖点、权益、时间和行动号召分成 2-3 个清晰模块，每组信息有边界，不堆小字。",
  },
  {
    id: "card-benefits",
    name: "卡片权益",
    shortName: "卡片",
    description: "用卡片承载权益或知识点。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "用少量精致卡片承载权益和卖点，卡片像真实品牌物料，不像廉价贴纸。",
  },
  {
    id: "layered-product",
    name: "层叠质感",
    shortName: "层叠",
    description: "主视觉和材质形成前后层次。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "用产品、花材、玻璃、织物等材质形成前后层次，文字保持在浅色留白区域。",
  },
  {
    id: "campaign-motion-x",
    name: "活动动势",
    shortName: "动势",
    description: "适合活动促销和开业张力。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "画面有轻微斜向动势和活动节奏，但价格与时间必须清楚，不要红黄促销传单感。",
  },
  {
    id: "radial-event",
    name: "节点放射",
    shortName: "放射",
    description: "中心主题向外展开节点信息。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "中心主题清晰，周围只展开少量关键节点，适合节日活动和开业节点。",
  },
  {
    id: "grid-menu",
    name: "网格菜单",
    shortName: "网格",
    description: "价目、菜单和清单更清楚。",
    textDensity: "high",
    directTextRisk: "high",
    version: "poster-layout-v1",
    prompt: "使用克制网格和清单层级展示项目或价目，保证每一项可读，避免模型自造额外项目。",
  },
  {
    id: "diagonal-xhs-cover",
    name: "斜线封面",
    shortName: "斜线",
    description: "适合探店、避坑和强标题封面。",
    textDensity: "medium",
    directTextRisk: "medium",
    version: "poster-layout-v1",
    prompt: "用斜向分割或强标题区域形成封面冲击，但只保留用户提供的可见文字。",
  },
  {
    id: "visual-center-premium",
    name: "视觉中心",
    shortName: "焦点",
    description: "单一焦点，适合高级主推。",
    textDensity: "low",
    directTextRisk: "low",
    version: "poster-layout-v1",
    prompt: "只保留一个强主视觉焦点，文字极少且高级，适合品牌形象和高客单项目。",
  },
]

const visualStylePresets: InternalPosterVisualStylePreset[] = [
  {
    id: "frosted-glass-archive-cover",
    name: "雾面玻璃档案封面",
    shortName: "雾面",
    description: "奶白、透明玻璃、浅色档案卡片，适合高级留白和新客信任。",
    textDensity: "low",
    directTextRisk: "low",
    prompt: "视觉像高端美容院的雾面玻璃档案封面：奶白底、半透明玻璃质感、浅灰投影、少量鼠尾草绿或烟粉点缀，文字像品牌档案标题。",
    negativePrompt: "重色块，霓虹灯，廉价玻璃拟态按钮",
  },
  {
    id: "salon-real-light",
    name: "真实护理光影",
    shortName: "真实",
    description: "真实护理室、柔和自然光、可触摸材质，减少模板感。",
    textDensity: "low",
    directTextRisk: "low",
    prompt: "主视觉必须像真实美容院护理场景或商业摄影：柔光、干净护理床、毛巾、产品瓶和自然皮肤质感，避免棚拍假模特和塑料皮肤。",
    negativePrompt: "假人脸，过度磨皮，医美手术器械，医院场景",
  },
  {
    id: "editorial-serif-whitespace",
    name: "宋体留白杂志",
    shortName: "宋体",
    description: "品牌杂志感宋体标题、大留白、强层级。",
    textDensity: "low",
    directTextRisk: "low",
    prompt: "版面像中文高端生活方式杂志：大留白、宋体或明朝气质主标题、克制无衬线辅助文字，字距自然，整体安静有质感。",
    negativePrompt: "描边大字，气泡字，字体混乱，标题挤压",
  },
  {
    id: "warm-campaign-card",
    name: "温柔活动卡",
    shortName: "活动",
    description: "温柔浅色活动氛围，权益清楚但不廉价。",
    textDensity: "medium",
    directTextRisk: "medium",
    prompt: "活动信息用温柔浅色卡片承载：香槟白、烟粉、浅金，小面积强调价格和日期，像精品店活动物料，不像低价传单。",
    negativePrompt: "爆炸贴纸，红黄促销，电商秒杀，夸张折扣角标",
  },
  {
    id: "clean-menu-grid",
    name: "清爽菜单网格",
    shortName: "菜单",
    description: "项目菜单、价格表和清单更清楚。",
    textDensity: "high",
    directTextRisk: "high",
    prompt: "用清爽网格和服务清单组织信息，留出足够行距，项目名和价格分栏对齐，像真实门店价目卡。",
    negativePrompt: "错列，密集小字，随机项目，价格乱码",
  },
  {
    id: "local-life-cover",
    name: "本地生活封面",
    shortName: "探店",
    description: "真实门店、强标题、适合探店/攻略封面。",
    textDensity: "medium",
    directTextRisk: "medium",
    prompt: "整体像真实本地生活探店封面：强主标题、真实空间、少量标签，重点是可点击但不廉价。",
    negativePrompt: "平台logo，小红书水印，假评分，假证书",
  },
  {
    id: "festive-greeting-card",
    name: "节日祝福贺卡",
    shortName: "祝福",
    description: "节日问候、老客关怀，不出现促销感。",
    textDensity: "low",
    directTextRisk: "low",
    prompt: "像高端品牌节日贺卡：温暖、克制、留白、少量节日意象，只表达问候和祝福，不出现促销、抢购或预约压迫感。",
    negativePrompt: "优惠券，促销标签，红包雨，销售话术",
  },
]

const templateLayoutMap: Record<string, string[]> = {
  P01: ["editorial-whitespace", "center-square-brand", "card-benefits"],
  P02: ["campaign-motion-x", "card-benefits", "radial-event"],
  P03: ["layered-product", "visual-center-premium", "card-benefits"],
  P04: ["visual-center-premium", "editorial-whitespace", "center-square-brand"],
  P05: ["card-benefits", "grouped-service-modules", "editorial-whitespace"],
  P06: ["campaign-motion-x", "radial-event", "center-square-brand"],
  P07: ["diagonal-xhs-cover", "editorial-whitespace", "center-square-brand"],
  P08: ["diagonal-xhs-cover", "grouped-service-modules", "card-benefits"],
  P09: ["grouped-service-modules", "card-benefits", "editorial-whitespace"],
  P10: ["grid-menu", "grouped-service-modules", "card-benefits"],
  P11: ["center-square-brand", "grid-menu", "visual-center-premium"],
  P12: ["editorial-whitespace", "card-benefits", "center-square-brand"],
  P13: ["editorial-whitespace", "center-square-brand", "radial-event"],
}

const templateVisualStyleMap: Record<string, string[]> = {
  P01: ["frosted-glass-archive-cover", "salon-real-light", "editorial-serif-whitespace"],
  P02: ["warm-campaign-card", "editorial-serif-whitespace", "frosted-glass-archive-cover"],
  P03: ["salon-real-light", "editorial-serif-whitespace", "warm-campaign-card"],
  P04: ["editorial-serif-whitespace", "salon-real-light", "frosted-glass-archive-cover"],
  P05: ["frosted-glass-archive-cover", "warm-campaign-card", "editorial-serif-whitespace"],
  P06: ["warm-campaign-card", "salon-real-light", "editorial-serif-whitespace"],
  P07: ["local-life-cover", "salon-real-light", "editorial-serif-whitespace"],
  P08: ["local-life-cover", "editorial-serif-whitespace", "warm-campaign-card"],
  P09: ["editorial-serif-whitespace", "frosted-glass-archive-cover", "clean-menu-grid"],
  P10: ["clean-menu-grid", "editorial-serif-whitespace", "frosted-glass-archive-cover"],
  P11: ["editorial-serif-whitespace", "clean-menu-grid", "salon-real-light"],
  P12: ["frosted-glass-archive-cover", "editorial-serif-whitespace", "warm-campaign-card"],
  P13: ["festive-greeting-card", "editorial-serif-whitespace", "frosted-glass-archive-cover"],
}

function publicLayoutPreset(preset: PosterLayoutPreset) {
  return {
    id: preset.id,
    name: preset.name,
    shortName: preset.shortName,
    description: preset.description,
    textDensity: preset.textDensity,
    directTextRisk: preset.directTextRisk,
    version: preset.version,
  }
}

function publicVisualStylePreset(preset: InternalPosterVisualStylePreset): PosterVisualStylePreset {
  return {
    id: preset.id,
    name: preset.name,
    shortName: preset.shortName,
    description: preset.description,
    textDensity: preset.textDensity,
    directTextRisk: preset.directTextRisk,
  }
}

function normalizePresetId(id: string) {
  return String(id || "").trim()
}

export function getPublicPosterLayoutPresets() {
  return layoutPresets.map(publicLayoutPreset)
}

export function getPublicPosterVisualStylePresets() {
  return visualStylePresets.map(publicVisualStylePreset)
}

export function getPosterTemplateLayoutMap() {
  return { ...templateLayoutMap }
}

export function getPosterTemplateVisualStyleMap() {
  return { ...templateVisualStyleMap }
}

export function getDefaultPosterLayoutPresetId(templateId: string) {
  const templateCandidates = templateLayoutMap[String(templateId || "").trim().toUpperCase()] || []
  return templateCandidates[0] || DEFAULT_LAYOUT_PRESET_ID
}

export function getDefaultPosterVisualStylePresetId(templateId: string) {
  const templateCandidates = templateVisualStyleMap[String(templateId || "").trim().toUpperCase()] || []
  return templateCandidates[0] || DEFAULT_VISUAL_STYLE_PRESET_ID
}

export function getPosterLayoutPreset(id: string) {
  const normalized = normalizePresetId(id)
  return layoutPresets.find((preset) => preset.id === normalized) || null
}

export function getPosterVisualStylePreset(id: string) {
  const normalized = normalizePresetId(id)
  return visualStylePresets.find((preset) => preset.id === normalized) || null
}

const commonNegativePrompt = [
  "乱码",
  "错别字",
  "英文",
  "随机文字",
  "多余文字",
  "文字模糊",
  "文字变形",
  "二维码",
  "电话",
  "微信号",
  "真实平台logo",
  "水印",
  "廉价促销风",
  "土味红黄配色",
  "信息过载",
  "过度磨皮",
  "塑料皮肤",
  "五官变形",
  "手指畸形",
  "杂乱背景",
  "暗沉肤色",
  "AI模板感",
  "Canva模板感",
  "廉价电商风",
  "卡通插画",
  "3D卡通",
  "塑料质感",
  "过度渐变",
  "描边大字",
  "气泡字",
  "字体混乱",
  "小图标堆叠",
  "随机贴纸",
  "夸张医美针头",
  "恐怖皮肤图",
  "虚假医疗承诺",
  "永久效果承诺",
].join("，")

const defaultTextRules = [
  "所有文字必须为清晰、准确、端正的简体中文。",
  "只使用我给出的文字，不要自动改写，不要添加额外标语。",
  "不要把字段名、字段说明、用途说明、目标人群说明写进画面，例如不要出现“主标题：”“副标题：”“适合想了解”等说明式文案。",
  "主标题控制在 8-16 个字，标签控制在 2-4 个短词。",
  "价格、日期、地址必须原样显示，不能多字、漏字或换成英文。",
  "手机端远看也能读，避免小字堆叠。",
]

function canvasForSize(size: PosterImageSize): PosterOverlay["canvas"] {
  if (size === "3:4") return { width: 900, height: 1200, size }
  if (size === "9:16") return { width: 900, height: 1600, size }
  if (size === "1:1") return { width: 1000, height: 1000, size }
  if (size === "16:9") return { width: 1600, height: 900, size }
  return { width: 900, height: 1125, size: "4:5" }
}

function field(
  key: string,
  label: string,
  placeholder: string,
  defaultValue = "",
  maxLength = 40,
  help = "",
  inputType: "text" | "textarea" = "text"
): PosterTemplateField {
  return { key, label, placeholder, defaultValue, maxLength, help, inputType, required: true }
}

function cleanFieldValue(fields: Record<string, string>, spec: PosterTemplateField) {
  const raw = String(fields[spec.key] ?? spec.defaultValue ?? "").trim()
  if (!spec.maxLength || raw.length <= spec.maxLength) return raw
  return raw.slice(0, spec.maxLength)
}

function fieldMap(fields: Record<string, string>, specs: PosterTemplateField[]) {
  const mapped = specs.reduce<Record<string, string>>((acc, spec) => {
    acc[spec.key] = cleanFieldValue(fields, spec)
    return acc
  }, {})
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith("_")) continue
    mapped[key] = String(value || "").trim().slice(0, 240)
  }
  return mapped
}

function textRuleBlock(fields: Record<string, string>, extraRules: string[] = []) {
  const strict =
    fields._textStrictness === "strict"
      ? ["这是文字严格版：优先保证中文准确、价格准确、日期准确，宁可减少装饰，也不要写错。"]
      : []
  return [...defaultTextRules, ...strict, ...extraRules].map((rule) => `- ${rule}`).join("\n")
}

function visibleCopyLine(line: string) {
  const text = String(line || "").trim()
  const idx = text.indexOf("：")
  return (idx >= 0 ? text.slice(idx + 1) : text).trim()
}

function contextLine(label: string, value: string | undefined) {
  const text = String(value || "").trim()
  return text ? `${label}：${text}` : ""
}

function visibleCopyBlock(lines: string[]) {
  return lines.map((line, index) => `${index + 1}. "${line}"`)
}

function premiumPosterDirectionBlock(fields: Record<string, string> = {}) {
  const stylePreset = String(fields._stylePreset || "").trim()
  const constraints = String(fields._constraints || "").trim()

  return [
    "总气质：品牌级美业杂志广告/精品店视觉，不是低价促销传单、AI模板拼贴或信息流广告截图。",
    stylePreset
      ? `用户指定风格方向：${stylePreset}。把它翻译成构图、色彩、字体层级、材质、光线和留白，不要只做表面元素堆叠。`
      : "",
    constraints ? `用户明确强调/避开：${constraints}。` : "",
    "构图：一处明确主视觉 + 一处安静可读的文字区；主视觉要有摄影棚级光影和空间层次，画面边缘保持干净。",
    "版式：大留白、高对齐、强层级；最多 3 个视觉层级、最多 3 种字号；文字不要压满画面，也不要散成很多小标签。",
    "字体：中文主标题用高端杂志感宋体/明朝/品牌衬线字气质；副标题和辅助信息用克制无衬线；字距自然，像真实品牌海报排版。",
    "材质与摄影：真实商业摄影质感，柔和自然光或高级棚拍光，浅景深；优先皮肤管理空间、护理用品、织物、玻璃、陶瓷、花材、纸张等可触摸材质。",
    "配色：低饱和、干净、精致，允许象牙白、烟粉、鼠尾草绿、深棕、香槟金等小面积点缀；全图主色不超过 3 个。",
    "细节：装饰线、图标、标签只作为辅助；不要堆满小图标、小贴纸、随机英文、假按钮或无意义角标。",
  ].filter(Boolean)
}

function posterProtocolBlock(opts: {
  layoutPresetId?: string
  visualStylePresetId?: string
  qrState?: PosterQrState
}) {
  const layoutPreset = getPosterLayoutPreset(opts.layoutPresetId || "")
  const visualStylePreset = getPosterVisualStylePreset(opts.visualStylePresetId || "")
  const hasQr = !!opts.qrState?.hasQr

  return [
    layoutPreset ? "【版式预设】" : "",
    layoutPreset ? `- 预设：${layoutPreset.name}（${layoutPreset.id}）。${layoutPreset.description}` : "",
    layoutPreset ? `- 执行方式：${layoutPreset.prompt}` : "",
    layoutPreset
      ? `- 信息密度：${layoutPreset.textDensity}；模型直接写字风险：${layoutPreset.directTextRisk}。风险越高越要减少装饰、优先保证中文可读。`
      : "",
    visualStylePreset ? "" : "",
    visualStylePreset ? "【视觉风格预设】" : "",
    visualStylePreset ? `- 预设：${visualStylePreset.name}（${visualStylePreset.id}）。${visualStylePreset.description}` : "",
    visualStylePreset ? `- 执行方式：${visualStylePreset.prompt}` : "",
    hasQr ? "" : "",
    hasQr ? "【二维码后合成】" : "",
    hasQr ? "- 用户已上传二维码。二维码由小程序在保存时后合成，模型不要绘制、仿造、生成或扭曲二维码。" : "",
    hasQr ? "- 在底部 CTA 附近或右下区域预留一块干净浅色可读空间，不要让人物、产品、主标题或价格压住这块区域。" : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function visualBrief(input: {
  taskType: string
  industryTheme: string
  size: PosterImageSize
  mainVisual: string
  sceneProps: string
  style: string
  layout: string
  textLines: string[]
  textRules?: string[]
  outputGoal: string
  emotion?: string
  fields?: Record<string, string>
}) {
  const visibleTextLines = input.textLines.map(visibleCopyLine).filter(Boolean)
  const resolvedSize = (input.fields?._requestedSize as PosterImageSize | undefined) || input.size
  const hiddenContext = [
    contextLine("行业", input.fields?._industry),
    contextLine("门店类型", input.fields?._businessType),
    contextLine("目标人群", input.fields?._targetAudience),
    contextLine("行动目标", input.fields?._cta),
    contextLine("用户风格方向", input.fields?._stylePreset),
    contextLine("风格限制", input.fields?._constraints),
    contextLine("商圈", input.fields?._cityArea),
  ].filter(Boolean)

  return [
    "生成一张可直接发布的完整中文商业海报。把它当成真实品牌广告创作，而不是模板填字或素材拼贴。",
    "",
    "【画布与任务】",
    `- 类型：${input.taskType}`,
    `- 行业：${input.industryTheme}`,
    `- 比例：${resolvedSize}，实际输出比例以这里为准。`,
    `- 目标：${input.outputGoal}`,
    input.emotion ? `- 情绪洞察：${input.emotion}` : "",
    "",
    "【主视觉创意】",
    `- 主体：${input.mainVisual}`,
    `- 场景/道具：${input.sceneProps}`,
    `- 风格基底：${input.style}`,
    "",
    "【高级美术指导】",
    ...premiumPosterDirectionBlock(input.fields || {}).map((line) => `- ${line}`),
    "",
    "【版式结构】",
    `- ${input.layout}`,
    "- 先整体设计画面，再把文字作为版式的一部分嵌入，不要像后期贴字。",
    "- 文字区必须有足够留白和对比度，手机端缩略图也能读出主标题。",
    "",
    "【可见文字】",
    "只渲染下面这些文字，每条逐字出现一次；不要显示引号、序号、字段名、冒号、解释句或用户画像说明；不要自行加英文、副标、电话、二维码、平台名。",
    ...visibleCopyBlock(visibleTextLines),
    "",
    "【中文排版规则】",
    textRuleBlock(input.fields || {}, input.textRules),
    hiddenContext.length ? "" : "",
    hiddenContext.length ? "【背景信息，不要写进画面】" : "",
    ...hiddenContext.map((line) => `- ${line}`),
    "",
    `【不要出现】${commonNegativePrompt}`,
  ]
    .filter(Boolean)
    .join("\n")
}

const templates: InternalPosterTemplate[] = [
  {
    id: "P01",
    group: "acquire",
    title: "新客首单",
    scenario: "第一次到店",
    goal: "降低防备，让用户敢预约第一次",
    description: "适合团购封面、朋友圈引流和门店群预热。",
    useCase: "新客获客 / 到店体验 / 本地生活",
    outputHint: "突出第一次来不尴尬、不硬推、先看状态。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "soft-entry",
    styleTags: ["清新可信", "真实门店", "低压到店"],
    textRules: ["不要把标题写成医疗承诺。", "不要添加电话、二维码或平台名。"],
    requiredFields: [
      field("storeName", "门店名", "椿舍皮肤管理", "椿舍皮肤管理", 18),
      field("cityArea", "城市/商圈", "吴江万宝", "吴江万宝", 12),
      field("headline", "主标题", "新客首单体验", "新客首单体验", 14),
      field("subline", "副标题", "第一次来，也能安心变美", "第一次来，也能安心变美", 18),
      field("projectName", "体验项目", "补水舒缓护理", "补水舒缓护理", 16),
      field("offerText", "权益/价格", "新客 99 起", "新客 99 起", 14),
      field("trustRules", "服务规矩", "不硬推｜可拒绝｜先评估", "不硬推｜可拒绝｜先评估", 22),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 新客首单体验海报",
        industryTheme: "生活美容 / 皮肤管理门店",
        size: "4:5",
        mainVisual: "真实明亮的皮肤管理门店接待区或护理室，一位顾客放松坐着或护理细节局部，状态自然，不夸张摆拍。",
        sceneProps: "干净毛巾、温水杯、柔光灯、香薰、护理床、浅色产品瓶、预约卡。",
        style: "小红书本地生活封面感，奶白、浅粉、鼠尾草绿，柔和自然光，真实摄影质感，高级但亲和。",
        layout: "上方留主标题，中部放真实服务场景，价格权益用精致浅色标签突出，底部放门店名、商圈和服务规矩。",
        textLines: [
          `门店：${f.storeName}`,
          `商圈：${f.cityArea}`,
          `主标题：${f.headline}`,
          `副标题：${f.subline}`,
          `体验项目：${f.projectName}`,
          `权益：${f.offerText}`,
          `服务规矩：${f.trustRules}`,
        ],
        textRules: templatesTextRules("price"),
        outputGoal: "让第一次来的顾客感觉门店可信、低压、可以先试一次。",
        emotion: "用户想变好，但怕被推销、怕尴尬、怕第一次就被消耗。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P02",
    group: "deal",
    title: "节日活动",
    scenario: "节日促销",
    goal: "把活动权益做得高级，不像廉价传单",
    description: "适合五一、520、女神节、周年庆和宠粉礼。",
    useCase: "活动成交 / 私域转发 / 朋友圈",
    outputHint: "保留优惠信息，但画面要像高端护肤广告。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "campaign",
    styleTags: ["活动权益", "香槟柔光", "高转化"],
    textRules: ["价格必须醒目但不能土味。", "活动时间必须完整准确。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("campaignTitle", "活动主题", "五一焕颜季", "五一焕颜季", 14),
      field("subline", "活动副标题", "提前预约，假期状态刚刚好", "提前预约，假期状态刚刚好", 20),
      field("sellingPoints", "卖点标签", "补水｜清洁｜舒缓｜提亮", "补水｜清洁｜舒缓｜提亮", 24),
      field("offerText", "优惠权益", "新客体验 99 起", "新客体验 99 起", 16),
      field("dateRange", "活动时间", "5.1-5.5", "5.1-5.5", 14),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 美容门店节日活动海报",
        industryTheme: "皮肤管理节日活动",
        size: "4:5",
        mainVisual: "自然清透妆容的女性、精华瓶、面膜、花束和浅色礼盒组成高级活动主视觉。",
        sceneProps: "丝绸、香薰、柔软毛巾、浅金贴纸、节日礼盒、柔光背景。",
        style: "奶白、浅粉、香槟金，真实商业摄影，高级温柔，有节日氛围但不廉价。",
        layout: "标题在上方偏左，人物或产品在右侧，优惠权益用精致标签突出，底部放活动时间和门店名。",
        textLines: [
          `门店：${f.storeName}`,
          `主标题：${f.campaignTitle}`,
          `副标题：${f.subline}`,
          `卖点：${f.sellingPoints}`,
          `优惠：${f.offerText}`,
          `时间：${f.dateRange}`,
        ],
        textRules: templatesTextRules("price"),
        outputGoal: "让活动有成交力，但仍然像专业门店的海报。",
        emotion: "用户想趁节日前变好，但不想看到土味促销。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P13",
    group: "retain",
    title: "节日祝福",
    scenario: "客户问候",
    goal: "让老客收到一张有温度、不推销的节日问候图",
    description: "适合端午、中秋、春节、节气和客户群问候，不主打优惠。",
    useCase: "老客维护 / 节日问候 / 私域关系",
    outputHint: "像高端品牌节日贺卡，不像促销活动单。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "festival-greeting",
    styleTags: ["节日祝福", "老客关怀", "杂志贺卡"],
    textRules: ["不要出现价格、优惠、促销、到店礼包。", "祝福文案要短而克制，不要堆满画面。"],
    requiredFields: [
      field("storeName", "门店名", "青禾养生", "青禾养生", 18),
      field("festivalName", "节日", "端午", "端午", 10),
      field("blessingTitle", "祝福标题", "端午安康", "端午安康", 12),
      field("blessingSubtitle", "祝福副标题", "愿你清爽一夏", "愿你清爽一夏", 18),
      field("signature", "署名", "青禾养生", "青禾养生", 18),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 非促销节日祝福海报",
        industryTheme: `${f.festivalName}客户问候 / 美业养生老客维护`,
        size: "4:5",
        mainVisual: "节日静物与门店护理氛围融合，画面安静、干净、有呼吸感；不出现促销牌、价格牌或活动标签。",
        sceneProps: `${f.festivalName}应景道具、植物叶片、茶、花材、护肤瓶、毛巾、浅色织物、自然窗光、纸张贺卡。`,
        style: "高端品牌节日贺卡 + 美业杂志大片，东方美学、低饱和、克制留白、真实摄影质感。",
        layout: "左侧或上方保留大祝福标题，右侧或下半部为节日静物主视觉；底部只放门店署名，整体像可转发的节日贺卡。",
        textLines: [
          `节日：${f.festivalName}`,
          `祝福标题：${f.blessingTitle}`,
          `祝福副标题：${f.blessingSubtitle}`,
          `署名：${f.signature || f.storeName}`,
        ],
        textRules: templatesTextRules("greeting"),
        outputGoal: "让老顾客感到被记得和被祝福，而不是被营销。",
        emotion: "用户不想卖东西，只想在节日里自然维护关系，语气要温暖但不油腻。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P03",
    group: "deal",
    title: "爆款项目",
    scenario: "项目种草",
    goal: "把单个项目讲成状态答案",
    description: "适合补水、清洁、肩颈、舒缓、妆前急救等项目。",
    useCase: "项目转化 / 小红书封面 / 私域促单",
    outputHint: "强调适合谁、解决什么状态，不做夸张前后对比。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "project",
    styleTags: ["项目主推", "适合人群", "状态管理"],
    textRules: ["不要使用永久、根治、立刻年轻等风险词。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("projectName", "项目名", "深层补水管理", "深层补水管理", 16),
      field("headline", "主标题", "给皮肤做次深呼吸", "给皮肤做次深呼吸", 14),
      field("audience", "适合人群", "熬夜脸｜换季干｜妆前卡粉", "熬夜脸｜换季干｜妆前卡粉", 26),
      field("highlights", "项目亮点", "清洁｜补水｜舒缓", "清洁｜补水｜舒缓", 20),
      field("bookingLine", "预约提示", "到店先做状态评估", "到店先做状态评估", 20),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 门店爆款项目海报",
        industryTheme: `美容门店项目：${f.projectName}`,
        size: "4:5",
        mainVisual: "高级护理服务场景，顾客闭眼放松，肌肤自然干净，仪器或手法只作为辅助元素。",
        sceneProps: "护理床、柔光灯、精华瓶、洁面巾、镜面反射、浅色产品陈列。",
        style: "真实门店摄影 + 高级项目 KV，干净、柔光、专业，不医美化。",
        layout: "主标题大而清楚，适合人群做 3 个短标签，项目亮点做三栏模块，底部放预约提示。",
        textLines: [
          `门店：${f.storeName}`,
          `项目：${f.projectName}`,
          `主标题：${f.headline}`,
          `适合：${f.audience}`,
          `亮点：${f.highlights}`,
          `提示：${f.bookingLine}`,
        ],
        textRules: templatesTextRules("safe"),
        outputGoal: "让用户一眼知道这个项目适合什么状态，而不是只看到项目名。",
        emotion: "用户想改善状态，但害怕试错和被过度承诺。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P04",
    group: "trust",
    title: "品牌形象",
    scenario: "门店信任",
    goal: "提升门店调性和可信感",
    description: "不主打低价，适合品牌升级、开业预热和朋友圈形象图。",
    useCase: "品牌信任 / 开业预热 / 形象传播",
    outputHint: "像高端杂志广告，不像促销单页。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "brand-trust",
    styleTags: ["高级留白", "门店质感", "信任主张"],
    textRules: ["标题不要过大到压迫，保持高端品牌大片感。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("brandPromise", "品牌主张", "让皮肤回到稳定发光", "让皮肤回到稳定发光", 18),
      field("subline", "一句解释", "专注皮肤管理与长期状态维护", "专注皮肤管理与长期状态维护", 24),
      field("proofLine", "可信细节", "先判断状态，再做护理", "先判断状态，再做护理", 22),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 高端美容门店品牌形象海报",
        industryTheme: "生活美容品牌形象",
        size: "4:5",
        mainVisual: "极简皮肤管理护理室、干净操作台、柔光产品陈列和自然材质空间。",
        sceneProps: "浅色空间、护理床、毛巾、玻璃瓶、花材、柔光窗帘、安静留白。",
        style: "高端杂志广告感，真实摄影，克制、安静、精致，大量留白。",
        layout: "主视觉占上半部或右侧，左下和底部保留文字区，标题不喧宾夺主。",
        textLines: [`品牌：${f.storeName}`, `主标题：${f.brandPromise}`, `副标题：${f.subline}`, `可信细节：${f.proofLine}`],
        textRules: templatesTextRules("brand"),
        outputGoal: "让门店摆脱低价感，建立长期专业和边界感。",
        emotion: "用户更信任克制、稳定、有规矩的门店。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P05",
    group: "retain",
    title: "会员招募",
    scenario: "长期复购",
    goal: "把办卡变成长期状态管理",
    description: "适合会员招募、月度护理和老客复购。",
    useCase: "会员权益 / 私域复购 / 长期养护",
    outputHint: "不要低端充值海报，要像生活方式会员卡视觉。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "member",
    styleTags: ["会员卡", "长期陪伴", "复购"],
    textRules: ["会员权益用短词，不堆长句。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("headline", "主标题", "会员状态管理计划", "会员状态管理计划", 16),
      field("subline", "副标题", "把每次护理做成长期稳定", "把每次护理做成长期稳定", 20),
      field("benefits", "会员权益", "专属档案｜周期提醒｜优先预约｜到店评估", "专属档案｜周期提醒｜优先预约｜到店评估", 34),
      field("giftLine", "入会礼", "入会赠一次肌肤检测", "入会赠一次肌肤检测", 18),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 美容门店会员招募海报",
        industryTheme: "皮肤管理会员计划",
        size: "4:5",
        mainVisual: "精致会员卡、护理空间、礼盒、产品陈列组成高端生活方式会员视觉。",
        sceneProps: "会员卡、浅色礼盒、丝绸、产品瓶、护理日历、小花材、暖光。",
        style: "高级生活方式品牌，奶白、暖灰、浅棕，光线柔和，有仪式感。",
        layout: "会员卡或礼盒作为视觉中心，权益用四个精致模块展示，底部放入会礼。",
        textLines: [`门店：${f.storeName}`, `主标题：${f.headline}`, `副标题：${f.subline}`, `会员权益：${f.benefits}`, `入会礼：${f.giftLine}`],
        textRules: templatesTextRules("brand"),
        outputGoal: "把复购理由从便宜转为稳定、规律、被照顾。",
        emotion: "用户希望有确定性，不想每次都重新做决定。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P06",
    group: "local",
    title: "开业宣传",
    scenario: "新店开业",
    goal: "把城市感和门店质感融合",
    description: "适合新店开业、迁址、商圈曝光。",
    useCase: "开业获客 / 本地传播 / 商圈曝光",
    outputHint: "要有城市高级感，避免传统剪彩风。",
    previewImage: "",
    defaultSize: "9:16",
    defaultResolution: "1k",
    previewStyle: "opening",
    styleTags: ["城市感", "新店", "开业礼"],
    textRules: ["地址如有较长，放底部小字但必须清楚。"],
    requiredFields: [
      field("storeName", "门店名", "椿舍皮肤管理", "椿舍皮肤管理", 18),
      field("cityArea", "城市/商圈", "苏州吴江", "苏州吴江", 14),
      field("headline", "主标题", "新店正式开业", "新店正式开业", 14),
      field("openingGift", "开业礼", "新客体验礼｜到店检测｜好友同行礼", "新客体验礼｜到店检测｜好友同行礼", 34),
      field("dateRange", "开业时间", "4.27 起", "4.27 起", 14),
      field("addressLine", "地址", "万宝商圈附近", "万宝商圈附近", 24),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 9:16 城市门店开业海报",
        industryTheme: "美容门店开业宣传",
        size: "9:16",
        mainVisual: "城市地标或街区生活感与高端门店空间融合，前景展示门店服务细节。",
        sceneProps: "柔和城市背景、门店门头局部、护理空间、花艺、接待区、开业礼盒。",
        style: "高级、明亮、真实，城市本地生活质感，避免传统红黄剪彩风。",
        layout: "顶部放品牌和开业标题，中部城市与门店融合主视觉，底部放开业礼、时间、地址。",
        textLines: [
          `品牌：${f.storeName}`,
          `城市：${f.cityArea}`,
          `主标题：${f.headline}`,
          `开业礼：${f.openingGift}`,
          `时间：${f.dateRange}`,
          `地址：${f.addressLine}`,
        ],
        textRules: templatesTextRules("address"),
        outputGoal: "让本地用户知道新店来了，并愿意保存或转发。",
        emotion: "用户需要确认这是一家真实、干净、值得去的新店。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P07",
    group: "local",
    title: "本地探店",
    scenario: "探店封面",
    goal: "让门店像真实小红书热门探店图",
    description: "适合城市关键词、商圈关键词和探店笔记封面。",
    useCase: "小红书探店 / 本地搜索 / 门店环境",
    outputHint: "不要像硬广，重点是真实、干净、可点击。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "local-visit",
    styleTags: ["探店", "真实门店", "可点击"],
    textRules: ["不要出现真实平台商标。"],
    requiredFields: [
      field("cityArea", "城市/商圈", "吴江万宝", "吴江万宝", 14),
      field("storeType", "店铺类型", "皮肤管理", "皮肤管理", 12),
      field("storeName", "店名", "椿舍皮肤管理", "椿舍皮肤管理", 18),
      field("reason", "推荐理由", "环境舒服，服务很细", "环境舒服，服务很细", 18),
      field("tags", "标签", "环境好｜服务细｜拍照出片", "环境好｜服务细｜拍照出片", 24),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 小红书本地探店封面",
        industryTheme: `${f.cityArea}${f.storeType}探店`,
        size: "4:5",
        mainVisual: "真实门店空间加一个精致服务细节特写，例如护理床、产品陈列、前台、茶水、镜子或花艺。",
        sceneProps: "门店空间、护理床、产品陈列、前台茶水、花艺、镜子、自然光。",
        style: "像手机拍到但经过高级修图的探店照片，明亮、干净、自然。",
        layout: "大标题在上方或左侧留白处，主视觉占中部，底部放店名、商圈和标签。",
        textLines: [
          `大标题：${f.cityArea}宝藏${f.storeType}`,
          `副标题：${f.reason}`,
          `标签：${f.tags}`,
          `店名：${f.storeName}`,
        ],
        textRules: templatesTextRules("xhs"),
        outputGoal: "让用户觉得这是一家真实可去、值得收藏的本地门店。",
        emotion: "用户想找本地靠谱店，不想白跑。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P08",
    group: "acquire",
    title: "避坑封面",
    scenario: "避雷攻略",
    goal: "用坑点吸引搜索用户停下来",
    description: "适合避雷、攻略、对比和评论区高频问题。",
    useCase: "搜索获客 / 小红书封面 / 避坑笔记",
    outputHint: "冲突要强，但不能恐吓和制造焦虑。",
    previewImage: "",
    defaultSize: "3:4",
    defaultResolution: "1k",
    previewStyle: "xhs-conflict",
    styleTags: ["避坑", "强标题", "收藏"],
    textRules: ["标题必须短、粗、清楚。", "不要使用恐吓式营销。"],
    requiredFields: [
      field("topic", "避坑主题", "美容院套路", "美容院套路", 14),
      field("headline", "大标题", "说不买之后看动作", "说不买之后看动作", 14),
      field("subline", "副标题", "这比推销本身更说明问题", "这比推销本身更说明问题", 22),
      field("tags", "标签", "别踩坑｜先收藏｜真实经验", "别踩坑｜先收藏｜真实经验", 24),
      field("storeName", "署名", "椿舍皮肤管理", "椿舍皮肤管理", 18),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 3:4 小红书避坑攻略封面",
        industryTheme: `${f.topic}避坑指南`,
        size: "3:4",
        mainVisual: "美容门店真实场景局部，空白价目单、笔、护理床、毛巾或接待桌，背景轻微虚化。",
        sceneProps: "纸张、便签、深色判断标签、柔光护理环境、少量真实道具。",
        style: "高级纸张质感 + 真实摄影局部，像可收藏判断卡，颜色不超过 3 种。",
        layout: "大标题占上方 30%，中间主视觉，下方放副标题和标签，手机端一眼读懂。",
        textLines: [`大标题：${f.headline}`, `副标题：${f.subline}`, `标签：${f.tags}`, `署名：${f.storeName}`],
        textRules: templatesTextRules("xhs"),
        outputGoal: "让有怀疑和防御心的用户先停下来。",
        emotion: "用户想做，但不想再被坑、被教育、被推销。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P09",
    group: "trust",
    title: "知识卡",
    scenario: "专业科普",
    goal: "把专业解释做成可收藏信息图",
    description: "适合护理前知识、项目选择、适合/不适合说明。",
    useCase: "小红书科普 / 专业信任 / 收藏转发",
    outputHint: "专家感要亲切，不要像报告。",
    previewImage: "",
    defaultSize: "3:4",
    defaultResolution: "1k",
    previewStyle: "infographic",
    styleTags: ["信息图", "专业可信", "可收藏"],
    textRules: ["每个知识点只用短句，不放长段落。"],
    requiredFields: [
      field("topic", "科普主题", "换季皮肤不稳定", "换季皮肤不稳定", 16),
      field("headline", "标题", "一张图讲清楚", "一张图讲清楚", 12),
      field("point1", "知识点 1", "先稳屏障", "先稳屏障", 12),
      field("point2", "知识点 2", "少叠刺激", "少叠刺激", 12),
      field("point3", "知识点 3", "清洁别过度", "清洁别过度", 12),
      field("point4", "知识点 4", "到店先评估", "到店先评估", 12),
      field("storeName", "署名", "云肌皮肤管理", "云肌皮肤管理", 18),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 3:4 美容知识信息图海报",
        industryTheme: `皮肤管理科普：${f.topic}`,
        size: "3:4",
        mainVisual: "中间为干净的皮肤管理示意主视觉，四周有 4 个模块化知识点。",
        sceneProps: "浅色纸张、细线图标、柔和模块、轻微手账标签、专业但亲切的小图形。",
        style: "高级百科卡 + 小红书知识卡，米白、浅灰、淡粉，信息密度中等，不拥挤。",
        layout: "顶部标题，中间主视觉，底部或四周 4 个知识模块，底部放门店署名。",
        textLines: [
          `主题：${f.topic}`,
          `标题：${f.headline}`,
          `模块1：${f.point1}`,
          `模块2：${f.point2}`,
          `模块3：${f.point3}`,
          `模块4：${f.point4}`,
          `署名：${f.storeName}`,
        ],
        textRules: templatesTextRules("safe"),
        outputGoal: "建立专业信任，让用户愿意收藏并进一步咨询适合方案。",
        emotion: "用户不是要被吓到，而是要知道怎么少走弯路。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P10",
    group: "menu",
    title: "价目菜单",
    scenario: "项目菜单",
    goal: "把菜单做清楚，但不显廉价",
    description: "适合门店项目菜单、价目表、服务清单。",
    useCase: "项目菜单 / 价目说明 / 门店咨询",
    outputHint: "价格对齐、分区清楚，是这类海报的第一优先级。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "menu",
    styleTags: ["菜单", "价目表", "清晰"],
    textRules: ["价格必须对齐，不能糊。", "分区不要超过 3 组。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("headline", "菜单标题", "项目菜单", "项目菜单", 12),
      field("category1", "分区 1", "清洁管理：小气泡 99 / 深层清洁 199", "清洁管理：小气泡 99 / 深层清洁 199", 38),
      field("category2", "分区 2", "补水舒缓：基础补水 168 / 屏障修护 268", "补水舒缓：基础补水 168 / 屏障修护 268", 38),
      field("category3", "分区 3", "状态管理：妆前急救 199 / 月度养护 599", "状态管理：妆前急救 199 / 月度养护 599", 38),
      field("bookingLine", "底部提示", "到店先评估，再选项目", "到店先评估，再选项目", 20),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 高端门店项目价目表海报",
        industryTheme: "美容门店服务菜单",
        size: "4:5",
        mainVisual: "浅色纸张或高级门店环境虚化背景，顶部品牌，主体是清晰菜单排版。",
        sceneProps: "高级纸张、细线分区、浅色背景、门店小照片或产品细节弱化作为背景。",
        style: "高端门店菜单，不像廉价价目表，克制、干净、可读。",
        layout: "顶部放门店和标题，中部三块分区菜单，价格右对齐，底部放预约提示。",
        textLines: [
          `门店：${f.storeName}`,
          `标题：${f.headline}`,
          `分区1：${f.category1}`,
          `分区2：${f.category2}`,
          `分区3：${f.category3}`,
          `底部：${f.bookingLine}`,
        ],
        textRules: templatesTextRules("price"),
        outputGoal: "让用户快速理解门店项目和价格区间。",
        emotion: "用户需要透明和确定性，不想到店后才发现信息不一致。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P11",
    group: "menu",
    title: "门店电子屏",
    scenario: "横版屏幕",
    goal: "适合电视屏、展架和店内大屏",
    description: "横版远距离可读，适合门店电子屏和活动展架。",
    useCase: "门店屏幕 / 展架 / 横版广告",
    outputHint: "远看可读，不把竖版海报硬拉宽。",
    previewImage: "",
    defaultSize: "16:9",
    defaultResolution: "1k",
    previewStyle: "screen",
    styleTags: ["16:9", "远看可读", "店内屏"],
    textRules: ["字要大，小字只保留一行。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("headline", "主标题", "今日到店先做状态评估", "今日到店先做状态评估", 18),
      field("subline", "副标题", "把护理做得更适合你", "把护理做得更适合你", 18),
      field("sellingPoints", "核心卖点", "清洁 / 补水 / 舒缓", "清洁 / 补水 / 舒缓", 24),
      field("bottomLine", "底部信息", "预约后优先安排档期", "预约后优先安排档期", 22),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "横版 16:9 门店电子屏海报",
        industryTheme: "美容门店店内屏幕",
        size: "16:9",
        mainVisual: "左侧大面积护理场景或产品主视觉，右侧清晰文字信息区。",
        sceneProps: "门店空间、护理床、产品陈列、柔光、浅色背景、留白。",
        style: "远距离可读的高端门店屏幕视觉，清爽、稳定、专业。",
        layout: "左图右文或中心主体加右侧信息区，主标题最大，卖点三个以内，底部一行提示。",
        textLines: [`门店：${f.storeName}`, `主标题：${f.headline}`, `副标题：${f.subline}`, `卖点：${f.sellingPoints}`, `底部：${f.bottomLine}`],
        textRules: templatesTextRules("screen"),
        outputGoal: "在门店内让顾客远距离也能读懂当前主推信息。",
        emotion: "顾客到店后需要稳定、清晰、专业的视觉确认。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
  {
    id: "P12",
    group: "retain",
    title: "朋友圈转发",
    scenario: "私域分享",
    goal: "生成一张老客愿意转发的轻活动图",
    description: "适合老客唤醒、闺蜜同行、预约提醒。",
    useCase: "私域转发 / 老客复购 / 闺蜜同行",
    outputHint: "像生活方式分享，不像强硬广告。",
    previewImage: "",
    defaultSize: "4:5",
    defaultResolution: "1k",
    previewStyle: "moments",
    styleTags: ["朋友圈", "轻活动", "老客"],
    textRules: ["文案要像可以转发的朋友提醒，不要硬广口吻。"],
    requiredFields: [
      field("storeName", "门店名", "云肌皮肤管理", "云肌皮肤管理", 18),
      field("headline", "主标题", "假期前把状态养回来", "假期前把状态养回来", 16),
      field("subline", "副标题", "最近忙的人，先给自己留一次护理", "最近忙的人，先给自己留一次护理", 24),
      field("shareOffer", "转发权益", "老客带朋友到店有小礼", "老客带朋友到店有小礼", 20),
      field("dateRange", "时间", "本周可约", "本周可约", 12),
    ],
    textSlots: [],
    promptBuilder: (f) =>
      visualBrief({
        taskType: "竖版 4:5 朋友圈私域转发海报",
        industryTheme: "美容门店老客唤醒",
        size: "4:5",
        mainVisual: "自然光生活方式场景，预约卡、护肤桌面、门店花束、护理后轻松氛围。",
        sceneProps: "咖啡、预约卡、花束、护肤品、镜子、浅色桌面、自然光。",
        style: "真实生活方式分享感，轻柔、干净、有温度，不像硬广。",
        layout: "标题在上方留白处，画面中部是生活方式主视觉，底部放权益和时间。",
        textLines: [`门店：${f.storeName}`, `主标题：${f.headline}`, `副标题：${f.subline}`, `权益：${f.shareOffer}`, `时间：${f.dateRange}`],
        textRules: templatesTextRules("brand"),
        outputGoal: "让老客愿意转发给朋友，不觉得尴尬或硬推。",
        emotion: "用户需要一个合理理由照顾自己，也愿意把靠谱体验分享给朋友。",
        fields: f,
      }),
    negativePrompt: commonNegativePrompt,
  },
]

function templatesTextRules(kind: "price" | "safe" | "brand" | "address" | "xhs" | "screen" | "greeting") {
  const rules: Record<typeof kind, string[]> = {
    price: ["价格和日期必须原样显示，价格区域醒目但高级。"],
    safe: ["避免医疗夸大，使用状态管理、护理体验、到店评估这类表达。"],
    brand: ["整体像高端生活方式品牌，不要促销单页感。"],
    address: ["地址或商圈信息必须清晰，不要生成电话、二维码或微信号。"],
    xhs: ["标题要短、粗、清楚，像真实小红书热门封面，不像淘宝广告。"],
    screen: ["远距离可读，主标题最大，信息不要超过三层。"],
    greeting: ["只做节日问候，不出现优惠、价格、促销、到店礼包、预约按钮或销售话术。"],
  }
  return rules[kind]
}

export function getPublicPosterTemplates() {
  return templates.map((template) => ({
    id: template.id,
    group: template.group,
    title: template.title,
    scenario: template.scenario,
    goal: template.goal,
    description: template.description,
    useCase: template.useCase,
    outputHint: template.outputHint,
    previewImage: template.previewImage,
    defaultSize: template.defaultSize,
    defaultResolution: template.defaultResolution,
    requiredFields: template.requiredFields,
    textSlots: template.textSlots,
    previewStyle: template.previewStyle,
    styleTags: template.styleTags,
    textRules: template.textRules,
  }))
}

export function getPosterTemplate(id: string) {
  const normalized = id.trim().toUpperCase()
  return templates.find((template) => template.id === normalized) || null
}

export function getMissingRequiredFields(template: InternalPosterTemplate, fields: Record<string, string>) {
  const mapped = fieldMap(fields, template.requiredFields)
  return template.requiredFields
    .filter((spec) => spec.required !== false && !mapped[spec.key])
    .map((spec) => spec.key)
}

export function renderPosterTemplate(
  template: InternalPosterTemplate,
  fields: Record<string, string>,
  size?: PosterImageSize,
  options: {
    layoutPresetId?: string
    visualStylePresetId?: string
    qrState?: PosterQrState
  } = {}
) {
  const mapped = fieldMap(fields, template.requiredFields)
  const layoutPresetId = options.layoutPresetId || mapped._layoutPresetId || getDefaultPosterLayoutPresetId(template.id)
  const visualStylePresetId =
    options.visualStylePresetId || mapped._visualStylePresetId || getDefaultPosterVisualStylePresetId(template.id)
  const layoutPreset = getPosterLayoutPreset(layoutPresetId) || getPosterLayoutPreset(DEFAULT_LAYOUT_PRESET_ID)
  const visualStylePreset =
    getPosterVisualStylePreset(visualStylePresetId) || getPosterVisualStylePreset(DEFAULT_VISUAL_STYLE_PRESET_ID)
  if (layoutPreset) {
    mapped._layoutPresetId = layoutPreset.id
    mapped._layoutName = layoutPreset.name
    mapped._layoutPresetVersion = layoutPreset.version
  }
  if (visualStylePreset) {
    mapped._visualStylePresetId = visualStylePreset.id
    mapped._visualStyleName = visualStylePreset.name
  }
  mapped._requestedSize = size || template.defaultSize
  const canvas = canvasForSize(size || template.defaultSize)
  const overlay: PosterOverlay = {
    canvas,
    slots: template.textSlots.map((slot) => ({ ...slot, text: mapped[slot.key] || "" })).filter((slot) => slot.text),
  }
  const protocol = posterProtocolBlock({
    layoutPresetId: layoutPreset?.id,
    visualStylePresetId: visualStylePreset?.id,
    qrState: options.qrState,
  })

  return {
    prompt: [template.promptBuilder(mapped), protocol].filter(Boolean).join("\n\n"),
    negativePrompt: [template.negativePrompt, visualStylePreset?.negativePrompt].filter(Boolean).join("，"),
    overlay,
    layoutPreset: layoutPreset ? publicLayoutPreset(layoutPreset) : null,
    visualStylePreset: visualStylePreset ? publicVisualStylePreset(visualStylePreset) : null,
  }
}

export function buildFreeImagePrompt(prompt: string) {
  return [
    prompt.trim(),
    "",
    "请按用户描述生成高质量图片。若用户要求文字，所有文字必须为清晰、准确、简体中文；不要乱码、错别字、英文或多余文字。",
    "如果用户没有明确要求文字，请不要在画面里添加任何随机文字、logo、水印、二维码或联系方式。",
  ].join("\n")
}

export function getDefaultPosterNegativePrompt() {
  return commonNegativePrompt
}
