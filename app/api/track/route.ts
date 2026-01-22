import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const trackSchema = z.object({
  event: z.string().min(1).max(120),
  props: z.record(z.unknown()).optional(),
  path: z.string().optional(),
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
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const validation = trackSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
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
  const ipAddress = getClientIp(request)
  const utm = extractUtm(body)

  const { error } = await supabase.from("analytics_events").insert({
    event: validation.data.event,
    path: validation.data.path,
    referrer,
    user_agent: userAgent,
    ip_address: ipAddress,
    props: validation.data.props ?? null,
    ...utm,
  })

  if (error) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
