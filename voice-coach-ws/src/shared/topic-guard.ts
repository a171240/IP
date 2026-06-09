export type TopicLock = {
  serviceName: string
  customerName: string
  forbiddenTerms: string[]
  promptText: string
  fallbackCustomerText: string
}

export type VoiceCoachTurnLite = {
  role: "customer" | "beautician"
  text: string
  emotion?: string
}

export type DialogueAxis =
  | "safety"
  | "mechanism"
  | "evidence"
  | "boundary"
  | "expectation"
  | "value"
  | "process"
  | "trust"
  | "advance"

export type DialoguePolicy = {
  serviceName: string
  customerName: string
  axis: DialogueAxis
  axisLabel: string
  nextMove: string
  fallbackCustomerText: string
  promptText: string
}

export type TopicGuardResult = {
  ok: boolean
  offendingTerms: string[]
  reason?: string
}

const AXIS_LABELS: Record<DialogueAxis, string> = {
  safety: "安全性",
  mechanism: "项目原理",
  evidence: "证据验证",
  boundary: "适用边界",
  expectation: "效果预期",
  value: "价格价值",
  process: "流程安排",
  trust: "服务信任",
  advance: "推进决策",
}

const DEFAULT_FORBIDDEN_TERMS = [
  "胸",
  "胸部",
  "丰胸",
  "乳腺",
  "胸部护理",
  "私密",
  "私密护理",
]

function compactText(input: string): string {
  return String(input || "").replace(/\s+/g, "").trim()
}

