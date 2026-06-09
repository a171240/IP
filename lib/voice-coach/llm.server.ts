import "server-only"

import { jsonrepair } from "jsonrepair"
import { z } from "zod"

import type { VoiceCoachEmotion, VoiceCoachScenario } from "@/lib/voice-coach/scenarios"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

type VoiceCoachLlmProvider = "apimart" | "deepseek"

const APIMART_API_KEY = process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY
const APIMART_BASE_URL =
  process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1"
const APIMART_MODEL = process.env.APIMART_QUICK_MODEL || process.env.APIMART_MODEL || "kimi-k2-thinking-turbo"
const APIMART_FAST_MODEL = process.env.APIMART_VOICE_COACH_FAST_MODEL || process.env.APIMART_QUICK_MODEL || APIMART_MODEL
const APIMART_ANALYSIS_MODEL = process.env.APIMART_VOICE_COACH_ANALYSIS_MODEL || APIMART_MODEL
const APIMART_DEFAULT_TIMEOUT_MS = Number(process.env.APIMART_TIMEOUT_MS || 30000)
const APIMART_FAST_TIMEOUT_MS = Number(process.env.APIMART_FAST_TIMEOUT_MS || 6000)
const APIMART_ANALYSIS_TIMEOUT_MS = Number(process.env.APIMART_ANALYSIS_TIMEOUT_MS || 12000)
const APIMART_HINT_TIMEOUT_MS = Number(process.env.APIMART_HINT_TIMEOUT_MS || 6000)
const USE_RESPONSE_FORMAT = process.env.APIMART_USE_RESPONSE_FORMAT === "true"

const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || "").trim()
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").trim()
const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || "deepseek-chat").trim()
const DEEPSEEK_FAST_MODEL = (process.env.DEEPSEEK_FAST_MODEL || DEEPSEEK_MODEL).trim()
const DEEPSEEK_ANALYSIS_MODEL = (process.env.DEEPSEEK_ANALYSIS_MODEL || DEEPSEEK_MODEL).trim()
const DEEPSEEK_FALLBACK_MODELS = String(process.env.DEEPSEEK_FALLBACK_MODELS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
const DEEPSEEK_DEFAULT_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 30000)
const DEEPSEEK_FAST_TIMEOUT_MS = Number(process.env.DEEPSEEK_FAST_TIMEOUT_MS || 6000)
const DEEPSEEK_ANALYSIS_TIMEOUT_MS = Number(process.env.DEEPSEEK_ANALYSIS_TIMEOUT_MS || 12000)
const DEEPSEEK_HINT_TIMEOUT_MS = Number(process.env.DEEPSEEK_HINT_TIMEOUT_MS || 6000)

function normalizeProvider(raw: string | undefined, fallback: VoiceCoachLlmProvider): VoiceCoachLlmProvider {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
  if (value === "deepseek" && DEEPSEEK_API_KEY) return "deepseek"
  if (value === "apimart" && APIMART_API_KEY) return "apimart"
  if (fallback === "deepseek" && DEEPSEEK_API_KEY) return "deepseek"
  return "apimart"
}

const DEFAULT_PROVIDER: VoiceCoachLlmProvider = DEEPSEEK_API_KEY ? "deepseek" : "apimart"
const REPLY_PROVIDER = normalizeProvider(process.env.VOICE_COACH_REPLY_PROVIDER, DEFAULT_PROVIDER)
const ANALYSIS_PROVIDER = normalizeProvider(process.env.VOICE_COACH_ANALYSIS_PROVIDER, REPLY_PROVIDER)
const HINT_PROVIDER = REPLY_PROVIDER

function parseStructuredContent<T>(content: string, schema: z.ZodType<T>): T {
  if (!content.trim()) {
    throw new Error("llm_empty_content")
  }
  const repaired = jsonrepair(content)
  const parsed = JSON.parse(repaired) as unknown
  return schema.parse(parsed)
}

function uniqueModelCandidates(preferred: string | undefined, fallbacks: string[]): string[] {
  const out: string[] = []
  for (const candidate of [preferred || "", ...fallbacks]) {
    const normalized = String(candidate || "").trim()
    if (!normalized || out.includes(normalized)) continue
    out.push(normalized)
  }
  return out
}

function formatHistory(history: Array<{ role: "customer" | "beautician"; text: string; emotion?: string }>): string {
  if (!history.length) return "（无历史对话）"
  return history
    .map((turn, index) => {
      const who = turn.role === "customer" ? "顾客" : "美容师"
      const emotion = turn.role === "customer" && turn.emotion ? `（情绪：${turn.emotion}）` : ""
      return `${index + 1}. ${who}${emotion}：${String(turn.text || "").trim()}`
    })
    .join("\n")
}

