import "server-only"

type GenerateImageOptions = {
  prompt: string
  negativePrompt?: string
  size: string
  resolution?: string
  quality?: string
  outputFormat?: string
  imageUrls?: string[]
}

type TaskStatus = "pending" | "submitted" | "processing" | "completed" | "failed"

const BASIC_IMAGE_RESOLUTION = "1k"

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "")
}

function isConfiguredKey(value: string) {
  return Boolean(value && value !== "your-api-key-here")
}

function apiBaseUrl() {
  return normalizeBaseUrl(process.env.APIMART_IMAGE_BASE_URL || "https://api.apimart.ai/v1")
}

function safeHost(value: string) {
  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || ""
  }
}

function resolveApiConfig() {
  const baseUrl = apiBaseUrl()
  const imageKey = (process.env.APIMART_IMAGE_API_KEY || "").trim()
  const sharedKey = (process.env.APIMART_API_KEY || "").trim()
  const sharedBaseUrl = process.env.APIMART_BASE_URL ? normalizeBaseUrl(process.env.APIMART_BASE_URL) : ""

  if (isConfiguredKey(imageKey)) {
    return { key: imageKey, keySource: "APIMART_IMAGE_API_KEY", baseUrl, sharedBaseUrl }
  }

  if (isConfiguredKey(sharedKey) && (!sharedBaseUrl || sharedBaseUrl === baseUrl)) {
    return { key: sharedKey, keySource: "APIMART_API_KEY", baseUrl, sharedBaseUrl }
  }

  return { key: "", keySource: "none", baseUrl, sharedBaseUrl }
}

function imageProviderDiagnostics(config: ReturnType<typeof resolveApiConfig>) {
  return {
    baseHost: safeHost(config.baseUrl),
    sharedBaseHost: config.sharedBaseUrl ? safeHost(config.sharedBaseUrl) : "",
    keySource: config.keySource,
    hasImageKey: isConfiguredKey((process.env.APIMART_IMAGE_API_KEY || "").trim()),
    hasSharedKey: isConfiguredKey((process.env.APIMART_API_KEY || "").trim()),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "",
  }
}

export function imageModel() {
  return "gpt-image-2"
}

function pollTimeoutMs() {
  const v = Number(process.env.APIMART_IMAGE_POLL_TIMEOUT_MS || 240000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 300000) : 240000
}

function requestTimeoutMs() {
  const v = Number(process.env.APIMART_IMAGE_REQUEST_TIMEOUT_MS || 30000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 60000) : 30000
}

