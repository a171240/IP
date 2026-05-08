export type BeautyXhsContentType = "treatment" | "education" | "promotion" | "comparison"
export type BeautyConflictLevel = "safe" | "standard" | "hard"

export type BeautyEntryClass =
  | "problem_repair"
  | "trust_doubt"
  | "relax_care"
  | "local_decision"
  | "boundary_risk"

export type BeautyNarratorId =
  | "experienced_friend"
  | "professional_translator"
  | "pitfall_observer"
  | "decision_coach"
  | "returning_customer"
  | "local_observer"
  | "store_operator"

export type BeautyCoverStyleId =
  | "soft-minimal-poster"
  | "editorial-magazine"
  | "clean-info-card"
  | "warm-dialog-card"
  | "contrast-warning-poster"
  | "comparison-split-card"
  | "lifestyle-spa-scene"
  | "premium-still-life"

export type BeautyCoverVisualPlan = {
  id: BeautyCoverStyleId
  label: string
  reason: string
  layout: string
  palette: string
  visualCue: string
  typography: string
}

export type BeautyContext = {
  contentType: BeautyXhsContentType
  contentTypeLabel: string
  conflictLabel: string
  entryClass: BeautyEntryClass
  entryLabel: string
  openingFamily: string
  narratorId: BeautyNarratorId
  narratorName: string
  narratorRole: string
  personaHint: string
  defenseMindset: string
  realDesire: string
  longingScene: string
  storeRuleFocus: string
  complaintAngles: string[]
  contentStrategy: string
  coverTemplateBias: "warm-poster" | "hand-note" | "dialog-bubble"
  coverVisualPlan: BeautyCoverVisualPlan
}

const COMMON_NEGATIVE_PROMPT = [
  "人物照片，产品图，英文字母，二维码，水印，logo，电话，微信号，平台界面，价格，优惠，地址，复杂背景，",
  "文字变形扭曲，文字模糊，错别字，乱码，多余文字，小字密集，冷色科技感，3D效果，卡通风格，廉价促销风，",
  "空白水彩模板，Canva模板感，淡色抽象弧形堆叠，廉价贴纸，纯背景加大字，低清截图感",
].join("")

const COVER_VISUAL_STYLE_IDS: BeautyCoverStyleId[] = [
  "soft-minimal-poster",
  "editorial-magazine",
  "clean-info-card",
  "warm-dialog-card",
  "contrast-warning-poster",
  "comparison-split-card",
  "lifestyle-spa-scene",
  "premium-still-life",
]

const COVER_VISUAL_STYLES: Record<
  BeautyCoverStyleId,
  Omit<BeautyCoverVisualPlan, "id" | "reason"> & { bestFor: string }
