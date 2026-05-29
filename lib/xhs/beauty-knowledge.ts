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
  taskType: string
  templateFamily: string
  mainVisual: string
  sceneProps: string
  composition: string
  layout: string
  palette: string
  visualCue: string
  typography: string
  qualityGoal: string
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

export const XHS_COVER_PROMPT_VERSION = "xhs-cover-brief-v4-text-guard"

const COMMON_NEGATIVE_PROMPT = [
  "水印，logo，平台界面，价格优惠，地址，联系方式，可扫描私域入口，",
  "文字变形扭曲，文字模糊，错别字，乱码，冷色科技感，3D效果，卡通风格，廉价促销风，",
  "底部引流条，行动按钮，平台入口，互动引导，扫码/联系/订阅/领取/咨询/解锁类转化元素，",
  "bottom conversion footer, platform-entry UI, social interaction prompt, private-domain contact element, scannable contact code,",
  "空白水彩模板，Canva模板感，廉价贴纸，低清截图感，纯背景加大字，只有标题没有信息层级",
].join("")

const COVER_DISPLAY_CTA_RE =
  /(关注|私信|评论区|评论|留言|点击|收藏|点赞|转发|扫码|二维码|加微信|微信|VX|vx|领取|咨询|预约|进群|小程序|主页|链接|回复|立即进入|解锁)/gi

