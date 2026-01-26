import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const activationSchema = z.object({
  email: z.string().trim().email(),
  platform: z.string().trim().min(1).max(60).optional(),
  order_tail: z.string().trim().min(4).max(16),
  note: z.string().trim().max(500).optional(),
  landing_path: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  utm: z
    .object({
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_content: z.string().optional(),
      utm_term: z.string().optional(),
    })
    .optional(),
})

type RateEntry = { count: number; resetAt: number }
type RepeatEntry = { lastAt: number }

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3
const REPEAT_WINDOW_MS = 2_000

const rateLimitMap: Map<string, RateEntry> = (() => {
  const globalAny = globalThis as typeof globalThis & { __activationRateLimit?: Map<string, RateEntry> }
  if (!globalAny.__activationRateLimit) {
    globalAny.__activationRateLimit = new Map()
  }
  return globalAny.__activationRateLimit
})()

const repeatMap: Map<string, RepeatEntry> = (() => {
  const globalAny = globalThis as typeof globalThis & { __activationRepeat?: Map<string, RepeatEntry> }
  if (!globalAny.__activationRepeat) {
    globalAny.__activationRepeat = new Map()
  }
  return globalAny.__activationRepeat
})()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return (request as { ip?: string }).ip || "unknown"
}

function getReferrer(request: NextRequest): string | null {
  return request.headers.get("referer") || request.headers.get("referrer")
}

function deriveLandingPath(landingPath: string | undefined, referrer: string | null): string {
  if (landingPath) return landingPath
  if (referrer) {
    try {
      const url = new URL(referrer)
      return url.pathname || "/activate"
    } catch {
      return "/activate"
    }
  }
  return "/activate"
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

function checkRepeat(key: string): boolean {
  const now = Date.now()
  const entry = repeatMap.get(key)
  if (!entry || now - entry.lastAt > REPEAT_WINDOW_MS) {
    repeatMap.set(key, { lastAt: now })
    return false
  }
  return true
}

function extractUtm(body: Record<string, unknown>): Record<string, string | undefined> {
  const utmBody = (body.utm ?? {}) as Record<string, unknown>
  return {
    utm_source: (utmBody.utm_source ?? body.utm_source ?? body.utmSource) as string | undefined,
    utm_medium: (utmBody.utm_medium ?? body.utm_medium ?? body.utmMedium) as string | undefined,
    utm_campaign: (utmBody.utm_campaign ?? body.utm_campaign ?? body.utmCampaign) as string | undefined,
    utm_content: (utmBody.utm_content ?? body.utm_content ?? body.utmContent) as string | undefined,
    utm_term: (utmBody.utm_term ?? body.utm_term ?? body.utmTerm) as string | undefined,
  }
}

function hashIp(value: string): string {
  const salt = process.env.CREDITS_IP_SALT || "activation"
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex")
}

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

function createSupabaseClientWithFallback() {
  try {
    return { client: createAdminSupabaseClient(), mode: "service" as const }
  } catch (error) {
    const url = getSupabaseUrl()
    const anonKey = getSupabaseAnonKey()
    if (url && anonKey) {
      console.warn(
        "[activation] SUPABASE_SERVICE_ROLE_KEY missing. Falling back to anon key; ensure RLS insert policy for anon."
      )
      return { client: createClient(url, anonKey, { auth: { persistSession: false } }), mode: "anon" as const }
    }
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return { error: message }
  }
}

export async function handleActivationPost(request: NextRequest) {
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

  const normalizedBody = {
    email: body.email,
    platform: body.platform ?? "xiaohongshu",
    order_tail: body.order_tail ?? body.orderTail ?? body.orderTail4,
    note: body.note ?? body.remark,
    landing_path: body.landing_path ?? body.landingPath,
    source: body.source,
    utm: body.utm,
  } as Record<string, unknown>

  const validation = activationSchema.safeParse(normalizedBody)
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
  }

  const email = validation.data.email.trim().toLowerCase()
  const orderTail = validation.data.order_tail.trim().slice(-4)
  const repeatKey = `${ipAddress}:${email}:${orderTail}`
  if (checkRepeat(repeatKey)) {
    return NextResponse.json({ ok: true, status: "pending" })
  }

  let userId: string | null = null
  let userEmail: string | null = null
  try {
    const supabaseAuth = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    userId = user?.id ?? null
    userEmail = user?.email ?? null
  } catch {
    userId = null
    userEmail = null
  }

  const supabaseResult = createSupabaseClientWithFallback()
  if ("error" in supabaseResult) {
    return NextResponse.json({ ok: false, error: supabaseResult.error }, { status: 500 })
  }
  const supabase = supabaseResult.client

  const referrer = getReferrer(request) || (body.referrer as string | undefined) || null
  const userAgent = request.headers.get("user-agent") || (body.userAgent as string | undefined) || null
  const landingPath = deriveLandingPath(validation.data.landing_path, referrer)
  const utm = extractUtm(body)
  const ipHash = hashIp(ipAddress)
  const source = (validation.data.source as string | undefined) || utm.utm_source || "xiaohongshu"
  const platform = validation.data.platform ?? "xiaohongshu"

  const { data, error } = await supabase
    .from("activation_requests")
    .insert({
      email: (userEmail || email).trim().toLowerCase(),
      user_id: userId,
      platform,
      order_tail: orderTail,
      note: validation.data.note,
      source,
      landing_path: landingPath,
      referrer,
      user_agent: userAgent,
      ip_hash: ipHash,
      ...utm,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    const errorCode = (error as { code?: string } | undefined)?.code
    if (errorCode === "42501") {
      return NextResponse.json({ ok: false, error: "rls_denied" }, { status: 403 })
    }
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
  }

  const webhookUrl = process.env.ACTIVATION_WEBHOOK_URL
  if (webhookUrl) {
    void fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activation_id: data.id,
        email: (userEmail || email).trim().toLowerCase(),
        platform,
        order_tail: orderTail,
        source,
        ...utm,
      }),
    }).catch((notifyError) => {
      console.error("[activation] webhook notify failed:", notifyError)
    })
  }

  return NextResponse.json({ ok: true, activationId: data.id, status: "pending" })
}