> = {
  "soft-minimal-poster": {
    label: "温柔极简海报",
    bestFor: "敏感、泛红、基础护理、语气温和但仍需要高级质感的体验内容",
    layout: "主标题占画面中上部，副标题下方，配一个清晰信息卡/细线框/材质层次，不能只有空白背景",
    palette: "暖米白、浅杏、低饱和玫瑰色，整体明亮干净但有明确层次",
    visualCue: "高级皮肤管理杂志感，柔光、干净护理空间局部、纸张/玻璃/水纹材质细节，不出现人物脸和具体产品瓶身",
    typography: "现代中文黑体，主标题加粗，副标题中等字重，字距正常，缩略图也清楚",
  },
  "editorial-magazine": {
    label: "高级杂志封面",
    bestFor: "本地找店、体验复盘、老客视角、轻专业内容",
    layout: "杂志封面式排版，顶部小栏目，中部主标题，下方一句副标题",
    palette: "象牙白、深咖、雾粉或鼠尾草绿，低饱和但有层次",
    visualCue: "生活方式杂志摄影感、柔和自然光、干净护理空间的局部氛围",
    typography: "标题用精致中文黑体，副标题更轻，保持高级留白",
  },
  "clean-info-card": {
    label: "清晰知识卡",
    bestFor: "科普、流程、判断标准、问题修复、需要讲清楚步骤的内容",
    layout: "单页信息卡，主标题在上，2-3个简短信息块在中下部，不做多页长图",
    palette: "奶油白、浅茶色、少量薄荷绿或珊瑚色作强调",
    visualCue: "干净信息图卡片、细线分隔、轻量图标感但不要卡通",
    typography: "中文无衬线，主次层级清楚，小字尽量少且放大",
  },
  "warm-dialog-card": {
    label: "温和对话卡",
    bestFor: "信任怀疑、拒绝推销、顾客顾虑、边界感表达",
    layout: "像对话重点摘录，不做真实聊天软件界面，标题气泡最大",
    palette: "暖白、柔杏、深棕文字，少量陶土色强调",
    visualCue: "柔和气泡块、便签层次、真实但克制的沟通氛围",
    typography: "圆润中文黑体，标题清晰，避免手写潦草",
  },
  "contrast-warning-poster": {
    label: "克制警示海报",
    bestFor: "避雷、踩坑、风险提醒、推销套路，但不做廉价促销风",
    layout: "强标题占上半区，副标题作判断标准，少量警示色块，不做报纸拼贴",
    palette: "米白、炭黑、陶土红，红色只作重点提醒",
    visualCue: "编辑部警示海报感、清晰边框、强对比但不恐吓",
    typography: "粗体中文黑体，标题醒目，副标题保持清晰克制",
  },
  "comparison-split-card": {
    label: "左右对比卡",
    bestFor: "对比、选择困难、两类人、两种方案、前后判断",
    layout: "左右或上下双栏对比，标题在上，两个分区标签清楚",
    palette: "暖白底，一侧浅杏，一侧浅绿或浅蓝灰，整体低饱和",
    visualCue: "清爽分栏信息卡、简短对照、明确视觉秩序",
    typography: "中文黑体，栏目标题加粗，正文只保留短句",
  },
  "lifestyle-spa-scene": {
    label: "暖光护理场景",
    bestFor: "SPA、肩颈、按摩、头疗、放松养护、情绪修复",
    layout: "大面积真实护理氛围背景，上方或中部叠加清晰标题文字",
    palette: "暖棕、奶油白、浅金、柔和阴影",
    visualCue: "photorealistic 生活方式摄影感，热毛巾、柔光、护理空间局部，不出现人物脸",
    typography: "标题用清晰中文黑体，白色或深棕高对比，文字区域有留白",
  },
  "premium-still-life": {
    label: "高级静物海报",
    bestFor: "项目质感、活动但不促销、护理体验、品牌感较强的内容",
    layout: "静物/材质氛围在下或侧边，标题居中偏上，副标题作为细小解释",
    palette: "奶油、琥珀、深棕、少量玫瑰金，不要艳丽",
    visualCue: "高端护理静物、柔光、织物/石材/水波纹理，不出现具体产品瓶身",
    typography: "高级中文无衬线，主标题大而稳，副标题简短",
  },
}

const ENTRY_PACKS: Record<
  BeautyEntryClass,
  {
    label: string
    openingFamily: string
    personaHint: string
    defenseMindset: string
    realDesire: string
    longingScene: string
    storeRuleFocus: string
    complaintAngles: string[]
    coverTemplateBias: BeautyContext["coverTemplateBias"]
  }
