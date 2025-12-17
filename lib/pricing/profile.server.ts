import "server-only"

import type { User } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

export type BillingProfile = {
  plan: PlanId
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
}

export function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    return first || null
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  return null
}

export function hashIp(ip: string): string {
  const salt = process.env.CREDITS_IP_SALT || "ipcf-default-salt"
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex")
}

export async function requireSupabaseUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      supabase,
      user: null as User | null,
      error: new Response(JSON.stringify({ error: "请先登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    }
  }

  return { supabase, user, error: null as Response | null }
}

export async function getOrCreateBillingProfile(opts: { user: User }) {
  const supabase = await createServerSupabaseClient()
  const { user } = opts

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("plan, credits_balance, credits_unlimited, trial_granted_at")
    .eq("id", user.id)
    .single()

  if (!error && profile) {
    return {
      supabase,
      profile: {
        plan: normalizePlan(profile.plan),
        credits_balance: Number(profile.credits_balance || 0),
        credits_unlimited: Boolean(profile.credits_unlimited),
        trial_granted_at: (profile.trial_granted_at as string | null) ?? null,
      } satisfies BillingProfile,
    }
  }

  if (error?.code === "PGRST116") {
    const { data: created, error: createError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        nickname: user.email?.split("@")[0] || "User",
        plan: "free",
        credits_balance: 30,
        credits_unlimited: false,
      })
      .select("plan, credits_balance, credits_unlimited, trial_granted_at")
      .single()

    if (createError || !created) {
      throw new Error(`无法访问用户档案，请尝试重新登录。错误: ${createError?.message || "profile create failed"}`)
    }

    return {
      supabase,
      profile: {
        plan: normalizePlan(created.plan),
        credits_balance: Number(created.credits_balance || 0),
        credits_unlimited: Boolean(created.credits_unlimited),
        trial_granted_at: (created.trial_granted_at as string | null) ?? null,
      } satisfies BillingProfile,
    }
  }

  throw new Error(`获取用户信息失败: ${error?.message || "profile not found"}`)
}

export async function ensureTrialCreditsIfNeeded(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  profile: BillingProfile
  deviceId: string
  ipHash: string | null
}) {
  const { supabase, profile, deviceId, ipHash } = opts

  if (profile.credits_unlimited) return profile
  if (profile.trial_granted_at) return profile
  if (profile.credits_balance > 0) return profile

  if (!deviceId || deviceId.trim().length < 8) {
    throw new Error("缺少设备标识，请刷新页面后重试")
  }

  const { data: grantRows, error: grantError } = await supabase.rpc("grant_trial_credits", {
    p_device_id: deviceId,
    p_ip_hash: ipHash,
  })

  if (grantError) {
    if (grantError.message?.includes("function") && grantError.message?.includes("does not exist")) return profile
    throw new Error(grantError.message || "试用积分发放失败")
  }

  const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows
  if (!grant) return profile

  return {
    ...profile,
    credits_balance: Number(grant.credits_balance ?? profile.credits_balance),
    credits_unlimited: Boolean(grant.credits_unlimited ?? profile.credits_unlimited),
    trial_granted_at: (grant.trial_granted_at as string | null) ?? profile.trial_granted_at,
  }
}

export async function consumeCredits(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  currentBalance: number
  amount: number
  stepId: string
}) {
  const { supabase, userId, currentBalance, amount, stepId } = opts

  if (amount <= 0) {
    return { credits_balance: currentBalance, credits_unlimited: false }
  }

  const { data: consumeRows, error: consumeError } = await supabase.rpc("consume_credits", {
    p_step_id: stepId,
    p_amount: amount,
  })

  if (consumeError) {
    if (consumeError.message?.includes("insufficient_credits")) {
      const { data: latest } = await supabase
        .from("profiles")
        .select("credits_balance, credits_unlimited")
        .eq("id", userId)
        .single()

      const latestBalance = Number(latest?.credits_balance ?? currentBalance)
      const err = new Error("insufficient_credits")
      ;(err as unknown as { meta?: Record<string, unknown> }).meta = { required: amount, balance: latestBalance }
      throw err
    }

    if (consumeError.message?.includes("function") && consumeError.message?.includes("does not exist")) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ credits_balance: currentBalance - amount })
        .eq("id", userId)
        .gte("credits_balance", amount)

      if (updateError) throw new Error(updateError.message || "积分扣减失败")
      return { credits_balance: currentBalance - amount, credits_unlimited: false }
    }

    throw new Error(consumeError.message || "积分扣减失败")
  }

  const consumed = Array.isArray(consumeRows) ? consumeRows[0] : consumeRows
  return {
    credits_balance: Number(consumed?.credits_balance ?? currentBalance),
    credits_unlimited: Boolean(consumed?.credits_unlimited ?? false),
  }
}
