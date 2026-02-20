import type { ContentPipelineErrorCode, ExtractedPayload, SourcePlatformId } from "@/lib/types/content-pipeline"

export type IngestErrorCode = Extract<
  ContentPipelineErrorCode,
  "unsupported_platform" | "invalid_link" | "extract_failed" | "private_or_deleted_content"
>

export type JsonObject = Record<string, unknown>

export type NormalizedSource = {
  input_url: string
  normalized_url: string
  platform: SourcePlatformId
}

export type ExtractedRecord = {
  source_url: string
  extracted: ExtractedPayload
  raw_payload: JsonObject
}

export type ProfileAnalysis = {
  topic_clusters: string[]
  hook_patterns: string[]
  script_pack: string[]
}

export type AuthUser = {
  id: string
  email?: string | null
  user_metadata?: unknown
}