> = {
  problem_repair: {
    label: "问题修复",
    openingFamily: "后果先行型",
    personaHint: "她不是在搜项目名，而是在搜脸上那个让她明天不敢见人的问题。",
    defenseMindset: "怕清不干净，也怕越做越红、越做越干、越解释越像推销。",
    realDesire: "先把状态拉回来一点，不想再被审判，也不想被迫买复杂方案。",
    longingScene: "做完后不是惊天逆转，而是脸干净一点、人轻一点，第二天敢正常出门。",
    storeRuleFocus: "先看皮肤状态，基础处理优先；不硬挤、不强承诺、不把每个问题都升级成大项目。",
    complaintAngles: ["没清干净", "硬挤到泛红", "做完更干", "说得越来越严重", "效果不稳"],
    coverTemplateBias: "warm-poster",
  },
  trust_doubt: {
    label: "信任怀疑",
    openingFamily: "冲突实景型",
    personaHint: "她想试一次，但进门前已经在心里准备好拒绝话术。",
    defenseMindset: "最怕的不是花钱，而是被轮番推销、被越说越严重、说不买后服务变脸。",
    realDesire: "先确认这家店会不会尊重她的边界，再谈体验和效果。",
    longingScene: "她能安心闭眼，过程中没人逼她做决定，做完还能轻松走出去。",
    storeRuleFocus: "说不要，话题就停；先做基础体验，不用现场被迫升级。",
    complaintAngles: ["从头到尾都在推销", "不买就敷衍", "轮番上阵", "隐形消费", "被吓唬办卡"],
    coverTemplateBias: "dialog-bubble",
  },
  relax_care: {
    label: "放松养护",
    openingFamily: "直接判断型",
    personaHint: "她表面上搜按摩、SPA、肩颈，实际是在找一段合法休息时间。",
    defenseMindset: "怕明明想放松，结果全程被聊天、推销、催办卡，身体没松，心更累。",
    realDesire: "不用解释太多，不用维持礼貌，能被妥帖照顾一会儿。",
    longingScene: "灯光低一点，毛巾热一点，肩颈慢慢松下来，手机不用一直看。",
    storeRuleFocus: "少打扰，先确认力度和温度；服务过程完整，不把放松变成销售场。",
    complaintAngles: ["根本放松不了", "全程还在推销", "手法敷衍", "时间缩水", "聊天太多"],
    coverTemplateBias: "hand-note",
  },
  local_decision: {
    label: "本地找店",
    openingFamily: "直接判断型",
    personaHint: "她已经有需求，正在判断附近哪家店不会让她白跑。",
    defenseMindset: "怕评价好看但实际不稳定，怕约不上，怕到了以后才发现规则不清楚。",
    realDesire: "找一个能长期去、沟通舒服、边界清楚的本地门店。",
    longingScene: "不用每次重新试错，有需要时知道去哪里，进门不用先防备。",
    storeRuleFocus: "门店昵称、商圈、服务时长、流程边界、可拒绝规则要清楚；没有档案时只写选择标准。",
    complaintAngles: ["约不上", "态度差", "怕白跑", "流程不透明", "宣传和实际不一致"],
    coverTemplateBias: "warm-poster",
  },
  boundary_risk: {
    label: "边界风险词",
    openingFamily: "边界提醒型",
    personaHint: "她的搜索词可能靠近医美、身体隐私或强功效承诺，需要先把服务边界讲清楚。",
    defenseMindset: "怕被夸大承诺，也怕生活美容门店把不能做的事说成能做。",
    realDesire: "知道哪些能在生活美容里做体验护理，哪些应该去正规医疗场景咨询。",
    longingScene: "判断清楚后再决定，不被焦虑推着走。",
    storeRuleFocus: "不碰医疗承诺，不替代诊断；只讲舒缓、体验、护理边界和合理预期。",
    complaintAngles: ["承诺过满", "宣传失真", "做完不适", "风险没说清", "边界模糊"],
    coverTemplateBias: "warm-poster",
  },
}

const NARRATORS: Record<BeautyNarratorId, { name: string; role: string }> = {
  experienced_friend: {
    name: "懂行朋友",
    role: "像比她多踩过几次坑的朋友，说具体判断标准，不端着教育人。",
  },
  professional_translator: {
    name: "专业翻译官",
    role: "把美容项目、人群差异和护理边界翻成生活语言，不堆术语。",
  },
  pitfall_observer: {
    name: "踩坑观察者",
    role: "先承认她的防备，再拆常见坑点，最后给可验证的边界。",
  },
  decision_coach: {
    name: "选择顾问",
    role: "帮她在两个方案之间做取舍，讲适合谁、不适合谁、怎么判断自己是哪类。",
  },
  returning_customer: {
    name: "老顾客复盘者",
    role: "用复盘口吻讲第一次怎么判断、后来为什么愿意继续，不夸张炫耀。",
  },
  local_observer: {
    name: "本地探店观察者",
    role: "讲本地找店时该看什么，不点名拉踩，不编造门店事实。",
  },
  store_operator: {
    name: "门店经营者",
    role: "只在需要解释规矩和边界时出现，像负责人说人话，不硬卖、不喊口号。",
  },
}