function cleanCoverDisplayText(value: string, fallback: string) {
  const cleaned = value
    .replace(COVER_DISPLAY_CTA_RE, "")
    .replace(/[|｜]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[，,。！？!、：:；;\s]+|[，,。！？!、：:；;\s]+$/g, "")
    .trim()
  return cleaned || fallback
}

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
    taskType: "竖版 3:4 小红书温柔护理首图",
    templateFamily: "X09 痛点解决封面 / X20 强标题弱背景",
    mainVisual: "柔光护理室局部、干净毛巾、玻璃护肤精华、水润材质或自然皮肤纹理，不出现夸张人脸特写",
    sceneProps: "浅色纸张卡片、洁净护理床、柔光窗帘、精华水滴、白瓷或磨砂玻璃材质",
    composition: "上方保留短标题区，中部为柔和护理材质主视觉，下方用轻量短标签补足信息层级",
    layout: "主标题占画面中上部，副标题下方；若有辅助信息点，用2-3个轻量短标签排在下方，不要只有空背景和大标题",
    palette: "温暖自然光、柔白、低饱和肤粉或浅杏，只用少量强调色",
    visualCue: "高级皮肤管理杂志感，柔光、干净护理空间局部、纸张/玻璃/水纹材质细节",
    typography: "现代中文黑体，主标题加粗，副标题中等字重，字距正常，缩略图也清楚",
    qualityGoal: "温和但不空，手机缩略图能读出核心判断，避免水彩模板感和纯背景大字。",
  },
  "editorial-magazine": {
    label: "高级杂志封面",
    bestFor: "本地找店、体验复盘、老客视角、轻专业内容",
    taskType: "竖版 3:4 小红书本地生活杂志封面",
    templateFamily: "X02 探店封面 / X08 到店打卡封面 / X18 真实体验日记",
    mainVisual: "真实明亮的皮肤管理门店空间、前台、护理床、产品陈列或服务细节局部，像高级手机实拍",
    sceneProps: "门店空间、护理床、产品架、接待茶水、镜面反射、花材、自然窗光",
    composition: "杂志封面式大标题和真实门店局部结合，主视觉占中部，底部或侧边放短栏目标签",
    layout: "杂志封面式排版，顶部小栏目，中部主标题，下方一句副标题；底部或侧边放短栏目标签，形成可收藏的信息层级",
    palette: "象牙白、深咖、雾粉或鼠尾草绿，低饱和但有层次",
    visualCue: "生活方式杂志摄影感、柔和自然光、干净护理空间的局部氛围",
    typography: "标题用精致中文黑体，副标题更轻，保持高级留白",
    qualityGoal: "像可发布的小红书首图，不像硬广落地页；真实、干净、可收藏。",
  },
  "clean-info-card": {
    label: "清晰专业海报",
    bestFor: "科普、流程、判断标准、问题修复、需要讲清楚步骤的内容",
    taskType: "竖版 3:4 小红书专业知识卡首图",
    templateFamily: "X10 专业科普卡 / X29 一图读懂封面 / X06 教程步骤首图",
    mainVisual: "护肤桌面、肌肤纹理抽象局部、水润精华、干净纸张模块或护理空间局部，专业但不医院化",
    sceneProps: "浅色纸张、精华水滴、玻璃瓶、细线模块、柔和标签、白瓷、浅灰背景",
    composition: "顶部大标题，中部真实护肤材质或简洁示意主视觉，底部/侧边放3-4个短知识标签",
    layout: "大标题专业海报，主标题+副标题+3个短判断点，真实材质或护理空间局部作视觉锚点；不要把正文拆成长段步骤",
    palette: "干净暖白、自然浅灰、低饱和肤粉或浅绿，深色标题，少量强调色",
    visualCue: "现代美业编辑封面、真实护肤材质细节、局部护理氛围或诊室级干净光线，不使用线框图标",
    typography: "清晰中文无衬线，主标题有冲击力，副标题克制清楚，只保留两组文字",
    qualityGoal: "信息层级清楚但不拥挤，一眼像专业小红书收藏卡，避免PPT、表格和报告感。",
  },
  "warm-dialog-card": {
    label: "温和对话卡",
    bestFor: "信任怀疑、拒绝推销、顾客顾虑、边界感表达",
    taskType: "竖版 3:4 小红书边界感对话封面",
    templateFamily: "X17 高频问题封面 / X20 强标题弱背景",
    mainVisual: "真实沟通氛围、接待桌局部、便签、项目单、温柔纸张卡片，不做真实聊天软件界面",
    sceneProps: "浅色便签、纸张、笔、茶水、柔光桌面、护理空间虚化背景",
    composition: "像一句被划重点的话，主标题居中偏上，副标题贴近标题，短标签用边界词辅助",
    layout: "像一句被划重点的话，不做真实聊天软件界面；可加2-3个边界短标签，避免画面只有一句话",
    palette: "暖白、柔杏、深棕文字，少量低饱和强调色",
    visualCue: "柔和便签或杂志摘录感，真实但克制的沟通氛围",
    typography: "圆润中文黑体，标题清晰，避免手写潦草",
    qualityGoal: "有真实沟通感，不像聊天截图；温和、有边界、可读。",
  },
  "contrast-warning-poster": {
    label: "克制警示海报",
    bestFor: "避雷、踩坑、风险提醒、推销套路，但不做廉价促销风",
    taskType: "竖版 3:4 小红书避坑警示首图",
    templateFamily: "X03 避坑攻略封面 / X20 强标题弱背景 / X24 红黑榜封面",
    mainVisual: "美容门店接待桌局部、空白项目单、笔、护理环境阴影或纸张标签，真实但不恐吓",
    sceneProps: "纸张、便签、深色判断标签、柔光护理环境、少量红色警示标记、干净浅底",
    composition: "上方强标题，中部真实门店局部或纸张主视觉，下方三条避坑短标签，红色只作重点提醒",
    layout: "强标题与一个克制警示视觉焦点组合；加入3个短避坑点或对比标签；底部不要出现任何引流CTA、平台入口或互动引导",
    palette: "干净浅底、炭黑、低饱和警示红，红色只作重点提醒",
    visualCue: "高级编辑部警示海报感、强对比但不恐吓，可用光影、色块、人脸局部或护肤材质质感制造停顿",
    typography: "粗体中文黑体，标题醒目，副标题保持清晰克制",
    qualityGoal: "点击感强但不土，不制造恐惧，不像廉价促销或情绪化海报。",
  },
  "comparison-split-card": {
    label: "左右对比卡",
    bestFor: "对比、选择困难、两类人、两种方案、前后判断",
    taskType: "竖版 3:4 小红书双分区对比首图",
    templateFamily: "X04 状态对比封面 / X23 对比测评封面",
    mainVisual: "两组护肤材质或服务场景分区对照，例如清洁材质 vs 补水材质，或两类状态判断",
    sceneProps: "左侧浅杏纸张/泡沫/毛巾，右侧浅雾绿精华/面膜/水润材质，统一真实摄影质感",
    composition: "顶部大标题，中部左右分区，两个短栏目标题清楚，底部一句判断建议",
    layout: "标题在上，左右分区表达两类人/两种方案，保留主副标题，并用2-4个短标签做对比信息",
    palette: "暖白底，一侧浅杏，一侧浅绿或浅蓝灰，整体低饱和",
    visualCue: "清爽分区海报、明确视觉秩序，不做表格或多条项目符号",
    typography: "中文黑体，栏目标题加粗，正文只保留短句",
    qualityGoal: "一眼看懂两边差异，不像表格，不做夸张前后对比。",
  },
  "lifestyle-spa-scene": {
    label: "暖光护理场景",
    bestFor: "SPA、肩颈、按摩、头疗、放松养护、情绪修复",
    taskType: "竖版 3:4 小红书生活方式护理首图",
    templateFamily: "X07 生活方式种草 / B07 Spa 放松海报",
    mainVisual: "暖光护理空间、热毛巾、香薰、精油、肩颈或头疗服务局部，不出现过度性感化人物",
    sceneProps: "香薰、毛巾、精油瓶、护理床、花材、暖光、木质或织物材质",
    composition: "真实护理氛围作为主视觉，左上或中上放标题，侧边或底部放短标签",
    layout: "真实护理氛围背景作为主视觉，左上或中上放清晰主标题，标题下方或左侧放3个短标签；不要只有背景图和大标题",
    palette: "暖棕、奶油白、浅金、柔和阴影",
    visualCue: "photorealistic 生活方式摄影感，热毛巾、柔光、护理空间局部，不出现人物脸",
    typography: "标题用清晰中文黑体，白色或深棕高对比，文字区域有留白",
    qualityGoal: "让人感觉放松和可信，不能像按摩会所广告，也不能只有氛围图。",
  },
  "premium-still-life": {
    label: "高级静物海报",
    bestFor: "项目质感、活动但不促销、护理体验、品牌感较强的内容",
    taskType: "竖版 3:4 小红书高级静物首图",
    templateFamily: "X11 护肤桌面 Flat Lay / X01 美容爆款封面",
    mainVisual: "高端护理静物、精华水滴、玻璃瓶、织物、石材、水波纹或护肤桌面，避免具体产品硬广",
    sceneProps: "精华瓶、面膜、白瓷、丝绸、浅色花材、玻璃、柔光阴影、纸张标签",
    composition: "静物/材质氛围在下方或侧边，标题居中偏上，短标签条补足信息密度",
    layout: "静物/材质氛围在下或侧边，标题居中偏上，副标题作为解释；下方用短标签条补足信息密度",
    palette: "奶油、琥珀、深棕、少量玫瑰金，不要艳丽",
    visualCue: "高端护理静物、柔光、织物/石材/水波纹理，不出现具体产品瓶身",
    typography: "高级中文无衬线，主标题大而稳，副标题简短",
    qualityGoal: "高级、干净、可商用，但不出现价格和促销按钮，不像电商主图。",
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

function requestedCoverStyleId(value?: string | null): BeautyCoverStyleId | "" {
  const id = String(value || "").trim()
  return isCoverStyleId(id) ? id : ""
}

function forceCoverStyleByTitle(text: string): BeautyCoverStyleId | "" {
  if (includesAny(text, ["避雷", "踩坑", "做错", "越做越", "越护越", "别再", "千万别", "翻车", "烂脸", "风险"])) {
    return "contrast-warning-poster"
  }
  if (includesAny(text, ["3点", "三点", "几点", "先看", "判断", "标准", "清单"])) return "clean-info-card"
  return ""
}

function coerceCoverStyleId(ctx: BeautyContext, styleId?: string | null): BeautyCoverStyleId {
  const requested = requestedCoverStyleId(styleId)
  if (!requested) return ctx.coverVisualPlan.id

  if (requested === "soft-minimal-poster" && ctx.coverVisualPlan.id !== "soft-minimal-poster") {
    return ctx.coverVisualPlan.id
  }

  return requested
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
  const forcedByText = forceCoverStyleByTitle(text)
  if (forcedByText) return forcedByText
  if (opts.entryClass === "trust_doubt") return "warm-dialog-card"
  if (opts.entryClass === "relax_care") return "lifestyle-spa-scene"
  if (opts.entryClass === "local_decision") return "editorial-magazine"
  if (opts.entryClass === "boundary_risk") return "contrast-warning-poster"
  if (opts.contentType === "education") return "clean-info-card"
  if (includesAny(text, ["防晒", "补水", "清洁", "黑头", "毛孔", "闭口", "粉刺"])) return "premium-still-life"
  if (includesAny(text, ["敏感", "泛红", "舒缓", "修护"])) return "soft-minimal-poster"
  if (includesAny(text, ["活动", "老客", "体验", "护理"])) return "premium-still-life"

  return "editorial-magazine"
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
  return "正文需要讲清判断标准，清晰专业海报能提升手机端可读性。"
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
    taskType: preset.taskType,
    templateFamily: preset.templateFamily,
    mainVisual: preset.mainVisual,
    sceneProps: preset.sceneProps,
    composition: preset.composition,
    layout: preset.layout,
    palette: preset.palette,
    visualCue: preset.visualCue,
    typography: preset.typography,
    qualityGoal: preset.qualityGoal,
  }
}