function findLatestHistoryText(
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: string }>,
  role: "customer" | "beautician",
): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i]
    if (turn.role !== role) continue
    const text = String(turn.text || "").trim()
    if (text) return text
  }
  return ""
}

function formatSessionContext(sessionContextText?: string): string {
  const text = String(sessionContextText || "").trim()
  if (!text) return ""
  return `High-priority training context (override generic defaults when they conflict):\n${text}`
}

const TOPIC_FORBIDDEN_TERMS = ["胸", "胸部", "丰胸", "乳腺", "胸部护理", "私密", "私密护理"]

function compactTopicText(input: string): string {
  return String(input || "").replace(/\s+/g, "").trim()
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

function extractServiceNameFromContext(sessionContextText?: string): string {
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

function buildTopicLock(sessionContextText?: string) {
  const serviceName = extractServiceNameFromContext(sessionContextText)
  if (!serviceName) return null
  const serviceCompact = compactTopicText(serviceName)
  const forbiddenTerms = TOPIC_FORBIDDEN_TERMS.filter((term) => {
    const termCompact = compactTopicText(term)
    return termCompact && !serviceCompact.includes(termCompact)
  })

  return {
    serviceName,
    forbiddenTerms,
    promptText: [
      `Current single training service: ${serviceName}`,
      "The next customer utterance must stay on this service.",
      forbiddenTerms.length
        ? `Do not switch to unrelated services or body areas: ${forbiddenTerms.join("、")}.`
        : "",
      "If the beautician is vague, ask about this service's safety, mechanism, evidence, suitability boundary, process, or expectation management; after repeated safety/boundary concern turns, switch to a concrete next-step arrangement instead of asking the same safety question again.",
    ].filter(Boolean).join("\n"),
    fallbackCustomerText: `那回到${serviceName}本身，我还是想确认一下，像我这种情况做之前需要先评估哪些风险？`,
  }
}

type DialogueAxis =
  | "safety"
  | "mechanism"
  | "evidence"
  | "boundary"
  | "expectation"
  | "value"
  | "process"
  | "trust"
  | "advance"

type TrainingFrame = {
  customerDisplayName: string
  serviceName: string
  sceneKind: string
  sceneGoal: string
  coreConcerns: string[]
  likelyQuestions: string[]
  targetObjections: string[]
  mustCoverPoints: string[]
}

type DialoguePolicy = {
  frame: TrainingFrame
  currentAxis: DialogueAxis
  axisLabel: string
  nextMove: string
  fallbackCustomerText: string
  promptText: string
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

function escapeRegExp(input: string): string {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

function splitContextItems(value: string, max = 6): string[] {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[；;、,，/|]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, max)
}

function extractCustomerDisplayName(sessionContextText?: string): string {
  const line = extractContextLine(String(sessionContextText || ""), [
    "顾客显示名",
    "顾客本人",
    "顾客",
    "顾客设定",
  ])
  return String(line || "")
    .replace(/（.*$/, "")
    .split(/[；;、,，|]/)[0]
    .trim()
    .slice(0, 40)
}

function extractSceneKind(sessionContextText?: string): string {
  const line =
    extractContextLine(String(sessionContextText || ""), ["当前训练项目", "场景卡", "训练场景"]) ||
    String(sessionContextText || "")
  if (line.includes("新品推广")) return "offer_promo"
  if (line.includes("到店")) return "customer_visit"
  return ""
}

function extractSceneGoal(sessionContextText?: string): string {
  return extractContextLine(String(sessionContextText || ""), ["训练目标", "目标"]).slice(0, 160)
}

function buildTrainingFrame(sessionContextText?: string): TrainingFrame {
  const text = String(sessionContextText || "")
  return {
    customerDisplayName: extractCustomerDisplayName(text),
    serviceName: extractServiceNameFromContext(text),
    sceneKind: extractSceneKind(text),
    sceneGoal: extractSceneGoal(text),
    coreConcerns: splitContextItems(extractContextLine(text, ["核心顾虑"]), 5),
    likelyQuestions: splitContextItems(extractContextLine(text, ["高频问题"]), 5),
    targetObjections: splitContextItems(extractContextLine(text, ["重点异议"]), 5),
    mustCoverPoints: splitContextItems(extractContextLine(text, ["必须覆盖"]), 5),
  }
}

function detectDialogueAxis(text: string, frame?: TrainingFrame): DialogueAxis | null {
  const compact = compactTopicText(text)
  if (/下一步|先做|先检测|先修复|体验一次|预约|怎么安排|怎么做|怎么办/.test(compact)) return "advance"
  if (/检测|报告|案例|数据|证明|依据|认证|成分/.test(compact)) return "evidence"
  if (/原理|方式|怎么|补充|机制|为什么|区别/.test(compact)) return "mechanism"
  if (/适合|不适合|禁忌|边界|体质/.test(compact)) return "boundary"
  if (/敏感|过敏|刺激|副作用|风险|安全/.test(compact)) return "safety"
  if (/效果|维持|多久|变化|预期|改善/.test(compact)) return "expectation"
  if (/价格|贵|值|划算|费用|优惠/.test(compact)) return "value"
  if (/流程|安排|时间|恢复|多久|步骤|先后/.test(compact)) return "process"
  if (/推销|办卡|服务|跟进|稳定|信任/.test(compact)) return "trust"
  if (frame?.sceneKind === "offer_promo") return "mechanism"
  return null
}

function recentCustomerAxes(history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>): DialogueAxis[] {
  return history
    .filter((turn) => turn.role === "customer")
    .slice(-6)
    .map((turn) => detectDialogueAxis(turn.text))
    .filter((axis): axis is DialogueAxis => Boolean(axis))
}

function isSafetyClusterAxis(axis: DialogueAxis): boolean {
  return axis === "safety" || axis === "boundary" || axis === "evidence"
}

function shouldAdvanceAfterVagueSafetyLoop(
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>,
  beauticianText: string,
): boolean {
  if (!isVagueBeauticianReply(beauticianText)) return false
  const recent = recentCustomerAxes(history)
  const recentSafetyCluster = recent.filter(isSafetyClusterAxis)
  if (recentSafetyCluster.length < 3) return false
  return recent.slice(-3).some(isSafetyClusterAxis)
}

function rotateDialogueAxis(
  candidate: DialogueAxis,
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>,
  beauticianText: string,
): DialogueAxis {
  if (shouldAdvanceAfterVagueSafetyLoop(history, beauticianText)) return "advance"

  const recent = recentCustomerAxes(history)
  const lastTwo = recent.slice(-2)
  const repeatedSafety = lastTwo.length >= 2 && lastTwo.every((axis) => axis === "safety")
  const repeatedSame = lastTwo.length >= 2 && lastTwo.every((axis) => axis === candidate)
  if (!repeatedSafety && !repeatedSame) return candidate

  const preferred: DialogueAxis[] = ["evidence", "boundary", "mechanism", "expectation", "process", "value", "trust"]
  const beauticianAxis = detectDialogueAxis(beauticianText)
  if (beauticianAxis && beauticianAxis !== "safety" && !lastTwo.includes(beauticianAxis)) return beauticianAxis
  return preferred.find((axis) => !lastTwo.includes(axis)) || "evidence"
}

function isVagueBeauticianReply(text: string): boolean {
  const compact = compactTopicText(text)
  if (!compact) return true
  const vague = /放心|很好|不错|专业|安全|没问题|肯定|都有|很多顾客|效果还可以|蛮好的|适合做|非常适合|清清楚楚|明明白白|不会有什么问题|老样子|抵抗力|特别会修复/.test(compact)
  const concrete = /检测报告|第三方|编号|资质|认证|备案|数据|案例|前后对比|皮肤检测|先评估|先做.*(检测|评估|测试)|耳后|局部|小范围|成分.*(神经酰胺|积雪草|胶原|肽|透明质酸|酸|醇)|禁忌人群|暂停|观察|流程|步骤|时间|术后|护理方案|风险边界|处理方案|过敏测试|敏感肌.*(先|暂停|评估)/.test(compact)
  return vague && !concrete
}

function buildNextMove(axis: DialogueAxis, frame: TrainingFrame, beauticianText: string): string {
  const service = frame.serviceName || "这个项目"
  const vague = isVagueBeauticianReply(beauticianText)
  if (axis === "advance") {
    return `美容师连续回答偏空泛，顾客不要再重复安全边界，转而围绕${service}追问下一步怎么安排，例如先检测还是先修复、能否先体验一次、周期价格是否值得。`
  }
  if (axis === "evidence") {
    return `继续围绕${service}要可验证证据，例如检测报告、成分依据、真实案例或前后对比。`
  }
  if (axis === "mechanism") {
    return `继续围绕${service}追问原理和操作方式，要求把“怎么起作用”和普通护理区别讲清楚。`
  }
  if (axis === "boundary") {
    return `继续围绕${service}确认适用和不适用边界，尤其是哪些皮肤状态要先评估。`
  }
  if (axis === "expectation") {
    return `继续围绕${service}确认效果预期，包括多久看到变化、能维持多久、什么情况算合理。`
  }
  if (axis === "value") {
    return `继续围绕${service}追问价格价值，要求用差异点、周期和可验证结果解释值不值。`
  }
  if (axis === "process") {
    return `继续围绕${service}追问流程安排，包括评估、操作、观察和后续跟进。`
  }
  if (axis === "trust") {
    return `继续围绕${service}追问服务信任，例如会不会强推、后续服务是否稳定、如何跟进。`
  }
  return vague
    ? `美容师回答偏空泛，继续围绕${service}的安全性要求具体评估标准、风险边界和处理方案。`
    : `继续围绕${service}的安全性追问一个具体风险控制点。`
}

function buildPolicyFallbackCustomerText(axis: DialogueAxis, frame: TrainingFrame): string {
  const service = frame.serviceName || "这个项目"
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

function buildDialoguePolicy(opts: {
  sessionContextText?: string
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  beauticianText?: string
  target?: string
}): DialoguePolicy {
  const frame = buildTrainingFrame(opts.sessionContextText)
  const latestCustomer = findLatestHistoryText(opts.history, "customer")
  const latestBeautician = String(opts.beauticianText || findLatestHistoryText(opts.history, "beautician") || "")
  const contextAxis = detectDialogueAxis(`${frame.coreConcerns.join(" ")} ${frame.targetObjections.join(" ")}`, frame)
  const detectedAxis =
    detectDialogueAxis(`${opts.target || ""} ${latestCustomer} ${latestBeautician}`, frame) ||
    contextAxis ||
    "safety"
  const currentAxis = rotateDialogueAxis(detectedAxis, opts.history, latestBeautician)
  const nextMove = buildNextMove(currentAxis, frame, latestBeautician)
  const fallbackCustomerText = buildPolicyFallbackCustomerText(currentAxis, frame)
  const service = frame.serviceName || "当前护理项目"
  const promptText = [
    `active_service=${service}`,
    frame.sceneKind ? `scene_kind=${frame.sceneKind}` : "",
    frame.customerDisplayName
      ? `customer_display_name=${frame.customerDisplayName}; this is metadata for UI/report only, not an addressee in customer speech.`
      : "",
    `current_axis=${AXIS_LABELS[currentAxis]}`,
    `next_customer_move=${nextMove}`,
    "policy: customer utterance must advance this active_service and current_axis, not choose a new service domain.",
    "policy: if the beautician mentions an unrelated body area/service while correcting drift, treat it as noise and return to active_service.",
  ].filter(Boolean).join("\n")

  return {
    frame,
    currentAxis,
    axisLabel: AXIS_LABELS[currentAxis],
    nextMove,
    fallbackCustomerText,
    promptText,
  }
}

function isCustomerNameAsAddress(text: string, customerName: string): boolean {
  const name = String(customerName || "").trim()
  if (!name) return false
  const compact = compactTopicText(text)
  const escaped = escapeRegExp(compactTopicText(name))
  return new RegExp(`^${escaped}(您好|你好|老师好|老师|，|,|。|！|!|:|：)?`).test(compact)
}

function removeCustomerNameAddress(text: string, customerName: string): string {
  const name = String(customerName || "").trim()
  if (!name) return String(text || "").trim()
  const escaped = escapeRegExp(name)
  return String(text || "")
    .replace(new RegExp(`^\\s*${escaped}(您好|你好|老师好|老师)?[，,。！!：:\\s]*`), "")
    .trim()
}

function normalizeCustomerTurnByPolicy(turn: CustomerTurn, policy: DialoguePolicy, topicLock: ReturnType<typeof buildTopicLock>): CustomerTurn {
  let text = removeCustomerNameAddress(turn.text, policy.frame.customerDisplayName)
  const needsFallback =
    !text ||
    isCustomerNameAsAddress(text, policy.frame.customerDisplayName) ||
    isOffTopicCustomerText(text, topicLock)

  if (needsFallback) {
    text = policy.fallbackCustomerText
  }

  return {
    ...turn,
    text,
    emotion: needsFallback ? "worried" : turn.emotion,
    tag: needsFallback ? policy.axisLabel : turn.tag,
  }
}

function isOffTopicCustomerText(text: string, topicLock: ReturnType<typeof buildTopicLock>): boolean {
  if (!topicLock || !topicLock.forbiddenTerms.length) return false
  const compact = compactTopicText(text)
  return topicLock.forbiddenTerms.some((term) => compact.includes(compactTopicText(term)))
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function buildVariationDirective(seed?: string, historyLength = 0): string {
  const normalizedSeed = String(seed || "").trim()
  if (!normalizedSeed) return ""

  const archetypes = [
    "Use a cautious, detail-checking tone and avoid the most generic opener.",
    "Use a trust-gap tone and push for one concrete proof point.",
    "Use a practical tone and focus on process, recovery, or visit arrangement.",
    "Use a comparison-first tone and pressure-test value or suitability boundaries.",
  ]
  const nudges = [
    "Keep the wording fresh for this run instead of repeating the default phrasing.",
    "Prefer a new angle over restating the same concern in the same wording.",
    "Use a slightly different objection shape even if the core concern is similar.",
    "Avoid opening with the exact same sentence pattern as previous sessions.",
  ]
  const baseIndex = quickHash(`${normalizedSeed}:${historyLength}`) % archetypes.length
  const nudgeIndex = quickHash(`${normalizedSeed}:nudge:${historyLength}`) % nudges.length
  return `${archetypes[baseIndex]} ${nudges[nudgeIndex]}`
}

async function apimartChatJson<T>(opts: {
  messages: ChatMessage[]
  schema: z.ZodType<T>
  temperature?: number
  model?: string
  timeoutMs?: number
}): Promise<T> {
  if (!APIMART_API_KEY) {
    throw new Error("APIMART_API_KEY_missing")
  }

  const timeoutMs = Math.max(3000, Number(opts.timeoutMs || APIMART_DEFAULT_TIMEOUT_MS) || APIMART_DEFAULT_TIMEOUT_MS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${APIMART_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${APIMART_API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.model || APIMART_MODEL,
        temperature: typeof opts.temperature === "number" ? opts.temperature : 0.6,
        messages: opts.messages,
        ...(USE_RESPONSE_FORMAT ? { response_format: { type: "json_object" } } : null),
      }),
      signal: controller.signal,
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const msg = json?.error?.message || json?.error || `llm_http_${res.status}`
      throw new Error(String(msg))
    }

    const content = String(json?.choices?.[0]?.message?.content || "")
    return parseStructuredContent(content, opts.schema)
  } finally {
    clearTimeout(timer)
  }
}

async function deepseekChatJson<T>(opts: {
  messages: ChatMessage[]
  schema: z.ZodType<T>
  temperature?: number
  model?: string
  timeoutMs?: number
  fallbackModels?: string[]
}): Promise<T> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY_missing")
  }

  const timeoutMs =
    Math.max(3000, Number(opts.timeoutMs || DEEPSEEK_DEFAULT_TIMEOUT_MS) || DEEPSEEK_DEFAULT_TIMEOUT_MS)
  const modelCandidates = uniqueModelCandidates(opts.model || DEEPSEEK_MODEL, opts.fallbackModels || DEEPSEEK_FALLBACK_MODELS)

  let lastError: Error | null = null

  for (const model of modelCandidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: typeof opts.temperature === "number" ? opts.temperature : 0.6,
          messages: opts.messages,
        }),
        signal: controller.signal,
      })

      const json = (await res.json().catch(() => null)) as any
      if (!res.ok) {
        const msg = json?.error?.message || json?.error || `llm_http_${res.status}`
        throw new Error(String(msg))
      }

      const content = String(json?.choices?.[0]?.message?.content || "")
      return parseStructuredContent(content, opts.schema)
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError || new Error("deepseek_chat_failed")
}

