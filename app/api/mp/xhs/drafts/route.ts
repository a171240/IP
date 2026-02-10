import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const createDraftSchema = z.object({
  contentType: z.string().max(40).optional(),
  topic: z.string().max(200).optional(),
  keywords: z.string().max(400).optional(),
  shopName: z.string().max(120).optional(),
  source: z.string().max(40).optional(),

  // Allow creating a "prefilled" draft (e.g. converting P8 script -> XHS draft)
  resultTitle: z.string().max(200).optional(),
  resultContent: z.string().max(200_000).optional(),
  coverTitle: z.string().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),

  // Optional link back to a workflow report (stored on the report metadata; no DB column needed).
  sourceReportId: z.string().uuid().optional(),
})

async function ensureProfileRowExists(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  user: { id: string; email?: string | null; user_metadata?: unknown }
) {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (!error && data?.id) return

  // PGRST116 = no row; ignore other errors (RLS, missing schema, etc.)
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
    .from("xhs_drafts")
    .select(
      "id, created_at, updated_at, status, content_type, topic, keywords, shop_name, result_title, danger_risk_level, danger_count, cover_storage_path, publish_qr_url, publish_qr_storage_path, publish_url, published_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  const drafts = (data || []).map((row) => {
    const coverUrl = row.cover_storage_path ? `/api/mp/xhs/covers/${row.id}` : null
    const qrUrl = row.publish_qr_url || row.publish_qr_storage_path ? `/api/mp/xhs/qrs/${row.id}` : null
    return { ...row, cover_url: coverUrl, qr_url: qrUrl }
  })

  return NextResponse.json({ ok: true, drafts })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createDraftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const now = new Date().toISOString()
  const payload = parsed.data

  // Idempotent: if sourceReportId is already linked to a draft, reuse it.
  if (payload.sourceReportId) {
    try {
      const { data: report } = await supabase
        .from("reports")
        .select("id, metadata")
        .eq("id", payload.sourceReportId)
        .eq("user_id", user.id)
        .maybeSingle()

      const meta = (report as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null
      const existingDraftId = typeof meta?.xhs_draft_id === "string" ? meta.xhs_draft_id.trim() : ""

      if (existingDraftId) {
        const { data: existingDraft } = await supabase
          .from("xhs_drafts")
          .select("id, created_at")
          .eq("id", existingDraftId)
          .eq("user_id", user.id)
          .maybeSingle()

        if (existingDraft?.id) {
          return NextResponse.json({ ok: true, draft: existingDraft, reused: true })
        }
      }
    } catch {
      // ignore; will create a new draft below
    }
  }

  // Prevent FK failures (xhs_drafts.user_id -> profiles.id) for first-time silent logins.
  try {
    await ensureProfileRowExists(supabase, user)
  } catch {
    // ignore
  }

  const { data: created, error } = await supabase
    .from("xhs_drafts")
    .insert({
      user_id: user.id,
      source: payload.source || "mp",
      content_type: payload.contentType || null,
      topic: payload.topic || null,
      keywords: payload.keywords || null,
      shop_name: payload.shopName || null,
      status: "draft",
      result_title: payload.resultTitle || null,
      result_content: payload.resultContent || null,
      cover_title: payload.coverTitle || null,
      tags: payload.tags || null,
      updated_at: now,
    })
    .select("id, created_at")
    .single()

  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message || "insert_failed" }, { status: 500 })
  }

  // Best-effort: link back to a workflow report via reports.metadata.
  if (payload.sourceReportId) {
    try {
      const { data: report } = await supabase
        .from("reports")
        .select("id, metadata")
        .eq("id", payload.sourceReportId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (report?.id) {
        const currentMeta = (report as { metadata?: unknown }).metadata as Record<string, unknown> | null
        const nextMeta: Record<string, unknown> = {
          ...(currentMeta && typeof currentMeta === "object" ? currentMeta : {}),
          xhs_draft_id: created.id,
          xhs_draft_linked_at: now,
        }

        await supabase.from("reports").update({ metadata: nextMeta }).eq("id", report.id).eq("user_id", user.id)
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, draft: created })
}
