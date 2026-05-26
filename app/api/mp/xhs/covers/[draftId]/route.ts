import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { downloadAsset, getXhsAssetsBucket, signXhsAssetUrl } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

function parseRange(rangeHeader: string | null, total: number) {
  if (!rangeHeader) return null
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null

  let start = match[1] ? Number(match[1]) : 0
  let end = match[2] ? Number(match[2]) : total - 1

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2])
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(total - suffixLength, 0)
    end = total - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) return null
  return { start, end: Math.min(end, total - 1) }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = (draftId || "").trim()
  if (!id) return new Response("missing draftId", { status: 400 })

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const { data: draft, error } = await admin
    .from("xhs_drafts")
    .select("cover_storage_path, cover_content_type")
    .eq("id", id)
    .maybeSingle()

  if (error || !draft?.cover_storage_path) {
    return new Response("not found", { status: 404 })
  }

  try {
    const bucket = getXhsAssetsBucket()
    const signedUrl = await signXhsAssetUrl({ bucket, path: draft.cover_storage_path })
    return new Response(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    // Fall through to the byte-serving fallback below.
  }

  try {
    const bucket = getXhsAssetsBucket()
    const downloaded = await downloadAsset({ bucket, path: draft.cover_storage_path })
    const contentType = draft.cover_content_type || downloaded.contentType || "application/octet-stream"
    const total = downloaded.arrayBuffer.byteLength
    const range = parseRange(request.headers.get("range"), total)

    if (request.headers.get("range") && !range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${total}`,
          "Cache-Control": "private, no-store",
        },
      })
    }

    if (range) {
      const chunk = downloaded.arrayBuffer.slice(range.start, range.end + 1)
      return new Response(chunk, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
        },
      })
    }

    return new Response(downloaded.arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return new Response("not found", { status: 404 })
  }
}