function escapeRegExp(input: string): string {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function inferServiceNameFromText(text: string): string {
  if (/胶原/.test(text) && /(抗衰|抗初老|紧致|松弛|垮|法令纹)/.test(text)) return "胶原抗衰护理"
  if (/抗衰|抗初老|紧致|松弛|法令纹/.test(text)) return "抗衰紧致护理"
  if (/补水|干|锁水|屏障/.test(text)) return "补水修护护理"
  if (/黑头|毛孔|小气泡|清洁/.test(text)) return "清洁毛孔护理"
  if (/痘|闭口|痘印/.test(text)) return "痘痘闭口调理"
  if (/淡斑|亮肤|暗黄|提亮|反黑/.test(text)) return "亮肤淡斑护理"
  if (/眼周|眼纹|黑眼圈/.test(text)) return "眼周护理"
  return ""
}

function extractServiceName(sessionContextText?: string): string {
  const text = String(sessionContextText || "").replace(/\r/g, "\n")
  const patterns = [
    /active_service=([^\n，,；;。]+)/,
    /当前唯一训练项目[:：\s]+([^\n，,；;。]+)/,
    /当前训练项目[:：\s]+([^\n，,；;。]+)/,
    /(?:^|[\n，,；;])\s*项目[:：\s]+([^\n，,；;。]+)/,
    /服务项目[:：\s]+([^\n，,；;。]+)/,
    /训练项目[:：\s]+([^\n，,；;。]+)/,
    /护理项目[:：\s]+([^\n，,；;。]+)/,
    /品项[:：\s]+([^\n，,；;。]+)/,
    /训练任务[:：]\s*([^；;\n，,。]+)/,
    /训练主题[:：]\s*([^；;\n，,。]+)/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = String(match?.[1] || "").trim()
    if (value) {
      if (/胶原/.test(text) && /(抗衰|抗初老|紧致|松弛|垮|法令纹)/.test(value)) return "胶原抗衰护理"
      return value.slice(0, 40)
    }
  }

  return inferServiceNameFromText(text).slice(0, 40)
}

function extractContextLine(sessionContextText: string, labels: string[]): string {
  const text = String(sessionContextText || "").replace(/\r/g, "\n")
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}[:：]\\s*([^\\n]+)`)
    const match = text.match(pattern)
    const value = String(match?.[1] || "").trim()
    if (value) return value
  }
  return ""
}

function extractCustomerName(sessionContextText?: string): string {
  const line = extractContextLine(String(sessionContextText || ""), [
    "顾客显示名",
    "顾客本人",
    "顾客",
    "顾客设定",
  ])
  const firstSegment = String(line || "")
    .replace(/（.*$/, "")
    .split(/[；;、,，|]/)[0] || ""
  return firstSegment
    .trim()
    .slice(0, 40)
}

function buildForbiddenTerms(serviceName: string): string[] {
  const serviceCompact = compactText(serviceName)
  return unique(
    DEFAULT_FORBIDDEN_TERMS.filter((term) => {
      const termCompact = compactText(term)
      return termCompact && (!serviceCompact || !serviceCompact.includes(termCompact))
    }),
  )
}

export function buildTopicLock(sessionContextText?: string): TopicLock | null {
  const serviceName = extractServiceName(sessionContextText)
  if (!serviceName) return null
  const customerName = extractCustomerName(sessionContextText)

  const forbiddenTerms = buildForbiddenTerms(serviceName)
  const promptText = [
    `当前唯一训练项目：${serviceName}`,
    customerName ? `顾客显示名：${customerName}，只用于后台识别和报告展示，不作为顾客对美容师的称呼。` : "",
    "顾客下一句必须围绕这个项目继续追问或回应。",
    forbiddenTerms.length
      ? `不得切换到这些无关服务或身体部位：${forbiddenTerms.join("、")}。`
      : "",
    "如果美容师回答空泛，就追问该项目的安全性、原理、证据、适用边界、流程或预期管理；如果已经连续围绕敏感/安全/边界追问，改问下一步安排、评估/修复/体验方案。",
  ].filter(Boolean).join("\n")

  return {
    serviceName,
    customerName,
    forbiddenTerms,
    promptText,
    fallbackCustomerText: `那回到${serviceName}本身，我还是想确认一下，像我这种情况做之前需要先评估哪些风险？`,
  }
}

function latestText(history: VoiceCoachTurnLite[], role: "customer" | "beautician"): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i]
    if (!turn) continue
    if (turn.role !== role) continue
    const text = String(turn.text || "").trim()
    if (text) return text
  }
  return ""
}

function detectAxis(input: string): DialogueAxis | null {
  const compact = compactText(input)
  if (/下一步|先做|先检测|先修复|体验一次|预约|怎么安排|怎么做|怎么办/.test(compact)) return "advance"
  if (/检测|报告|案例|数据|证明|依据|认证|成分/.test(compact)) return "evidence"
  if (/原理|方式|怎么|补充|机制|为什么|区别/.test(compact)) return "mechanism"
  if (/适合|不适合|禁忌|边界|体质/.test(compact)) return "boundary"
  if (/敏感|过敏|刺激|副作用|风险|安全/.test(compact)) return "safety"
  if (/效果|维持|多久|变化|预期|改善/.test(compact)) return "expectation"
  if (/价格|贵|值|划算|费用|优惠/.test(compact)) return "value"
  if (/流程|安排|时间|恢复|步骤|先后/.test(compact)) return "process"
  if (/推销|办卡|服务|跟进|稳定|信任/.test(compact)) return "trust"
  return null
}

function recentCustomerAxes(history: VoiceCoachTurnLite[]): DialogueAxis[] {
  return history
    .filter((turn) => turn.role === "customer")
    .slice(-6)
    .map((turn) => detectAxis(turn.text))
    .filter((axis): axis is DialogueAxis => Boolean(axis))
}

function isSafetyClusterAxis(axis: DialogueAxis): boolean {
  return axis === "safety" || axis === "boundary" || axis === "evidence"
}

function shouldAdvanceAfterVagueSafetyLoop(history: VoiceCoachTurnLite[], beauticianText: string): boolean {
  if (!isVagueBeauticianReply(beauticianText)) return false
  const recent = recentCustomerAxes(history)
  const recentSafetyCluster = recent.filter(isSafetyClusterAxis)
  if (recentSafetyCluster.length < 3) return false
  return recent.slice(-3).some(isSafetyClusterAxis)
}

function rotateAxis(candidate: DialogueAxis, history: VoiceCoachTurnLite[], beauticianText: string): DialogueAxis {
  if (shouldAdvanceAfterVagueSafetyLoop(history, beauticianText)) return "advance"

  const recent = recentCustomerAxes(history)
  const lastTwo = recent.slice(-2)
  const repeatedSafety = lastTwo.length >= 2 && lastTwo.every((axis) => axis === "safety")
  const repeatedSame = lastTwo.length >= 2 && lastTwo.every((axis) => axis === candidate)
  if (!repeatedSafety && !repeatedSame) return candidate

  const preferred: DialogueAxis[] = ["evidence", "boundary", "mechanism", "expectation", "process", "value", "trust"]
  const beauticianAxis = detectAxis(beauticianText)
  if (beauticianAxis && beauticianAxis !== "safety" && !lastTwo.includes(beauticianAxis)) return beauticianAxis
  return preferred.find((axis) => !lastTwo.includes(axis)) || "evidence"
}

function isVagueBeauticianReply(text: string): boolean {
  const compact = compactText(text)
  if (!compact) return true
  const vague = /放心|很好|不错|专业|安全|没问题|肯定|都有|很多顾客|效果还可以|蛮好的|适合做|非常适合|清清楚楚|明明白白|不会有什么问题|老样子|抵抗力|特别会修复/.test(compact)
  const concrete = /检测报告|第三方|编号|资质|认证|备案|数据|案例|前后对比|皮肤检测|先评估|先做.*(检测|评估|测试)|耳后|局部|小范围|成分.*(神经酰胺|积雪草|胶原|肽|透明质酸|酸|醇)|禁忌人群|暂停|观察|流程|步骤|时间|术后|护理方案|风险边界|处理方案|过敏测试|敏感肌.*(先|暂停|评估)/.test(compact)
  return vague && !concrete
}

function nextMoveFor(axis: DialogueAxis, serviceName: string, beauticianText: string): string {
  const service = serviceName || "这个项目"
  if (axis === "advance") return `美容师连续回答偏空泛，顾客不要再重复安全边界，转而围绕${service}追问下一步怎么安排，例如先检测还是先修复、能否先体验一次、周期价格是否值得。`
  if (axis === "evidence") return `继续围绕${service}要可验证证据，例如检测报告、成分依据、真实案例或前后对比。`
  if (axis === "mechanism") return `继续围绕${service}追问原理和操作方式，要求讲清“怎么起作用”和普通护理区别。`
  if (axis === "boundary") return `继续围绕${service}确认适用和不适用边界，尤其是哪些皮肤状态要先评估。`
  if (axis === "expectation") return `继续围绕${service}确认效果预期，包括多久看到变化、能维持多久、什么情况算合理。`
  if (axis === "value") return `继续围绕${service}追问价格价值，要求用差异点、周期和可验证结果解释值不值。`
  if (axis === "process") return `继续围绕${service}追问流程安排，包括评估、操作、观察和后续跟进。`
  if (axis === "trust") return `继续围绕${service}追问服务信任，例如会不会强推、后续服务是否稳定、如何跟进。`
  return isVagueBeauticianReply(beauticianText)
    ? `美容师回答偏空泛，继续围绕${service}的安全性要求具体评估标准、风险边界和处理方案。`
    : `继续围绕${service}的安全性追问一个具体风险控制点。`
}

function fallbackFor(axis: DialogueAxis, serviceName: string): string {
  const service = serviceName || "这个项目"
  if (axis === "advance") return `那你别只说适合，我想知道下一步到底怎么安排：我是先做皮肤检测、先修复，还是可以先体验一次？`
  if (axis === "evidence") return `那回到${service}本身，我想看能证明安全性和成分依据的检测报告。`
  if (axis === "mechanism") return `那回到${service}本身，你能把它的原理和普通护理的区别讲具体吗？`
  if (axis === "boundary") return `那回到${service}本身，哪些皮肤状态适合，哪些情况要先暂缓？`
  if (axis === "expectation") return `那回到${service}本身，多久能看到变化、能维持多久，你能说清楚吗？`
  if (axis === "value") return `那回到${service}本身，它贵在哪里、值在哪里，你能给我一个具体对比吗？`
  if (axis === "process") return `那回到${service}本身，做之前怎么评估、做完怎么观察，你能讲一下吗？`
  if (axis === "trust") return `那回到${service}本身，我想确认后面会不会一直推销，以及服务怎么跟进。`
  return `那回到${service}本身，像我这种情况做之前需要先评估哪些风险？`
}

export function buildDialoguePolicy(args: {
  sessionContextText?: string
  history: VoiceCoachTurnLite[]
  beauticianText?: string
}): DialoguePolicy | null {
  const lock = buildTopicLock(args.sessionContextText)
  if (!lock) return null
  const latestCustomer = latestText(args.history, "customer")
  const latestBeautician = String(args.beauticianText || latestText(args.history, "beautician") || "")
  const detectedAxis = detectAxis(`${latestCustomer} ${latestBeautician}`) || "safety"
  const axis = rotateAxis(detectedAxis, args.history, latestBeautician)
  const nextMove = nextMoveFor(axis, lock.serviceName, latestBeautician)
  const fallbackCustomerText = fallbackFor(axis, lock.serviceName)
  const promptText = [
    `active_service=${lock.serviceName}`,
    lock.customerName ? `customer_display_name=${lock.customerName}; only metadata, never an addressee in customer speech.` : "",
    `current_axis=${AXIS_LABELS[axis]}`,
    `next_customer_move=${nextMove}`,
    "policy: 顾客下一句只推进 active_service 和 current_axis，不自行切换项目或身体部位。",
    "policy: 如果美容师提到无关身体部位/项目是在纠偏，把它当噪音，回到 active_service。",
  ].filter(Boolean).join("\n")

  return {
    serviceName: lock.serviceName,
    customerName: lock.customerName,
    axis,
    axisLabel: AXIS_LABELS[axis],
    nextMove,
    fallbackCustomerText,
    promptText,
  }
}

function isCustomerNameAddress(text: string, customerName: string): boolean {
  const name = compactText(customerName)
  if (!name) return false
  return new RegExp(`^${escapeRegExp(name)}(您好|你好|老师好|老师|，|,|。|！|!|:|：)?`).test(compactText(text))
}

export function normalizeCustomerReplyByPolicy(text: string, policy: DialoguePolicy | null): string {
  if (!policy) return String(text || "").trim()
  const customerName = String(policy.customerName || "").trim()
  let normalized = String(text || "").trim()
  if (customerName) {
    normalized = normalized
      .replace(new RegExp(`^\\s*${escapeRegExp(customerName)}(您好|你好|老师好|老师)?[，,。！!：:\\s]*`), "")
      .trim()
  }
  if (!normalized || isCustomerNameAddress(normalized, customerName)) return policy.fallbackCustomerText
  return normalized
}

export function validateCustomerReplyTopic(text: string, lock: TopicLock | null): TopicGuardResult {
  if (!lock) return { ok: true, offendingTerms: [] }

  const compact = compactText(text)
  if (!compact) return { ok: true, offendingTerms: [] }

  if (isCustomerNameAddress(text, lock.customerName)) {
    return {
      ok: false,
      offendingTerms: lock.customerName ? [lock.customerName] : [],
      reason: "customer_name_as_addressee",
    }
  }

  if (!lock.forbiddenTerms.length) return { ok: true, offendingTerms: [] }

  const offendingTerms = lock.forbiddenTerms.filter((term) => compact.includes(compactText(term)))
  if (!offendingTerms.length) return { ok: true, offendingTerms: [] }

  return {
    ok: false,
    offendingTerms,
    reason: "off_topic_forbidden_term",
  }
}
