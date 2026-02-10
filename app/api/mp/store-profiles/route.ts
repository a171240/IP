import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

async function ensureProfileRowExists(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  user: { id: string; email?: string | null; user_metadata?: unknown }
) {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (!error && data?.id) return
  if (error?.code !== "PGRST116") return

  await supabase.from("profiles").insert({
    id: user.id,
    email: user.email,
    nickname: (user.user_metadata as Record<string, unknown> | null)?.nickname || user.email?.split("@")[0] || "User",
    avatar_url: (user.user_metadata as Record<string, unknown> | null)?.avatar_url || null,
    plan: "free",
    credits_balance: 30,
    credits_unlimited: false,
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  city: z.string().trim().max(40).optional(),
  district: z.string().trim().max(40).optional(),
  landmark: z.string().trim().max(80).optional(),
  shop_type: z.string().trim().max(40).optional(),

  main_offer_name: z.string().trim().max(80).optional(),
  main_offer_duration_min: z.number().int().min(10).max(240).optional(),
  included_steps: z.any().optional(),
  promises: z.any().optional(),
})

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
    .from("store_profiles")
    .select("id, created_at, updated_at, name, city, district, landmark, shop_type, main_offer_name, main_offer_duration_min, promises")
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

  // Prevent FK failures (store_profiles.user_id -> profiles.id) for first-time silent logins.
  try {
    await ensureProfileRowExists(supabase, user)
  } catch {
    // ignore
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const now = new Date().toISOString()
  const p = parsed.data

  const { data: created, error } = await supabase
    .from("store_profiles")
    .insert({
      user_id: user.id,
      name: p.name,
      city: p.city || null,
      district: p.district || null,
      landmark: p.landmark || null,
      shop_type: p.shop_type || null,
      main_offer_name: p.main_offer_name || null,
      main_offer_duration_min: typeof p.main_offer_duration_min === "number" ? p.main_offer_duration_min : null,
      included_steps: p.included_steps ?? null,
      promises: p.promises ?? null,
      updated_at: now,
    })
    .select("id, created_at")
    .single()

  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message || "insert_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profile: created })
}
