import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 26
const MAX_CREATE_COUNT = 500
const MAX_EXPORT_COUNT = 5000

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

function generateCode(length = CODE_LENGTH): string {
  const bytes = crypto.randomBytes(length)
  let code = ""
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

function parseNumber(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const clamped = Math.min(Math.max(Math.floor(parsed), min), max)
  return clamped
}

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ""
  const text = String(value)
  if (text.includes(",") || text.includes("\"") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/\"/g, "\"\"")}"`
  }
  return text
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const headerLine = headers.join(",")
  const lines = rows.map((row) => headers.map((key) => escapeCsvValue(row[key] as string | number)).join(","))
  return [headerLine, ...lines].join("\n")
}

async function requireAdmin() {
  const supabaseAuth = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  if (!isAdminUser(user)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) }
  }

  return { ok: true as const, user }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const status = (searchParams.get("status") || "all").trim().toLowerCase()
  const batch = (searchParams.get("batch") || "").trim()
  const query = (searchParams.get("query") || "").trim()
  const includeSummary = (searchParams.get("includeSummary") || "") === "1"
  const format = (searchParams.get("format") || "").trim().toLowerCase()
  const limit = parseNumber(searchParams.get("limit"), 100, 1, format === "csv" ? MAX_EXPORT_COUNT : 500)
  const offset = parseNumber(searchParams.get("offset"), 0, 0, 10_000)

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  const nowIso = new Date().toISOString()
  let listQuery = admin
    .from("redemption_codes")
    .select(
      "code, status, plan, plan_grant, sku, credits_grant, duration_days, max_uses, used_count, source, created_at, used_at, used_by, expires_at, batch",
      {
      count: "exact",
      }
    )
    .order("created_at", { ascending: false })

  if (status && status !== "all") {
    if (status === "expired") {
      listQuery = listQuery.not("expires_at", "is", null).lt("expires_at", nowIso)
    } else {
      listQuery = listQuery.eq("status", status)
    }
  }

  if (batch) {
    listQuery = listQuery.eq("batch", batch)
  }

  if (query) {
    listQuery = listQuery.ilike("code", `%${query}%`)
  }

  if (format !== "csv") {
    listQuery = listQuery.range(offset, offset + limit - 1)
  } else {
    listQuery = listQuery.limit(limit)
  }

  const { data, error, count } = await listQuery

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 })
  }

  if (format === "csv") {
    const rows = (data || []).map((row) => ({
      code: row.code,
      status: row.status,
      sku: row.sku,
      plan: row.plan,
      plan_grant: row.plan_grant,
      credits_grant: row.credits_grant,
      duration_days: row.duration_days,
      max_uses: row.max_uses,
      used_count: row.used_count,
      source: row.source,
      created_at: row.created_at,
      used_at: row.used_at,
      used_by: row.used_by,
      expires_at: row.expires_at,
      batch: row.batch,
    }))
    const csv = toCsv(rows, [
      "code",
      "status",
      "sku",
      "plan",
      "plan_grant",
      "credits_grant",
      "duration_days",
      "max_uses",
      "used_count",
      "source",
      "created_at",
      "used_at",
      "used_by",
      "expires_at",
      "batch",
    ])

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=redemption_codes.csv",
      },
    })
  }

  let summary: Record<string, number> | undefined
  if (includeSummary) {
    const statuses = ["unused", "used", "disabled"]
    const summaryEntries = await Promise.all(
      statuses.map(async (value) => {
        const { count: statusCount } = await admin
          .from("redemption_codes")
          .select("code", { count: "exact", head: true })
          .eq("status", value)
        return [value, statusCount || 0] as const
      })
    )

    const { count: expiredCount } = await admin
      .from("redemption_codes")
      .select("code", { count: "exact", head: true })
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso)

    const { count: totalCount } = await admin
      .from("redemption_codes")
      .select("code", { count: "exact", head: true })

    summary = {
      ...Object.fromEntries(summaryEntries),
      expired: expiredCount || 0,
      total: totalCount || 0,
    }
  }

  return NextResponse.json({
    ok: true,
    rows: data || [],
    count: count ?? 0,
    summary,
  })
}

const createSchema = z.object({
  action: z.literal("create"),
  count: z.number().int().min(1).max(MAX_CREATE_COUNT),
  plan: z.string().trim().min(1).max(40).optional(),
  sku: z.string().trim().max(120).optional(),
  plan_grant: z.string().trim().max(40).optional(),
  credits_grant: z.number().int().min(0).max(100000).optional(),
  duration_days: z.number().int().min(1).max(365).optional(),
  max_uses: z.number().int().min(1).max(100).optional(),
  batch: z.string().trim().max(120).optional(),
  expires_at: z.string().trim().optional(),
  source: z.string().trim().max(80).optional(),
})

const updateSchema = z.object({
  action: z.enum(["disable", "restore"]),
  code: z.string().trim().min(6).max(128),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const action = String(body.action || "").trim()
  const validation =
    action === "create"
      ? createSchema.safeParse(body)
      : updateSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", details: validation.error.issues },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  if (validation.data.action === "create") {
    const count = validation.data.count
    const plan = validation.data.plan || "trial_pro"
    const durationDays = validation.data.duration_days || 7
    const rawPlanGrant = validation.data.plan_grant
    const planGrant = rawPlanGrant !== undefined ? rawPlanGrant : plan
    const creditsGrant = validation.data.credits_grant ?? 0
    const maxUses = validation.data.max_uses ?? 1
    const batch = validation.data.batch || null
    const expiresAtRaw = validation.data.expires_at
    const expiresAt =
      expiresAtRaw && Number.isFinite(Date.parse(expiresAtRaw)) ? new Date(expiresAtRaw).toISOString() : null
    const sku =
      validation.data.sku ||
      (creditsGrant > 0 && (!planGrant || planGrant === "none")
        ? `credits_${creditsGrant}`
        : `${planGrant || plan}_${durationDays}d`)
    const source = validation.data.source || null

    const createdRows: Array<Record<string, unknown>> = []
    let remaining = count
    let attempts = 0

    while (remaining > 0 && attempts < 6) {
      attempts += 1
      const payload = Array.from({ length: remaining }).map(() => ({
        code: generateCode(),
        status: "unused",
        plan,
        plan_grant: planGrant,
        sku,
        credits_grant: creditsGrant,
        duration_days: durationDays,
        max_uses: maxUses,
        used_count: 0,
        batch,
        expires_at: expiresAt,
        source,
      }))

      const { data, error } = await admin
        .from("redemption_codes")
        .upsert(payload, { onConflict: "code", ignoreDuplicates: true })
        .select(
          "code, status, sku, plan, plan_grant, credits_grant, duration_days, max_uses, used_count, created_at, expires_at, batch, source"
        )

      if (error) {
        return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 })
      }

      createdRows.push(...(data || []))
      remaining = count - createdRows.length
    }

    if (createdRows.length < count) {
      return NextResponse.json({ ok: false, error: "create_incomplete", created: createdRows.length }, { status: 500 })
    }

    return NextResponse.json({ ok: true, rows: createdRows })
  }

  const code = validation.data.code
  const nextStatus = validation.data.action === "disable" ? "disabled" : "unused"
  const expectedStatus = validation.data.action === "disable" ? "unused" : "disabled"

  const { data, error } = await admin
    .from("redemption_codes")
    .update({ status: nextStatus })
    .eq("code", code)
    .eq("status", expectedStatus)
    .select("code, status")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 })
  }

  return NextResponse.json({ ok: true, row: data })
}
