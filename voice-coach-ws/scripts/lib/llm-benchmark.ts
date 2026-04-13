import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { performance } from "node:perf_hooks"

export type BenchmarkMessage = {
  role: "system" | "user" | "assistant" | "developer"
  content: string
}

export type BenchmarkTarget = {
  name: string
  label: string
  apiKey: string
  baseUrl: string
  model: string
  source: "env" | "cli"
}

export type BenchmarkSettings = {
  iterations: number
  timeoutMs: number
  temperature: number
  maxTokens?: number
  messages: BenchmarkMessage[]
}

export type BenchmarkRunResult = {
  targetName: string
  targetLabel: string
  model: string
  iteration: number
  success: boolean
  ttftMs: number | null
  totalLatencyMs: number
  outputChars: number
  startedAt: string
  error?: string
}

export type BenchmarkSummary = {
  targetName: string
  targetLabel: string
  model: string
  runs: number
  successCount: number
  failureCount: number
  avgTtftMs: number | null
  p95TtftMs: number | null
  avgTotalLatencyMs: number | null
  p95TotalLatencyMs: number | null
  avgOutputChars: number
  firstError: string
}

export type BenchmarkProgressEvent = {
  target: BenchmarkTarget
  result: BenchmarkRunResult
}

type BenchmarkDeps = {
  fetchImpl?: typeof fetch
  now?: () => number
}

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
const DEFAULT_ARK_MODEL = "doubao-seed-1-6-flash-250828"
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"

export const defaultBenchmarkMessages: BenchmarkMessage[] = [
  {
    role: "system",
    content:
      "你是一个实时语音销售教练。请用简体中文回复，控制在2句话内，给出可直接说出口的话术。",
  },
  {
    role: "user",
    content:
      "客户说：我担心做完恢复期太长，会影响上班。请先安抚顾虑，再自然引导到下一步沟通。",
  },
]

function readEnv(env: NodeJS.ProcessEnv, name: string, fallback = ""): string {
  const value = env[name]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
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

function extractTextFromUnknown(candidate: unknown): string {
  if (typeof candidate === "string") return candidate
  if (Array.isArray(candidate)) {
    return candidate
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object") {
          const text = (part as { text?: unknown }).text
          if (typeof text === "string") return text
        }
        return ""
      })
      .join("")
  }
  return ""
}

function extractTokenFromPayload(payload: any): string {
  if (!payload || typeof payload !== "object") return ""

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta : undefined

  const candidates = [
    delta?.content,
    delta?.text,
    choice?.message?.content,
    choice?.text,
    payload.content,
    payload.text,
    payload.message?.content,
  ]

  for (const candidate of candidates) {
    const token = extractTextFromUnknown(candidate)
    if (token) return token
  }

  return ""
}

async function readErrorBody(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "")
  if (!raw.trim()) return `http_${response.status}`

  try {
    const parsed = JSON.parse(raw)
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error?.code ||
      parsed?.code
    return typeof message === "string" && message.trim() ? message.trim() : raw.trim()
  } catch {
    return raw.trim()
  }
}

