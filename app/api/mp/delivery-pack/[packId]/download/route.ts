import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("delivery_packs")
    .select("id, status, pdf_path")
    .eq("id", packId)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  if (data.status !== "done" || !data.pdf_path) {
    return NextResponse.json({ ok: false, error: "not_ready" }, { status: 409 })
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const { data: file, error: downloadError } = await admin.storage.from("delivery-packs").download(data.pdf_path)
  if (downloadError || !file) {
    return NextResponse.json({ ok: false, error: "download_failed" }, { status: 500 })
  }

  const content = await file.arrayBuffer()
  const match = data.pdf_path.match(/(\\d{8})\\.pdf$/)
  const displayDate = match?.[1]
  const displayName = displayDate
    ? `交付包_内容交付系统诊断_${displayDate}.pdf`
    : "交付包_内容交付系统诊断.pdf"

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${encodeURIComponent(displayName)}\"`,
      "Cache-Control": "no-store",
    },
  })
}
