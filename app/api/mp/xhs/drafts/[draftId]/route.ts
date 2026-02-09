import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = (draftId || "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_draft_id" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("xhs_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  const coverUrl = data.cover_storage_path ? `/api/mp/xhs/covers/${data.id}` : null
  const qrUrl = data.publish_qr_url || data.publish_qr_storage_path ? `/api/mp/xhs/qrs/${data.id}` : null

  return NextResponse.json({ ok: true, draft: { ...data, cover_url: coverUrl, qr_url: qrUrl } })
}
