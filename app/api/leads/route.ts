import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

export const runtime = "nodejs"

const leadSchema = z.object({
  team_size: z.enum(["1-3", "4-8", "9-20", "20+"]),
  current_status: z.enum(["no-sop", "multi-project", "low-conversion", "need-scale"]),
  contact: z.string().trim().min(1).max(200),
  landing_path: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  elapsed_ms: z.number().optional(),
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

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3

// In-memory rate limit: works per instance. In serverless multi-instance this is best-effort.
const rateLimitMap: Map<string, RateEntry> = (() => {
  const globalAny = globalThis as typeof globalThis & { __leadRateLimit?: Map<string, RateEntry> }
  if (!globalAny.__leadRateLimit) {
    globalAny.__leadRateLimit = new Map()
  }
  return globalAny.__leadRateLimit
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
      return url.pathname || "/demo"
    } catch {
      return "/demo"
    }
  }
  return "/demo"
}

function isLikelyUrl(value: string): boolean {
  const lower = value.toLowerCase()
  return lower.includes("http://") || lower.includes("https://") || lower.includes("www.")
}

function isRepeatedCharacters(value: string): boolean {
  const compact = value.replace(/\s+/g, "")
  return compact.length > 0 && /^(.)(\1)+$/.test(compact)
}

function hashContact(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function hashIp(value: string): string {
  const salt = process.env.CREDITS_IP_SALT || "leads"
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex")
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
        "[leads] SUPABASE_SERVICE_ROLE_KEY missing. Falling back to anon key; ensure RLS insert policy for anon."
      )
      return { client: createClient(url, anonKey, { auth: { persistSession: false } }), mode: "anon" as const }
    }
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return { error: message }
  }
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

  const honeypotValue = String(body.website ?? body.company ?? "").trim()
  if (honeypotValue) {
    console.warn("[leads] Honeypot triggered; dropping lead.")
    // Honeypot: treat as success but do not write to DB.
    return NextResponse.json({ ok: true, lead_id: "honeypot" })
  }

  const normalizedBody = {
    team_size: body.team_size ?? body.teamSize,
    current_status: body.current_status ?? body.currentStatus,
    contact: body.contact,
    landing_path: body.landing_path ?? body.landingPath,
    source: body.source,
    elapsed_ms: (() => {
      const raw = body.elapsed_ms ?? body.elapsedMs
      const parsed = typeof raw === "number" ? raw : Number(raw)
      return Number.isFinite(parsed) ? parsed : undefined
    })(),
    utm: body.utm,
  } as Record<string, unknown>

  const validation = leadSchema.safeParse(normalizedBody)
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
  }

  const contact = validation.data.contact.trim()
  if (isLikelyUrl(contact) || isRepeatedCharacters(contact)) {
    return NextResponse.json({ ok: false, error: "invalid_contact" }, { status: 400 })
  }

  if (validation.data.elapsed_ms !== undefined && validation.data.elapsed_ms < 2000) {
    console.warn("[leads] Submit too fast; dropping lead.")
    return NextResponse.json({ ok: true, lead_id: "too_fast" })
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
  const contactHash = hashContact(contact)
  const ipHash = hashIp(ipAddress)
  const source = typeof validation.data.source === "string" ? validation.data.source : "demo"

  const { data, error } = await supabase
    .from("leads")
    .insert({
      team_size: validation.data.team_size,
      current_status: validation.data.current_status,
      contact,
      contact_hash: contactHash,
      ip_hash: ipHash,
      landing_path: landingPath,
      referrer,
      user_agent: userAgent,
      ip_address: ipAddress,
      source,
      ...utm,
    })
    .select("id")
    .single()

  if (error) {
    const errorCode = (error as { code?: string }).code
    if (errorCode === "23505") {
      return NextResponse.json({ ok: false, error: "duplicate_lead" }, { status: 409 })
    }
    if (errorCode === "42501") {
      return NextResponse.json({ ok: false, error: "rls_denied" }, { status: 403 })
    }
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
  }

  const webhookUrl = process.env.LEADS_WEBHOOK_URL
  if (webhookUrl) {
    void fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: data.id,
        team_size: validation.data.team_size,
        current_status: validation.data.current_status,
        contact,
        landing_path: landingPath,
        source,
        ...utm,
      }),
    }).catch((notifyError) => {
      console.error("[leads] webhook notify failed:", notifyError)
    })
  }

  return NextResponse.json({ ok: true, lead_id: data.id })
}