async function readStreamingText(
  response: Response,
  startedAt: number,
  now: () => number,
): Promise<{ outputText: string; ttftMs: number | null }> {
  const reader = response.body?.getReader()
  if (!reader) {
    const raw = await response.text().catch(() => "")
    if (!raw.trim()) {
      return {
        outputText: "",
        ttftMs: null,
      }
    }

    try {
      const parsed = JSON.parse(raw)
      const outputText = extractTokenFromPayload(parsed)
      return {
        outputText,
        ttftMs: outputText ? now() - startedAt : null,
      }
    } catch {
      return {
        outputText: raw,
        ttftMs: raw ? now() - startedAt : null,
      }
    }
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let outputText = ""
  let ttftMs: number | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const boundaryIndex = buffer.search(/\r?\n\r?\n/)
      if (boundaryIndex < 0) break

      const match = buffer.match(/\r?\n\r?\n/)
      const boundaryLength = match?.[0]?.length || 2
      const rawEvent = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + boundaryLength)

      const data = parseEventData(rawEvent)
      if (!data || data === "[DONE]") continue

      let token = ""
      try {
        token = extractTokenFromPayload(JSON.parse(data))
      } catch {
        token = data
      }

      if (!token) continue
      if (ttftMs === null) {
        ttftMs = now() - startedAt
      }
      outputText += token
    }
  }

  if (buffer.trim()) {
    const data = parseEventData(buffer) ?? buffer.trim()
    if (data && data !== "[DONE]") {
      let token = ""
      try {
        token = extractTokenFromPayload(JSON.parse(data))
      } catch {
        token = data
      }

      if (token) {
        if (ttftMs === null) {
          ttftMs = now() - startedAt
        }
        outputText += token
      }
    }
  }

  try {
    await reader.cancel().catch(() => undefined)
  } catch {
    // Ignore cancel errors during shutdown.
  }

  return { outputText, ttftMs }
}

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-"
  return `${Math.round(value)}ms`
}

export function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index] ?? null
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildEnvTarget(input: Omit<BenchmarkTarget, "source">): BenchmarkTarget {
  return {
    ...input,
    source: "env",
  }
}

export function dedupeTargets(targets: BenchmarkTarget[]): BenchmarkTarget[] {
  const byName = new Map<string, BenchmarkTarget>()
  for (const target of targets) {
    byName.set(`${target.name}::${target.model}`, target)
  }
  return [...byName.values()]
}