const PROBLEM_WORDS = [
  "黑头",
  "毛孔",
  "痘",
  "闭口",
  "粉刺",
  "暗沉",
  "美白",
  "补水",
  "清洁",
  "小气泡",
  "针清",
  "泛红",
  "敏感",
  "干",
  "出油",
  "痘印",
]

const TRUST_WORDS = [
  "套路",
  "推销",
  "办卡",
  "退卡",
  "加价",
  "隐形消费",
  "被坑",
  "有用吗",
  "会不会",
  "靠谱吗",
  "值不值",
  "不买",
]

const RELAX_WORDS = ["spa", "SPA", "按摩", "肩颈", "头疗", "放松", "疲惫", "睡眠", "舒缓", "精油"]
const LOCAL_WORDS = ["吴江", "苏州", "附近", "本地", "商圈", "美容院推荐", "哪里", "哪家"]
const BOUNDARY_WORDS = ["点痣", "祛斑", "产后", "盆底", "私密", "医美", "水光", "热玛吉", "瘦脸", "治疗", "根治"]

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function classifyEntry(text: string, contentType: BeautyXhsContentType): BeautyEntryClass {
  if (includesAny(text, BOUNDARY_WORDS)) return "boundary_risk"
  if (includesAny(text, LOCAL_WORDS) && /美容院|做脸|皮肤管理|门店|店/.test(text)) return "local_decision"
  if (includesAny(text, RELAX_WORDS)) return "relax_care"
  if (/美容院.*怎么选|怎么选.*美容院|做脸.*怎么选|怎么选.*做脸/.test(text)) return "trust_doubt"
  if (includesAny(text, TRUST_WORDS) && !(includesAny(text, PROBLEM_WORDS) && /黑头|毛孔|痘印|闭口/.test(text))) {
    return "trust_doubt"
  }
  if (includesAny(text, PROBLEM_WORDS)) return "problem_repair"
  if (contentType === "promotion") return "trust_doubt"
  if (contentType === "comparison") return "local_decision"
  return "problem_repair"
}

function selectNarrator(contentType: BeautyXhsContentType, entryClass: BeautyEntryClass, text: string): BeautyNarratorId {
  if (entryClass === "boundary_risk") return "professional_translator"
  if (contentType === "education") return "professional_translator"
  if (contentType === "promotion") return "pitfall_observer"
  if (contentType === "comparison") return "decision_coach"
  if (entryClass === "local_decision") return includesAny(text, ["规矩", "老板", "不加价", "不缩水"]) ? "store_operator" : "local_observer"
  if (entryClass === "trust_doubt") return "experienced_friend"
  if (entryClass === "relax_care") return "returning_customer"
  return "experienced_friend"
}

export function contentTypeLabel(contentType: BeautyXhsContentType): string {
  if (contentType === "treatment") return "攻略"
  if (contentType === "education") return "科普"
  if (contentType === "promotion") return "避雷"
  return "对比"
}

export function conflictLabel(level: BeautyConflictLevel): string {
  if (level === "safe") return "稳健"
  if (level === "hard") return "狠"
  return "标准"
}

function isCoverStyleId(value: string): value is BeautyCoverStyleId {
  return (COVER_VISUAL_STYLE_IDS as string[]).includes(value)
}

function selectCoverStyleId(opts: {
  contentType: BeautyXhsContentType
  conflictLevel: BeautyConflictLevel
  entryClass: BeautyEntryClass
  text: string
}): BeautyCoverStyleId {
  const text = opts.text

  if (opts.contentType === "comparison") return "comparison-split-card"
  if (opts.contentType === "promotion" || opts.conflictLevel === "hard") return "contrast-warning-poster"
  if (opts.entryClass === "trust_doubt") return "warm-dialog-card"
  if (opts.entryClass === "relax_care") return "lifestyle-spa-scene"
  if (opts.entryClass === "local_decision") return "editorial-magazine"
  if (opts.entryClass === "boundary_risk") return "clean-info-card"
  if (opts.contentType === "education") return "clean-info-card"
  if (includesAny(text, ["补水", "清洁", "黑头", "毛孔", "闭口", "粉刺"])) return "clean-info-card"
  if (includesAny(text, ["敏感", "泛红", "舒缓", "修护"])) return "soft-minimal-poster"
  if (includesAny(text, ["活动", "老客", "体验", "护理"])) return "premium-still-life"

  return "clean-info-card"
}

