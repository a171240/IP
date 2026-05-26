import { NextRequest, NextResponse } from "next/server"

import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
} from "@/lib/mp/ai-points.server"
import { generatePrivateCopy } from "@/lib/private-copy/llm.server"
import {
  createPrivateCopyDraft,
  loadPrivateCopyCustomerProfile,
  loadPrivateCopyDraft,
  markPrivateCopyDraftFailed,
  markPrivateCopyDraftSuccess,
  privateCopyInputHash,
} from "@/lib/private-copy/storage.server"
import { privateCopyGenerateRequestSchema } from "@/lib/private-copy/types"
import { trackServerEvent } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = privateCopyGenerateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const payload = parsed.data
  const regenerate = Boolean(payload.variant_of)

  if (payload.variant_of) {
    const sourceDraft = await loadPrivateCopyDraft({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      draftId: payload.variant_of,
    })
    if (!sourceDraft) {
      return NextResponse.json({ ok: false, error: "draft_not_found" }, { status: 404 })
    }
  }

  let customerProfile = null
  try {
    customerProfile = await loadPrivateCopyCustomerProfile({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      customerProfileId: payload.customer_profile_id,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "customer_profile_failed" },
      { status: 403 }
    )
  }

  let draftId = ""
  try {
    draftId = await createPrivateCopyDraft({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      request: payload,
      inputHash: privateCopyInputHash(payload),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "private_copy_draft_create_failed" },
      { status: 500 }
    )
  }

  const actionCode = regenerate ? "private.copy.regenerate" : "private.copy.generate"
  const charged = await chargeMpAiPoints({
    request,
    ctx: billing.ctx,
    actionCode,
    businessObjectType: "private_copy_draft",
    businessObjectId: draftId,
    metadata: {
      module: payload.module,
      scene: payload.scene || null,
      channel: payload.channel || null,
      customer_profile_id: payload.customer_profile_id || null,
      variant_of: payload.variant_of || null,
    },
  })
  if (!charged.ok) {
    await markPrivateCopyDraftFailed({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      draftId,
      errorMessage: "insufficient_ai_points",
    }).catch(() => null)
    return charged.error
  }

  await trackServerEvent({
    request,
    event: "private_copy_generate_submit",
    props: {
      source: "mp",
      module: payload.module,
      cost: charged.cost,
      actionCode: charged.actionCode,
      plan: billing.ctx.plan,
      hasCustomerProfile: Boolean(customerProfile),
    },
  })

  try {
    const result = await generatePrivateCopy({
      request: payload,
      customerProfile,
      regenerate,
    })

    await markPrivateCopyDraftSuccess({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      draftId,
      outputs: result.outputs,
      usageTips: result.usageTips,
      risk: result.risk,
      cost: charged.cost,
      plan: billing.ctx.plan,
      model: result.model,
    })

    await trackServerEvent({
      request,
      event: "private_copy_generate_success",
      props: {
        source: "mp",
        module: payload.module,
        draftId,
        riskLevel: result.risk.level,
        outputCount: result.outputs.length,
      },
    })

    const res = NextResponse.json({
      ok: true,
      draft: { id: draftId },
      result: {
        outputs: result.outputs,
        usageTips: result.usageTips,
        risk: result.risk,
      },
      billing: {
        action_code: charged.actionCode,
        cost_points: charged.cost,
        balance_points: charged.unlimited ? null : charged.remaining,
        ai_points_unlimited: charged.unlimited,
      },
    })
    setMpAiPointHeaders(res, charged)
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : "private_copy_generate_failed"
    await refundMpAiPoints({
      ctx: billing.ctx,
      charge: charged,
      reason: "private_copy_generate_failed",
      metadata: { draft_id: draftId, error: message.slice(0, 200) },
    }).catch(() => null)
    await markPrivateCopyDraftFailed({
      supabase: billing.ctx.supabase,
      userId: billing.ctx.userId,
      draftId,
      errorMessage: message,
    }).catch(() => null)
    await trackServerEvent({
      request,
      event: "private_copy_generate_fail",
      props: { source: "mp", module: payload.module, draftId, message: message.slice(0, 180) },
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
