import { NextRequest, NextResponse } from "next/server"

import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
  type MpAiActionCode,
  type MpAiBillingContext,
} from "@/lib/mp/ai-points.server"
import { trackServerEvent } from "@/lib/xhs/proxy.server"
import {
  generatePrivateCopyContent,
  hashPrivateCopyInput,
  normalizePrivateCopyInput,
  validatePrivateCopyInput,
} from "@/lib/private-copy/generate.server"

export const runtime = "nodejs"

type DraftRow = Record<string, unknown>

async function loadStoreProfile(opts: {
  billing: MpAiBillingContext
  storeProfileId: string
}) {
  const { data, error } = await opts.billing.supabase
    .from("store_profiles")
    .select("id, name, city, district, landmark, shop_type, main_offer_name, main_offer_duration_min, included_steps, promises")
    .eq("id", opts.storeProfileId)
    .eq("user_id", opts.billing.userId)
    .maybeSingle()

  if (error) throw new Error(error.message || "store_profile_query_failed")
  return data || null
}

async function loadCustomerProfile(opts: {
  billing: MpAiBillingContext
  customerProfileId: string
}) {
  const { data, error } = await opts.billing.supabase
    .from("voice_coach_customer_profiles")
    .select(
      "id, name, age_label, occupation, personality_tags, communication_style, core_concerns, trust_triggers, past_experience, notes"
    )
    .eq("id", opts.customerProfileId)
    .eq("user_id", opts.billing.userId)
    .maybeSingle()

  if (error) throw new Error(error.message || "customer_profile_query_failed")
  return data || null
}

