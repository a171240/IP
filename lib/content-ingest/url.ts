import { withRetry } from "@/lib/content-ingest/http"
import { IngestError } from "@/lib/content-ingest/errors"
import type { NormalizedSource } from "@/lib/content-ingest/types"
import type { SourcePlatformId } from "@/lib/types/content-pipeline"

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:"
}

function detectPlatform(hostname: string): SourcePlatformId | null {
  const host = hostname.toLowerCase()

  if (
    host === "douyin.com" ||
    host.endsWith(".douyin.com") ||
    host === "iesdouyin.com" ||
    host.endsWith(".iesdouyin.com")
  ) {
    return "douyin"
  }

  if (
    host === "xiaohongshu.com" ||
    host.endsWith(".xiaohongshu.com") ||
    host === "xhslink.com" ||
    host.endsWith(".xhslink.com")
  ) {
    return "xiaohongshu"
  }

  return null
}

function cleanUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ""
  return url.toString()
}

async function followRedirects(url: string): Promise<string> {
  return withRetry(
    async () => {
      let current = cleanUrl(url)

      for (let i = 0; i < 5; i += 1) {
        const response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        })

        if (REDIRECT_STATUS.has(response.status)) {
          const location = response.headers.get("location")
          response.body?.cancel().catch(() => undefined)

          if (!location) break
          current = cleanUrl(new URL(location, current).toString())
          continue
        }

        response.body?.cancel().catch(() => undefined)
        return cleanUrl(response.url || current)
      }

      return current
    },
    { retries: 3, baseDelayMs: 350 }
  )
}

export async function normalizeSourceUrl(inputUrl: string): Promise<NormalizedSource> {
  const value = String(inputUrl || "").trim()

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new IngestError("invalid_link", "链接格式不合法")
  }

  if (!isHttpUrl(parsed)) {
    throw new IngestError("invalid_link", "仅支持 http/https 链接")
  }

  const resolvedUrl = await followRedirects(parsed.toString()).catch(() => cleanUrl(parsed.toString()))
  const normalizedUrl = cleanUrl(resolvedUrl)
  const normalized = new URL(normalizedUrl)

  const platform = detectPlatform(normalized.hostname)
  if (!platform) {
    throw new IngestError("unsupported_platform", "仅支持抖音或小红书链接")
  }

  return {
    input_url: value,
    normalized_url: normalizedUrl,
    platform,
  }
}

export function inferPlatformFromLooseUrl(input: string, fallback: SourcePlatformId = "douyin"): SourcePlatformId {
  const text = String(input || "").toLowerCase()
  if (text.includes("xiaohongshu") || text.includes("xhslink")) return "xiaohongshu"
  if (text.includes("douyin") || text.includes("iesdouyin")) return "douyin"
  return fallback
}
