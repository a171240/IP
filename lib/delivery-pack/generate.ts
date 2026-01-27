import { deliveryPackOutputSchema, DeliveryPackInput, DeliveryPackOutput } from "./schema"
import { sanitizeDeliveryPack } from "./sanitize"

const APIMART_API_KEY = process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY
const APIMART_BASE_URL =
  process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1"
const APIMART_MODEL = process.env.APIMART_MODEL || process.env.APIMART_QUICK_MODEL || "kimi-k2-thinking"
const LLM_TIMEOUT_MS = Number(process.env.APIMART_TIMEOUT_MS || 120000)

const DELIVERY_PACK_TOOL = {
  type: "function",
  function: {
    name: "GenerateDeliveryPackV2",
    description: "Generate delivery pack v2 JSON",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "scorecard",
        "calendar_7d",
        "topic_bank_10",
        "scripts_3",
        "qc_checklist_10",
      ],
      properties: {
        scorecard: {
          type: "object",
          additionalProperties: false,
          required: ["dimensions", "core_bottleneck", "top_actions"],
          properties: {
            dimensions: {
              type: "array",
              minItems: 5,
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "score", "insight"],
                properties: {
                  name: { type: "string" },
                  score: { type: "number", minimum: 0, maximum: 10 },
                  insight: { type: "string" },
                },
              },
            },
            core_bottleneck: { type: "string" },
            top_actions: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string" },
            },
          },
        },
        calendar_7d: {
          type: "array",
          minItems: 7,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["day", "theme", "deliverable", "notes"],
            properties: {
              day: { type: "string" },
              theme: { type: "string" },
              deliverable: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        topic_bank_10: {
          type: "array",
          minItems: 10,
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "intent", "hook"],
            properties: {
              title: { type: "string" },
              intent: { type: "string" },
              hook: { type: "string" },
            },
          },
        },
        scripts_3: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "hook", "outline", "cta"],
            properties: {
              title: { type: "string" },
              hook: { type: "string" },
              outline: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string" },
              },
              cta: { type: "string" },
            },
          },
        },
        qc_checklist_10: {
          type: "array",
          minItems: 10,
          maxItems: 10,
          items: { type: "string" },
        },
        thinking_summary: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: { type: "string" },
        },
      },
    },
  },
} as const

function buildPrompt(input: DeliveryPackInput): string {
  return `You must call function GenerateDeliveryPackV2 and return ONLY valid JSON arguments. No extra text.` +
    `

Input:
${JSON.stringify(input, null, 2)}

Schema:

- scorecard.dimensions[]: name, score(0-10), insight

- scorecard.core_bottleneck: string

- scorecard.top_actions: string[3]

- calendar_7d[]: day, theme, deliverable (format + title), notes (format: "Hook:... | CTA:...")

- topic_bank_10[]: title, intent (target person + buying motive), hook (opening line + CTA)

- scripts_3[]: title, hook, outline(string[3]), cta (as 成交话术模板)

- qc_checklist_10: string[10]

- thinking_summary: string[3-5] (summary of reasoning, no chain-of-thought)


Hard rules:

1) Scores must be 0-10.

2) No unverifiable claims like ranking/top%/beating peers.

3) Copy must be conversion-focused for agency operators.

4) Script 1 = conversion script, Script 2 = resonance script, Script 3 = professional viewpoint.

5) CTA must follow: 动作 + 价值 + 低门槛 (e.g. "私信关键词领取清单").

6) Script outline must follow: 痛点与结果承诺 → 方法/案例证明 → 成交引导+风险消除.

7) Output in concise Simplified Chinese.

8) QC checklist must be binary and testable.

9) Keep each field concise (<=24 chars; outline item <=14 chars).

10) thinking_summary must be 3-5 bullets, summarizing rationale without revealing chain-of-thought.`
}