function draftResultFromRow(row: DraftRow, actionCode: MpAiActionCode) {
  const outputs = Array.isArray(row.outputs) ? row.outputs : []
  const riskFlags = Array.isArray(row.risk_flags) ? row.risk_flags : []

  return NextResponse.json({
    ok: true,
    duplicate: true,
    draft: { id: row.id, status: row.status || "draft" },
    result: {
      module: row.module,
      scene: row.scene || "",
      channel: row.channel || "wechat",
      outputs,
      usageTips: [],
      risk: {
        level: row.risk_level || "low",
        flags: riskFlags,
      },
    },
    model: {
      provider: row.model_provider || "deepseek",
      name: row.model_name || "",
      fallback_used: Boolean(row.model_fallback_used),
      latency_ms: Number(row.latency_ms || 0),
    },
    billing: {
      action_code: actionCode,
      cost_points: 0,
      balance_points: null,
      ai_points_unlimited: false,
    },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  let input
  try {
    input = normalizePrivateCopyInput(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_payload"
    return NextResponse.json({ ok: false, error: "invalid_payload", details: message }, { status: 400 })
  }

  const validationMessage = validatePrivateCopyInput(input)
  if (validationMessage) {
    return NextResponse.json({ ok: false, error: validationMessage, code: "invalid_payload" }, { status: 400 })
  }

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const actionCode = (input.draft_id || input.variant_of ? "private.copy.regenerate" : "private.copy.generate") as MpAiActionCode
  const inputHash = hashPrivateCopyInput(input)
  const now = new Date().toISOString()
  const recentWindow = new Date(Date.now() - 60_000).toISOString()

  if (!input.draft_id && !input.variant_of) {
    const { count } = await billing.ctx.supabase
      .from("private_copy_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", billing.ctx.userId)
      .gte("created_at", recentWindow)
    if (typeof count === "number" && count >= 5) {
      return NextResponse.json({ ok: false, error: "操作太快，稍后再试", code: "rate_limited" }, { status: 429 })
    }

    const { data: duplicate } = await billing.ctx.supabase
      .from("private_copy_drafts")
      .select("*")
      .eq("user_id", billing.ctx.userId)
      .eq("input_hash", inputHash)
      .eq("status", "draft")
      .gte("created_at", recentWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (duplicate?.id && Array.isArray(duplicate.outputs) && duplicate.outputs.length) {
      return draftResultFromRow(duplicate as DraftRow, actionCode)
    }
  }

  let storeProfile: Record<string, unknown> | null = null
  if (input.store_profile_id) {
    try {
      storeProfile = (await loadStoreProfile({ billing: billing.ctx, storeProfileId: input.store_profile_id })) as Record<string, unknown> | null
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "store_profile_query_failed", code: "store_profile_forbidden" },
        { status: 403 }
      )
    }
    if (!storeProfile) {
      return NextResponse.json({ ok: false, error: "当前门店档案不可用", code: "store_profile_forbidden" }, { status: 403 })
    }
  }

  let customerProfile: Record<string, unknown> | null = null
  if (input.customer_profile_id) {
    try {
      customerProfile = (await loadCustomerProfile({ billing: billing.ctx, customerProfileId: input.customer_profile_id })) as Record<
        string,
        unknown
      > | null
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "customer_profile_query_failed", code: "customer_profile_forbidden" },
        { status: 403 }
      )
    }
    if (!customerProfile) {
      return NextResponse.json({ ok: false, error: "当前顾客档案不可用", code: "customer_profile_forbidden" }, { status: 403 })
    }
  }

  const { data: created, error: createError } = await billing.ctx.supabase
    .from("private_copy_drafts")
    .insert({
      user_id: billing.ctx.userId,
      source: "mp",
      module: input.module,
      scene: input.scene,
      channel: input.channel,
      store_profile_id: input.store_profile_id || null,
      customer_profile_id: input.customer_profile_id || null,
      variant_of: input.variant_of || input.draft_id || null,
      input: input.input,
      input_hash: inputHash,
      status: "generating",
      updated_at: now,
    })
    .select("id")
    .single()

  if (createError || !created?.id) {
    return NextResponse.json({ ok: false, error: createError?.message || "draft_create_failed", code: "draft_update_failed" }, { status: 500 })
  }

  const draftId = String(created.id)
  const charged = await chargeMpAiPoints({
    request,
    ctx: billing.ctx,
    actionCode,
    businessObjectType: "private_copy_draft",
    businessObjectId: draftId,
    metadata: {
      module: input.module,
      scene: input.scene,
      channel: input.channel,
      store_profile_id: input.store_profile_id || null,
      customer_profile_id: input.customer_profile_id || null,
    },
  })

  if (!charged.ok) {
    await billing.ctx.supabase.from("private_copy_drafts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", draftId)
    return charged.error
  }

  await trackServerEvent({
    request,
    event: "private_copy_generate_submit",
    props: {
      source: "mp",
      module: input.module,
      scene: input.scene,
      channel: input.channel,
      actionCode: charged.actionCode,
      cost: charged.cost,
    },
  })

  try {
    const generated = await generatePrivateCopyContent({ input, storeProfile, customerProfile })

    await billing.ctx.supabase
      .from("private_copy_drafts")
      .update({
        outputs: generated.result.outputs,
        risk_level: generated.result.risk.level,
        risk_flags: generated.result.risk.flags,
        credits_cost: charged.cost,
        plan_at_generate: billing.ctx.plan,
        model_provider: generated.model.provider,
        model_name: generated.model.name,
        model_fallback_used: generated.model.fallback_used,
        prompt_version: generated.promptVersion,
        prompt_source_keys: ["private-copy-v1"],
        usage_tokens: generated.usageTokens || null,
        latency_ms: generated.model.latency_ms,
        generation_meta: {
          usageTips: generated.result.usageTips,
          input_hash: inputHash,
        },
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("user_id", billing.ctx.userId)

    await trackServerEvent({
      request,
      event: "private_copy_generate_success",
      props: {
        source: "mp",
        module: input.module,
        scene: input.scene,
        channel: input.channel,
        cost: charged.cost,
        actionCode: charged.actionCode,
        riskLevel: generated.result.risk.level,
        flags: generated.result.risk.flags,
        fallbackUsed: generated.model.fallback_used,
        latencyMs: generated.model.latency_ms,
      },
    })

    const res = NextResponse.json({
      ok: true,
      draft: { id: draftId, status: "draft" },
      result: generated.result,
      model: generated.model,
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
    await refundMpAiPoints({
      ctx: billing.ctx,
      charge: charged,
      reason: "private_copy_generate_failed",
      metadata: {
        draft_id: draftId,
        module: input.module,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error || "unknown").slice(0, 200),
      },
    }).catch(() => null)

    await billing.ctx.supabase
      .from("private_copy_drafts")
      .update({
        status: "failed",
        generation_meta: {
          error: error instanceof Error ? error.message.slice(0, 200) : String(error || "unknown").slice(0, 200),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("user_id", billing.ctx.userId)

    await trackServerEvent({
      request,
      event: "private_copy_generate_fail",
      props: {
        source: "mp",
        module: input.module,
        scene: input.scene,
        channel: input.channel,
        message: error instanceof Error ? error.message : String(error || "unknown"),
      },
    })

    console.error("[private-copy] generate failed", {
      draftId,
      module: input.module,
      channel: input.channel,
      message: error instanceof Error ? error.message : String(error || "unknown"),
    })

    return NextResponse.json({ ok: false, error: "生成失败，本次不扣点", code: "model_failed" }, { status: 500 })
  }
}
