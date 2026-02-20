import { IngestError, isIngestError } from "@/lib/content-ingest/errors"
import { fetchTextWithTimeout, withRetry } from "@/lib/content-ingest/http"
import { normalizeSourceUrl } from "@/lib/content-ingest/url"
import type { ExtractedRecord, IngestErrorCode, JsonObject, NormalizedSource } from "@/lib/content-ingest/types"
import type { ExtractedPayload } from "@/lib/types/content-pipeline"

const CONTENT_UPSTREAM_BASE_URL =
  process.env.CONTENT_INGEST_UPSTREAM_BASE_URL?.replace(/\/$/, "") ||
  process.env.INGEST_UPSTREAM_BASE_URL?.replace(/\/$/, "") ||
  process.env.XHS_UPSTREAM_BASE_URL?.replace(/\/$/, "") ||
  ""
const CONTENT_UPSTREAM_API_KEY = process.env.CONTENT_INGEST_UPSTREAM_API_KEY || ""

const PRIVATE_MARKERS = [
  "已删除",
  "不存在",
  "私密",
  "无权限查看",
  "暂时无法查看",
  "内容不可见",
  "抱歉",
  "removed",
  "not available",
]

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"

type UpstreamProfileItem = {
  source_url?: unknown
  url?: unknown
  title?: unknown
  text?: unknown
  images?: unknown
  video_url?: unknown
  author?: unknown
  meta?: unknown
  raw_payload?: unknown
}

export type SingleExtractResult = {
  normalized: NormalizedSource
  extracted: ExtractedPayload
  raw_payload: JsonObject
}

export type ProfileExtractItemResult = {
  source_url: string
  extracted: ExtractedPayload | null
  raw_payload: JsonObject
  error_code: IngestErrorCode | null
  message: string | null
}

function buildDouyinFallback(normalized: NormalizedSource, reason: string): { extracted: ExtractedPayload; raw: JsonObject } {
  const path = new URL(normalized.normalized_url).pathname
  const videoId = path.match(/\/video\/(\d+)/)?.[1] || path.match(/\/note\/(\d+)/)?.[1] || null
  const fallbackTitle = videoId ? `抖音视频 ${videoId}` : "抖音内容"

  return {
    extracted: {
      title: fallbackTitle,
      text: "",
      images: [],
      video_url: normalized.normalized_url,
      author: null,
      meta: {
        platform: "douyin",
        extractor: "douyin_fallback",
        reason,
      },
    },
    raw: {
      source: "douyin_fallback",
      reason,
      normalized_url: normalized.normalized_url,
    },
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
}

function sanitizeText(input: string): string {
  return decodeHtmlEntities(String(input || "").replace(/\s+/g, " ")).trim()
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const cleaned = sanitizeText(value)
  return cleaned || null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
}

function toJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {}
}

function normalizeExtractedPayload(candidate: unknown): ExtractedPayload | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null
  const data = candidate as Record<string, unknown>

  const title = toStringValue(data.title) ?? ""
  const text = toStringValue(data.text) ?? ""
  const images = toStringArray(data.images)
  const videoUrl = toStringValue(data.video_url)
  const author = toStringValue(data.author)
  const meta = toJsonObject(data.meta)

  if (!title && !text && !videoUrl && images.length === 0) return null

  return {
    title,
    text,
    images,
    video_url: videoUrl,
    author,
    meta,
  }
}

function normalizeUrl(value: string): string {
  const parsed = new URL(value)
  parsed.hash = ""
  return parsed.toString()
}

function collectMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {}
  const metaRegex = /<meta\b[^>]*>/gi

  for (const match of html.matchAll(metaRegex)) {
    const tag = match[0]
    const attrRegex = /([:@a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
    const attrs: Record<string, string> = {}

    for (const attrMatch of tag.matchAll(attrRegex)) {
      const key = attrMatch[1].toLowerCase()
      const value = (attrMatch[3] || attrMatch[4] || attrMatch[5] || "").trim()
      attrs[key] = value
    }

    const key = (attrs.property || attrs.name || attrs["http-equiv"] || "").toLowerCase()
    const content = attrs.content || ""
    if (key && content) {
      tags[key] = sanitizeText(content)
    }
  }

  return tags
}

function getTitleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return sanitizeText(match?.[1] || "")
}

