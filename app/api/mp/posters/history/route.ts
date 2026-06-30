import { NextRequest, NextResponse } from "next/server"

import { resolveBillingContext } from "@/lib/xhs/proxy.server"
import { downloadAsset, getXhsAssetsBucket } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

type PosterGenerationRow = {
  id: string
  created_at?: string | null
  mode?: string | null
  template_id?: string | null
  image_bucket?: string | null
  size?: string | null
  resolution?: string | null
  content_type?: string | null
}

function imageUrlForPoster(posterId: string) {
  return `/api/mp/posters/images/${posterId}`
}

function metadataPath(posterId: string) {
  return `posters/index/${posterId}.json`
}

async function loadPosterMetadata(opts: { bucket: string; posterId: string; userId: string }) {
  try {
    const asset = await downloadAsset({ bucket: opts.bucket, path: metadataPath(opts.posterId) })
    const text = Buffer.from(asset.arrayBuffer).toString("utf8")
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (parsed.userId && parsed.userId !== opts.userId) return null
    return parsed
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const url = new URL(request.url)
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10) || 10))

  const { data, error } = await billing.ctx.supabase
    .from("poster_generations")
    .select("id, created_at, mode, template_id, image_bucket, size, resolution, content_type")
    .eq("user_id", billing.ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    const msg = error.message || ""
    if (msg.includes("poster_generations") || msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, posters: [], warning: "poster_history_not_initialized" })
    }
    return NextResponse.json({ ok: false, error: msg || "query_failed" }, { status: 500 })
  }

  const posters = await Promise.all(
    ((data || []) as PosterGenerationRow[]).map(async (item) => {
      const meta = await loadPosterMetadata({
        bucket: item.image_bucket || getXhsAssetsBucket(),
        posterId: item.id,
        userId: billing.ctx.userId,
      })

      return {
        posterId: item.id,
        createdAt: item.created_at,
        mode: item.mode,
        templateId: item.template_id,
        size: item.size,
        resolution: item.resolution,
        contentType: item.content_type,
        imageUrl: imageUrlForPoster(item.id),
        fields: meta?.fields || null,
        fieldSources: meta?.fieldSources || null,
        layoutPresetId: meta?.layoutPresetId || null,
        layoutPreset: meta?.layoutPreset || null,
        visualStylePresetId: meta?.visualStylePresetId || null,
        visualStylePreset: meta?.visualStylePreset || null,
        posterPlan: meta?.posterPlan || null,
        visibleCopy: meta?.visibleCopy || null,
        hiddenContext: meta?.hiddenContext || null,
        qrState: meta?.qrState || null,
        qrAssetRef: meta?.qrAssetRef || null,
        assetRefs: Array.isArray(meta?.assetRefs) ? meta.assetRefs : [],
      }
    })
  )

  return NextResponse.json({
    ok: true,
    posters,
  })
}
