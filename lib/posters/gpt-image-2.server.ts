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
type ImageProviderName = "apimart" | "evolink"
type ImageProviderConfig = {
  provider: ImageProviderName
  label: string
  key: string
  keySource: string
  baseUrl: string
  sharedBaseUrl?: string
}
type ImageModelCandidate = {
  provider: ImageProviderName
  model: string
}

const BASIC_IMAGE_RESOLUTION = "1k"
const DEFAULT_IMAGE_MODEL = "gpt-image-2"
const OFFICIAL_IMAGE_MODEL = "gpt-image-2-official"
const GEMINI_IMAGE_RESOLUTION = "1K"
const IMAGE_OVERLOADED_MESSAGE =
  "\u751f\u56fe\u901a\u9053\u6b63\u5728\u6392\u961f\uff0c\u4e0a\u6e38\u6682\u65f6\u8fc7\u8f7d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002\u5931\u8d25\u4e0d\u4f1a\u6263 AI \u70b9\u3002"
const IMAGE_TIMEOUT_MESSAGE =
  "\u751f\u6210\u7b49\u5f85\u8d85\u65f6\uff1a\u4e0a\u6e38\u6ca1\u6709\u5728\u9650\u65f6\u5185\u8fd4\u56de\u56fe\u7247\uff0c\u5931\u8d25\u4e0d\u4f1a\u6263 AI \u70b9\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"

type ImageProviderError = Error & {
  code?: string
  status?: number
  retryable?: boolean
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "")
}

function isConfiguredKey(value: string) {
  return Boolean(value && value !== "your-api-key-here")
}

function envText(name: string) {
  return String(process.env[name] || "").trim()
}

