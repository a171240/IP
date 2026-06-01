import { NextRequest, NextResponse } from "next/server"

import { resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import { patchPrivateCopyDraftSchema } from "@/lib/private-copy/schema"

export const runtime = "nodejs"

type DraftRow = Record<string, unknown>
type DraftOutput = Record<string, unknown> & { id?: unknown; text?: unknown }

function asDraftOutput(value: unknown): DraftOutput | null {
  return value && typeof value === "object" ? (value as DraftOutput) : null
}

function findOutput(row: DraftRow, outputId: string) {
  const outputs = Array.isArray(row.outputs) ? row.outputs : []
  for (const item of outputs) {
    const output = asDraftOutput(item)
    if (output && String(output.id || "") === outputId) return output
  }
  return null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = String(draftId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_draft_id" }, { status: 400 })

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const { data, error } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", billing.ctx.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "draft_not_found", code: "draft_not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, draft: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  const id = String(draftId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_draft_id" }, { status: 400 })

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const body = await request.json().catch(() => null)
  const parsed = patchPrivateCopyDraftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const { data: draft, error: draftError } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", billing.ctx.userId)
    .maybeSingle()

  if (draftError) return NextResponse.json({ ok: false, error: draftError.message || "query_failed" }, { status: 500 })
  if (!draft) return NextResponse.json({ ok: false, error: "draft_not_found", code: "draft_not_found" }, { status: 404 })

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }
  const action = parsed.data.action

  if (action === "archive") {
    patch.status = "archived"
  } else {
    const outputId = parsed.data.outputId || ""
    if (!outputId) return NextResponse.json({ ok: false, error: "output_id_required", code: "invalid_payload" }, { status: 400 })
    const draftRow = draft as DraftRow
    const selected = findOutput(draftRow, outputId)
    if (!selected) return NextResponse.json({ ok: false, error: "output_not_found", code: "invalid_payload" }, { status: 400 })

    if (action === "select_output") {
      patch.selected_output_id = outputId
      patch.selected_output = selected
    } else if (action === "record_copy") {
      patch.selected_output_id = outputId
      patch.selected_output = selected
      patch.copied_at = now
      patch.copy_count = Number(draftRow.copy_count || 0) + 1
    } else if (action === "mark_used") {
      patch.selected_output_id = outputId
      patch.selected_output = selected
      patch.used_at = now
      patch.status = "used"
    } else if (action === "edit_output") {
      const text = String(parsed.data.text || "").trim()
      if (!text) return NextResponse.json({ ok: false, error: "text_required", code: "invalid_payload" }, { status: 400 })
      patch.selected_output_id = outputId
      patch.selected_output = { ...selected, text }
    }
  }

  const { data: updated, error: updateError } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", billing.ctx.userId)
    .select("*")
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ ok: false, error: updateError?.message || "draft_update_failed", code: "draft_update_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, draft: updated })
}
