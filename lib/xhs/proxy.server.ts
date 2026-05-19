import "server-only"

import { NextRequest } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import {
  PLAN_LABELS,
  getCrossLevelMultiplier,
  isPlanSufficient,
  type PlanId,
} from "@/lib/pricing/rules"
import {
  consumeCredits,
  ensureTrialCreditsIfNeeded,
  getClientIp,
  type BillingProfile,
} from "@/lib/pricing/profile.server"

export type BillingContext = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
  userId: string
  userEmail: string | null
  plan: PlanId
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
  deviceId: string
  ipHash: string | null
  billing_user_id?: string | null
  billing_owner_label?: string | null
  billing_scope?: string | null
}

export function getXhsUpstreamBaseUrl(): string {
  const raw = process.env.XHS_UPSTREAM_BASE_URL || "https://xhs.ipgongchang.xin"
  return raw.replace(/\/$/, "")
}

export function buildXhsUpstreamUrl(path: string): string {
  const base = getXhsUpstreamBaseUrl()
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}

export async function resolveBillingContext(request: NextRequest): Promise<
  | { ok: true; ctx: BillingContext }
  | { ok: false; error: Response }
> {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing

  const ctx = billing.ctx

  return {
    ok: true,
    ctx: {
      supabase: ctx.supabase,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      plan: ctx.plan,
      credits_balance: ctx.credits_balance,
      credits_unlimited: ctx.credits_unlimited,
      trial_granted_at: ctx.trial_granted_at,
      deviceId: ctx.deviceId,
      ipHash: ctx.ipHash,
      billing_user_id: ctx.billing_user_id ?? null,
      billing_owner_label: ctx.billing_owner_label ?? null,
      billing_scope: ctx.billing_scope ?? null,
    },
  }
}

export async function chargeCredits(opts: {
  request: NextRequest
  ctx: BillingContext
  requiredPlan: PlanId
  allowCreditsOverride: boolean
  baseCost: number
  stepId: string
}): Promise<
  | { ok: true; cost: number; remaining: number; unlimited: boolean; planOk: boolean }
  | {
      ok: false
      error: Response
    }
> {
  const { ctx, requiredPlan, allowCreditsOverride, baseCost, stepId } = opts

  const planOk = isPlanSufficient(ctx.plan, requiredPlan)

  if (!planOk && !allowCreditsOverride) {
    return {
      ok: false,
      error: new Response(
        JSON.stringify({
          error: `您当前是${PLAN_LABELS[ctx.plan]}，此功能需要 ${PLAN_LABELS[requiredPlan]}。`,
          code: "plan_required",
          required_plan: requiredPlan,
          current_plan: ctx.plan,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    }
  }

  if (ctx.credits_unlimited) {
    return { ok: true, cost: 0, remaining: ctx.credits_balance, unlimited: true, planOk }
  }

  const multiplier = planOk ? 1 : getCrossLevelMultiplier(ctx.plan, requiredPlan)
  const cost = Math.max(0, Math.floor(baseCost * multiplier))
  if (cost <= 0) {
    return { ok: true, cost: 0, remaining: ctx.credits_balance, unlimited: false, planOk }
  }

  let currentProfile: BillingProfile = {
    plan: ctx.plan,
    credits_balance: ctx.credits_balance,
    credits_unlimited: ctx.credits_unlimited,
    trial_granted_at: ctx.trial_granted_at,
  }
  const billingUserId = ctx.billing_user_id || ctx.userId

  // First-time trial grant (device + IP throttling), matching the web logic.
  if (!currentProfile.credits_unlimited && !currentProfile.trial_granted_at && currentProfile.credits_balance <= 0) {
    if (!ctx.deviceId || ctx.deviceId.trim().length < 8) {
      return {
        ok: false,
        error: new Response(
          JSON.stringify({ error: "缺少设备标识，请刷新后重试", code: "device_id_required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
      }
    }

    currentProfile = await ensureTrialCreditsIfNeeded({
      supabase: ctx.supabase,
      userId: billingUserId,
      profile: currentProfile,
      deviceId: ctx.deviceId,
      ipHash: ctx.ipHash,
    })
  }

  try {
    const consumed = await consumeCredits({
      supabase: ctx.supabase,
      userId: billingUserId,
      currentBalance: currentProfile.credits_balance,
      amount: cost,
      stepId,
    })
    return {
      ok: true,
      cost,
      remaining: consumed.credits_balance,
      unlimited: consumed.credits_unlimited,
      planOk,
    }
  } catch (e) {
    if (e instanceof Error && e.message === "insufficient_credits") {
      const meta = (e as unknown as { meta?: { required?: number; balance?: number } }).meta
      return {
        ok: false,
        error: new Response(
          JSON.stringify({
            error: `积分不足：本次需消耗 ${meta?.required ?? cost}，当前余额 ${meta?.balance ?? 0}。`,
            code: "insufficient_credits",
            required: meta?.required ?? cost,
            balance: meta?.balance ?? 0,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        ),
      }
    }

    const msg = e instanceof Error ? e.message : "credits_charge_failed"
    return {
      ok: false,
      error: new Response(JSON.stringify({ error: msg, code: "credits_charge_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    }
  }
}

export async function trackServerEvent(opts: {
  request: NextRequest
  event: string
  props?: Record<string, unknown>
}) {
  const { request, event, props } = opts
  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return
  }

  const referrer = request.headers.get("referer") || request.headers.get("referrer")
  const userAgent = request.headers.get("user-agent")
  const ipAddress = getClientIp(request) || "unknown"

  await admin
    .from("analytics_events")
    .insert({
      event,
      path: "/mp", // mini program requests don't have a meaningful path; keep a constant
      referrer,
      user_agent: userAgent,
      ip_address: ipAddress,
      props: props ?? null,
    })
}