function collectUrlsByRegex(html: string, regex: RegExp): string[] {
  const out = new Set<string>()
  for (const match of html.matchAll(regex)) {
    const value = match[1] || match[0]
    const decoded = sanitizeText(value.replace(/\\\//g, "/"))
    if (!decoded) continue
    if (!/^https?:\/\//i.test(decoded)) continue
    out.add(decoded)
  }
  return Array.from(out)
}

function hasPrivateMarker(text: string): boolean {
  const lower = text.toLowerCase()
  return PRIVATE_MARKERS.some((marker) => lower.includes(marker.toLowerCase()))
}

export function validateSingleLinkPath(normalized: NormalizedSource): void {
  const parsed = new URL(normalized.normalized_url)
  const path = parsed.pathname

  if (normalized.platform === "douyin") {
    const isVideo = /\/video\/\d+/.test(path)
    const isShareVideo = /\/share\/video\/\d+/.test(path)
    const isNote = /\/note\/\d+/.test(path)

    if (!isVideo && !isShareVideo && !isNote) {
      throw new IngestError("invalid_link", "抖音链接需为具体视频/笔记链接")
    }
    return
  }

  const isExplore = /\/explore\//.test(path)
  const isDiscovery = /\/discovery\/item\//.test(path)
  const isItem = /\/item\//.test(path)
  if (!isExplore && !isDiscovery && !isItem) {
    throw new IngestError("invalid_link", "小红书链接需为具体图文/视频链接")
  }
}

export function validateDouyinProfileLink(normalized: NormalizedSource): void {
  if (normalized.platform !== "douyin") {
    throw new IngestError("unsupported_platform", "仅支持抖音主页导入")
  }

  const path = new URL(normalized.normalized_url).pathname
  const isProfile = /\/user\//.test(path) || /\/share\/user\//.test(path)
  if (!isProfile) {
    throw new IngestError("invalid_link", "请输入抖音主页链接")
  }
}

async function requestUpstream(paths: string | string[], payload: Record<string, unknown>): Promise<unknown> {
  if (!CONTENT_UPSTREAM_BASE_URL) return null

  const candidates = Array.isArray(paths) ? paths : [paths]

  for (const path of candidates) {
    const url = `${CONTENT_UPSTREAM_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`

    try {
      return await withRetry(
        async () => {
          const { response, text } = await fetchTextWithTimeout(
            url,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(CONTENT_UPSTREAM_API_KEY ? { "x-api-key": CONTENT_UPSTREAM_API_KEY } : {}),
              },
              body: JSON.stringify(payload),
            },
            15_000
          )

          if (!response.ok) {
            if (response.status === 404 || response.status === 410) {
              throw new IngestError("private_or_deleted_content", "内容可能已删除或不可见")
            }
            if (response.status >= 500) {
              throw new IngestError("extract_failed", "上游提取服务异常")
            }
            throw new IngestError("extract_failed", "上游提取服务返回错误")
          }

          try {
            return JSON.parse(text) as unknown
          } catch {
            throw new IngestError("extract_failed", "上游返回数据不可解析")
          }
        },
        { retries: 3, baseDelayMs: 350 }
      )
    } catch (error) {
      if (isIngestError(error) && error.code === "private_or_deleted_content") {
        throw error
      }
      continue
    }
  }

  return null
}

function singleUpstreamPaths(): string[] {
  return ["/api/content/ingest/extract", "/ingest/extract", "/extract"]
}

function profileUpstreamPaths(): string[] {
  return ["/api/content/ingest/extract-profile", "/ingest/extract-profile", "/extract-profile"]
}

function parseSingleUpstreamPayload(payload: unknown): { extracted: ExtractedPayload; raw: JsonObject } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const data = payload as Record<string, unknown>
  const extractedCandidate = data.extracted ?? data.data ?? data.result
  const extracted = normalizeExtractedPayload(extractedCandidate)
  if (!extracted) return null

  return {
    extracted,
    raw: {
      source: "upstream",
      payload: data,
    },
  }
}

function parseProfileUpstreamPayload(payload: unknown): UpstreamProfileItem[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return []
  const data = payload as Record<string, unknown>
  const candidates = data.items ?? data.data ?? []
  return Array.isArray(candidates) ? (candidates as UpstreamProfileItem[]) : []
}

