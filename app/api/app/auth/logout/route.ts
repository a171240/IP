import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录", code: "auth_required" }, { status: 401 })
  }

  await supabase.auth.signOut().catch(() => {
    // APP logout is best-effort server-side; local token clearing is authoritative.
  })

  return NextResponse.json({ ok: true })
}
