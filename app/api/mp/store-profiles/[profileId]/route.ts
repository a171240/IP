import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  city: z.string().trim().max(40).optional().nullable(),
  district: z.string().trim().max(40).optional().nullable(),
  landmark: z.string().trim().max(80).optional().nullable(),
  shop_type: z.string().trim().max(40).optional().nullable(),
  main_offer_name: z.string().trim().max(80).optional().nullable(),
  main_offer_duration_min: z.number().int().min(10).max(240).optional().nullable(),
  included_steps: z.any().optional().nullable(),
  promises: z.any().optional().nullable(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const { data, error } = await supabase
    .from("store_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, profile: data })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const now = new Date().toISOString()
  const p = parsed.data

  const { data, error } = await supabase
    .from("store_profiles")
    .update({ ...p, updated_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const { error } = await supabase.from("store_profiles").delete().eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ ok: false, error: error.message || "delete_failed" }, { status: 500 })

  return NextResponse.json({ ok: true })
}

