import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

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
    .select("id, status, zip_path")
    .eq("id", packId)
    .eq("user_id", user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  if (data.status !== "done" || !data.zip_path) {
    return NextResponse.json({ ok: false, error: "not_ready" }, { status: 409 })
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const { data: signed, error: signError } = await admin.storage
    .from("delivery-packs")
    .createSignedUrl(data.zip_path, 60 * 10)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: "sign_failed" }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