async function chatJsonByProvider<T>(opts: {
  provider: VoiceCoachLlmProvider
  messages: ChatMessage[]
  schema: z.ZodType<T>
  temperature?: number
  model?: string
  timeoutMs?: number
  fallbackModels?: string[]
}): Promise<T> {
  if (opts.provider === "deepseek") {
    return deepseekChatJson(opts)
  }
  return apimartChatJson(opts)
}

export const CustomerTurnSchema = z.object({
  text: z.string().min(1).max(300),
  emotion: z.enum(["neutral", "worried", "skeptical", "impatient", "pleased"] as const),
  tag: z.string().min(1).max(40),
})

export type CustomerTurn = z.infer<typeof CustomerTurnSchema>

export const HighlightSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  label: z.string().min(1).max(30),
  severity: z.enum(["info", "warn", "bad"] as const),
})

export const TurnAnalysisSchema = z.object({
  suggestions: z.array(z.string().min(1).max(80)).length(3),
  polished: z.string().min(40).max(220),
  highlights: z.array(HighlightSchema).optional(),
  per_turn_scores: z.record(z.string(), z.number()).optional(),
  risk_notes: z.array(z.string().min(1).max(80)).optional(),
  persuasion_score: z.number().min(0).max(100).optional(),
  organization_score: z.number().min(0).max(100).optional(),
})

