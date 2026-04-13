import { NextRequest, NextResponse } from "next/server"

import {
  normalizeCustomerProfileInput,
  voiceCoachCustomerProfilePayloadSchema,
} from "@/lib/voice-coach/session-context"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitRaw = url.searchParams.get("limit")
  const limit = Math.min(50, Math.max(1, Number(limitRaw || 20) || 20))

  const { data, error } = await supabase
    .from("voice_coach_customer_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profiles: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = voiceCoachCustomerProfilePayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const payload = normalizeCustomerProfileInput(parsed.data)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from("voice_coach_customer_profiles")
    .insert({
      user_id: user.id,
      ...payload,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || "insert_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profile: data })
}