function buildCoverStyleReason(opts: {
  id: BeautyCoverStyleId
  contentType: BeautyXhsContentType
  entryClass: BeautyEntryClass
  conflictLevel: BeautyConflictLevel
}) {
  if (opts.id === "comparison-split-card") return "正文在帮顾客做选择，对比卡能最快讲清两种情况。"
  if (opts.id === "contrast-warning-poster") return "正文带避雷或强提醒，需要醒目但克制的警示视觉。"
  if (opts.id === "warm-dialog-card") return "正文在处理顾客顾虑和信任问题，对话卡更像真实沟通。"
  if (opts.id === "lifestyle-spa-scene") return "正文偏放松养护，暖光护理场景更能传达休息感。"
  if (opts.id === "editorial-magazine") return "正文偏本地决策或体验复盘，杂志封面感更稳、更像可收藏内容。"
  if (opts.id === "soft-minimal-poster") return "正文偏温和护理或皮肤状态修复，极简暖调能减少压迫感。"
  if (opts.id === "premium-still-life") return "正文偏体验质感，静物海报能保留高级感且避免促销味。"
  return "正文需要讲清判断标准，知识卡能提升手机端可读性。"
}

function buildCoverVisualPlan(opts: {
  contentType: BeautyXhsContentType
  conflictLevel: BeautyConflictLevel
  entryClass: BeautyEntryClass
  text: string
}): BeautyCoverVisualPlan {
  const id = selectCoverStyleId(opts)
  const preset = COVER_VISUAL_STYLES[id]
  return {
    id,
    label: preset.label,
    reason: buildCoverStyleReason({ ...opts, id }),
    layout: preset.layout,
    palette: preset.palette,
    visualCue: preset.visualCue,
    typography: preset.typography,
  }
}

export function resolveCoverVisualPlan(
  ctx: BeautyContext,
  styleId?: string | null,
  styleReason?: string | null
): BeautyCoverVisualPlan {
  const id = isCoverStyleId(String(styleId || "")) ? (styleId as BeautyCoverStyleId) : ctx.coverVisualPlan.id
  const preset = COVER_VISUAL_STYLES[id]
  return {
    id,
    label: preset.label,
    reason: String(styleReason || "").trim() || (id === ctx.coverVisualPlan.id ? ctx.coverVisualPlan.reason : preset.bestFor),
    layout: preset.layout,
    palette: preset.palette,
    visualCue: preset.visualCue,
    typography: preset.typography,
  }
}

export function buildCoverStyleCatalogText() {
  return COVER_VISUAL_STYLE_IDS.map((id) => {
    const item = COVER_VISUAL_STYLES[id]
    return `- ${id}：${item.label}；适合：${item.bestFor}；版式：${item.layout}`
  }).join("\n")
}

function buildCoverStylePromptBlock(plan: BeautyCoverVisualPlan) {
  return [
    "【AI视觉风格】",
    `风格ID：${plan.id}`,
    `风格名称：${plan.label}`,
    `选择理由：${plan.reason}`,
    `主视觉：${plan.visualCue}`,
    `版式：${plan.layout}`,
    `配色：${plan.palette}`,
    `字体：${plan.typography}`,
  ].join("\n")
}

