import { NextRequest, NextResponse } from "next/server"

import { resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import { privateCopyModuleSchema } from "@/lib/private-copy/schema"

export const runtime = "nodejs"

type DraftListRow = Record<string, unknown>
type DraftOutputPreview = Record<string, unknown> & { text?: unknown }

function asOutputPreview(value: unknown): DraftOutputPreview | null {
  return value && typeof value === "object" ? (value as DraftOutputPreview) : null
}

function previewText(row: DraftListRow) {
  const selected = asOutputPreview(row.selected_output)
  const outputs = Array.isArray(row.outputs) ? row.outputs : []
  const first = selected || asOutputPreview(outputs[0]) || null
  const text = typeof first?.text === "string" ? first.text : ""
  return text.length > 36 ? `${text.slice(0, 36)}...` : text
}

export async function GET(request: NextRequest) {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const url = request.nextUrl
  const rawModule = url.searchParams.get("module") || ""
  const rawStatus = url.searchParams.get("status") || ""
  const cursor = url.searchParams.get("cursor") || ""
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20))

  const moduleParsed = rawModule ? privateCopyModuleSchema.safeParse(rawModule) : null
  if (rawModule && !moduleParsed?.success) {
    return NextResponse.json({ ok: false, error: "invalid_module", code: "invalid_payload" }, { status: 400 })
  }

  const allowedStatus = new Set(["generating", "draft", "failed", "used", "archived"])
  if (rawStatus && !allowedStatus.has(rawStatus)) {
    return NextResponse.json({ ok: false, error: "invalid_status", code: "invalid_payload" }, { status: 400 })
  }

  let query = billing.ctx.supabase
    .from("private_copy_drafts")
    .select(
      "id, created_at, updated_at, module, scene, channel, status, outputs, selected_output_id, selected_output, risk_level, risk_flags, copy_count, copied_at, used_at"
    )
    .eq("user_id", billing.ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (moduleParsed?.success) query = query.eq("module", moduleParsed.data)
  if (rawStatus) query = query.eq("status", rawStatus)
  else query = query.neq("status", "archived")
  if (cursor) query = query.lt("created_at", cursor)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  const rows = (data || []) as DraftListRow[]
  const drafts = rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    module: row.module,
    scene: row.scene,
    channel: row.channel,
    status: row.status,
    selected_output_id: row.selected_output_id,
    preview_text: previewText(row),
    risk_level: row.risk_level || "low",
    risk_flags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
    copy_count: Number(row.copy_count || 0),
    copied_at: row.copied_at,
    used_at: row.used_at,
  }))

  const nextCursor = rows.length >= limit ? rows[rows.length - 1]?.created_at || null : null
  return NextResponse.json({ ok: true, drafts, next_cursor: nextCursor })
}
