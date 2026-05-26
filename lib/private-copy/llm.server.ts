import "server-only"

import { jsonrepair } from "jsonrepair"

type ChatMessage = { role: string; content: string }

export type PrivateCopyLlmResult = {
  data: unknown
  modelName: string
  fallbackUsed: boolean
  latencyMs: number
  usageTokens: unknown
}

function extractBalancedJsonObject(text: string) {
  const start = text.indexOf("{")
  if (start < 0) return ""

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ""
}

function parseJsonCandidate(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(jsonrepair(text))
    } catch {
      return null
    }
  }
}

function safeJsonParse(text: string): unknown {
  const trimmed = String(text || "").trim()
  if (!trimmed) return null

  const direct = parseJsonCandidate(trimmed)
  if (direct) return direct

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  if (fenced) {
    const parsed = parseJsonCandidate(fenced)
    if (parsed) return parsed
  }

  const balanced = extractBalancedJsonObject(trimmed)
  return balanced ? parseJsonCandidate(balanced) : null
}

function getContentPayload(responseText: string) {
  const parsed = safeJsonParse(responseText)
  if (!parsed || typeof parsed !== "object") return { data: null, usage: null }

  const usage = (parsed as Record<string, unknown>).usage ?? null
  const choices = (parsed as Record<string, unknown>).choices
  if (!Array.isArray(choices) || !choices.length) return { data: parsed, usage }

  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : null
  if (!message || typeof message !== "object") return { data: null, usage }

  const content = (message as Record<string, unknown>).content
  if (typeof content === "string" && content.trim()) {
    return { data: safeJsonParse(content), usage }
  }

  const reasoning = (message as Record<string, unknown>).reasoning_content
  if (typeof reasoning === "string" && reasoning.trim()) {
    return { data: safeJsonParse(reasoning), usage }
  }

  return { data: null, usage }
}

function fallbackModels() {
  const explicit = (process.env.PRIVATE_COPY_DEEPSEEK_FALLBACK_MODEL || "").trim()
  const list = (process.env.PRIVATE_COPY_DEEPSEEK_FALLBACK_MODELS || "").trim()
  return [...(explicit ? [explicit] : []), ...list.split(",").map((v) => v.trim()).filter(Boolean)]
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
}

function chatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "")
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`
}

export async function callPrivateCopyDeepSeekJson(messages: ChatMessage[]): Promise<PrivateCopyLlmResult> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim()
  const baseUrl = (
    process.env.PRIVATE_COPY_DEEPSEEK_BASE_URL ||
    process.env.DEEPSEEK_XHS_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).trim()
  const primaryModel = (
    process.env.PRIVATE_COPY_DEEPSEEK_MODEL ||
    process.env.DEEPSEEK_XHS_MODEL ||
    process.env.DEEPSEEK_PRO_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek-chat"
  ).trim()
  const models = uniqueModels([primaryModel, ...fallbackModels()])
  const timeoutMs = Number(process.env.PRIVATE_COPY_DEEPSEEK_TIMEOUT_MS || 35000)
  const maxTokens = Number(process.env.PRIVATE_COPY_DEEPSEEK_MAX_TOKENS || 2600)
  const temperature = Number(process.env.PRIVATE_COPY_DEEPSEEK_TEMPERATURE || 0.52)

  if (!apiKey || apiKey === "your-api-key-here") throw new Error("DEEPSEEK_API_KEY missing")

  async function doRequest(model: string, fallbackUsed: boolean) {
    const started = Date.now()
    const thinkingMode = (process.env.PRIVATE_COPY_DEEPSEEK_THINKING || process.env.DEEPSEEK_XHS_THINKING || (model.includes("v4") ? "disabled" : "")).trim()
    const basePayload: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      response_format: { type: "json_object" },
    }
    if (thinkingMode) basePayload.thinking = { type: thinkingMode }

    async function send(payload: Record<string, unknown>) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(5000, timeoutMs))
      try {
        const upstream = await fetch(chatCompletionsUrl(baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        const text = await upstream.text().catch(() => "")
        return { ok: upstream.ok, status: upstream.status, text }
      } finally {
        clearTimeout(timer)
      }
    }

    async function sendWithCompatibilityFallbacks() {
      const payload = { ...basePayload }
      let last = await send(payload)
      for (let attempt = 0; attempt < 2 && !last.ok && last.status === 400; attempt += 1) {
        const lower = last.text.slice(0, 500).toLowerCase()
        let changed = false
        if (payload.response_format && (lower.includes("response_format") || lower.includes("json_object"))) {
          delete payload.response_format
          changed = true
        }
        if (payload.thinking && lower.includes("thinking")) {
          delete payload.thinking
          changed = true
        }
        if (!changed) return last
        last = await send(payload)
      }
      return last
    }

    const res = await sendWithCompatibilityFallbacks()
    if (!res.ok) throw new Error(`DeepSeek LLM error: ${res.status} ${res.text.slice(0, 200)}`)

    const { data, usage } = getContentPayload(res.text)
    if (!data) throw new Error("DeepSeek did not return valid JSON")

    return {
      data,
      modelName: model,
      fallbackUsed,
      latencyMs: Date.now() - started,
      usageTokens: usage,
    }
  }

  let lastError: unknown = null
  for (let i = 0; i < models.length; i += 1) {
    try {
      return await doRequest(models[i], i > 0)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DeepSeek request failed")
}