function maxRetries() {
  const v = Number(process.env.APIMART_IMAGE_MAX_RETRIES || 0)
  return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 5) : 0
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildFullPrompt(opts: Pick<GenerateImageOptions, "prompt" | "negativePrompt">) {
  const prompt = opts.prompt.trim()
  const negativePrompt = opts.negativePrompt?.trim()
  if (!negativePrompt || prompt.includes(negativePrompt)) return prompt

  return [
    prompt,
    "",
    `需要避开的画面问题：${negativePrompt}`,
  ].join("\n")
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function extractTaskId(json: unknown) {
  const root = asRecord(json)
  const data = root?.data
  if (Array.isArray(data)) {
    const first = asRecord(data[0])
    const taskId = first?.task_id
    if (typeof taskId === "string" && taskId.trim()) return taskId.trim()
  }

  const taskId = root?.task_id
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : ""
}

function extractImageUrl(json: unknown): string {
  const root = asRecord(json)
  const data = asRecord(root?.data)
  const result = asRecord(data?.result) || asRecord(root?.result)
  const images = result?.images || data?.images || root?.images

  if (Array.isArray(images) && images.length) {
    const first = asRecord(images[0])
    const url = first?.url
    if (Array.isArray(url) && typeof url[0] === "string") return url[0]
    if (typeof url === "string") return url
  }

  const directUrl = root?.url || data?.url
  if (typeof directUrl === "string") return directUrl
  if (Array.isArray(directUrl) && typeof directUrl[0] === "string") return directUrl[0]

  return ""
}

function extractStatus(json: unknown): TaskStatus | "" {
  const root = asRecord(json)
  const data = asRecord(root?.data)
  const raw = data?.status || root?.status
  return typeof raw === "string" ? (raw as TaskStatus) : ""
}

function extractErrorMessage(json: unknown, fallback: string) {
  const root = asRecord(json)
  const error = asRecord(root?.error)
  const message = error?.message || root?.message
  return typeof message === "string" && message.trim() ? message.trim() : fallback
}

async function requestJson(path: string, init?: RequestInit) {
  const config = resolveApiConfig()
  if (!config.key) {
    console.error("APIMart image provider missing key", imageProviderDiagnostics(config))
    throw new Error("APIMART_IMAGE_API_KEY missing")
  }

  let lastError: Error | null = null
  const attempts = maxRetries() + 1

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs())

    try {
      const res = await fetch(`${config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.key}`,
          ...(init?.headers || {}),
        },
      })

      const text = await res.text().catch(() => "")
      const json = parseJson(text)
      if (!res.ok) {
        const upstreamMessage = extractErrorMessage(json, text.slice(0, 200))
        const message = `APIMart image error: ${res.status} ${upstreamMessage}`
        lastError = new Error(message)
        const retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(res.status)
        if (!retryable || attempt >= attempts - 1) {
          console.error("APIMart image request failed", {
            ...imageProviderDiagnostics(config),
            path,
            status: res.status,
            upstreamMessage: upstreamMessage.slice(0, 200),
            attempt: attempt + 1,
            attempts,
          })
          throw lastError
        }
      } else {
        return json
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch failed"
      const isUpstreamHttpError = message.startsWith("APIMart image error:")
      lastError = new Error(isUpstreamHttpError ? message : `APIMart image request failed: ${message}`)
      if (attempt >= attempts - 1) {
        if (!isUpstreamHttpError) {
          console.error("APIMart image fetch failed", {
            ...imageProviderDiagnostics(config),
            path,
            message: message.slice(0, 200),
            attempt: attempt + 1,
            attempts,
          })
        }
        throw lastError
      }
    } finally {
      clearTimeout(timer)
    }

    await sleep(1000 * (attempt + 1))
  }

  throw lastError || new Error("APIMart image request failed")
}

async function pollTask(taskId: string) {
  const started = Date.now()
  await sleep(9000)

  while (Date.now() - started < pollTimeoutMs()) {
    const json = await requestJson(`/tasks/${encodeURIComponent(taskId)}`, { method: "GET" })
    const status = extractStatus(json)
    const url = extractImageUrl(json)

    if (status === "completed" && url) return url
    if (status === "failed") throw new Error(extractErrorMessage(json, "image_task_failed"))

    await sleep(3500)
  }

  throw new Error("image_task_timeout")
}

export async function generateGptImage2(opts: GenerateImageOptions): Promise<{ imageUrl: string; model: string }> {
  const model = imageModel()
  const fullPrompt = buildFullPrompt(opts)
  const payload: Record<string, unknown> = {
    model,
    prompt: fullPrompt,
    n: 1,
    size: opts.size || process.env.APIMART_IMAGE_SIZE || "3:4",
  }
  const resolution = BASIC_IMAGE_RESOLUTION
  const quality = opts.quality || process.env.APIMART_IMAGE_QUALITY || ""
  const outputFormat = opts.outputFormat || process.env.APIMART_IMAGE_OUTPUT_FORMAT || ""
  payload.resolution = resolution
  if (quality) payload.quality = quality
  if (outputFormat) payload.output_format = outputFormat
  if (opts.imageUrls?.length) payload.image_urls = opts.imageUrls.slice(0, 16)

  const submitted = await requestJson("/images/generations", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  const directUrl = extractImageUrl(submitted)
  if (directUrl) return { imageUrl: directUrl, model }

  const taskId = extractTaskId(submitted)
  if (!taskId) throw new Error("image_task_id_missing")

  const imageUrl = await pollTask(taskId)
  return { imageUrl, model }
}