function envFlag(name: string) {
  const value = envText(name).toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function parseModelList(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function apiBaseUrl() {
  return normalizeBaseUrl(process.env.APIMART_IMAGE_BASE_URL || "https://api.apimart.ai/v1")
}

function evolinkApiBaseUrl() {
  return normalizeBaseUrl(process.env.EVOLINK_IMAGE_BASE_URL || process.env.EVOLINK_BASE_URL || "https://api.evolink.ai/v1")
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
    return { provider: "apimart" as const, label: "APIMart", key: imageKey, keySource: "APIMART_IMAGE_API_KEY", baseUrl, sharedBaseUrl }
  }

  if (isConfiguredKey(sharedKey) && (!sharedBaseUrl || sharedBaseUrl === baseUrl)) {
    return { provider: "apimart" as const, label: "APIMart", key: sharedKey, keySource: "APIMART_API_KEY", baseUrl, sharedBaseUrl }
  }

  return { provider: "apimart" as const, label: "APIMart", key: "", keySource: "none", baseUrl, sharedBaseUrl }
}

function resolveEvolinkConfig(): ImageProviderConfig {
  const baseUrl = evolinkApiBaseUrl()
  const imageKey = (process.env.EVOLINK_IMAGE_API_KEY || "").trim()
  const sharedKey = (process.env.EVOLINK_API_KEY || "").trim()

  if (isConfiguredKey(imageKey)) {
    return { provider: "evolink", label: "Evolink", key: imageKey, keySource: "EVOLINK_IMAGE_API_KEY", baseUrl }
  }

  if (isConfiguredKey(sharedKey)) {
    return { provider: "evolink", label: "Evolink", key: sharedKey, keySource: "EVOLINK_API_KEY", baseUrl }
  }

  return { provider: "evolink", label: "Evolink", key: "", keySource: "none", baseUrl }
}

function imageProviderDiagnostics(config: ImageProviderConfig) {
  return {
    provider: config.provider,
    baseHost: safeHost(config.baseUrl),
    sharedBaseHost: config.sharedBaseUrl ? safeHost(config.sharedBaseUrl) : "",
    keySource: config.keySource,
    hasImageKey: isConfiguredKey((process.env.APIMART_IMAGE_API_KEY || "").trim()),
    hasSharedKey: isConfiguredKey((process.env.APIMART_API_KEY || "").trim()),
    hasEvolinkImageKey: isConfiguredKey((process.env.EVOLINK_IMAGE_API_KEY || "").trim()),
    hasEvolinkSharedKey: isConfiguredKey((process.env.EVOLINK_API_KEY || "").trim()),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "",
  }
}

function apimartImageModelCandidates() {
  const primary = envText("APIMART_IMAGE_MODEL") || DEFAULT_IMAGE_MODEL
  const configuredFallbacks = parseModelList(envText("APIMART_IMAGE_FALLBACK_MODELS"))
  const candidates = [primary, ...configuredFallbacks]

  if (envFlag("APIMART_IMAGE_OFFICIAL_FALLBACK") && primary !== OFFICIAL_IMAGE_MODEL) {
    candidates.push(OFFICIAL_IMAGE_MODEL)
  }

  return unique(candidates)
}

function evolinkImageModelCandidates() {
  const config = resolveEvolinkConfig()
  const primary = envText("EVOLINK_IMAGE_MODEL") || DEFAULT_IMAGE_MODEL
  const configuredFallbacks = parseModelList(envText("EVOLINK_IMAGE_FALLBACK_MODELS"))
  const candidates = unique([primary, ...configuredFallbacks])
  return config.key || envFlag("EVOLINK_IMAGE_FALLBACK_ENABLED") ? candidates : []
}

function imageModelCandidates(): ImageModelCandidate[] {
  const apimartCandidates = apimartImageModelCandidates().map((model) => ({ provider: "apimart" as const, model }))
  const evolinkCandidates = evolinkImageModelCandidates().map((model) => ({ provider: "evolink" as const, model }))
  const candidates: ImageModelCandidate[] = envFlag("EVOLINK_IMAGE_PRIMARY")
    ? [...evolinkCandidates, ...apimartCandidates]
    : [...apimartCandidates, ...evolinkCandidates]
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.model}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function imageModel() {
  return imageModelCandidates()[0]?.model || DEFAULT_IMAGE_MODEL
}

function modelLabel(candidate: ImageModelCandidate) {
  return candidate.provider === "evolink" ? `evolink:${candidate.model}` : candidate.model
}

function isGeminiImageModel(model: string) {
  return /^gemini-.*image/i.test(model)
}

function usesEvolinkGeminiImageParams(candidate: ImageModelCandidate) {
  return candidate.provider === "evolink" && isGeminiImageModel(candidate.model)
}

function imageResolution(candidate: ImageModelCandidate, opts: GenerateImageOptions) {
  const configured =
    opts.resolution ||
    envText(candidate.provider === "evolink" ? "EVOLINK_IMAGE_RESOLUTION" : "APIMART_IMAGE_RESOLUTION")
  if (configured) return candidate.provider === "evolink" ? configured.toUpperCase() : configured
  const model = candidate.model
  if (isGeminiImageModel(model)) return GEMINI_IMAGE_RESOLUTION
  return BASIC_IMAGE_RESOLUTION
}

function pollTimeoutMs(provider: ImageProviderName) {
  const raw = provider === "evolink" ? process.env.EVOLINK_IMAGE_POLL_TIMEOUT_MS : process.env.APIMART_IMAGE_POLL_TIMEOUT_MS
  const v = Number(raw || 240000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 300000) : 240000
}

function requestTimeoutMs(provider: ImageProviderName) {
  const raw =
    provider === "evolink" ? process.env.EVOLINK_IMAGE_REQUEST_TIMEOUT_MS : process.env.APIMART_IMAGE_REQUEST_TIMEOUT_MS
  const v = Number(raw || 30000)
  return Number.isFinite(v) && v > 5000 ? Math.min(v, 60000) : 30000
}

function maxRetries(provider: ImageProviderName) {
  const raw = provider === "evolink" ? process.env.EVOLINK_IMAGE_MAX_RETRIES : process.env.APIMART_IMAGE_MAX_RETRIES
  const v = Number(raw || 0)
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
  if (typeof taskId === "string" && taskId.trim()) return taskId.trim()

  const id = root?.id
  return typeof id === "string" && id.trim() ? id.trim() : ""
}

function extractImageUrl(json: unknown): string {
  const root = asRecord(json)
  const data = asRecord(root?.data)
  const result = asRecord(data?.result) || asRecord(root?.result)
  const images = result?.images || data?.images || root?.images
  const results = data?.results || root?.results

  if (Array.isArray(images) && images.length) {
    const first = asRecord(images[0])
    const url = first?.url
    if (Array.isArray(url) && typeof url[0] === "string") return url[0]
    if (typeof url === "string") return url
  }

  if (Array.isArray(results) && typeof results[0] === "string") return results[0]

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

function imageProviderError(message: string, meta: Omit<ImageProviderError, "name" | "message"> = {}) {
  const error = new Error(message) as ImageProviderError
  Object.assign(error, meta)
  return error
}

function isOverloadedMessage(message: string) {
  return /overloaded|queue=.*pending|pending=\d+\s*>\s*\d+|image_provider_overloaded/i.test(message)
}

function imageProviderErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "")
}

export function isImageProviderOverloadedError(error: unknown) {
  const e = error as ImageProviderError
  return e?.code === "image_provider_overloaded" || e?.status === 503 || isOverloadedMessage(imageProviderErrorMessage(error))
}

export function imageGenerationErrorStatus(error: unknown) {
  const e = error as ImageProviderError
  const message = imageProviderErrorMessage(error)
  if (isImageProviderOverloadedError(error)) return 503
  if (e?.code === "image_task_timeout" || message === "image_task_timeout") return 504
  return 502
}

export function publicImageGenerationErrorMessage(error: unknown) {
  const e = error as ImageProviderError
  const message = imageProviderErrorMessage(error)
  if (isImageProviderOverloadedError(error)) return IMAGE_OVERLOADED_MESSAGE
  if (e?.code === "image_task_timeout" || message === "image_task_timeout") return IMAGE_TIMEOUT_MESSAGE
  return message || "image_generation_failed"
}

function shouldTryFallback(error: unknown) {
  const e = error as ImageProviderError
  return Boolean(
    e?.retryable ||
      isImageProviderOverloadedError(error) ||
      e?.code === "image_task_timeout" ||
      e?.code === "image_provider_missing_key"
  )
}