export function resolveCoverVisualPlan(
  ctx: BeautyContext,
  styleId?: string | null,
  styleReason?: string | null
): BeautyCoverVisualPlan {
  const requested = requestedCoverStyleId(styleId)
  const id = coerceCoverStyleId(ctx, styleId)
  const preset = COVER_VISUAL_STYLES[id]
  const reason = requested === id ? String(styleReason || "").trim() : ""
  return {
    id,
    label: preset.label,
    reason: reason || (id === ctx.coverVisualPlan.id ? ctx.coverVisualPlan.reason : preset.bestFor),
    taskType: preset.taskType,
    templateFamily: preset.templateFamily,
    mainVisual: preset.mainVisual,
    sceneProps: preset.sceneProps,
    composition: preset.composition,
    layout: preset.layout,
    palette: preset.palette,
    visualCue: preset.visualCue,
    typography: preset.typography,
    qualityGoal: preset.qualityGoal,
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
    "【Skill视觉Brief】",
    `风格ID：${plan.id}`,
    `风格名称：${plan.label}`,
    `任务类型：${plan.taskType}`,
    `模板参考：${plan.templateFamily}`,
    `选择理由：${plan.reason}`,
    `主视觉：${plan.mainVisual}`,
    `场景道具：${plan.sceneProps}`,
    `构图：${plan.composition}`,
    `版式：${plan.layout}`,
    `配色：${plan.palette}`,
    `字体：${plan.typography}`,
    `质感目标：${plan.qualityGoal}`,
    `视觉气质：${plan.visualCue}`,
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
    "封面只需要你输出短标题、短副标题和视觉风格ID；最终生图提示词由后端按 gpt-image-2-poster-xhs skill brief 统一拼接，避免旧模板污染。",
    "cover_prompt 可以留空；如果输出了也只会作为参考，不得写成信息卡、清单、图标、细线分隔列表。",
    "封面必须是可直接发布的小红书首图设计，不是背景图。必须有明确视觉焦点和美业质感。",
    "视觉风格必须根据生成正文的真实内容智能选择，不要把“攻略/科普/避雷/对比”硬绑定到固定画风。",
    "如果标题含“3点/三点/几点/清单/先看/判断/避雷/标准”，优先选择 clean-info-card 或 contrast-warning-poster，但画面仍是高级海报；清单可以少量出现，不要做成营销落地页或底部引流组件。",
    "cover_points 必须是能直接显示在图上的短判断点/短避坑点/短流程点，不要写成抽象情绪词。",
    "可选视觉风格如下，cover_style_id 必须从中选择一个：",
    buildCoverStyleCatalogText(),
    "",
    `当前默认建议：${plan.id}（${plan.label}）。${plan.reason}`,
    buildCoverStylePromptBlock(plan),
    "后端最终提示词会包含中文主标题和副标题，并要求严格原样显示。",
    "最终封面必须以主标题和一句短副标题为核心；可以有少量辅助说明或清单，但不要做成营销落地页。",
    "封面只做单张小红书首图，不放门店信息、价格优惠、地址、品牌标识、水印、联系方式或可扫码联系元素。",
    "所有文字必须为清晰、准确、简体中文；不要乱码、错别字、英文、多余文字；不要把标题改写成别的句子。",
    "不要生成空白水彩模板、淡色抽象弧形堆叠、纯背景加大字、廉价Canva模板、素材站样图、信息卡列表。优先干净、现代、手机端高可读的美业封面。",
    "cover_negative 可以留空；后端会补充统一负面词。",
  ].join("\n")
}

