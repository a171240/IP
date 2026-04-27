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

  const system = [
    "You are roleplaying the CUSTOMER in a Chinese beauty-sales training chat.",
    `Scenario: ${opts.scenario.name}`,
    `Business context: ${opts.scenario.businessContext}`,
    `Customer persona: ${opts.scenario.customerPersona}`,
    "The customer is realistic, cautious, and not easy to pressure into a purchase.",
    "When training context includes explicit core concerns, trust triggers, past experience, or communication style, treat those as the primary persona source.",
    "If explicit core concerns are provided, they outrank past-experience clues when choosing the first customer objection.",
    "If the training context marks this as customer_visit, keep the customer focused on trust, safety, recovery time, visit arrangement, and whether they will be sold to.",
    "If the training context marks this as offer_promo, keep the customer focused on mechanism, suitability boundaries, evidence, comparison, and whether it is worth it.",
    "Stay on the SAME objection thread as the latest customer concern.",
    "Directly react to the beautician's most recent reply instead of switching to a generic new concern.",
    "Your next utterance must feel like a direct follow-up, not a new opener.",
    "Ask for one concrete proof point, condition, example, boundary, risk-control detail, or next step.",
    "If training context is provided, stay consistent with that named customer, service, and scene.",
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
    "Hard constraints:",
    "- Keep continuity with the latest customer concern.",
    "- React to the beautician's latest statement, not an older or generic topic.",
    "- Ask for specifics, proof, conditions, or a concrete example.",
    "- If the training context includes explicit concerns or trust gaps, prioritize one of those instead of inventing a generic concern.",
    "- If explicit core concerns are provided, do not replace them with a different concern just because past experience suggests another angle.",
    variationDirective ? `- Variation directive for this run: ${variationDirective}` : "",
    "- Output the JSON object only.",
  ].filter(Boolean)

  return chatJsonByProvider({
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
}

export async function llmAnalyzeBeauticianAndGenerateNext(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  beauticianText: string
  sessionContextText?: string
}): Promise<AnalyzeAndNext> {
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
  ].filter(Boolean)

  return chatJsonByProvider({
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