async function requestJson(config: ImageProviderConfig, path: string, init?: RequestInit) {
  if (!config.key) {
    console.error(`${config.label} image provider missing key`, imageProviderDiagnostics(config))
    throw imageProviderError(`${config.label} image API key missing`, {
      code: "image_provider_missing_key",
      retryable: true,
    })
  }

  let lastError: Error | null = null
  const attempts = maxRetries(config.provider) + 1

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs(config.provider))

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
        const message = `${config.label} image error: ${res.status} ${upstreamMessage}`
        const overloaded = res.status === 503 && isOverloadedMessage(upstreamMessage)
        const retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(res.status)
        lastError = imageProviderError(message, {
          status: res.status,
          code: overloaded ? "image_provider_overloaded" : "image_provider_http_error",
          retryable,
        })
        if (!retryable || attempt >= attempts - 1) {
          console.error(`${config.label} image request failed`, {
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
      const isUpstreamHttpError = message.startsWith(`${config.label} image error:`)
      const incoming = error as ImageProviderError
      lastError = incoming?.code
        ? incoming
        : imageProviderError(isUpstreamHttpError ? message : `${config.label} image request failed: ${message}`, {
            code: /abort|timeout/i.test(message) ? "image_provider_request_timeout" : "image_provider_fetch_failed",
            retryable: true,
          })
      if (attempt >= attempts - 1) {
        if (!isUpstreamHttpError) {
          console.error(`${config.label} image fetch failed`, {
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

  throw lastError || new Error(`${config.label} image request failed`)
}

async function pollTask(config: ImageProviderConfig, taskId: string) {
  const started = Date.now()
  await sleep(9000)

  while (Date.now() - started < pollTimeoutMs(config.provider)) {
    const json = await requestJson(config, `/tasks/${encodeURIComponent(taskId)}`, { method: "GET" })
    const status = extractStatus(json)
    const url = extractImageUrl(json)

    if (status === "completed" && url) return url
    if (status === "failed") throw new Error(extractErrorMessage(json, "image_task_failed"))

    await sleep(3500)
  }

  throw imageProviderError("image_task_timeout", { code: "image_task_timeout", retryable: true })
}

export async function generateGptImage2(opts: GenerateImageOptions): Promise<{ imageUrl: string; model: string }> {
  const candidates = imageModelCandidates()
  const failures: string[] = []
  let lastError: unknown = null

  for (const model of candidates) {
    try {
      return await generateGptImage2WithModel(model, opts)
    } catch (error) {
      lastError = error
      const message = imageProviderErrorMessage(error)
      failures.push(`${model.provider}:${model.model}: ${message.slice(0, 160)}`)
      if (!shouldTryFallback(error)) throw error
    }
  }

  if (failures.length > 1) {
    const last = lastError as ImageProviderError
    throw imageProviderError(`image_generation_all_models_failed: ${failures.join(" | ")}`, {
      code: isImageProviderOverloadedError(lastError)
        ? "image_provider_overloaded"
        : last?.code === "image_task_timeout"
          ? "image_task_timeout"
          : "image_generation_all_models_failed",
      retryable: shouldTryFallback(lastError),
    })
  }

  throw lastError instanceof Error ? lastError : new Error("image_generation_failed")
}

async function generateGptImage2WithModel(candidate: ImageModelCandidate, opts: GenerateImageOptions): Promise<{ imageUrl: string; model: string }> {
  const config = candidate.provider === "evolink" ? resolveEvolinkConfig() : resolveApiConfig()
  const fullPrompt = buildFullPrompt(opts)
  const payload: Record<string, unknown> = {
    model: candidate.model,
    prompt: fullPrompt,
    n: 1,
    size:
      opts.size ||
      envText(candidate.provider === "evolink" ? "EVOLINK_IMAGE_SIZE" : "APIMART_IMAGE_SIZE") ||
      "3:4",
  }
  const quality =
    opts.quality || envText(candidate.provider === "evolink" ? "EVOLINK_IMAGE_QUALITY" : "APIMART_IMAGE_QUALITY")
  const outputFormat =
    opts.outputFormat ||
    envText(candidate.provider === "evolink" ? "EVOLINK_IMAGE_OUTPUT_FORMAT" : "APIMART_IMAGE_OUTPUT_FORMAT")
  const resolution = imageResolution(candidate, opts)
  if (usesEvolinkGeminiImageParams(candidate)) {
    payload.quality = quality || resolution
  } else {
    payload.resolution = resolution
    if (quality) payload.quality = quality
  }
  if (outputFormat) payload.output_format = outputFormat
  if (opts.imageUrls?.length) payload.image_urls = opts.imageUrls.slice(0, 16)

  const submitted = await requestJson(config, "/images/generations", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  const directUrl = extractImageUrl(submitted)
  if (directUrl) return { imageUrl: directUrl, model: modelLabel(candidate) }

  const taskId = extractTaskId(submitted)
  if (!taskId) throw new Error("image_task_id_missing")

  const imageUrl = await pollTask(config, taskId)
  return { imageUrl, model: modelLabel(candidate) }
}
