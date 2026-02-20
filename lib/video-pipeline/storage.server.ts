import "server-only"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

const DEFAULT_VIDEO_PIPELINE_BUCKET = "video-render-assets"

function resolveBucket(): string {
  const bucket = (process.env.VIDEO_RENDER_ASSETS_BUCKET || DEFAULT_VIDEO_PIPELINE_BUCKET).trim()
  return bucket || DEFAULT_VIDEO_PIPELINE_BUCKET
}

function ensuredBucketStore() {
  const store = globalThis as typeof globalThis & { __videoPipelineBucketsEnsured?: Set<string> }
  if (!store.__videoPipelineBucketsEnsured) {
    store.__videoPipelineBucketsEnsured = new Set()
  }
  return store.__videoPipelineBucketsEnsured
}

async function ensureBucket(bucket: string) {
  const ensured = ensuredBucketStore()
  if (ensured.has(bucket)) return

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.getBucket(bucket)
  if (error || !data) {
    try {
      await admin.storage.createBucket(bucket, { public: false })
    } catch {
      // Ignore "already exists" or transient errors; upload path will report a concrete error later.
    }
  }

  ensured.add(bucket)
}

export async function uploadVideoPipelineAsset(opts: {
  path: string
  data: Buffer
  contentType: string
  bucket?: string
}) {
  const bucket = (opts.bucket || resolveBucket()).trim() || resolveBucket()
  await ensureBucket(bucket)

  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(bucket).upload(opts.path, opts.data, {
    contentType: opts.contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message || "video_asset_upload_failed")

  return { bucket, path: opts.path }
}

export async function signVideoPipelineAsset(path: string, expiresInSeconds = 3600, bucket?: string) {
  const target = (path || "").trim()
  if (!target) return null
  if (/^https?:\/\//i.test(target)) return target

  const resolvedBucket = (bucket || resolveBucket()).trim() || resolveBucket()
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.from(resolvedBucket).createSignedUrl(target, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message || "video_asset_sign_failed")
  return data.signedUrl
}

export function getVideoPipelineBucket() {
  return resolveBucket()
}
