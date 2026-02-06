import "server-only"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

const DEFAULT_BUCKET = process.env.XHS_ASSETS_BUCKET || "xhs-assets"

type UploadedAsset = {
  bucket: string
  path: string
  contentType: string
}

function getEnsureBucketStore() {
  const globalStore = globalThis as typeof globalThis & {
    __xhsAssetsBucketsEnsured?: Set<string>
  }
  if (!globalStore.__xhsAssetsBucketsEnsured) globalStore.__xhsAssetsBucketsEnsured = new Set()
  return globalStore.__xhsAssetsBucketsEnsured
}

async function ensureBucket(bucket: string) {
  const ensured = getEnsureBucketStore()
  if (ensured.has(bucket)) return

  const admin = createAdminSupabaseClient()

  const { data, error } = await admin.storage.getBucket(bucket)
  if (error || !data) {
    // Best-effort create. If it already exists, ignore.
    try {
      const created = await admin.storage.createBucket(bucket, { public: false })
      void created
    } catch {
      // ignore
    }
  }

  ensured.add(bucket)
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const trimmed = (dataUrl || "").trim()
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const contentType = match[1] || "application/octet-stream"
  const base64 = match[2] || ""
  try {
    const buffer = Buffer.from(base64, "base64")
    if (buffer.length <= 0) return null
    return { contentType, buffer }
  } catch {
    return null
  }
}

function pickExt(contentType: string): string {
  const ct = (contentType || "").toLowerCase()
  if (ct.includes("png")) return "png"
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg"
  if (ct.includes("webp")) return "webp"
  return "bin"
}

export async function uploadDataUrlAsset(opts: {
  userId: string
  draftId: string
  kind: "cover" | "qr"
  dataUrl: string
  bucket?: string
}): Promise<UploadedAsset> {
  const bucket = (opts.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
  await ensureBucket(bucket)

  const parsed = parseDataUrl(opts.dataUrl)
  if (!parsed) throw new Error("invalid_data_url")

  const stamp = Date.now()
  const ext = pickExt(parsed.contentType)
  const path = `xhs/${opts.userId}/${opts.draftId}/${opts.kind}_${stamp}.${ext}`

  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, parsed.buffer, { contentType: parsed.contentType, upsert: true })

  if (error) throw new Error(error.message || "upload_failed")

  return { bucket, path, contentType: parsed.contentType }
}

export async function uploadRemoteAsset(opts: {
  userId: string
  draftId: string
  kind: "cover" | "qr"
  url: string
  bucket?: string
}): Promise<UploadedAsset> {
  const bucket = (opts.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
  await ensureBucket(bucket)

  const u = new URL(opts.url)
  if (u.protocol !== "https:") throw new Error("only_https_allowed")

  const res = await fetch(u.toString(), { method: "GET" })
  if (!res.ok) throw new Error(`remote_fetch_failed:${res.status}`)

  const contentType = res.headers.get("content-type") || "application/octet-stream"
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length <= 0) throw new Error("remote_empty")

  const stamp = Date.now()
  const ext = pickExt(contentType)
  const path = `xhs/${opts.userId}/${opts.draftId}/${opts.kind}_${stamp}.${ext}`

  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(bucket).upload(path, buf, { contentType, upsert: true })
  if (error) throw new Error(error.message || "upload_failed")

  return { bucket, path, contentType }
}

export async function downloadAsset(opts: {
  bucket?: string
  path: string
}): Promise<{ arrayBuffer: ArrayBuffer; contentType: string }> {
  const bucket = (opts.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
  const admin = createAdminSupabaseClient()

  const { data, error } = await admin.storage.from(bucket).download(opts.path)
  if (error || !data) throw new Error(error?.message || "download_failed")

  // data is a Blob in Node 18+.
  const contentType = (data as unknown as { type?: string }).type || "application/octet-stream"
  const arrayBuffer = await data.arrayBuffer()
  return { arrayBuffer, contentType }
}

export function getXhsAssetsBucket(): string {
  return (process.env.XHS_ASSETS_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
}
