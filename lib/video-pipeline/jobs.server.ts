import "server-only"

import { randomUUID } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { doubaoTts } from "@/lib/voice-coach/speech/doubao.server"
import { getVideoPipelineBucket, signVideoPipelineAsset, uploadVideoPipelineAsset } from "@/lib/video-pipeline/storage.server"

export type VideoJobStatus = "queued" | "running" | "done" | "failed"
export type VideoPipelineErrorCode = "avatar_input_invalid" | "video_render_failed"

export const VIDEO_RENDER_MAX_RETRY = 3

type VideoJobRecord = {
  id: string
  user_id: string
  rewrite_id: string
  duration_profile: string
  avatar_profile_id: string | null
  product_assets: string[]
  provider: string
  provider_job_id: string | null
  status: VideoJobStatus
  progress: number
  retry_count: number
  audio_storage_path: string | null
  video_storage_path: string | null
  error: string | null
  created_at: string
  updated_at: string
}

type RewriteRow = {
  id: string
  status: string | null
  result_script: string | null
  result_body: string | null
  result_title: string | null
}

type AvatarProfileRow = {
  id: string
  name: string | null
  boss_drive_video_path: string | null
  boss_portrait_path: string | null
}

type RenderAttemptResult = {
  audioStoragePath: string
  videoStoragePath: string
}

type UpdatePatch = Partial<{
  provider: string
  provider_job_id: string | null
  status: VideoJobStatus
  progress: number
  retry_count: number
  audio_storage_path: string | null
  video_storage_path: string | null
  error: string | null
}>

export type VideoJobView = {
  status: VideoJobStatus
  progress: number
  video_url: string | null
  error: string | null
}

export class VideoPipelineError extends Error {
  code: VideoPipelineErrorCode

