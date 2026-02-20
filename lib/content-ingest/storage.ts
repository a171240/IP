import type { User } from "@supabase/supabase-js"

import type { IngestErrorCode, JsonObject } from "@/lib/content-ingest/types"
import type { ExtractedPayload, IngestMode, SourcePlatformId } from "@/lib/types/content-pipeline"

type SupabaseClientForRequest = {
  from: (table: string) => {
    select: (columns?: string) => any
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => any
  }
}

type PersistContentSourceOptions = {
  supabase: SupabaseClientForRequest
  user: User
  source_mode: IngestMode
  platform: SourcePlatformId
  source_url: string
  status: "ready" | "failed"
  batch_id: string | null
  sort_index: number
  extracted: ExtractedPayload | null
  raw_payload: JsonObject
  error_code: IngestErrorCode | null
}

export type PersistedContentSource = {
  source_id: string
  title: string
}

function safeNickname(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | null
  const nickname = typeof metadata?.nickname === "string" ? metadata.nickname.trim() : ""
  if (nickname) return nickname
  if (user.email) {
    const candidate = user.email.split("@")[0]?.trim()
    if (candidate) return candidate
  }
  return "User"
}

export async function ensureProfileRowExists(supabase: SupabaseClientForRequest, user: User): Promise<void> {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()

  if (data?.id) return
  if (error && error.code !== "PGRST116") {
    throw new Error(error.message || "profile_query_failed")
  }

  const { error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      nickname: safeNickname(user),
      avatar_url: null,
      plan: "free",
      credits_balance: 30,
      credits_unlimited: false,
    })

  if (createError && createError.code !== "23505") {
    throw new Error(createError.message || "profile_create_failed")
  }
}

export async function persistContentSource(options: PersistContentSourceOptions): Promise<PersistedContentSource> {
  const {
    supabase,
    user,
    source_mode,
    platform,
    source_url,
    status,
    batch_id,
    sort_index,
    extracted,
    raw_payload,
    error_code,
  } = options

  await ensureProfileRowExists(supabase, user)

  const payload: Record<string, unknown> = {
    user_id: user.id,
    source_mode,
    platform,
    source_url,
    status,
    batch_id,
    sort_index,
    title: extracted?.title ?? null,
    text_content: extracted?.text ?? null,
    images: extracted?.images ?? [],
    video_url: extracted?.video_url ?? null,
    author: extracted?.author ?? null,
    meta: extracted?.meta ?? {},
    raw_payload,
    error_code: status === "failed" ? error_code : null,
  }

  const { data, error } = await supabase
    .from("content_sources")
    .insert(payload)
    .select("id,title")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || "content_source_insert_failed")
  }

  return {
    source_id: data.id as string,
    title: typeof data.title === "string" ? data.title : "",
  }
}
