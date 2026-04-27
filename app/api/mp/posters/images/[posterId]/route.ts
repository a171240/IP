import { NextRequest } from "next/server"

import { downloadAsset, getXhsAssetsBucket } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

function isSafePosterId(id: string) {
  return /^[0-9a-fA-F-]{32,40}$/.test(id)
}

function metadataPath(posterId: string) {
  return `posters/index/${posterId}.json`
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ posterId: string }> }) {
  const { posterId } = await params
  const id = (posterId || "").trim()
  if (!id || !isSafePosterId(id)) return new Response("missing posterId", { status: 400 })

  const bucket = getXhsAssetsBucket()

  try {
    const metaAsset = await downloadAsset({ bucket, path: metadataPath(id) })
    const metaText = Buffer.from(metaAsset.arrayBuffer).toString("utf8")
    const meta = JSON.parse(metaText) as { path?: string; contentType?: string }
    if (!meta.path) return new Response("not found", { status: 404 })

    const image = await downloadAsset({ bucket, path: meta.path })
    const contentType = meta.contentType || image.contentType || "application/octet-stream"

    return new Response(image.arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return new Response("not found", { status: 404 })
  }
}
