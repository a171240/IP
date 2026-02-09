import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import {
  chargeCredits,
  resolveBillingContext,
  trackServerEvent,
  type BillingContext,
} from "@/lib/xhs/proxy.server"
import { generateXhsV4, type ConflictLevel, type XhsContentType, type StoreProfile } from "@/lib/xhs/generate-v4.server"

export const runtime = "nodejs"

const bodySchema = z.object({
  draft_id: z.string().uuid().optional(),
  variant_of: z.string().uuid().optional(),

  contentType: z.enum(["treatment", "education", "promotion", "comparison"]),
  topic: z.string().trim().min(1).max(200),
  keywords: z.string().trim().max(400).optional().default(""),
  shopName: z.string().trim().max(120).optional().default(""),
  conflictLevel: z.enum(["safe", "standard", "hard"]).optional().default("standard"),
  store_profile_id: z.string().uuid().optional(),
  seed_reviews: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
})

async function loadStoreProfile(opts: {
  billing: BillingContext
  storeProfileId: string
}): Promise<StoreProfile | null> {
  const { billing, storeProfileId } = opts
  const { data, error } = await billing.supabase
    .from("store_profiles")
    .select("id, name, city, district, landmark, shop_type, main_offer_name, main_offer_duration_min, included_steps, promises")
    .eq("id", storeProfileId)
    .eq("user_id", billing.userId)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as StoreProfile
}

async function ensureDraft(opts: {
  billing: BillingContext
  input: z.infer<typeof bodySchema>
}): Promise<{ id: string; reused: boolean }> {
  const { billing, input } = opts
  const draftId = (input.draft_id || "").trim()

  if (draftId) {
    const { data } = await billing.supabase
      .from("xhs_drafts")
      .select("id")
      .eq("id", draftId)
      .eq("user_id", billing.userId)
      .maybeSingle()
    if (!data?.id) throw new Error("draft_not_found")
    return { id: draftId, reused: true }
  }

  const now = new Date().toISOString()
  const { data: created, error } = await billing.supabase
    .from("xhs_drafts")
    .insert({
      user_id: billing.userId,
      source: "mp",
      content_type: input.contentType,
      topic: input.topic,
      keywords: input.keywords || null,
      shop_name: input.shopName || null,
      status: "draft",
      conflict_level: input.conflictLevel,
      store_profile_id: input.store_profile_id || null,
      variant_of: input.variant_of || null,
      updated_at: now,
    })
    .select("id")
    .single()

  if (error || !created?.id) {
    // Fallback: in case DB hasn't been migrated for new columns, retry with minimal columns.
    const { data: created2, error: error2 } = await billing.supabase
      .from("xhs_drafts")
      .insert({
        user_id: billing.userId,
        source: "mp",
        content_type: input.contentType,
        topic: input.topic,
        keywords: input.keywords || null,
        shop_name: input.shopName || null,
        status: "draft",
        updated_at: now,
      })
      .select("id")
      .single()

    if (error2 || !created2?.id) throw new Error(error2?.message || error?.message || "insert_failed")
    return { id: created2.id as string, reused: false }
  }

  return { id: created.id as string, reused: false }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  // Billing: treat as "basic" feature, credits can override.
  const charged = await chargeCredits({
    request,
    ctx: billing.ctx,
    requiredPlan: "basic",
    allowCreditsOverride: true,
    baseCost: 4,
    stepId: "xhs:generate-v4",
  })
  if (!charged.ok) return charged.error

  const input = parsed.data

  await trackServerEvent({
    request,
    event: "xhs_v4_generate_submit",
    props: {
      source: "mp",
      contentType: input.contentType,
      conflictLevel: input.conflictLevel,
      cost: charged.cost,
      plan: billing.ctx.plan,
      planOk: charged.planOk,
    },
  })

  let draftId = ""
  try {
    const ensured = await ensureDraft({ billing: billing.ctx, input })
    draftId = ensured.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : "draft_failed"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const storeProfileId = (input.store_profile_id || "").trim()
  const storeProfile = storeProfileId ? await loadStoreProfile({ billing: billing.ctx, storeProfileId }) : null

  try {
    const { result, guardrails } = await generateXhsV4({
      billing: billing.ctx,
      draftId,
      input: {
        contentType: input.contentType as XhsContentType,
        topic: input.topic,
        keywords: input.keywords || "",
        shopName: input.shopName || "",
        conflictLevel: input.conflictLevel as ConflictLevel,
        storeProfile,
        seedReviews: input.seed_reviews || [],
        maxRounds: 2,
      },
    })

    // Persist best-effort to xhs_drafts.
    try {
      const now = new Date().toISOString()
      await billing.ctx.supabase
        .from("xhs_drafts")
        .update({
          content_type: input.contentType,
          topic: input.topic,
          keywords: input.keywords || null,
          shop_name: input.shopName || null,

          result_title: result.title,
          result_content: result.body,
          cover_title: result.coverText.main,
          tags: result.tags,

          pinned_comment: result.pinnedComment,
          reply_templates: result.replyTemplates,
          cover_text_main: result.coverText.main,
          cover_text_sub: result.coverText.sub,
          cover_prompt: result.coverPrompt,
          cover_negative: result.coverNegative,

          conflict_level: input.conflictLevel,
          guardrail_rounds: guardrails.rounds,
          guardrail_flags: guardrails.flags,
          store_profile_id: storeProfileId || null,

          credits_cost: charged.cost,
          plan_at_generate: billing.ctx.plan,
          updated_at: now,
        })
        .eq("id", draftId)
        .eq("user_id", billing.ctx.userId)
    } catch {
      // ignore (DB migration may not be applied yet)
    }

    const needProfile = !storeProfileId

    await trackServerEvent({
      request,
      event: "xhs_v4_generate_success",
      props: {
        source: "mp",
        cost: charged.cost,
        riskLevel: guardrails.riskLevel,
        dangerCount: guardrails.dangerCount,
        rounds: guardrails.rounds,
        flags: guardrails.flags.map((f) => `${f.field}:${f.rule}:${f.match}`).slice(0, 20),
        needProfile,
      },
    })

    const res = NextResponse.json({
      ok: true,
      draft: { id: draftId },
      result: {
        title: result.title,
        body: result.body,
        coverText: result.coverText,
        pinnedComment: result.pinnedComment,
        replyTemplates: result.replyTemplates,
        tags: result.tags,
        coverPrompt: result.coverPrompt,
        coverNegative: result.coverNegative,
      },
      guardrails: {
        rounds: guardrails.rounds,
        flags: guardrails.flags.map((f) => `${f.field}:${f.rule}:${f.match}`),
        riskLevel: guardrails.riskLevel,
        dangerCount: guardrails.dangerCount,
      },
      followup: needProfile
        ? {
            needProfile: true,
            questions: [
              "你在哪个城市/区？",
              "主推项目时长（分钟）？",
              "能否承诺：不加价/不缩水/可拒绝（不硬推销）？",
              "附近地标/商圈？",
            ],
          }
        : { needProfile: false, questions: [] },
    })

    res.headers.set("X-Credits-Cost", String(charged.cost))
    res.headers.set("X-Credits-Remaining", charged.unlimited ? "unlimited" : String(charged.remaining))
    res.headers.set("X-Credits-Unlimited", charged.unlimited ? "1" : "0")
    return res
  } catch (error) {
    await trackServerEvent({
      request,
      event: "xhs_v4_generate_fail",
      props: { source: "mp", message: error instanceof Error ? error.message : String(error || "unknown") },
    })

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "生成失败" }, { status: 500 })
  }
}

