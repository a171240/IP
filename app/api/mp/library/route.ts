import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { extractTopicsFromText } from "@/lib/workflow/topic-extract"

export const runtime = "nodejs"

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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

  const [draftsRes, packsRes, reportsRes] = await Promise.all([
    supabase
      .from("xhs_drafts")
      .select(
        "id, created_at, status, result_title, danger_risk_level, cover_storage_path, publish_qr_url, publish_qr_storage_path, publish_url, published_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("delivery_packs")
      .select("id, status, created_at, pdf_path, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("reports")
      .select("id, step_id, title, summary, metadata, created_at, updated_at")
      .eq("user_id", user.id)
      .in("step_id", ["P7", "P8", "P9", "P10"])
      .order("created_at", { ascending: false })
      .limit(limit),
  ])

  if (draftsRes.error) {
    return NextResponse.json({ ok: false, error: draftsRes.error.message || "xhs_drafts_query_failed" }, { status: 500 })
  }
  if (packsRes.error) {
    return NextResponse.json({ ok: false, error: packsRes.error.message || "delivery_packs_query_failed" }, { status: 500 })
  }
  if (reportsRes.error) {
    return NextResponse.json({ ok: false, error: reportsRes.error.message || "reports_query_failed" }, { status: 500 })
  }

  // Best-effort: backfill P7 topics into reports.metadata so clients can render per-topic statuses.
  const reports = (reportsRes.data || []) as Array<{
    id: string
    step_id: string
    title: string | null
    summary: string | null
    metadata?: unknown
    created_at: string
    updated_at: string
  }>

  const p7MissingTopicIds = reports
    .filter((r) => r.step_id === "P7" && !Array.isArray((isRecord(r.metadata) ? r.metadata.p7_topics : null)))
    .map((r) => r.id)

  if (p7MissingTopicIds.length) {
    try {
      const { data: rows } = await supabase
        .from("reports")
        .select("id, content, metadata")
        .eq("user_id", user.id)
        .in("id", p7MissingTopicIds.slice(0, 20))

      const now = new Date().toISOString()
      await Promise.all(
        (rows || []).map(async (row) => {
          const content = String((row as { content?: unknown }).content || "")
          const topics = extractTopicsFromText(content, 220)
          if (!topics.length) return

          const meta = isRecord((row as { metadata?: unknown }).metadata) ? { ...(row as { metadata: JsonObject }).metadata } : {}
          meta.p7_topics = topics
          meta.p7_topics_parsed_at = now
          meta.p7_topics_parser = "v1"

          // Update DB (best-effort)
          await supabase.from("reports").update({ metadata: meta }).eq("id", row.id).eq("user_id", user.id)

          // Update in-memory response rows
          const idx = reports.findIndex((r) => r.id === row.id)
          if (idx >= 0) {
            reports[idx] = { ...reports[idx], metadata: meta }
          }
        })
      )
    } catch {
      // ignore
    }
  }

  const xhs_drafts = (draftsRes.data || []).map((d) => ({
    ...d,
    cover_url: d.cover_storage_path ? `/api/mp/xhs/covers/${d.id}` : null,
    qr_url: d.publish_qr_url || d.publish_qr_storage_path ? `/api/mp/xhs/qrs/${d.id}` : null,
  }))

  const delivery_packs = (packsRes.data || []).map((p) => ({
    ...p,
    download_url: p.pdf_path ? `/api/mp/delivery-pack/${p.id}/download` : null,
  }))

  return NextResponse.json({
    ok: true,
    library: {
      reports,
      xhs_drafts,
      delivery_packs,
    },
  })
}