async function extractViaMetaScraping(normalized: NormalizedSource): Promise<{ extracted: ExtractedPayload; raw: JsonObject }> {
  const { response, text } = await withRetry(
    () =>
      fetchTextWithTimeout(
        normalized.normalized_url,
        {
          method: "GET",
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        },
        15_000
      ),
    { retries: 3, baseDelayMs: 350 }
  )

  if (response.status === 404 || response.status === 410 || response.status === 451) {
    throw new IngestError("private_or_deleted_content", "内容可能已删除或不可访问")
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new IngestError("private_or_deleted_content", "内容可能为私密或无权限访问")
    }
    throw new IngestError("extract_failed", `抓取失败（HTTP ${response.status}）`)
  }

  const meta = collectMetaTags(text)
  const title =
    sanitizeText(meta["og:title"] || meta["twitter:title"] || meta["title"] || getTitleFromHtml(text) || "")
  const description = sanitizeText(meta["og:description"] || meta.description || meta["twitter:description"] || "")
  const author = sanitizeText(meta.author || meta["og:article:author"] || meta["article:author"] || "") || null

  const imageCandidates = [
    ...(meta["og:image"] ? [meta["og:image"]] : []),
    ...(meta["twitter:image"] ? [meta["twitter:image"]] : []),
    ...collectUrlsByRegex(text, /https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi),
  ]

  const videoCandidate =
    meta["og:video"] ||
    meta["og:video:url"] ||
    collectUrlsByRegex(text, /https?:\/\/[^"'\s>]+\.(?:mp4|m3u8)/gi)[0] ||
    null

  const images = Array.from(new Set(imageCandidates.map((item) => sanitizeText(item)).filter(Boolean))).slice(0, 20)

  const extracted: ExtractedPayload = {
    title,
    text: description,
    images,
    video_url: videoCandidate ? sanitizeText(videoCandidate) : null,
    author,
    meta: {
      platform: normalized.platform,
      extractor: "meta_scraper",
      fetched_url: response.url || normalized.normalized_url,
      fetched_at: new Date().toISOString(),
      status_code: response.status,
    },
  }

  if (!extracted.title && !extracted.text && !extracted.video_url && extracted.images.length === 0) {
    if (hasPrivateMarker(text)) {
      throw new IngestError("private_or_deleted_content", "内容可能已删除或私密")
    }
    throw new IngestError("extract_failed", "未提取到有效内容")
  }

  return {
    extracted,
    raw: {
      source: "meta_scraper",
      status: response.status,
      fetched_url: response.url || normalized.normalized_url,
      meta,
      html_excerpt: text.slice(0, 4000),
    },
  }
}

export async function extractSingleFromNormalized(normalized: NormalizedSource): Promise<SingleExtractResult> {
  validateSingleLinkPath(normalized)

  let upstreamPayload: unknown = null
  if (CONTENT_UPSTREAM_BASE_URL) {
    upstreamPayload = await requestUpstream(singleUpstreamPaths(), { url: normalized.normalized_url }).catch((error) => {
      if (error instanceof IngestError) {
        throw error
      }
      return null
    })

    const upstreamParsed = parseSingleUpstreamPayload(upstreamPayload)
    if (upstreamParsed) {
      return {
        normalized,
        extracted: upstreamParsed.extracted,
        raw_payload: upstreamParsed.raw,
      }
    }
  }

  let scraped: { extracted: ExtractedPayload; raw: JsonObject }
  try {
    scraped = await extractViaMetaScraping(normalized)
  } catch (error) {
    if (isIngestError(error) && normalized.platform === "douyin" && error.code === "extract_failed") {
      scraped = buildDouyinFallback(normalized, error.message)
    } else {
      throw error
    }
  }

  return {
    normalized,
    extracted: scraped.extracted,
    raw_payload: scraped.raw,
  }
}

export async function extractSingleFromUrl(url: string): Promise<SingleExtractResult> {
  const normalized = await normalizeSourceUrl(url)
  return extractSingleFromNormalized(normalized)
}

function dedupeAndClampUrls(urls: string[], limit: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    if (!raw) continue
    let normalized = raw.trim()
    if (!normalized) continue

    try {
      normalized = normalizeUrl(normalized)
    } catch {
      continue
    }

    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= limit) break
  }
  return out
}

