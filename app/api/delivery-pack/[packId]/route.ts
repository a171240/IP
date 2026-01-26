import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  const { packId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("delivery_packs")
    .select("id, status, created_at, zip_path, error_message, output_json")
    .eq("id", packId)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  const thinkingSummary = Array.isArray((data as { output_json?: { thinking_summary?: unknown } }).output_json?.thinking_summary)
    ? (data as { output_json?: { thinking_summary?: string[] } }).output_json?.thinking_summary
    : null

  return NextResponse.json({
    ok: true,
    packId: data.id,
    status: data.status,
    createdAt: data.created_at,
    zipPath: data.zip_path,
    errorMessage: data.error_message,
    thinkingSummary,
  })
}