export type TurnAnalysis = z.infer<typeof TurnAnalysisSchema>

export const AnalyzeAndNextSchema = z.object({
  analysis: TurnAnalysisSchema,
  next_customer: CustomerTurnSchema,
})

export type AnalyzeAndNext = z.infer<typeof AnalyzeAndNextSchema>

export const HintSchema = z.object({
  hint_text: z.string().min(1).max(400),
  hint_points: z.array(z.string().min(1).max(60)).max(5).optional(),
})

export type HintResult = z.infer<typeof HintSchema>

export async function llmGenerateCustomerTurn(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  target?: string
  sessionContextText?: string
  variationSeed?: string
}): Promise<CustomerTurn> {
  const latestCustomerConcern = findLatestHistoryText(opts.history, "customer")
  const latestBeauticianReply = findLatestHistoryText(opts.history, "beautician")
  const variationDirective = buildVariationDirective(opts.variationSeed, opts.history.length)
  const topicLock = buildTopicLock(opts.sessionContextText)
  const dialoguePolicy = buildDialoguePolicy({
    sessionContextText: opts.sessionContextText,
    history: opts.history,
    beauticianText: latestBeauticianReply,
    target: opts.target,
  })

  const system = [
    "You are roleplaying the CUSTOMER in a Chinese beauty-sales training chat.",
    `Scenario: ${opts.scenario.name}`,
    `Business context: ${opts.scenario.businessContext}`,
    `Customer persona: ${opts.scenario.customerPersona}`,
    "The customer is realistic, cautious, and not easy to pressure into a purchase.",
    "When training context includes explicit core concerns, trust triggers, past experience, or communication style, treat those as the primary persona source.",
    "If the training context contains a customer profile name, that name belongs to the simulated customer, not the beautician; never use it to address the beautician.",
    "If explicit core concerns are provided, they outrank past-experience clues when choosing the first customer objection.",
    "If the training context marks this as customer_visit, keep the customer focused on trust, safety, recovery time, visit arrangement, and whether they will be sold to.",
    "If the training context marks this as offer_promo, keep the customer focused on mechanism, suitability boundaries, evidence, comparison, and whether it is worth it.",
    "Stay on the SAME objection thread as the latest customer concern.",
    "Directly react to the beautician's most recent reply instead of switching to a generic new concern.",
    "Your next utterance must feel like a direct follow-up, not a new opener.",
    "Ask for one concrete proof point, condition, example, boundary, risk-control detail, or next step.",
    "If the dialogue policy current_axis is 推进决策, stop repeating the same safety/boundary question and ask about the concrete next step: skin check, repair first, trial arrangement, price-cycle value, or pause condition.",
    "If training context is provided, stay consistent with that named customer, service, and scene.",
    `Dialogue policy:\n${dialoguePolicy.promptText}`,
    topicLock ? `Topic lock:\n${topicLock.promptText}` : "",
    variationDirective,
    "Write natural spoken Chinese only, one short customer utterance, roughly 10-35 Chinese characters.",
    "Do not praise the beautician. Do not summarise the whole conversation. Do not reset the topic.",
    "Return strict JSON only.",
    'JSON schema: {"text": string, "emotion": "neutral|worried|skeptical|impatient|pleased", "tag": string}',
  ].join("\n")

  const userParts = [
    `Turn objective: ${opts.target || "Continue the same objection thread and ask for concrete, verifiable details."}`,
    `Allowed topic tags: ${opts.scenario.seedTopics.join(" / ")}`,
    formatSessionContext(opts.sessionContextText),
    "Conversation history:",
    formatHistory(opts.history),
    `Latest customer concern to continue: ${latestCustomerConcern || "（无）"}`,
    `Beautician's most recent reply: ${latestBeauticianReply || "（无）"}`,
    `Deterministic next move: ${dialoguePolicy.nextMove}`,
    "Hard constraints:",
    "- Keep continuity with the latest customer concern.",
    "- React to the beautician's latest statement, not an older or generic topic.",
    "- Ask for specifics, proof, conditions, or a concrete example.",
    "- If the deterministic next move asks for a next-step arrangement, do not ask another generic safety/boundary question.",
    "- The customer profile name is the simulated customer themself; do not address the beautician with that name.",
    "- If the training context includes explicit concerns or trust gaps, prioritize one of those instead of inventing a generic concern.",
    "- If explicit core concerns are provided, do not replace them with a different concern just because past experience suggests another angle.",
    topicLock ? `- Strictly stay on this single training service: ${topicLock.serviceName}.` : "",
    topicLock && topicLock.forbiddenTerms.length
      ? `- Never move into these unrelated directions unless they are the selected service: ${topicLock.forbiddenTerms.join("、")}.`
      : "",
    variationDirective ? `- Variation directive for this run: ${variationDirective}` : "",
    "- Output the JSON object only.",
  ].filter(Boolean)

  const result = await chatJsonByProvider({
    provider: REPLY_PROVIDER,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n\n") },
    ],
    model: REPLY_PROVIDER === "deepseek" ? DEEPSEEK_FAST_MODEL : APIMART_FAST_MODEL,
    schema: CustomerTurnSchema,
    temperature: 0.7,
    timeoutMs: REPLY_PROVIDER === "deepseek" ? DEEPSEEK_FAST_TIMEOUT_MS : APIMART_FAST_TIMEOUT_MS,
  })

  return normalizeCustomerTurnByPolicy(result, dialoguePolicy, topicLock)
}

