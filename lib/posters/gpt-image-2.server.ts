import "server-only"

type GenerateImageOptions = {
  prompt: string
  negativePrompt?: string
  size: string
  resolution: string
  imageUrls?: string[]
}

type TaskStatus = "pending" | "submitted" | "processing" | "completed" | "failed"

function apiBaseUrl() {
  return (process.env.APIMART_IMAGE_BASE_URL || "https://api.apimart.ai/v1").trim().replace(/\/$/, "")
}

function apiKey() {
  return (process.env.APIMART_IMAGE_API_KEY || process.env.APIMART_API_KEY || "").trim()
}

function imageModel() {
  return (process.env.APIMART_IMAGE_MODEL || "gpt-image-2").trim()
}

function officialFallback() {
  return String(process.env.APIMART_IMAGE_OFFICIAL_FALLBACK || "").trim().toLowerCase() === "true"
}

function pollTimeoutMs() {
  const v = Number(process.env.APIMART_IMAGE_POLL_TIMEOUT_MS || 90000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 120000) : 90000
}

function requestTimeoutMs() {
  const v = Number(process.env.APIMART_IMAGE_REQUEST_TIMEOUT_MS || 30000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 60000) : 30000
}

function maxRetries() {
  const v = Number(process.env.APIMART_IMAGE_MAX_RETRIES || 2)
  return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 5) : 2
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const key = apiKey()
  if (!key || key === "your-api-key-here") throw new Error("APIMART_API_KEY missing")

  let lastError: Error | null = null
  const attempts = maxRetries() + 1

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs())

    try {
      const res = await fetch(`${apiBaseUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...(init?.headers || {}),
        },
      })

      const text = await res.text().catch(() => "")
      const json = parseJson(text)
      if (!res.ok) {
        const message = `APIMart image error: ${res.status} ${extractErrorMessage(json, text.slice(0, 200))}`
        lastError = new Error(message)
        if (![408, 409, 425, 429, 500, 502, 503, 504].includes(res.status) || attempt >= attempts - 1) {
          throw lastError
        }
      } else {
        return json
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch failed"
      lastError = new Error(`APIMart image request failed: ${message}`)
      if (attempt >= attempts - 1) throw lastError
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

export async function generateGptImage2(opts: GenerateImageOptions): Promise<{ imageUrl: string }> {
  const fullPrompt = [opts.prompt, opts.negativePrompt ? `\nNegative prompt: ${opts.negativePrompt}` : ""]
    .join("")
    .trim()
  const payload: Record<string, unknown> = {
    model: imageModel(),
    prompt: [opts.prompt, opts.negativePrompt ? `\n负面提示词：${opts.negativePrompt}` : ""].join("").trim(),
    n: 1,
    size: opts.size || process.env.APIMART_IMAGE_SIZE || "4:5",
    resolution: opts.resolution || process.env.APIMART_IMAGE_RESOLUTION || "2k",
  }
  payload.prompt = fullPrompt
  if (opts.imageUrls?.length) payload.image_urls = opts.imageUrls.slice(0, 16)

  if (officialFallback()) payload.official_fallback = true

  const submitted = await requestJson("/images/generations", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  const directUrl = extractImageUrl(submitted)
  if (directUrl) return { imageUrl: directUrl }

  const taskId = extractTaskId(submitted)
  if (!taskId) throw new Error("image_task_id_missing")

  const imageUrl = await pollTask(taskId)
  return { imageUrl }
}
