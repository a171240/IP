import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { downloadAsset, getXhsAssetsBucket } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

function isAllowedRemoteQrUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return false

    // Conservative allow-list: avoid turning this into an open proxy.
    const host = u.hostname.toLowerCase()
    return host === "note.limyai.com" || host.endsWith(".limyai.com") || host === "limyai.com"
  } catch {
    return false
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
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
    .select("publish_qr_storage_path, publish_qr_content_type, publish_qr_url")
    .eq("id", id)
    .maybeSingle()

  if (error || !draft) {
    return new Response("not found", { status: 404 })
  }

  // 1) Prefer stored asset.
  if (draft.publish_qr_storage_path) {
    try {
      const bucket = getXhsAssetsBucket()
      const downloaded = await downloadAsset({ bucket, path: draft.publish_qr_storage_path })
      const contentType = draft.publish_qr_content_type || downloaded.contentType || "application/octet-stream"

      return new Response(downloaded.arrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=300",
        },
      })
    } catch {
      // continue fallback
    }
  }

  // 2) Fallback: proxy the upstream QR URL if allowed.
  if (typeof draft.publish_qr_url === "string" && draft.publish_qr_url && isAllowedRemoteQrUrl(draft.publish_qr_url)) {
    try {
      const res = await fetch(draft.publish_qr_url, { method: "GET" })
      if (!res.ok) return new Response("not found", { status: 404 })

      const ab = await res.arrayBuffer()
      const contentType = res.headers.get("content-type") || "image/png"

      return new Response(ab, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      })
    } catch {
      return new Response("not found", { status: 404 })
    }
  }

  return new Response("not found", { status: 404 })
}
