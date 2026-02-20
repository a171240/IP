import type { User } from "@supabase/supabase-js"

import { buildProfileAnalysis } from "@/lib/content-ingest/analysis"
import { IngestError, isIngestError } from "@/lib/content-ingest/errors"
import {
  extractDouyinProfileItemsFromNormalized,
  extractSingleFromNormalized,
  validateDouyinProfileLink,
} from "@/lib/content-ingest/extract"
import { persistContentSource } from "@/lib/content-ingest/storage"
import type { IngestErrorCode } from "@/lib/content-ingest/types"
import { inferPlatformFromLooseUrl, normalizeSourceUrl } from "@/lib/content-ingest/url"

type SupabaseClientForRequest = {
  from: (table: string) => {
    select: (columns?: string) => any
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => any
  }
}

function normalizeFailureSourceUrl(input: string): string {
  const value = String(input || "").trim()
  if (!value) return "https://www.douyin.com/"
  try {
    const parsed = new URL(value)
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return "https://www.douyin.com/"
  }
}

async function persistFailedRecord(opts: {
  supabase: SupabaseClientForRequest
  user: User
  source_mode: "single_link" | "douyin_profile"
  platform: "douyin" | "xiaohongshu"
  source_url: string
  batch_id: string | null
  sort_index: number
  error_code: IngestErrorCode
  message: string
}): Promise<void> {
  const { supabase, user, source_mode, platform, source_url, batch_id, sort_index, error_code, message } = opts

  await persistContentSource({
    supabase,
    user,
    source_mode,
    platform,
    source_url,
    status: "failed",
    batch_id,
    sort_index,
    extracted: {
      title: "",
      text: "",
      images: [],
      video_url: null,
      author: null,
      meta: {
        failed: true,
        error_code,
      },
    },
    raw_payload: {
      failed: true,
      error_code,
      message,
    },
    error_code,
  })
}

export async function ingestSingleLinkToSource(opts: {
  supabase: SupabaseClientForRequest
  user: User
  url: string
}): Promise<{
  source_id: string
  platform: "douyin" | "xiaohongshu"
  extracted: {
    title: string
    text: string
    images: string[]
    video_url: string | null
    author: string | null
    meta: Record<string, unknown>
  }
}> {
  const { supabase, user, url } = opts

  let platform: "douyin" | "xiaohongshu" = inferPlatformFromLooseUrl(url)
  let sourceUrl = normalizeFailureSourceUrl(url)

  try {
    const normalized = await normalizeSourceUrl(url)
    platform = normalized.platform
    sourceUrl = normalized.normalized_url

    const extracted = await extractSingleFromNormalized(normalized)

    const saved = await persistContentSource({
      supabase,
      user,
      source_mode: "single_link",
      platform,
      source_url: sourceUrl,
      status: "ready",
      batch_id: null,
      sort_index: 0,
      extracted: extracted.extracted,
      raw_payload: extracted.raw_payload,
      error_code: null,
    })

    return {
      source_id: saved.source_id,
      platform,
      extracted: extracted.extracted,
    }
  } catch (error) {
    const ingestError = isIngestError(error)
      ? error
      : new IngestError("extract_failed", error instanceof Error ? error.message : "提取失败")

    try {
      await persistFailedRecord({
        supabase,
        user,
        source_mode: "single_link",
        platform,
        source_url: sourceUrl,
        batch_id: null,
        sort_index: 0,
        error_code: ingestError.code,
        message: ingestError.message,
      })
    } catch {
      // Keep original ingest error as response cause.
    }

    throw ingestError
  }
}

export async function ingestDouyinProfileToSources(opts: {
  supabase: SupabaseClientForRequest
  user: User
  profile_url: string
  limit: number
}): Promise<{
  batch_id: string
  items: Array<{ source_id: string; title: string }>
  analysis: {
    topic_clusters: string[]
    hook_patterns: string[]
    script_pack: string[]
  }
}> {
  const { supabase, user, profile_url, limit } = opts

  const batchId = crypto.randomUUID()
  const clampedLimit = Math.max(1, Math.min(20, Number(limit) || 20))

  let normalizedUrl = normalizeFailureSourceUrl(profile_url)
  let hasPersistedRows = false

  try {
    const normalized = await normalizeSourceUrl(profile_url)
    validateDouyinProfileLink(normalized)
    normalizedUrl = normalized.normalized_url

    const extractedItems = await extractDouyinProfileItemsFromNormalized(normalized, clampedLimit)

    const responseItems: Array<{ source_id: string; title: string }> = []
    const successfulExtracted: Array<{
      title: string
      text: string
      images: string[]
      video_url: string | null
      author: string | null
      meta: Record<string, unknown>
    }> = []

    for (let i = 0; i < extractedItems.length; i += 1) {
      const item = extractedItems[i]
      const sourceUrl = normalizeFailureSourceUrl(item.source_url || normalizedUrl)

      if (item.extracted) {
        const saved = await persistContentSource({
          supabase,
          user,
          source_mode: "douyin_profile",
          platform: "douyin",
          source_url: sourceUrl,
          status: "ready",
          batch_id: batchId,
          sort_index: i,
          extracted: item.extracted,
          raw_payload: item.raw_payload,
          error_code: null,
        })

        responseItems.push({
          source_id: saved.source_id,
          title: saved.title || item.extracted.title || "未命名内容",
        })
        successfulExtracted.push(item.extracted)
        hasPersistedRows = true
        continue
      }

      const failedCode: IngestErrorCode = item.error_code ?? "extract_failed"
      const failedMessage = item.message || "提取失败"

      const saved = await persistContentSource({
        supabase,
        user,
        source_mode: "douyin_profile",
        platform: "douyin",
        source_url: sourceUrl,
        status: "failed",
        batch_id: batchId,
        sort_index: i,
        extracted: {
          title: "",
          text: "",
          images: [],
          video_url: null,
          author: null,
          meta: {
            failed: true,
            error_code: failedCode,
          },
        },
        raw_payload: {
          ...item.raw_payload,
          failed: true,
          error_code: failedCode,
          message: failedMessage,
        },
        error_code: failedCode,
      })

      responseItems.push({
        source_id: saved.source_id,
        title: "提取失败",
      })
      hasPersistedRows = true
    }

    if (successfulExtracted.length === 0) {
      throw new IngestError("extract_failed", "主页内容提取失败")
    }

    const analysis = buildProfileAnalysis(successfulExtracted)

    return {
      batch_id: batchId,
      items: responseItems,
      analysis: {
        topic_clusters: analysis.topic_clusters,
        hook_patterns: analysis.hook_patterns,
        script_pack: analysis.script_pack.length >= 3 ? analysis.script_pack : [...analysis.script_pack, "脚本补充A", "脚本补充B", "脚本补充C"].slice(0, 3),
      },
    }
  } catch (error) {
    const ingestError = isIngestError(error)
      ? error
      : new IngestError("extract_failed", error instanceof Error ? error.message : "主页导入失败")

    if (!hasPersistedRows) {
      try {
        await persistFailedRecord({
          supabase,
          user,
          source_mode: "douyin_profile",
          platform: "douyin",
          source_url: normalizedUrl,
          batch_id: batchId,
          sort_index: 0,
          error_code: ingestError.code,
          message: ingestError.message,
        })
      } catch {
        // Keep original ingest error as response cause.
      }
    }

    throw ingestError
  }
}
