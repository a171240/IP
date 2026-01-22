import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import crypto from "crypto"

export const runtime = "nodejs"

const leadSchema = z.object({
  team_size: z.enum(["1-3", "4-8", "9-20", "20+"]),
  current_status: z.enum(["no-sop", "multi-project", "low-conversion", "need-scale"]),
  contact: z.string().trim().min(3).max(80),
  landing_path: z.string().trim().min(1).optional(),
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
const RATE_LIMIT_MAX = 5

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
    utm_source: (utmBody.utm_source ?? body.utm_source) as string | undefined,
    utm_medium: (utmBody.utm_medium ?? body.utm_medium) as string | undefined,
    utm_campaign: (utmBody.utm_campaign ?? body.utm_campaign) as string | undefined,
    utm_content: (utmBody.utm_content ?? body.utm_content) as string | undefined,
    utm_term: (utmBody.utm_term ?? body.utm_term) as string | undefined,
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

  if (body.website) {
    // Honeypot: treat as success but do not write to DB.
    return NextResponse.json({ ok: true, lead_id: "honeypot" })
  }

  const validation = leadSchema.safeParse(body)
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

  let supabase
  try {
    supabase = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const referrer = getReferrer(request)
  const userAgent = request.headers.get("user-agent")
  const landingPath = deriveLandingPath(validation.data.landing_path, referrer)
  const utm = extractUtm(body)
  const contactHash = hashContact(contact)

  const { data, error } = await supabase
    .from("leads")
    .insert({
      team_size: validation.data.team_size,
      current_status: validation.data.current_status,
      contact,
      contact_hash: contactHash,
      landing_path: landingPath,
      referrer,
      user_agent: userAgent,
      ip_address: ipAddress,
      ...utm,
    })
    .select("id")
    .single()

  if (error) {
    const errorCode = (error as { code?: string }).code
    if (errorCode === "23505") {
      return NextResponse.json({ ok: false, error: "duplicate_lead" }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, lead_id: data.id })
}
