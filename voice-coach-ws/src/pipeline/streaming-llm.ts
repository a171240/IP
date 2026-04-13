import {
  ANALYSIS_DELIMITER,
  REPLY_META_DELIMITER,
  type ChatMessage,
  type VoiceCoachScenario,
  buildAsyncAnalysisPrompt,
  buildFastReplyPrompt,
  buildMergedPrompt,
} from "../shared/prompts.js"

export interface StreamingLlmOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fallbackModels?: string[]
  temperature?: number
  timeoutMs?: number
  abortSignal?: AbortSignal
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
const DEFAULT_MODEL = "doubao-seed-1-6-flash-250828"
const DEFAULT_TIMEOUT_MS = 20000

function toError(error: unknown, fallbackMessage = "llm_stream_error"): Error {
  if (error instanceof Error) return error
  if (typeof error === "string" && error.trim()) return new Error(error)
  return new Error(fallbackMessage)
}

function timeoutError(ms: number): Error {
  const err = new Error(`llm_timeout:${ms}`)
  err.name = "TimeoutError"
  return err
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  if (typeof reason === "string" && reason.trim()) return new Error(reason)
  const err = new Error("llm_aborted")
  err.name = "AbortError"
  return err
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "llm_aborted" ||
      error.message.startsWith("llm_timeout:"))
  )
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

function normalizeModelList(primary: string, fallbackModels?: string[]): string[] {
  return [primary, ...(fallbackModels || [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
}

function extractTokenFromPayload(payload: any): string {
  if (!payload || typeof payload !== "object") return ""

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta : undefined

  const candidates = [
    delta?.content,
    delta?.text,
    choice?.text,
    payload.content,
    payload.text,
    payload.message?.content,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }

  return ""
}

function parseEventData(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/)
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""))
    }
  }

  if (!dataLines.length) return null
  return dataLines.join("\n").trimEnd()
}

async function readJsonResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    return ""
  }

  const json = (await response.json().catch(() => null)) as any
  if (!json || typeof json !== "object") return ""
  return extractTokenFromPayload(json) || ""
}

function extractErrorMessage(payload: any): string {
  if (!payload || typeof payload !== "object") return ""

  const candidates = [
    payload.error?.message,
    payload.error?.code,
    payload.message,
    payload.code,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
}

async function readErrorResponse(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "")
  if (!raw.trim()) return `llm_http_${response.status}`

  try {
    const parsed = JSON.parse(raw)
    return extractErrorMessage(parsed) || raw.trim()
  } catch {
    return raw.trim()
  }
}

function shouldRetryWithFallback(status: number | null, message: string): boolean {
  const normalized = String(message || "").toLowerCase()
  if (status === 400 || status === 403 || status === 404 || status === 429) return true
  if (status !== null && status >= 500) return true

  return [
    "model",
    "endpoint",
    "permission",
    "not found",
    "not support",
    "invalid",
    "quota",
    "rate limit",
  ].some((keyword) => normalized.includes(keyword))
}

async function streamSseResponse(
  response: Response,
  signal: AbortSignal,
  options: StreamingLlmOptions,
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    const fallback = await readJsonResponse(response)
    if (fallback) {
      options.onToken(fallback)
      options.onDone(fallback)
      return fallback
    }
    throw new Error("llm_empty_stream")
  }

  let buffer = ""
  let fullText = ""
  let done = false
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(abortError(signal))
      return
    }

    signal.addEventListener(
      "abort",
      () => {
        reject(abortError(signal))
      },
      { once: true },
    )
  })

  try {
    while (!done) {
      const result = (await Promise.race([reader.read(), abortPromise])) as {
        done: boolean
        value?: Uint8Array
      }
      if (result.done) break

      buffer += new TextDecoder().decode(result.value, { stream: true })

      while (true) {
        const boundaryIndex = buffer.search(/\r?\n\r?\n/)
        if (boundaryIndex < 0) break

        const match = buffer.match(/\r?\n\r?\n/)
        const boundaryLength = match?.[0]?.length || 2
        const rawEvent = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + boundaryLength)

        const data = parseEventData(rawEvent)
        if (!data) continue
        if (data === "[DONE]") {
          done = true
          break
        }

        let payload: any = null
        let token = ""
        try {
          payload = JSON.parse(data)
          token = extractTokenFromPayload(payload)
        } catch (_error) {
          token = data
        }

        if (token) {
          fullText += token
          options.onToken(token)
        }

        const finished = Array.isArray(payload?.choices) && payload.choices.some((choice: any) => choice?.finish_reason)
        if (finished && !token && typeof payload?.text === "string") {
          fullText += payload.text
          options.onToken(payload.text)
        }
      }
    }

    if (buffer.trim()) {
      const data = parseEventData(buffer) ?? buffer.trim()
      if (data && data !== "[DONE]") {
        try {
          const payload = JSON.parse(data)
          const token = extractTokenFromPayload(payload)
          if (token) {
            fullText += token
            options.onToken(token)
          }
        } catch {
          fullText += data
          options.onToken(data)
        }
      }
    }

    options.onDone(fullText)
    return fullText
  } finally {
    try {
      await reader.cancel().catch(() => undefined)
    } catch {
      // Ignore cancel errors during shutdown.
    }
  }
}

/**
 * Streams an Ark-compatible chat completion from Doubao using SSE.
 */
export async function streamChat(messages: ChatMessage[], options: StreamingLlmOptions): Promise<void> {
  if (!options.apiKey?.trim()) {
    const error = new Error("llm_api_key_missing")
    options.onError(error)
    throw error
  }

  const baseUrl = options.baseUrl?.trim() || DEFAULT_BASE_URL
  const models = normalizeModelList(options.model?.trim() || DEFAULT_MODEL, options.fallbackModels)
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Math.round(options.timeoutMs || 0)) : DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs)
  const signal = controller.signal

  if (options.abortSignal?.aborted) {
    controller.abort(abortError(options.abortSignal))
  } else if (options.abortSignal) {
    options.abortSignal.addEventListener(
      "abort",
      () => controller.abort(abortError(options.abortSignal)),
      { once: true },
    )
  }

  try {
    let lastError: Error | null = null

    for (let index = 0; index < models.length; index += 1) {
      const model = models[index]!

      try {
        const response = await fetch(joinUrl(baseUrl, "/chat/completions"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: typeof options.temperature === "number" ? options.temperature : 0.6,
            stream: true,
            messages,
          }),
          signal,
        })

        if (!response.ok) {
          const errorMessage = await readErrorResponse(response)
          const err = new Error(errorMessage || `llm_http_${response.status}`)
          const hasFallback = index < models.length - 1
          if (hasFallback && shouldRetryWithFallback(response.status, err.message)) {
            lastError = err
            continue
          }
          throw err
        }

        await streamSseResponse(response, signal, options)
        return
      } catch (error) {
        if (isAbortLike(error)) throw error

        const err = toError(error)
        const hasFallback = index < models.length - 1
        if (hasFallback && shouldRetryWithFallback(null, err.message)) {
          lastError = err
          continue
        }
        throw err
      }
    }

    throw lastError || new Error("llm_stream_error")
  } catch (error) {
    const err = toError(error)
    options.onError(err)
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export {
  ANALYSIS_DELIMITER,
  REPLY_META_DELIMITER,
  buildAsyncAnalysisPrompt,
  buildFastReplyPrompt,
  buildMergedPrompt,
  type ChatMessage,
  type VoiceCoachScenario,
}