  constructor(code: VideoPipelineErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const VIDEO_JOB_SELECT = [
  "id",
  "user_id",
  "rewrite_id",
  "duration_profile",
  "avatar_profile_id",
  "product_assets",
  "provider",
  "provider_job_id",
  "status",
  "progress",
  "retry_count",
  "audio_storage_path",
  "video_storage_path",
  "error",
  "created_at",
  "updated_at",
].join(", ")

function nowIso() {
  return new Date().toISOString()
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function safeNullableString(value: unknown): string | null {
  const text = safeString(value).trim()
  return text ? text : null
}

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : 0
}

function clampProgress(value: unknown): number {
  const n = safeNumber(value)
  if (n <= 0) return 0
  if (n >= 1) return 1
  return Number(n.toFixed(4))
}

function normalizeRetryCount(value: unknown): number {
  const n = Math.floor(safeNumber(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function normalizeStatus(value: unknown): VideoJobStatus {
  const raw = safeString(value).trim()
  if (raw === "queued" || raw === "running" || raw === "done" || raw === "failed") return raw
  return "queued"
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => safeString(item).trim()).filter(Boolean)
}

function toRecord(data: unknown): VideoJobRecord {
  const row = (data || {}) as Record<string, unknown>
  return {
    id: safeString(row.id),
    user_id: safeString(row.user_id),
    rewrite_id: safeString(row.rewrite_id),
    duration_profile: safeString(row.duration_profile || "15_25s"),
    avatar_profile_id: safeNullableString(row.avatar_profile_id),
    product_assets: asStringArray(row.product_assets),
    provider: safeString(row.provider || "volc"),
    provider_job_id: safeNullableString(row.provider_job_id),
    status: normalizeStatus(row.status),
    progress: clampProgress(row.progress),
    retry_count: normalizeRetryCount(row.retry_count),
    audio_storage_path: safeNullableString(row.audio_storage_path),
    video_storage_path: safeNullableString(row.video_storage_path),
    error: safeNullableString(row.error),
    created_at: safeString(row.created_at),
    updated_at: safeString(row.updated_at),
  }
}

function retryBaseMs() {
  const raw = Number(process.env.VIDEO_RENDER_RETRY_BASE_MS || 2000)
  if (!Number.isFinite(raw)) return 2000
  return Math.max(500, Math.round(raw))
}

function retryDelayMs(retryCount: number) {
  if (retryCount <= 0) return 0
  const exp = Math.max(0, retryCount - 1)
  return retryBaseMs() * 2 ** exp
}

function boolEnv(name: string, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === "") return fallback
  const value = raw.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function missingRequiredEnv(names: string[]) {
  return names.filter((name) => !safeString(process.env[name]).trim())
}

type ProviderPreflight = {
  videoOutputPath: string | null
  allowAudioOnlySuccess: boolean
}

function resolveProviderPreflight(avatarProfile: AvatarProfileRow): ProviderPreflight {
  const missingSpeech = missingRequiredEnv(["VOLC_SPEECH_APP_ID", "VOLC_SPEECH_ACCESS_TOKEN"])
  if (missingSpeech.length > 0) {
    throw new VideoPipelineError(
      "video_render_failed",
      `volc_speech_env_missing(missing:${missingSpeech.join(",")})`,
    )
  }

  const avatarVideoPath = safeNullableString(avatarProfile.boss_drive_video_path)
  const mockVideoUrl = safeNullableString(process.env.VIDEO_PIPELINE_MOCK_VIDEO_URL)
  const allowAudioOnlySuccess = boolEnv("VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS", false)

  if (avatarVideoPath) {
    return {
      videoOutputPath: avatarVideoPath,
      allowAudioOnlySuccess,
    }
  }

  if (mockVideoUrl) {
    return {
      videoOutputPath: mockVideoUrl,
      allowAudioOnlySuccess,
    }
  }

  if (!allowAudioOnlySuccess) {
    throw new VideoPipelineError(
      "video_render_failed",
      "volc_video_provider_not_configured(set:store_profiles.boss_drive_video_path_or_VIDEO_PIPELINE_MOCK_VIDEO_URL_or_VIDEO_PIPELINE_ALLOW_AUDIO_ONLY_SUCCESS=true)",
    )
  }

  return {
    videoOutputPath: null,
    allowAudioOnlySuccess,
  }
}

function convertErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const text = error.message.trim()
    return text || "video_render_failed"
  }
  const text = safeString(error).trim()
  return text || "video_render_failed"
}

export function normalizeVideoPipelineError(error: unknown): VideoPipelineError {
  if (error instanceof VideoPipelineError) return error
  const message = convertErrorMessage(error)
  if (message.startsWith("avatar_input_invalid:")) {
    return new VideoPipelineError("avatar_input_invalid", message.replace(/^avatar_input_invalid:/, "").trim())
  }
  return new VideoPipelineError("video_render_failed", message)
}

async function updateVideoJob(opts: {
  supabase: SupabaseClient
  userId: string
  jobId: string
  patch: UpdatePatch
  touchUpdatedAt?: boolean
}) {
  const shouldTouchUpdatedAt = opts.touchUpdatedAt !== false
  const payload = Object.fromEntries(
    Object.entries({
      ...opts.patch,
      ...(shouldTouchUpdatedAt ? { updated_at: nowIso() } : {}),
    }).filter(([, value]) => value !== undefined),
  )

  const { data, error } = await opts.supabase
    .from("video_render_jobs")
    .update(payload)
    .eq("id", opts.jobId)
    .eq("user_id", opts.userId)
    .select(VIDEO_JOB_SELECT)
    .single()

  if (error || !data) {
    throw new VideoPipelineError("video_render_failed", error?.message || "video_job_update_failed")
  }

  return toRecord(data)
}

function buildProviderJobId(jobId: string, attempt: number) {
  return `volc-${jobId}-attempt-${attempt}-${randomUUID()}`
}

function extractNarrationText(rewrite: RewriteRow) {
  const source = [rewrite.result_script, rewrite.result_body, rewrite.result_title]
    .map((item) => safeString(item).trim())
    .find(Boolean)
  if (!source) {
    throw new VideoPipelineError("video_render_failed", "rewrite_script_missing")
  }
  return source.slice(0, 800)
}

async function loadRewrite(opts: { supabase: SupabaseClient; userId: string; rewriteId: string }) {
  const { data, error } = await opts.supabase
    .from("content_rewrites")
    .select("id, status, result_script, result_body, result_title")
    .eq("id", opts.rewriteId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error) {
    throw new VideoPipelineError("video_render_failed", error.message || "rewrite_query_failed")
  }
  if (!data?.id) {
    throw new VideoPipelineError("video_render_failed", "rewrite_not_found")
  }

  return data as RewriteRow
}

async function loadAvatarProfile(opts: { supabase: SupabaseClient; userId: string; avatarProfileId: string }) {
  const { data, error } = await opts.supabase
    .from("store_profiles")
    .select("id, name, boss_drive_video_path, boss_portrait_path")
    .eq("id", opts.avatarProfileId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error) {
    throw new VideoPipelineError("video_render_failed", error.message || "avatar_query_failed")
  }
  if (!data?.id) {
    throw new VideoPipelineError("avatar_input_invalid", "avatar_profile_not_found")
  }

  const profile = data as AvatarProfileRow
  if (!safeString(profile.boss_drive_video_path).trim() && !safeString(profile.boss_portrait_path).trim()) {
    throw new VideoPipelineError("avatar_input_invalid", "avatar_profile_assets_missing")
  }

  return profile
}

async function runSingleRenderAttempt(opts: {
  supabase: SupabaseClient
  userId: string
  job: VideoJobRecord
  attempt: number
}) {
  const rewrite = await loadRewrite({
    supabase: opts.supabase,
    userId: opts.userId,
    rewriteId: opts.job.rewrite_id,
  })

  const avatarProfileId = safeString(opts.job.avatar_profile_id)
  if (!avatarProfileId) {
    throw new VideoPipelineError("avatar_input_invalid", "avatar_profile_missing")
  }

  const avatarProfile = await loadAvatarProfile({
    supabase: opts.supabase,
    userId: opts.userId,
    avatarProfileId,
  })

  const providerConfig = resolveProviderPreflight(avatarProfile)

  const narration = extractNarrationText(rewrite)
  const tts = await doubaoTts({
    text: narration,
    uid: opts.userId,
  })

  if (!tts.audio || tts.audio.length <= 0) {
    throw new VideoPipelineError("video_render_failed", "volc_tts_empty_audio")
  }

  const audioPath = `video-pipeline/${opts.userId}/${opts.job.id}/attempt-${opts.attempt}-${Date.now()}.mp3`
  await uploadVideoPipelineAsset({
    path: audioPath,
    data: tts.audio,
    contentType: "audio/mpeg",
  })

  const videoPath =
    providerConfig.videoOutputPath || (providerConfig.allowAudioOnlySuccess ? audioPath : null)
  if (!videoPath) {
    throw new VideoPipelineError("video_render_failed", "volc_video_provider_not_configured")
  }

  return {
    audioStoragePath: audioPath,
    videoStoragePath: videoPath,
  } satisfies RenderAttemptResult
}

export async function getVideoRenderJobById(opts: {
  supabase: SupabaseClient
  userId: string
  jobId: string
}) {
  const { data, error } = await opts.supabase
    .from("video_render_jobs")
    .select(VIDEO_JOB_SELECT)
    .eq("id", opts.jobId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error) {
    throw new VideoPipelineError("video_render_failed", error.message || "video_job_query_failed")
  }
  if (!data) return null

  return toRecord(data)
}

export async function advanceVideoRenderJob(opts: {
  supabase: SupabaseClient
  userId: string
  job: VideoJobRecord
}) {
  let job = opts.job

  if (job.status === "done" || job.status === "failed") {
    return job
  }

  if (job.status === "queued") {
    job = await updateVideoJob({
      supabase: opts.supabase,
      userId: opts.userId,
      jobId: job.id,
      patch: {
        provider: "volc",
        status: "running",
        progress: Math.max(job.progress, 0.05),
        error: null,
      },
    })
  }

  if (job.status !== "running") return job

  const delay = retryDelayMs(job.retry_count)
  if (delay > 0) {
    const elapsed = Math.max(0, Date.now() - new Date(job.updated_at || 0).getTime())
    const delayRatio = delay <= 0 ? 1 : Math.min(1, elapsed / delay)
    const baseProgress = Math.max(job.progress, Math.min(0.94, 0.2 + job.retry_count * 0.15 + delayRatio * 0.05))
    job = await updateVideoJob({
      supabase: opts.supabase,
      userId: opts.userId,
      jobId: job.id,
      patch: {
        progress: baseProgress,
        retry_count: job.retry_count,
        error: job.error,
      },
      touchUpdatedAt: false,
    })
    if (elapsed < delay) {
      return job
    }
  }

  const attempt = job.retry_count + 1
  const providerJobId = buildProviderJobId(job.id, attempt)
  job = await updateVideoJob({
    supabase: opts.supabase,
    userId: opts.userId,
    jobId: job.id,
    patch: {
      provider: "volc",
      provider_job_id: providerJobId,
      status: "running",
      progress: Math.max(job.progress, Math.min(0.95, 0.2 + job.retry_count * 0.1)),
      error: null,
    },
  })

  try {
    const attemptResult = await runSingleRenderAttempt({
      supabase: opts.supabase,
      userId: opts.userId,
      job,
      attempt,
    })

    return await updateVideoJob({
      supabase: opts.supabase,
      userId: opts.userId,
      jobId: job.id,
      patch: {
        provider: "volc",
        provider_job_id: providerJobId,
        status: "done",
        progress: 1,
        audio_storage_path: attemptResult.audioStoragePath,
        video_storage_path: attemptResult.videoStoragePath,
        error: null,
      },
    })
  } catch (error) {
    const normalized = normalizeVideoPipelineError(error)
    const errorText = `${normalized.code}:${normalized.message}`

    if (normalized.code === "avatar_input_invalid") {
      return await updateVideoJob({
        supabase: opts.supabase,
        userId: opts.userId,
        jobId: job.id,
        patch: {
          provider: "volc",
          provider_job_id: providerJobId,
          status: "failed",
          progress: Math.max(job.progress, 0.99),
          audio_storage_path: job.audio_storage_path,
          error: errorText,
        },
      })
    }

    if (job.retry_count < VIDEO_RENDER_MAX_RETRY) {
      return await updateVideoJob({
        supabase: opts.supabase,
        userId: opts.userId,
        jobId: job.id,
        patch: {
          provider: "volc",
          provider_job_id: providerJobId,
          status: "running",
          retry_count: job.retry_count + 1,
          progress: Math.max(job.progress, Math.min(0.95, 0.25 + (job.retry_count + 1) * 0.15)),
          audio_storage_path: job.audio_storage_path,
          error: errorText,
        },
      })
    }

    return await updateVideoJob({
      supabase: opts.supabase,
      userId: opts.userId,
      jobId: job.id,
      patch: {
        provider: "volc",
        provider_job_id: providerJobId,
        status: "failed",
        progress: Math.max(job.progress, 0.99),
        audio_storage_path: job.audio_storage_path,
        error: errorText,
      },
    })
  }
}

export async function toVideoJobView(job: VideoJobRecord): Promise<VideoJobView> {
  const status = normalizeStatus(job.status)
  const progress = clampProgress(job.progress)
  let videoUrl: string | null = null

  if (status === "done" && job.video_storage_path) {
    try {
      videoUrl = await signVideoPipelineAsset(job.video_storage_path, 3600, getVideoPipelineBucket())
    } catch {
      videoUrl = null
    }
  }

  const rawError = safeNullableString(job.error)
  const error =
    status === "done" && !videoUrl
      ? rawError || "video_render_failed:video_url_unavailable"
      : status === "failed"
        ? rawError || "video_render_failed:render_failed"
        : rawError

  return {
    status,
    progress,
    video_url: videoUrl,
    error: error || null,
  }
}
