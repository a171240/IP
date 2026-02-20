import "server-only"

import { jsonrepair } from "jsonrepair"
import { z } from "zod"

import type { VoiceCoachEmotion, VoiceCoachScenario } from "@/lib/voice-coach/scenarios"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

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

function formatHistory(history: Array<{ role: "customer" | "beautician"; text: string; emotion?: string }>): string {
  if (!history.length) return "（无历史对话）"
  return history
    .map((t) => {
      const who = t.role === "customer" ? "顾客" : "美容师"
      const emo = t.role === "customer" && t.emotion ? `（情绪：${t.emotion}）` : ""
      return `${who}${emo}：${t.text}`
    })
    .join("\n")
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
  const t = setTimeout(() => controller.abort(), timeoutMs)

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
    if (!content.trim()) {
      throw new Error("llm_empty_content")
    }

    const repaired = jsonrepair(content)
    const parsed = JSON.parse(repaired) as unknown
    return opts.schema.parse(parsed)
  } finally {
    clearTimeout(t)
  }
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
  polished: z.string().min(1).max(400),
  highlights: z.array(HighlightSchema).optional(),
  per_turn_scores: z.record(z.string(), z.number()).optional(),
  risk_notes: z.array(z.string().min(1).max(80)).optional(),
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
}): Promise<CustomerTurn> {
  const system = [
    "你在一个微信小程序里扮演“顾客”，用于训练美容师销售话术。",
    `场景：${opts.scenario.name}`,
    `商家背景：${opts.scenario.businessContext}`,
    `顾客人设：${opts.scenario.customerPersona}`,
    "要求：只输出严格 JSON，不要任何多余文字。",
    "JSON 结构：{ \"text\": string, \"emotion\": \"neutral|worried|skeptical|impatient|pleased\", \"tag\": string }",
    "约束：顾客说话要自然、口语化，长度 10-35 字。",
  ].join("\n")

  const user = [
    "对话历史：",
    formatHistory(opts.history),
    "",
    `本轮目标：${opts.target || "继续提出疑问/异议，推动美容师给出更有说服力的回复"}`,
    "",
    `可用话题标签：${opts.scenario.seedTopics.join(" / ")}`,
  ].join("\n")

  return apimartChatJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: APIMART_FAST_MODEL,
    schema: CustomerTurnSchema,
    temperature: 0.7,
    timeoutMs: APIMART_FAST_TIMEOUT_MS,
  })
}

export async function llmAnalyzeBeauticianAndGenerateNext(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  beauticianText: string
}): Promise<AnalyzeAndNext> {
  const system = [
    "你是美业销售话术教练。",
    `场景：${opts.scenario.name}`,
    `商家背景：${opts.scenario.businessContext}`,
    "任务：",
    "1) 评价美容师这一句回复，给出 3 条“可操作的改进建议”。",
    "2) 给出一段“润色表达”（美容师可以照读）。",
    "3) 给出少量高亮（指出问题点/亮点的片段索引，按字符索引）。",
    "4) 生成下一句顾客回复（保持顾客人设）。",
    "",
    "只输出严格 JSON，不要任何多余文字。",
    "JSON 结构：",
    "{",
    '  "analysis": {',
    '    "suggestions": [string,string,string],',
    '    "polished": string,',
    '    "highlights": [{ "start": number, "end": number, "label": string, "severity": "info|warn|bad" }],',
    '    "risk_notes": string[]',
    "  },",
    '  "next_customer": { "text": string, "emotion": "neutral|worried|skeptical|impatient|pleased", "tag": string }',
    "}",
    "",
    "合规约束：不要给出医疗诊断/治疗结论；不要承诺 100% 效果；不要编造无法证实的数据。",
  ].join("\n")

  const user = [
    "对话历史（最近信息可能更重要）：",
    formatHistory(opts.history),
    "",
    `顾客本句：${opts.customerTurn.text}`,
    `美容师本句：${opts.beauticianText}`,
  ].join("\n")

  return apimartChatJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: APIMART_ANALYSIS_MODEL,
    schema: AnalyzeAndNextSchema,
    temperature: 0.6,
    timeoutMs: APIMART_ANALYSIS_TIMEOUT_MS,
  })
}

export async function llmAnalyzeBeauticianTurn(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
  beauticianText: string
}): Promise<TurnAnalysis> {
  const system = [
    "你是美业销售话术教练。",
    `场景：${opts.scenario.name}`,
    `商家背景：${opts.scenario.businessContext}`,
    "任务：评价美容师这一句回复，输出严格 JSON。",
    "只输出严格 JSON，不要任何多余文字。",
    "JSON 结构：",
    "{",
    '  "suggestions": [string,string,string],',
    '  "polished": string,',
    '  "highlights": [{ "start": number, "end": number, "label": string, "severity": "info|warn|bad" }],',
    '  "risk_notes": string[]',
    "}",
    "约束：",
    "1) suggestions 必须是 3 条、可执行、具体。",
    "2) polished 要可直接照读，长度 40-220 字。",
    "3) 合规：不要给医疗诊断/疗效承诺/虚假数据。",
  ].join("\n")

  const user = [
    "对话历史（最近信息更重要）：",
    formatHistory(opts.history),
    "",
    `顾客本句：${opts.customerTurn.text}`,
    `美容师本句：${opts.beauticianText}`,
  ].join("\n")

  return apimartChatJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: APIMART_ANALYSIS_MODEL,
    schema: TurnAnalysisSchema,
    temperature: 0.5,
    timeoutMs: APIMART_ANALYSIS_TIMEOUT_MS,
  })
}

export async function llmGenerateHint(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
  customerTurn: { text: string; emotion?: VoiceCoachEmotion }
}): Promise<HintResult> {
  const system = [
    "你是美业销售话术教练。",
    `场景：${opts.scenario.name}`,
    "任务：给出本轮“适宜话术”的提示，鼓励美容师用自己的话表达。",
    "只输出严格 JSON。",
    "JSON 结构：{ \"hint_text\": string, \"hint_points\"?: string[] }",
    "约束：hint_text 80-160 字；hint_points 最多 3 条。",
    "合规约束：不要给出医疗诊断/治疗结论；不要夸大承诺。",
  ].join("\n")

  const user = [
    "对话历史：",
    formatHistory(opts.history),
    "",
    `顾客本句：${opts.customerTurn.text}`,
  ].join("\n")

  return apimartChatJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: APIMART_FAST_MODEL,
    schema: HintSchema,
    temperature: 0.5,
    timeoutMs: APIMART_HINT_TIMEOUT_MS,
  })
}