export async function llmAnalyzeBeauticianAndGenerateNext(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  beauticianText: string
  sessionContextText?: string
}): Promise<AnalyzeAndNext> {
  const topicLock = buildTopicLock(opts.sessionContextText)
  const dialoguePolicy = buildDialoguePolicy({
    sessionContextText: opts.sessionContextText,
    history: opts.history,
    beauticianText: opts.beauticianText,
  })
  const system = [
    "你是美容销售训练教练。",
    `场景：${opts.scenario.name}`,
    `商家背景：${opts.scenario.businessContext}`,
    "任务：",
    "1) 评价美容师这句回复，给出 3 条可操作的改进建议。",
    "2) 给出一段润色后的表达，美容师可以直接照着说。",
    "3) 给出少量高亮片段，指出问题点或亮点。",
    "4) 生成下一句顾客回复，保持顾客人设和当前顾虑连续。",
    "5) 如果训练设定里明确写了顾客关注点、信任触发点或过往经历，下一句顾客话术要优先围绕这些信息推进，不要回到泛化异议。",
    "6) 如果训练设定里标明是到店顾客训练，就更看重信任、安全、恢复期和到店决策；如果标明是新品推广训练，就更看重原理、适用边界、证据和价值。",
    "7) 训练设定里的顾客姓名是模拟顾客本人，不是美容师称呼；下一句顾客话术不要用这个名字称呼对方。",
    "8) 如果对话策略是推进决策，下一句顾客要问下一步安排、先检测还是先修复、能否先体验、价格周期值不值，不要继续重复同一个安全边界问题。",
    `对话策略：\n${dialoguePolicy.promptText}`,
    topicLock ? `项目锁定：\n${topicLock.promptText}` : "",
    "优先方法：先接情绪，再澄清事实，再确认期待；价格/怀疑/犹豫类问题优先使用 Feel / Felt / Found。",
    "不要使用逼单、恐吓、伪限时、替顾客做决定或虚假承诺。",
    "只输出严格 JSON，不要任何额外文字。",
    "{",
    '  "analysis": {',
    '    "suggestions": [string,string,string],',
    '    "polished": string,',
    '    "highlights": [{ "start": number, "end": number, "label": string, "severity": "info|warn|bad" }],',
    '    "risk_notes": string[]',
    "  },",
    '  "next_customer": { "text": string, "emotion": "neutral|worried|skeptical|impatient|pleased", "tag": string }',
    "}",
  ].join("\n")

  const userParts = [
    formatSessionContext(opts.sessionContextText),
    "对话历史：",
    formatHistory(opts.history),
    `顾客本句：${opts.customerTurn.text}`,
    `美容师本句：${opts.beauticianText}`,
    `下一句顾客策略：${dialoguePolicy.nextMove}`,
  ].filter(Boolean)

  const result = await chatJsonByProvider({
    provider: ANALYSIS_PROVIDER,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n\n") },
    ],
    model: ANALYSIS_PROVIDER === "deepseek" ? DEEPSEEK_ANALYSIS_MODEL : APIMART_ANALYSIS_MODEL,
    schema: AnalyzeAndNextSchema,
    temperature: 0.6,
    timeoutMs: ANALYSIS_PROVIDER === "deepseek" ? DEEPSEEK_ANALYSIS_TIMEOUT_MS : APIMART_ANALYSIS_TIMEOUT_MS,
  })

  return {
    ...result,
    next_customer: normalizeCustomerTurnByPolicy(result.next_customer, dialoguePolicy, topicLock),
  }
}

