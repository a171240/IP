import "server-only"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { getWechatpayProduct } from "@/lib/wechatpay/products"
import { isPlanSufficient, normalizePlan, type PlanId } from "@/lib/pricing/rules"

type FulfillResult =
  | { ok: true; fulfilled: true; plan_set_to: PlanId; credits_granted: number }
  | { ok: true; fulfilled: false; reason: string }
  | { ok: false; fulfilled: false; error: string }

function computeNextPlan(current: unknown, target: PlanId): PlanId {
  const cur = normalizePlan(current)
  if (isPlanSufficient(cur, target)) return cur
  return target
}

export async function tryFulfillWechatpayOrder(outTradeNo: string): Promise<FulfillResult> {
  if (!outTradeNo) return { ok: false, fulfilled: false, error: "missing out_trade_no" }

  const admin = createAdminSupabaseClient()

  const { data: order, error: orderError } = await admin
    .from("wechatpay_orders")
    .select("out_trade_no,status,user_id,product_id,grant_status,grant_attempts")
    .eq("out_trade_no", outTradeNo)
    .single()

  if (orderError || !order) return { ok: false, fulfilled: false, error: orderError?.message || "order not found" }

  if (order.status !== "paid") return { ok: true, fulfilled: false, reason: "not_paid" }
  if (!order.user_id) return { ok: true, fulfilled: false, reason: "no_user" }

  const product = getWechatpayProduct(order.product_id)
  if (!product) return { ok: true, fulfilled: false, reason: "no_product" }

  if (order.grant_status === "granted") {
    return { ok: true, fulfilled: false, reason: "already_granted" }
  }

  // Light-weight lock: best-effort mark as granting to reduce double grants.
  const { data: locked, error: lockError } = await admin
    .from("wechatpay_orders")
    .update({ grant_status: "granting", grant_attempts: Number(order.grant_attempts || 0) + 1 })
    .eq("out_trade_no", outTradeNo)
    .eq("status", "paid")
    .or("grant_status.is.null,grant_status.eq.pending,grant_status.eq.failed")
    .select("out_trade_no,grant_status")
    .single()

  if (lockError || !locked) {
    return { ok: true, fulfilled: false, reason: "locked_or_already_processed" }
  }

  try {
    const { data: existingTx } = await admin
      .from("credit_transactions")
      .select("id")
      .eq("user_id", order.user_id)
      .eq("reason", "wechatpay_purchase")
      .filter("metadata->>out_trade_no", "eq", outTradeNo)
      .limit(1)

    if (existingTx && existingTx.length > 0) {
      await admin
        .from("wechatpay_orders")
        .update({ grant_status: "granted", granted_at: new Date().toISOString(), grant_error: null })
        .eq("out_trade_no", outTradeNo)
      return { ok: true, fulfilled: false, reason: "already_granted_by_tx" }
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("plan, credits_balance, credits_unlimited")
      .eq("id", order.user_id)
      .single()

    if (profileError || !profile) throw new Error(profileError?.message || "profile not found")

    const nextPlan = computeNextPlan(profile.plan, product.plan)
    const creditsUnlimited = Boolean(profile.credits_unlimited)
    const creditsDelta = creditsUnlimited ? 0 : product.credits_grant

    if (nextPlan !== normalizePlan(profile.plan) || creditsDelta !== 0) {
      const nextBalance = Number(profile.credits_balance || 0) + creditsDelta
      const { error: updProfileErr } = await admin
        .from("profiles")
        .update({ plan: nextPlan, credits_balance: nextBalance })
        .eq("id", order.user_id)

      if (updProfileErr) throw new Error(updProfileErr.message || "profile update failed")
    }

    if (creditsDelta !== 0) {
      const { error: txErr } = await admin.from("credit_transactions").insert({
        user_id: order.user_id,
        delta: creditsDelta,
        reason: "wechatpay_purchase",
        metadata: { out_trade_no: outTradeNo, product_id: product.id },
      })
      if (txErr) throw new Error(txErr.message || "credit transaction insert failed")
    }

    const { error: finalizeErr } = await admin
      .from("wechatpay_orders")
      .update({ grant_status: "granted", granted_at: new Date().toISOString(), grant_error: null })
      .eq("out_trade_no", outTradeNo)

    if (finalizeErr) throw new Error(finalizeErr.message || "order finalize failed")

    return { ok: true, fulfilled: true, plan_set_to: nextPlan, credits_granted: creditsDelta }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fulfill failed"
    await admin
      .from("wechatpay_orders")
      .update({ grant_status: "failed", grant_error: msg })
      .eq("out_trade_no", outTradeNo)
    return { ok: false, fulfilled: false, error: msg }
  }
}

