import { NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const TRIAL_DAYS = 7

function parseAdminList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false
  const adminEmails = parseAdminList(process.env.ADMIN_EMAILS)
  const adminUserIds = parseAdminList(process.env.ADMIN_USER_IDS)
  const email = user.email?.toLowerCase()

  if (email && adminEmails.includes(email)) return true
  if (user.id && adminUserIds.includes(user.id.toLowerCase())) return true
  return false
}

async function findUserIdByEmail(admin: ReturnType<typeof createAdminSupabaseClient>, email: string) {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)

  const profile = profiles?.[0]
  if (profile?.id) return profile.id as string

  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const match = data?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    return match?.id ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const action = String(body.action || "").trim()
  const activationId = String(body.id || "").trim()

  if (!activationId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  const supabaseAuth = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const { data: activation, error } = await admin
    .from("activation_requests")
    .select("id, email, user_id, status")
    .eq("id", activationId)
    .single()

  if (error || !activation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  if (action === "reject") {
    const { error: updateError } = await admin
      .from("activation_requests")
      .update({ status: "rejected" })
      .eq("id", activationId)

    if (updateError) {
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  let userId = activation.user_id as string | null
  if (!userId && activation.email) {
    userId = await findUserIdByEmail(admin, activation.email)
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 })
  }

  const days = TRIAL_DAYS
  const now = new Date()

  const { data: entitlements } = await admin
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", userId)
    .limit(1)

  const current = entitlements?.[0]
  const currentExpiry = current?.pro_expires_at ? new Date(current.pro_expires_at) : null
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now
  const newExpires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  const nextPlan = current?.plan === "vip" ? "vip" : "trial_pro"

  const { error: upsertError } = await admin.from("entitlements").upsert({
    user_id: userId,
    plan: nextPlan,
    pro_expires_at: newExpires.toISOString(),
    updated_at: now.toISOString(),
  })

  if (upsertError) {
    return NextResponse.json({ ok: false, error: "entitlement_update_failed" }, { status: 500 })
  }

  const { error: activationUpdateError } = await admin
    .from("activation_requests")
    .update({
      status: "approved",
      user_id: userId,
      approved_at: now.toISOString(),
      expires_at: newExpires.toISOString(),
    })
    .eq("id", activationId)

  if (activationUpdateError) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