export async function llmAnalyzeBeauticianTurn(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  beauticianText: string
  sessionContextText?: string
}): Promise<TurnAnalysis> {
  const system = [
    "你是美容销售训练教练。",
    `场景：${opts.scenario.name}`,
    `商家背景：${opts.scenario.businessContext}`,
    "任务：评价美容师这一句回复，输出严格 JSON。",
    "只输出严格 JSON，不要任何额外文字。",
    "{",
    '  "suggestions": [string,string,string],',
    '  "polished": string,',
    '  "highlights": [{ "start": number, "end": number, "label": string, "severity": "info|warn|bad" }],',
    '  "risk_notes": string[],',
    '  "persuasion_score": number,',
    '  "organization_score": number',
    "}",
    "要求：",
    "1) suggestions 必须正好 3 条，且可执行、具体。",
    "2) polished 要可直接照读，长度 40-220 字，结构优先体现“接情绪 -> 讲事实 -> 给下一步”。",
    "3) 不要给医疗诊断、疗效承诺、虚假数据。",
    "4) 不鼓励硬压、恐吓、替顾客做决定或伪限时成交。",
    "5) 如果训练设定里已经写明了顾客的关注点、信任触发点或过往经历，评估和润色必须围绕这些具体信息。",
    "6) 如果训练设定里标明是到店顾客训练，就优先看是否接住顾虑、建立信任、解释流程与恢复期；如果是新品推广训练，就优先看是否讲清原理、适用边界、证据和价值。",
  ].join("\n")

  const userParts = [
    formatSessionContext(opts.sessionContextText),
    "对话历史：",
    formatHistory(opts.history),
    `顾客本句：${opts.customerTurn.text}`,
    `美容师本句：${opts.beauticianText}`,
  ].filter(Boolean)

  return chatJsonByProvider({
    provider: ANALYSIS_PROVIDER,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n\n") },
    ],
    model: ANALYSIS_PROVIDER === "deepseek" ? DEEPSEEK_ANALYSIS_MODEL : APIMART_ANALYSIS_MODEL,
    schema: TurnAnalysisSchema,
    temperature: 0.5,
    timeoutMs: ANALYSIS_PROVIDER === "deepseek" ? DEEPSEEK_ANALYSIS_TIMEOUT_MS : APIMART_ANALYSIS_TIMEOUT_MS,
  })
}

