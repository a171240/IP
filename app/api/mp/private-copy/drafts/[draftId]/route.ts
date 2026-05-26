import { NextRequest, NextResponse } from "next/server"

import { resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"

export const runtime = "nodejs"

const ACTIONS = new Set(["record_copy", "mark_used", "archive", "select_output", "update_output"])

function textValue(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = String(draftId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_draft_id" }, { status: 400 })

  const billing = await resolveMpAiBillingContext(_request)
  if (!billing.ok) return billing.error

  const { data, error } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", billing.ctx.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "draft_not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, draft: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = String(draftId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_draft_id" }, { status: 400 })

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = textValue(body.action, 40)
  const outputId = textValue(body.outputId, 80)
  const text = textValue(body.text, 1000)
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }
  if (outputId) update.selected_output_id = outputId
  if (text) update.selected_output = text

  if (action === "record_copy") {
    update.copied_at = now
  } else if (action === "mark_used") {
    update.status = "used"
    update.used_at = now
  } else if (action === "archive") {
    update.status = "archived"
    update.archived_at = now
  }

  const { data, error } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .update(update)
    .eq("id", id)
    .eq("user_id", billing.ctx.userId)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message || "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "draft_not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, draft: data })
}