function extractJson(content: string): string {
  let cleaned = content.trim()
  const markerStart = "<<<JSON_START>>>"
  const markerEnd = "<<<JSON_END>>>"
  if (cleaned.includes(markerStart) && cleaned.includes(markerEnd)) {
    const start = cleaned.indexOf(markerStart) + markerStart.length
    const end = cleaned.indexOf(markerEnd, start)
    if (end > start) {
      cleaned = cleaned.slice(start, end).trim()
    }
  }
  cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "")
  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1)
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1")
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  return escapeNewlinesInStrings(cleaned)
}

function escapeNewlinesInStrings(input: string): string {
  let result = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inString) {
      if (escaped) {
        escaped = false
        if (char === "\n") {
          result += "n"
          continue
        }
        if (char === "\r") {
          result += "r"
          continue
        }
        if (char === "\t") {
          result += "t"
          continue
        }
        result += char
        continue
      }
      if (char === "\\") {
        escaped = true
        result += char
        continue
      }
      if (char === "\"") {
        inString = false
        result += char
        continue
      }
      if (char === "\n") {
        result += "\\n"
        continue
      }
      if (char === "\r") {
        continue
      }
      if (char === "\t") {
        result += "\\t"
        continue
      }
    } else if (char === "\"") {
      inString = true
    }
    result += char
  }
  return result
}

function coerceToolArgs(value: unknown): string {
  if (typeof value === "string") return value
  if (!value) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

function buildRepairPrompt(raw: string): string {
  return `You must call function GenerateDeliveryPackV2 and return ONLY valid JSON arguments. Fix from raw below.

Raw:
${raw}`
}

async function callLLM(
  prompt: string,
  temperature = 0.6,
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  if (!APIMART_API_KEY) {
    throw new Error("APIMART_API_KEY missing")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  const model = options?.model || APIMART_MODEL
  const maxTokens = options?.maxTokens ?? 1600

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: "Call GenerateDeliveryPackV2 and output only JSON arguments." },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
    tools: [DELIVERY_PACK_TOOL],
    tool_choice: {
      type: "function",
      function: { name: "GenerateDeliveryPackV2" },
    },
  }

  const response = await fetch(`${APIMART_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${APIMART_API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("LLM request timeout")
      }
      throw error
    })
    .finally(() => clearTimeout(timeout))

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed: ${response.status} ${errorText}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
        reasoning_content?: string
        tool_calls?: Array<{ function?: { arguments?: string } }>
        function_call?: { arguments?: string }
      }
    }>
  }
  const message = json.choices?.[0]?.message
  const toolArgs = coerceToolArgs(
    message?.tool_calls?.[0]?.function?.arguments || message?.function_call?.arguments
  )
  if (toolArgs.trim()) {
    return toolArgs
  }
  const content = message?.content?.trim() || ""
  if (!content) {
    throw new Error("LLM response empty")
  }
  return content
}

export async function generateDeliveryPackV2(input: DeliveryPackInput): Promise<DeliveryPackOutput> {
  let lastError: unknown
  let lastRaw = ""
  const fallbackModel = process.env.APIMART_QUICK_MODEL || APIMART_MODEL
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const prompt = attempt === 0 ? buildPrompt(input) : buildRepairPrompt(lastRaw)
      const raw = await callLLM(prompt, attempt === 0 ? 0.2 : 0.1, {
        model: attempt === 0 ? APIMART_MODEL : fallbackModel,
        maxTokens: attempt === 0 ? 1600 : 1200,
      })
      lastRaw = raw
      const jsonText = extractJson(raw)
      const parsed = JSON.parse(jsonText)
      const validated = deliveryPackOutputSchema.parse(parsed)
      return sanitizeDeliveryPack(validated)
    } catch (error) {
      lastError = error
      if (lastRaw) {
        console.warn("[delivery-pack] raw snippet:", lastRaw.slice(0, 500))
      }
      console.warn(`[delivery-pack] parse failed on attempt ${attempt + 1}`, error)
    }
  }
  throw lastError
}
