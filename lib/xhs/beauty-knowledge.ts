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
}

const COMMON_NEGATIVE_PROMPT = [
  "人物照片，产品图，英文字母，二维码，水印，logo，电话，微信号，平台界面，价格，优惠，地址，复杂背景，",
  "文字变形扭曲，文字模糊，错别字，乱码，多余文字，小字密集，冷色科技感，3D效果，卡通风格，廉价促销风",
].join("")

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
  const template =
    ctx.coverTemplateBias === "hand-note"
      ? "优先手写感便签：像随手记下来的真心话，留白充足，暖光纸张质感。"
      : ctx.coverTemplateBias === "dialog-bubble"
        ? "优先对话气泡：像聊天里的重点句，但不要做成真实平台界面。"
        : "优先暖调文字海报：暖米白/浅杏背景，大字短句，手机端一眼可读。"

  return [
    "封面提示词必须由你直接生成，后端不会再帮你拼版式。",
    "cover_prompt 第一行必须是：画幅比例3:4竖版。",
    template,
    "提示词必须包含要生成的中文主标题和副标题，并要求严格原样显示。",
    "封面只做单张小红书首图，不做多页信息图，不放门店信息、价格、优惠、地址、平台名、二维码、电话、微信号、logo、水印。",
    "所有文字必须为清晰、准确、简体中文；不要乱码、错别字、英文、多余文字；不要把标题改写成别的句子。",
    "cover_negative 单独输出，覆盖：人物照片、产品图、英文字母、二维码、水印、复杂背景、文字变形、文字模糊、乱码、冷色科技感、3D、卡通。",
  ].join("\n")
}

export function normalizeCoverAsset(opts: {
  main: string
  sub: string
  prompt?: string | null
  negative?: string | null
  ctx: BeautyContext
}) {
  const main = opts.main.trim()
  const sub = opts.sub.trim()
  const prompt = String(opts.prompt || "").trim()
  const negative = String(opts.negative || "").trim()

  const promptBody = prompt
    ? prompt
    : [
        "画幅比例3:4竖版。",
        "为生活美容/皮肤管理门店生成一张小红书首图封面。",
        buildCoverPromptRequirements(opts.ctx),
        "",
        "【封面文字】",
        `主标题：${main}`,
        `副标题：${sub}`,
        "",
        "【输出目标】手机端高可读，暖调、克制、有情绪停顿感。",
      ].join("\n")

  const richPrompt =
    promptBody.length >= 500 && /文字必须|严格原样|清晰/.test(promptBody) && /二维码|水印|logo/.test(promptBody)
      ? promptBody
      : [
          promptBody,
          "",
          "【补充版式约束】",
          buildCoverPromptRequirements(opts.ctx),
          "",
          "【必须原样显示的中文文字】",
          `主标题：${main}`,
          `副标题：${sub}`,
          "",
          "【输出目标】手机端高可读，暖米白/浅杏/奶油色等暖调优先，克制、干净、有情绪停顿感；不要促销感，不要信息过载。",
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
  }
}