function decodeJsonEscapedText(input: string): string {
  return String(input || "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
}

function collectNumericIdsFromHtml(html: string): string[] {
  const out = new Set<string>()
  const idPatterns = [
    /"(?:aweme_id|awemeId|item_id|itemId|group_id|groupId)"\s*:\s*"(\d{8,})"/g,
    /"(?:aweme_id|awemeId|item_id|itemId|group_id|groupId)"\s*:\s*(\d{8,})/g,
    /\\"(?:aweme_id|awemeId|item_id|itemId|group_id|groupId)\\"\s*:\s*\\"(\d{8,})\\"/g,
    /\\"(?:aweme_id|awemeId|item_id|itemId|group_id|groupId)\\"\s*:\s*(\d{8,})/g,
    /\\u002Fvideo\\u002F(\d{8,})/g,
    /\\\/video\\\/(\d{8,})/g,
  ]

  for (const pattern of idPatterns) {
    for (const match of html.matchAll(pattern)) {
      const id = String(match[1] || "").trim()
      if (id) out.add(id)
    }
  }

  return Array.from(out)
}

function canonicalizeDouyinContentUrl(url: string): string {
  const normalized = String(url || "").trim()
  const shareVideoMatch = normalized.match(/\/share\/video\/(\d+)/)
  if (shareVideoMatch?.[1]) {
    return `https://www.douyin.com/video/${shareVideoMatch[1]}`
  }
  return normalized
}

function extractDecodedScriptContents(html: string): string[] {
  const out = new Set<string>()
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi

  for (const match of html.matchAll(scriptRegex)) {
    const scriptText = String(match[1] || "")
    if (!scriptText) continue

    out.add(scriptText)
    out.add(decodeJsonEscapedText(scriptText))

    const encodedBlocks = scriptText.matchAll(/decodeURIComponent\("([^"]+)"\)/g)
    for (const encoded of encodedBlocks) {
      const encodedValue = encoded[1]
      if (!encodedValue) continue
      try {
        const decoded = decodeURIComponent(encodedValue)
        out.add(decoded)
        out.add(decodeJsonEscapedText(decoded))
      } catch {
        // best effort decoding only
      }
    }
  }

  return Array.from(out)
}

function discoverDouyinLinksFromProfileUrl(profileUrl: string): string[] {
  const ids = new Set<string>()
  try {
    const parsed = new URL(profileUrl)
    const idKeys = ["aweme_id", "awemeId", "item_id", "itemId", "group_id", "groupId", "modal_id", "modalId"]

    for (const key of idKeys) {
      const values = parsed.searchParams.getAll(key)
      for (const value of values) {
        const match = String(value || "").match(/(\d{8,})/)
        if (match?.[1]) ids.add(match[1])
      }
    }
  } catch {
    return []
  }

  return Array.from(ids).map((id) => `https://www.douyin.com/video/${id}`)
}

function discoverDouyinLinksFromHtml(profileUrls: string[], html: string, limit: number): string[] {
  const fromProfileUrl = profileUrls.flatMap((profileUrl) => discoverDouyinLinksFromProfileUrl(profileUrl))
  const fullMatches = collectUrlsByRegex(html, /https?:\/\/(?:www\.)?douyin\.com\/(?:video|share\/video)\/\d+/gi)
  const escapedFullMatches = collectUrlsByRegex(html, /https?:\\\/\\\/(?:www\.)?douyin\.com\\\/(?:video|share\\\/video)\\\/\d+/gi)
  const shortMatches = collectUrlsByRegex(html, /https?:\/\/v\.douyin\.com\/[a-zA-Z0-9]+\/?/gi)
  const escapedShortMatches = collectUrlsByRegex(html, /https?:\\\/\\\/v\.douyin\.com\\\/[a-zA-Z0-9]+\\\/?/gi)

  const scriptContents = extractDecodedScriptContents(html)
  const scriptFullMatches = scriptContents.flatMap((content) =>
    collectUrlsByRegex(content, /https?:\/\/(?:www\.)?douyin\.com\/(?:video|share\/video)\/\d+/gi)
  )
  const scriptShortMatches = scriptContents.flatMap((content) =>
    collectUrlsByRegex(content, /https?:\/\/v\.douyin\.com\/[a-zA-Z0-9]+\/?/gi)
  )

  const numericIds = [
    ...collectNumericIdsFromHtml(html),
    ...scriptContents.flatMap((content) => collectNumericIdsFromHtml(content)),
  ]
  const byNumericId = numericIds.map((id) => `https://www.douyin.com/video/${id}`)

  const pathIds = Array.from(html.matchAll(/\/video\/(\d+)/g)).map((m) => `https://www.douyin.com/video/${m[1]}`)
  const sharePathIds = Array.from(html.matchAll(/\/share\/video\/(\d+)/g)).map(
    (m) => `https://www.douyin.com/video/${m[1]}`
  )

  const merged = [
    ...fromProfileUrl,
    ...fullMatches,
    ...escapedFullMatches,
    ...shortMatches,
    ...escapedShortMatches,
    ...scriptFullMatches,
    ...scriptShortMatches,
    ...byNumericId,
    ...pathIds,
    ...sharePathIds,
  ].map(canonicalizeDouyinContentUrl)

  return dedupeAndClampUrls(merged, limit)
}

export async function extractDouyinProfileItemsFromNormalized(
  normalized: NormalizedSource,
  limit: number
): Promise<ProfileExtractItemResult[]> {
  validateDouyinProfileLink(normalized)
  const clampedLimit = Math.max(1, Math.min(20, Number(limit) || 20))

  let candidates: UpstreamProfileItem[] = []
  if (CONTENT_UPSTREAM_BASE_URL) {
    const payload = await requestUpstream(profileUpstreamPaths(), {
      profile_url: normalized.normalized_url,
      limit: clampedLimit,
    }).catch((error) => {
      if (isIngestError(error)) return null
      return null
    })
    candidates = parseProfileUpstreamPayload(payload)
  }

  const results: ProfileExtractItemResult[] = []

  for (const item of candidates.slice(0, clampedLimit)) {
    const sourceUrlRaw =
      (typeof item.source_url === "string" && item.source_url.trim()) ||
      (typeof item.url === "string" && item.url.trim()) ||
      null

    if (!sourceUrlRaw) continue

    const extracted = normalizeExtractedPayload(item)
    if (extracted) {
      results.push({
        source_url: sourceUrlRaw,
        extracted,
        raw_payload: {
          source: "upstream_profile",
          payload: item,
        },
        error_code: null,
        message: null,
      })
    }
  }

  if (results.length >= clampedLimit) {
    return results.slice(0, clampedLimit)
  }

  let discoveredUrls: string[] = []
  try {
    const { response, text } = await withRetry(
      () =>
        fetchTextWithTimeout(
          normalized.normalized_url,
          {
            method: "GET",
            headers: {
              "user-agent": USER_AGENT,
              accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          },
          15_000
        ),
      { retries: 3, baseDelayMs: 350 }
    )

    if (response.status === 404 || response.status === 410) {
      throw new IngestError("private_or_deleted_content", "主页不存在或已删除")
    }

    if (!response.ok && (response.status === 401 || response.status === 403)) {
      throw new IngestError("private_or_deleted_content", "主页可能是私密账号")
    }

    if (!response.ok) {
      throw new IngestError("extract_failed", `主页抓取失败（HTTP ${response.status}）`)
    }

    if (hasPrivateMarker(text)) {
      throw new IngestError("private_or_deleted_content", "主页内容不可访问")
    }

    discoveredUrls = discoverDouyinLinksFromHtml([normalized.input_url, normalized.normalized_url], text, clampedLimit)
  } catch (error) {
    if (isIngestError(error)) throw error
    throw new IngestError("extract_failed", "主页抓取失败")
  }

  if (discoveredUrls.length === 0) {
    if (results.length > 0) {
      return results.slice(0, clampedLimit)
    }

    return [
      {
        source_url: normalized.normalized_url,
        extracted: null,
        raw_payload: {
          source: "profile_fallback_discovery",
          profile_url: normalized.normalized_url,
          attempted_strategies: [
            "upstream_profile_items",
            "profile_url_query_ids",
            "html_full_video_links",
            "html_short_links",
            "html_aweme_id",
            "html_embedded_json",
          ],
          discovered_url_count: 0,
        },
        error_code: "extract_failed",
        message: "未从主页解析到作品链接",
      },
    ]
  }

  const remaining = Math.max(0, clampedLimit - results.length)
  const existingUrls = new Set(results.map((item) => item.source_url))
  const worklist = discoveredUrls.filter((url) => !existingUrls.has(url)).slice(0, remaining)

  for (const sourceUrl of worklist) {
    try {
      const single = await extractSingleFromUrl(sourceUrl)
      results.push({
        source_url: single.normalized.normalized_url,
        extracted: single.extracted,
        raw_payload: {
          source: "profile_fallback_single",
          payload: single.raw_payload,
        },
        error_code: null,
        message: null,
      })
    } catch (error) {
      const ingestError = isIngestError(error)
        ? error
        : new IngestError("extract_failed", error instanceof Error ? error.message : "提取失败")

      results.push({
        source_url: sourceUrl,
        extracted: null,
        raw_payload: {
          source: "profile_fallback_single",
          error: ingestError.message,
        },
        error_code: ingestError.code,
        message: ingestError.message,
      })
    }
  }

  return results.slice(0, clampedLimit)
}

export async function extractDouyinProfileItems(profileUrl: string, limit: number): Promise<ProfileExtractItemResult[]> {
  const normalized = await normalizeSourceUrl(profileUrl)
  return extractDouyinProfileItemsFromNormalized(normalized, limit)
}

export function buildFailedExtractedRecord(sourceUrl: string, errorCode: IngestErrorCode, message: string): ExtractedRecord {
  return {
    source_url: sourceUrl,
    extracted: {
      title: "",
      text: "",
      images: [],
      video_url: null,
      author: null,
      meta: {
        failed: true,
        error_code: errorCode,
        message,
      },
    },
    raw_payload: {
      failed: true,
      error_code: errorCode,
      message,
    },
  }
}
