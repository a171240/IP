import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { downloadAsset, getXhsAssetsBucket } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

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
    .select("cover_storage_path, cover_content_type")
    .eq("id", id)
    .maybeSingle()

  if (error || !draft?.cover_storage_path) {
    return new Response("not found", { status: 404 })
  }

  try {
    const bucket = getXhsAssetsBucket()
    const downloaded = await downloadAsset({ bucket, path: draft.cover_storage_path })
    const contentType = draft.cover_content_type || downloaded.contentType || "application/octet-stream"

    return new Response(downloaded.arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    return new Response("not found", { status: 404 })
  }
}