function contentTypeStrategy(contentType: BeautyXhsContentType, ctx: Pick<BeautyContext, "entryLabel" | "narratorName">) {
  if (contentType === "treatment") {
    return [
      `【攻略】表层是攻略，底层必须接住“${ctx.entryLabel}”意图。`,
      `叙述者用“${ctx.narratorName}”：给判断标准、流程细节和可验证边界，不写成项目广告。`,
      "结构：她为什么现在搜这个词 -> 她怕哪里不透明 -> 3-4条判断标准 -> 什么情况建议先缓一缓。",
    ].join("\n")
  }
  if (contentType === "education") {
    return [
      `【科普】表层是科普，底层必须接住“${ctx.entryLabel}”意图。`,
      `叙述者用“${ctx.narratorName}”：把术语翻成人话，解释服务边界和合理预期。`,
      "结构：常见误会 -> 为什么会这样 -> 她能自己观察什么 -> 哪些情况要谨慎。",
    ].join("\n")
  }
  if (contentType === "promotion") {
    return [
      `【避雷】表层是避雷，底层必须接住“${ctx.entryLabel}”意图。`,
      `叙述者用“${ctx.narratorName}”：先承认她怕，再把骂点翻译成可验证买点。`,
      "结构：具体吐槽/顾虑 -> 背后的风险 -> 识别方法 -> 门店应有的边界。坑点只做入口，向往才是成交理由。",
    ].join("\n")
  }
  return [
    `【对比】表层是对比，底层必须接住“${ctx.entryLabel}”意图。`,
    `叙述者用“${ctx.narratorName}”：帮她做取舍，不做绝对优劣结论。`,
    "结构：同一个需求下的两类人 -> 各自适合什么 -> 怎么判断自己是哪类 -> 别只看表面卖点。",
  ].join("\n")
}

export function buildBeautyContext(opts: {
  contentType: BeautyXhsContentType
  conflictLevel: BeautyConflictLevel
  topic: string
  keywords: string
  shopName?: string
}): BeautyContext {
  const text = [opts.topic, opts.keywords, opts.shopName || ""].join(" ")
  const entryClass = classifyEntry(text, opts.contentType)
  const pack = ENTRY_PACKS[entryClass]
  const narratorId = selectNarrator(opts.contentType, entryClass, text)
  const narrator = NARRATORS[narratorId]
  const coverVisualPlan = buildCoverVisualPlan({
    contentType: opts.contentType,
    conflictLevel: opts.conflictLevel,
    entryClass,
    text,
  })
  const partial = {
    entryLabel: pack.label,
    narratorName: narrator.name,
  }

  return {
    contentType: opts.contentType,
    contentTypeLabel: contentTypeLabel(opts.contentType),
    conflictLabel: conflictLabel(opts.conflictLevel),
    entryClass,
    entryLabel: pack.label,
    openingFamily: pack.openingFamily,
    narratorId,
    narratorName: narrator.name,
    narratorRole: narrator.role,
    personaHint: pack.personaHint,
    defenseMindset: pack.defenseMindset,
    realDesire: pack.realDesire,
    longingScene: pack.longingScene,
    storeRuleFocus: pack.storeRuleFocus,
    complaintAngles: pack.complaintAngles,
    contentStrategy: contentTypeStrategy(opts.contentType, partial),
    coverTemplateBias: pack.coverTemplateBias,
    coverVisualPlan,
  }
}

export function buildBeautySourcePackText(ctx: BeautyContext) {
  return [
    `隐藏意图：${ctx.entryLabel}`,
    `推荐开头家族：${ctx.openingFamily}`,
    `叙述者：${ctx.narratorName}。${ctx.narratorRole}`,
    `具体人提示：${ctx.personaHint}`,
    `防御心态：${ctx.defenseMindset}`,
    `真实想要：${ctx.realDesire}`,
    `向往画面：${ctx.longingScene}`,
    `门店规矩托底：${ctx.storeRuleFocus}`,
    `差评骂点只作语言来源，不冒充真实案例：${ctx.complaintAngles.join("、")}`,
    "行业差评高频矛盾：推销办卡/隐形消费、时长缩水/手法敷衍、环境卫生/舒适度、清洁不到位/效果不稳、预约难/沟通低效。",
    "总链路：关键词意图 -> 具体人 -> 防御心态 -> 向往画面 -> 门店规矩 -> 小红书输出。",
    "总原则：坑点是入口，向往是成交理由，规矩是托底。",
    "不要硬套老板视角；只有叙述者被选为“门店经营者”时，才用老板/负责人口吻。",
  ].join("\n")
}

