import "server-only"

import { rewriteModelOutputSchema, type RewriteModelOutput } from "@/lib/content-rewrite/types"

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type LlmRequestInput = {
  messages: ChatMessage[]
  maxTokens?: number
}

function safeJsonParse(input: string): unknown {
  const text = input.trim()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function extractToolArguments(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const choices = payload.choices
  if (!Array.isArray(choices) || !choices.length) return null

  const choice = choices[0]
  if (!isRecord(choice)) return null

  const message = choice.message
  if (!isRecord(message)) return null

  const toolCalls = message.tool_calls
  if (!Array.isArray(toolCalls) || !toolCalls.length) return null

  const first = toolCalls[0]
  if (!isRecord(first)) return null

  const fn = first.function
  if (!isRecord(fn)) return null

  const args = fn.arguments
  return typeof args === "string" && args.trim() ? args : null
}

function extractMessageContent(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const choices = payload.choices
  if (!Array.isArray(choices) || !choices.length) return null

  const choice = choices[0]
  if (!isRecord(choice)) return null

  const message = choice.message
  if (!isRecord(message)) return null

  const content = message.content
  return typeof content === "string" && content.trim() ? content : null
}

function coerceModelOutput(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate

  if (isRecord(candidate.result) && isRecord(candidate.compliance_report)) {
    return candidate
  }

  const hasResultShape =
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.script === "string" &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.cover_prompts)

  if (!hasResultShape) return candidate

  if (isRecord(candidate.compliance_report)) {
    return {
      result: {
        title: candidate.title,
        body: candidate.body,
        script: candidate.script,
        tags: candidate.tags,
        cover_prompts: candidate.cover_prompts,
      },
      compliance_report: candidate.compliance_report,
    }
  }

  if (typeof candidate.risk_level === "string" && Array.isArray(candidate.flags)) {
    return {
      result: {
        title: candidate.title,
        body: candidate.body,
        script: candidate.script,
        tags: candidate.tags,
        cover_prompts: candidate.cover_prompts,
      },
      compliance_report: {
        risk_level: candidate.risk_level,
        flags: candidate.flags,
      },
    }
  }

  return candidate
}

function decodeLlmPayload(rawText: string): RewriteModelOutput {
  const responseEnvelope = safeJsonParse(rawText)

  const candidates: unknown[] = [
    coerceModelOutput(responseEnvelope),
    coerceModelOutput(safeJsonParse(extractToolArguments(responseEnvelope) || "")),
    coerceModelOutput(safeJsonParse(extractMessageContent(responseEnvelope) || "")),
  ]

  for (const candidate of candidates) {
    const parsed = rewriteModelOutputSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }

  throw new Error("rewrite_model_output_invalid")
}

async function postChatCompletion(opts: {
  baseUrl: string
  apiKey: string
  payload: Record<string, unknown>
  timeoutMs: number
}): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

  try {
    const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(opts.payload),
      signal: controller.signal,
    })

    const text = await response.text().catch(() => "")
    return {
      ok: response.ok,
      status: response.status,
      text,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("rewrite_model_timeout")
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function callRewriteModel(input: LlmRequestInput): Promise<RewriteModelOutput> {
  const apiKey =
    (process.env.APIMART_QUICK_API_KEY && process.env.APIMART_QUICK_API_KEY !== "your-api-key-here"
      ? process.env.APIMART_QUICK_API_KEY
      : process.env.APIMART_API_KEY) || ""

  if (!apiKey || apiKey === "your-api-key-here") {
    throw new Error("APIMART_API_KEY 未配置")
  }

  const baseUrl =
    (process.env.APIMART_QUICK_BASE_URL && process.env.APIMART_QUICK_BASE_URL.trim().length
      ? process.env.APIMART_QUICK_BASE_URL
      : process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1").trim()

  const model = (process.env.APIMART_QUICK_MODEL || process.env.APIMART_MODEL || "gpt-4o").trim()
  const maxTokens = Math.max(1000, Math.min(Number(input.maxTokens || 2800), 6000))
  const timeoutMs = Math.max(5000, Number(process.env.APIMART_TIMEOUT_MS || 90000))

  const toolName = "emit_rewrite_payload"
  const basePayload: Record<string, unknown> = {
    model,
    messages: input.messages,
    temperature: 0.5,
    max_tokens: maxTokens,
    stream: false,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          description: "输出重写结果与合规报告，必须为 JSON，不要输出额外文字。",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              result: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string", minLength: 1, maxLength: 120 },
                  body: { type: "string", minLength: 1, maxLength: 20000 },
                  script: { type: "string", minLength: 1, maxLength: 20000 },
                  tags: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 40 },
                    minItems: 1,
                    maxItems: 30,
                  },
                  cover_prompts: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 400 },
                    minItems: 1,
                    maxItems: 10,
                  },
                },
                required: ["title", "body", "script", "tags", "cover_prompts"],
              },
              compliance_report: {
                type: "object",
                additionalProperties: false,
                properties: {
                  risk_level: { type: "string", enum: ["safe", "medium", "high"] },
                  flags: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 160 },
                    maxItems: 50,
                  },
                },
                required: ["risk_level", "flags"],
              },
            },
            required: ["result", "compliance_report"],
          },
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: {
        name: toolName,
      },
    },
  }

  let response = await postChatCompletion({
    baseUrl,
    apiKey,
    payload: basePayload,
    timeoutMs,
  })

  if (!response.ok && response.status === 400) {
    const lower = response.text.toLowerCase()
    const toolUnsupported = lower.includes("tool") || lower.includes("tool_choice") || lower.includes("tools")

    if (toolUnsupported) {
      response = await postChatCompletion({
        baseUrl,
        apiKey,
        payload: {
          model,
          messages: input.messages,
          temperature: 0.5,
          max_tokens: maxTokens,
          stream: false,
          response_format: { type: "json_object" },
        },
        timeoutMs,
      })
    }
  }

  if (!response.ok) {
    throw new Error(`rewrite_upstream_error:${response.status}`)
  }

  return decodeLlmPayload(response.text)
}