function buildDirectCoverPromptRequirements(plan: BeautyCoverVisualPlan) {
  return [
    `版本：${XHS_COVER_PROMPT_VERSION}`,
    "这是最终生图提示词：按 gpt-image-2-poster-xhs skill 的直出封面规格生成一张完整小红书首图。",
    "当前阶段仍由生图模型直接生成完整封面，不做多图候选，不做后期叠字排版。",
    `最终风格ID：${plan.id}。最终风格名称：${plan.label}。`,
    "封面必须是可直接发布的高级护肤杂志封面视觉，不是App入口页，不是引流落地页。",
    "画面应像高级美业杂志封面或商业护肤摄影海报：有明确主视觉、干净留白、真实材质和克制情绪。",
    "最高优先级：禁止任何底部导流组件、转化按钮、互动引导、平台入口、扫码联系入口或私域联系方式；画面底部应保持干净，不要像营销落地页。",
    "中文主标题和副标题必须清晰、准确、简体中文；不要乱码、错别字、英文。",
    "可以有人脸、护理场景、局部对比、少量清单或辅助说明，但不要做成营销转化页，不要出现门店信息、价格优惠、地址、平台名、联系方式、可扫描私域入口、logo、水印。",
    "版式必须有设计骨架：主标题区、副标题区、辅助信息点区、主视觉区。若提示词后续包含【辅助信息点】，必须把这些短点做成清晰可读的小标签、侧边短清单或分区信息条。",
    "禁止只做一张氛围背景再压一个大标题；禁止主标题占满半张图导致其它信息没有层次。",
    "不要空白水彩模板、廉价Canva模板、素材站样图、廉价贴纸、低清截图感。",
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
  const main = cleanCoverDisplayText(opts.main.trim(), "皮肤护理先看这几点")
  const sub = cleanCoverDisplayText(opts.sub.trim(), "少走弯路，安心护理")
  const negative = String(opts.negative || "").trim()
  const forcedStyle = forceCoverStyleByTitle(main)
  const plan = resolveCoverVisualPlan(opts.ctx, forcedStyle || opts.styleId, forcedStyle ? null : opts.styleReason)
  const styleBlock = buildCoverStylePromptBlock(plan)
  const directRequirements = buildDirectCoverPromptRequirements(plan)
  const promptBody = [
    `【${XHS_COVER_PROMPT_VERSION}】`,
    `任务类型：${plan.taskType}`,
    "行业/主题：生活美容、皮肤管理、本地门店小红书首图封面。",
    "画幅比例：3:4 竖版。",
    "输出：只生成一张完成度高的封面图。",
    "CRITICAL CTA RULE: no bottom conversion footer, no action button, no platform-entry UI, no social interaction prompt, no private-domain contact element, no scannable contact code.",
    "",
    styleBlock,
    "",
    directRequirements,
    "",
    "【必须原样显示的中文文字】",
    `主标题："${main}"`,
    `副标题："${sub}"`,
    "文字要求：",
    "- 所有文字必须为清晰、准确、简体中文。",
    "- 严格使用我给出的主标题、副标题和短标签；不要自动改写，不要添加额外标语。",
    "- 不要乱码、错别字、英文、拼音或无意义小字。",
    "- 主标题优先保证准确和最大可读，副标题更小但必须清楚。",
    "- 如果后续提示词包含【辅助信息点】，这些短点必须逐条显示在画面里，不要省略，不要只用图标代替文字。",
    "",
    "【画面方向】",
    `主视觉：${plan.mainVisual}`,
    `场景道具：${plan.sceneProps}`,
    `构图：${plan.composition}`,
    "文字要自然融入海报，而不是贴在模板上。",
    "版面至少有三层信息：主标题、短副标题、短标签/短清单；不要生成单调的“背景图 + 大标题”。",
    "",
    "【输出目标】",
    "手机端缩略图可读，商业化可发布，干净、现代、专业；信息密度稳定但不拥挤；不要促销感，不要信息过载，不要像App入口页，不要像投放转化页。",
    `质量底线：${plan.qualityGoal}`,
  ].join("\n")

  return {
    prompt: promptBody,
    negative: negative ? `${COMMON_NEGATIVE_PROMPT}，${negative}` : COMMON_NEGATIVE_PROMPT,
    styleId: plan.id,
    styleLabel: plan.label,
    styleReason: plan.reason,
    layout: plan.layout,
    palette: plan.palette,
  }
}
