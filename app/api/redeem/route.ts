import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type RateEntry = { count: number; resetAt: number }

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

const rateLimitMap: Map<string, RateEntry> = (() => {
  const globalAny = globalThis as typeof globalThis & { __redeemRateLimit?: Map<string, RateEntry> }
  if (!globalAny.__redeemRateLimit) {
    globalAny.__redeemRateLimit = new Map()
  }
  return globalAny.__redeemRateLimit
})()

const redeemSchema = z.object({
  code: z.string().trim().min(6).max(128),
  email: z.string().trim().email().optional(),
})

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    process.env.IPgongchang_SUPABASE_URL ||
    ""
  )
}

function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    process.env.IPgongchang_SUPABASE_ANON_KEY ||
    process.env.IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    ""
  )
}

function getRedeemSecret(): string {
  return process.env.REDEEM_LOGIN_SECRET || process.env.WECHAT_LOGIN_SECRET || ""
}

function buildRedeemPassword(secret: string, email: string) {
  return createHmac("sha256", secret).update(email).digest("hex")
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return (request as { ip?: string }).ip || "unknown"
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count += 1
  return true
}

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase()
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase()
  const { data, error } = await admin
    .schema("auth")
    .from("users")
    .select("id, email")
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (!error && data?.id) {
    return data.id
  }

  // Fallback: some Supabase projects do not expose auth schema via PostgREST.
  try {
    let page = 1
    const perPage = 200
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage })
      if (listError) return null
      const match = list.users.find((user) => user.email?.toLowerCase() === normalizedEmail)
      if (match?.id) return match.id
      if (!list.nextPage) break
      page = list.nextPage
    }
  } catch {
    // ignore and fall through
  }

  return null
}

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  if (!checkRateLimit(ipAddress)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim() : ""
  const validation = redeemSchema.safeParse({ ...body, email: rawEmail || undefined })
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
  }

  const code = normalizeCode(validation.data.code)
  const email = validation.data.email ? validation.data.email.toLowerCase() : ""

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  // 先校验兑换码有效性，避免无效码也创建账号
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: precheckRows, error: precheckError } = await admin
    .from("redemption_codes")
    .select("code, status, expires_at")
    .eq("code", code)
    .limit(1)

  if (precheckError) {
    return NextResponse.json({ ok: false, error: "redeem_failed" }, { status: 500 })
  }

  const precheck = precheckRows?.[0]

  if (!precheck) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 404 })
  }

  if (precheck.expires_at && new Date(precheck.expires_at) <= now) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 410 })
  }

  if (precheck.status && precheck.status !== "unused") {
    return NextResponse.json({ ok: false, error: "used" }, { status: 409 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let targetUserId = user?.id ?? null
  let sessionTokens: { access_token: string; refresh_token: string; expires_in: number } | null = null
  let loginRequired = false

  if (!targetUserId) {
    if (!email) {
      return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 })
    }

    const secret = getRedeemSecret()
    if (!secret) {
      return NextResponse.json({ ok: false, error: "redeem_secret_missing" }, { status: 500 })
    }

    const password = buildRedeemPassword(secret, email)

    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        source: "redeem",
      },
    })

    if (createdUser?.user?.id) {
      targetUserId = createdUser.user.id
    } else {
      const existingId = await findUserIdByEmail(admin, email)
      if (!existingId) {
        const message =
          createError && typeof createError === "object" && "message" in createError
            ? String((createError as { message?: string }).message || "")
            : "user_create_failed"
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
      }
      targetUserId = existingId
    }

    const supabaseUrl = getSupabaseUrl()
    const supabaseAnonKey = getSupabaseAnonKey()
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 })
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sessionData } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (sessionData?.session) {
      sessionTokens = {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_in: sessionData.session.expires_in,
      }
    } else {
      loginRequired = true
    }
  }

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const { data: updatedRows, error: updateError } = await admin
    .from("redemption_codes")
    .update({ status: "used", used_by: targetUserId, used_at: nowIso })
    .eq("code", code)
    .eq("status", "unused")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .select("code, plan, duration_days, expires_at")

  if (updateError) {
    return NextResponse.json({ ok: false, error: "redeem_failed" }, { status: 500 })
  }

  const updated = updatedRows?.[0]

  if (!updated) {
    const { data: existingRows } = await admin
      .from("redemption_codes")
      .select("status, used_at, expires_at")
      .eq("code", code)
      .limit(1)

    const existing = existingRows?.[0]

    if (!existing) {
      return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 404 })
    }

    if (existing.expires_at && new Date(existing.expires_at) <= now) {
      return NextResponse.json({ ok: false, error: "expired" }, { status: 410 })
    }

    if (existing.status && existing.status !== "unused") {
      return NextResponse.json({ ok: false, error: "used" }, { status: 409 })
    }

    return NextResponse.json({ ok: false, error: "redeem_failed" }, { status: 400 })
  }

  const planFromCode = updated.plan || "trial_pro"
  const days = Math.max(1, Number(updated.duration_days || 7))

  const { data: entitlements } = await admin
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", targetUserId)
    .limit(1)

  const current = entitlements?.[0]
  const currentExpiry = current?.pro_expires_at ? new Date(current.pro_expires_at) : null
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now
  const newExpires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  const isRenewal = Boolean(current?.plan || current?.pro_expires_at)

  const nextPlan = current?.plan && ["pro", "vip"].includes(current.plan)
    ? current.plan
    : planFromCode

  const { error: upsertError } = await admin.from("entitlements").upsert({
    user_id: targetUserId,
    plan: nextPlan,
    pro_expires_at: newExpires.toISOString(),
    updated_at: nowIso,
  })

  if (upsertError) {
    return NextResponse.json({ ok: false, error: "entitlement_update_failed" }, { status: 500 })
  }

  if (email) {
    await admin.from("profiles").upsert({ id: targetUserId, email }, { onConflict: "id" })
  }

  return NextResponse.json({
    ok: true,
    plan: nextPlan,
    expiresAt: newExpires.toISOString(),
    isRenewal,
    session: sessionTokens,
    loginRequired,
  })
}
