export type RetryOptions = {
  retries?: number
  baseDelayMs?: number
  timeoutMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = Math.max(1, Math.min(3, options.retries ?? 3))
  const baseDelayMs = Math.max(120, options.baseDelayMs ?? 350)

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
      const delay = baseDelayMs * 2 ** (attempt - 1)
      await sleep(delay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("request_failed")
}

export async function fetchTextWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: init.redirect ?? "follow",
    })
    const text = await response.text()
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}
