import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { deliveryPackInputSchema } from "@/lib/delivery-pack/schema"
import { generateDeliveryPackV2 } from "@/lib/delivery-pack/generate"
import { renderDeliveryPackPdf } from "@/lib/delivery-pack/pdf"

export const runtime = "nodejs"

type RateEntry = { count: number; resetAt: number }

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3
const DAILY_LIMIT = 3
const DAILY_LIMIT_ALLOWLIST = new Set(
  (process.env.DELIVERY_PACK_DAILY_ALLOWLIST ?? "630788685@qq.com")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
)

const rateLimitMap: Map<string, RateEntry> = (() => {
  const globalAny = globalThis as typeof globalThis & { __deliveryPackRateLimit?: Map<string, RateEntry> }
  if (!globalAny.__deliveryPackRateLimit) {
    globalAny.__deliveryPackRateLimit = new Map()
  }
  return globalAny.__deliveryPackRateLimit
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

function hashIp(value: string): string {
  const salt = process.env.CREDITS_IP_SALT || "delivery-pack"
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

function buildPaywall() {
  return {
    title: "解锁「7天交付包」",
    bullets: [
      "7天成交排产（PDF）",
      "10条高意图选题（PDF）",
      "3条成交脚本（PDF）",
      "质检清单（PDF）",
      "归档规则与升级建议（PDF）",
    ],
    cta: {
      activate: "/activate",
      demo: "/demo",
    },
  }
}

async function checkEntitlement(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  userId: string
) {
  const now = new Date()
  let isPro = false

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", userId)
    .limit(1)

  const entitlement = entitlements?.[0]
  const expiresAt = entitlement?.pro_expires_at ? new Date(entitlement.pro_expires_at) : null
  if (expiresAt && expiresAt > now) {
    isPro = true
  }

  if (entitlement?.plan && ["pro", "trial_pro", "vip"].includes(entitlement.plan)) {
    if (expiresAt ? expiresAt > now : entitlement.plan !== "trial_pro") {
      isPro = true
    }
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .limit(1)

  const plan = profiles?.[0]?.plan as string | undefined
  if (plan === "pro" || plan === "vip") {
    isPro = true
  }

  return isPro
}

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const validation = deliveryPackInputSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const allowExtra = user.email ? DAILY_LIMIT_ALLOWLIST.has(user.email) : false
  if (!allowExtra && !checkRateLimit(ipAddress)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
  }

  const entitled = await checkEntitlement(supabase, user.id)
  if (!entitled) {
    return NextResponse.json({ ok: false, error: "not_entitled", paywall: buildPaywall() }, { status: 403 })
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count, error: countError } = await admin
    .from("delivery_packs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "done")
    .gte("created_at", startOfDay.toISOString())

  if (countError) {
    return NextResponse.json({ ok: false, error: "count_failed" }, { status: 500 })
  }

  if (!allowExtra && (count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ ok: false, error: "daily_limit" }, { status: 429 })
  }

  const input = validation.data
  const ipHash = hashIp(ipAddress)
  const safeJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  const { data: created, error: insertError } = await admin
    .from("delivery_packs")
    .insert({
      user_id: user.id,
      status: "pending",
      input_json: safeJson({ ...input, ip_hash: ipHash }),
    })
    .select("id")
    .single()

  if (insertError || !created?.id) {
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
  }
  const packId = created.id

  const runGeneration = async () => {
    try {
      const output = await generateDeliveryPackV2(input)
      const safeOutput = safeJson(output)
      const pdfBuffer = await renderDeliveryPackPdf(input, safeOutput)

      const date = new Date()
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
      const pdfName = `delivery_pack_${dateStr}.pdf`
      const pdfPath = `${user.id}/${packId}/${pdfName}`

      const { error: uploadError } = await admin.storage
        .from("delivery-packs")
        .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true })

      if (uploadError) {
        throw uploadError
      }

      const { error: updateError } = await admin
        .from("delivery_packs")
        .update({
          status: "done",
          output_json: safeOutput,
          zip_path: pdfPath,
        })
        .eq("id", packId)

      if (updateError) {
        throw updateError
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "generate_failed"
      console.error("[delivery-pack] generate failed", error)
      await admin
        .from("delivery_packs")
        .update({ status: "failed", error_message: message })
        .eq("id", packId)
    }
  }

  void runGeneration()

  return NextResponse.json({
    ok: true,
    packId,
    status: "pending",
  })
}