export async function llmGenerateHint(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  sessionContextText?: string
}): Promise<HintResult> {
  const system = [
    "你是美容销售训练教练。",
    `场景：${opts.scenario.name}`,
    "任务：给出本轮更适合的话术提示，鼓励美容师用自己的话表达。",
    "只输出严格 JSON。",
    'JSON 结构：{"hint_text": string, "hint_points"?: string[]}',
    "要求：hint_text 80-160 字；hint_points 最多 3 条。",
    "优先方法：先接情绪，再澄清事实，再确认期待；价格/怀疑/犹豫类问题优先使用 Feel / Felt / Found。",
    "不要给医疗诊断、疗效承诺、逼单、恐吓或伪限时表达。",
    "如果训练设定里已经给出顾客的关注点和建立信任方式，提示要围绕这些具体信息，不要给空泛建议。",
    "如果训练设定里标明是到店顾客训练，就优先提示信任建立、评估流程、恢复期和低压力推进；如果是新品推广训练，就优先提示原理、适用边界、证据和价值解释。",
  ].join("\n")

  const userParts = [
    formatSessionContext(opts.sessionContextText),
    "对话历史：",
    formatHistory(opts.history),
    `顾客本句：${opts.customerTurn.text}`,
  ].filter(Boolean)

  return chatJsonByProvider({
    provider: HINT_PROVIDER,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n\n") },
    ],
    model: HINT_PROVIDER === "deepseek" ? DEEPSEEK_FAST_MODEL : APIMART_FAST_MODEL,
    schema: HintSchema,
    temperature: 0.5,
    timeoutMs: HINT_PROVIDER === "deepseek" ? DEEPSEEK_HINT_TIMEOUT_MS : APIMART_HINT_TIMEOUT_MS,
  })
}