export function discoverDefaultTargets(env: NodeJS.ProcessEnv): BenchmarkTarget[] {
  const targets: BenchmarkTarget[] = []

  const arkApiKey = readEnv(env, "ARK_API_KEY", readEnv(env, "DOUBAO_API_KEY"))
  if (arkApiKey) {
    targets.push(
      buildEnvTarget({
        name: "ark",
        label: "Ark / Doubao",
        apiKey: arkApiKey,
        baseUrl: readEnv(env, "ARK_BASE_URL", readEnv(env, "VOLC_ARK_BASE_URL", DEFAULT_ARK_BASE_URL)),
        model: readEnv(env, "ARK_VOICE_COACH_FAST_MODEL", readEnv(env, "ARK_MODEL", DEFAULT_ARK_MODEL)),
      }),
    )
  }

  const deepseekApiKey = readEnv(env, "DEEPSEEK_API_KEY")
  if (deepseekApiKey) {
    targets.push(
      buildEnvTarget({
        name: "deepseek",
        label: "DeepSeek V3",
        apiKey: deepseekApiKey,
        baseUrl: readEnv(env, "DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL),
        model: readEnv(env, "DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL),
      }),
    )
  }

  const openAiApiKey = readEnv(env, "OPENAI_API_KEY")
  const openAiModel = readEnv(env, "OPENAI_MODEL")
  if (openAiApiKey && openAiModel) {
    targets.push(
      buildEnvTarget({
        name: "openai",
        label: "OpenAI",
        apiKey: openAiApiKey,
        baseUrl: readEnv(env, "OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL),
        model: openAiModel,
      }),
    )
  }

  return targets
}

export function selectTargets(targets: BenchmarkTarget[], requestedNames: string[]): BenchmarkTarget[] {
  if (!requestedNames.length) return targets
  const requested = new Set(requestedNames.map((item) => item.trim().toLowerCase()).filter(Boolean))
  return targets.filter((target) => requested.has(target.name.toLowerCase()))
}

export function parseTargetSpec(spec: string, env: NodeJS.ProcessEnv): BenchmarkTarget {
  const record = Object.fromEntries(
    spec
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=")
        if (separatorIndex < 0) {
          throw new Error(`Invalid --target segment "${part}". Expected key=value.`)
        }
        return [part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim()]
      }),
  )

  const name = record.name?.trim()
  const baseUrl = record.baseUrl?.trim()
  const model = record.model?.trim()
  const apiKeyEnv = record.apiKeyEnv?.trim()
  const inlineApiKey = record.apiKey?.trim()
  const apiKey = inlineApiKey || (apiKeyEnv ? readEnv(env, apiKeyEnv) : "")

  if (!name || !baseUrl || !model || !apiKey) {
    throw new Error(
      "Each --target must include name, baseUrl, model, and either apiKey or apiKeyEnv with a populated env var.",
    )
  }

  return {
    name,
    label: record.label?.trim() || name,
    apiKey,
    baseUrl,
    model,
    source: "cli",
  }
}

export async function runSingleBenchmark(
  target: BenchmarkTarget,
  settings: BenchmarkSettings,
  iteration: number,
  deps: BenchmarkDeps = {},
): Promise<BenchmarkRunResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => performance.now())
  const startedAt = new Date().toISOString()
  const started = now()
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(new Error(`timeout:${settings.timeoutMs}`)), settings.timeoutMs)

  try {
    const response = await fetchImpl(joinUrl(target.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${target.apiKey}`,
      },
      body: JSON.stringify({
        model: target.model,
        messages: settings.messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: true,
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errorBody = await readErrorBody(response)
      throw new Error(`${response.status}:${errorBody}`)
    }

    const { outputText, ttftMs } = await readStreamingText(response, started, now)
    const totalLatencyMs = now() - started

    return {
      targetName: target.name,
      targetLabel: target.label,
      model: target.model,
      iteration,
      success: outputText.trim().length > 0,
      ttftMs,
      totalLatencyMs,
      outputChars: outputText.length,
      startedAt,
      error: outputText.trim().length > 0 ? undefined : "empty_response",
    }
  } catch (error) {
    const totalLatencyMs = now() - started
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "benchmark_request_failed"

    return {
      targetName: target.name,
      targetLabel: target.label,
      model: target.model,
      iteration,
      success: false,
      ttftMs: null,
      totalLatencyMs,
      outputChars: 0,
      startedAt,
      error: message,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function runBenchmarkSuite(
  targets: BenchmarkTarget[],
  settings: BenchmarkSettings,
  deps: BenchmarkDeps & { onProgress?: (event: BenchmarkProgressEvent) => void } = {},
): Promise<BenchmarkRunResult[]> {
  const results: BenchmarkRunResult[] = []

  for (const target of targets) {
    for (let iteration = 1; iteration <= settings.iterations; iteration += 1) {
      const result = await runSingleBenchmark(target, settings, iteration, deps)
      results.push(result)
      deps.onProgress?.({ target, result })
    }
  }

  return results
}

export function summarizeResults(results: BenchmarkRunResult[]): BenchmarkSummary[] {
  const grouped = new Map<string, BenchmarkRunResult[]>()

  for (const result of results) {
    const key = `${result.targetName}::${result.model}`
    const bucket = grouped.get(key) || []
    bucket.push(result)
    grouped.set(key, bucket)
  }

  return [...grouped.values()].map((group) => {
    const ttftValues = group
      .filter((result) => result.success && result.ttftMs !== null)
      .map((result) => result.ttftMs as number)
    const totalValues = group.filter((result) => result.success).map((result) => result.totalLatencyMs)
    const outputChars = group.filter((result) => result.success).map((result) => result.outputChars)
    const failures = group.filter((result) => !result.success)

    return {
      targetName: group[0]!.targetName,
      targetLabel: group[0]!.targetLabel,
      model: group[0]!.model,
      runs: group.length,
      successCount: group.length - failures.length,
      failureCount: failures.length,
      avgTtftMs: average(ttftValues),
      p95TtftMs: percentile(ttftValues, 0.95),
      avgTotalLatencyMs: average(totalValues),
      p95TotalLatencyMs: percentile(totalValues, 0.95),
      avgOutputChars: average(outputChars) ?? 0,
      firstError: failures[0]?.error || "",
    }
  })
}

export async function writeJsonReport(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}