export function buildCoverPromptRequirements(ctx: BeautyContext) {
  const plan = ctx.coverVisualPlan

  return [
    "封面提示词必须由你直接生成，后端不会再帮你拼版式。",
    "cover_prompt 第一行必须是：画幅比例3:4竖版。",
    "封面必须是可直接发布的小红书首图设计，不是背景图。必须有明确版式、文字层级、视觉焦点和美业质感。",
    "视觉风格必须根据生成正文的真实内容智能选择，不要把“攻略/科普/避雷/对比”硬绑定到固定画风。",
    "如果标题含“3点/三点/几点/清单/先看/判断/避雷/标准”，优先选择 clean-info-card 或 contrast-warning-poster，不要选择纯极简水彩背景。",
    "可选视觉风格如下，cover_style_id 必须从中选择一个：",
    buildCoverStyleCatalogText(),
    "",
    `当前默认建议：${plan.id}（${plan.label}）。${plan.reason}`,
    buildCoverStylePromptBlock(plan),
    "提示词必须包含要生成的中文主标题和副标题，并要求严格原样显示。",
    "提示词必须写清楚：主标题字号最大、手机端缩略图可读；副标题明显更小；画面至少有2个设计层次（信息卡、细线分隔、材质背景、局部护理场景、色块之一）。",
    "封面只做单张小红书首图，不做多页信息图，不放门店信息、价格、优惠、地址、平台名、二维码、电话、微信号、logo、水印。",
    "所有文字必须为清晰、准确、简体中文；不要乱码、错别字、英文、多余文字；不要把标题改写成别的句子。",
    "不要生成空白水彩模板、淡色抽象弧形堆叠、纯背景加大字、廉价Canva模板、素材站样图。优先干净、现代、手机端高可读的美业封面。",
    "cover_negative 单独输出，覆盖：人物照片、产品图、英文字母、二维码、水印、复杂背景、文字变形、文字模糊、乱码、冷色科技感、3D、卡通、廉价促销风。",
  ].join("\n")
}

export function normalizeCoverAsset(opts: {
  main: string
  sub: string
  prompt?: string | null
  negative?: string | null
  styleId?: string | null
  styleReason?: string | null
  ctx: BeautyContext
}) {
  const main = opts.main.trim()
  const sub = opts.sub.trim()
  const prompt = String(opts.prompt || "").trim()
  const negative = String(opts.negative || "").trim()
  const plan = resolveCoverVisualPlan(opts.ctx, opts.styleId, opts.styleReason)
  const styleBlock = buildCoverStylePromptBlock(plan)

  const promptBody = prompt
    ? prompt
    : [
        "画幅比例3:4竖版。",
        "为生活美容/皮肤管理门店生成一张小红书首图封面。",
        buildCoverPromptRequirements(opts.ctx),
        "",
        styleBlock,
        "",
        "【封面文字】",
        `主标题：${main}`,
        `副标题：${sub}`,
        "",
        "【输出目标】手机端高可读，暖调、克制、有情绪停顿感。",
      ].join("\n")

  const richPrompt =
    promptBody.length >= 500 && /AI视觉风格|风格ID/.test(promptBody) && /文字必须|严格原样|清晰/.test(promptBody) && /二维码|水印|logo/.test(promptBody)
      ? promptBody
      : [
          promptBody,
          "",
          styleBlock,
          "",
          "【补充版式约束】",
          buildCoverPromptRequirements(opts.ctx),
          "",
          "【必须原样显示的中文文字】",
          `主标题：${main}`,
          `副标题：${sub}`,
          "",
          "【输出目标】手机端高可读，暖米白/浅杏/奶油色等暖调优先，克制、干净、有情绪停顿感；不要促销感，不要信息过载。",
          "【质量底线】必须像专业美业账号首图，不要空白水彩模板、纯背景大字、低成本素材感。",
        ].join("\n")

  const withRatio = richPrompt.startsWith("画幅比例3:4竖版。") ? richPrompt : `画幅比例3:4竖版。\n${richPrompt}`
  const withText =
    withRatio.includes(main) && withRatio.includes(sub)
      ? withRatio
      : [
          withRatio,
          "",
          "【必须原样显示的中文文字】",
          `主标题：${main}`,
          `副标题：${sub}`,
        ].join("\n")

  return {
    prompt: withText,
    negative: negative || COMMON_NEGATIVE_PROMPT,
    styleId: plan.id,
    styleLabel: plan.label,
    styleReason: plan.reason,
    layout: plan.layout,
    palette: plan.palette,
  }
}
