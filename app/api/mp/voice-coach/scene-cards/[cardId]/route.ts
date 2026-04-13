import { NextRequest, NextResponse } from "next/server"

import { normalizeSceneCardInput, voiceCoachSceneCardPayloadSchema } from "@/lib/voice-coach/session-context"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params
  const id = String(cardId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_card_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const { data, error } = await supabase
    .from("voice_coach_scene_cards")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, card: data })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params
  const id = String(cardId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_card_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = voiceCoachSceneCardPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const payload = normalizeSceneCardInput(parsed.data)
  const { data, error } = await supabase
    .from("voice_coach_scene_cards")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 })
  return NextResponse.json({ ok: true, card: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params
  const id = String(cardId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_card_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const { error } = await supabase
    .from("voice_coach_scene_cards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ ok: false, error: error.message || "delete_failed" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
