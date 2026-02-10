import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { normalizePlan, PLAN_LABELS } from "@/lib/pricing/rules"

export const runtime = "nodejs"

type ProfileRow = {
  plan?: string | null
  credits_balance?: number | null
  credits_unlimited?: boolean | null
  trial_granted_at?: string | null
  nickname?: string | null
  avatar_url?: string | null
  email?: string | null
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  // profiles: plan + credits snapshot
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, credits_balance, credits_unlimited, trial_granted_at, nickname, avatar_url, email")
    .eq("id", user.id)
    .single()

  let resolvedProfile: ProfileRow | null = profile as ProfileRow | null

  // PGRST116 = no row (or blocked by RLS). In our app we create a default profile row on demand.
  if (profileError || !resolvedProfile) {
    if (profileError?.code === "PGRST116") {
      const { data: created, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          nickname: (user.user_metadata as Record<string, unknown> | null)?.nickname || user.email?.split("@")[0] || "User",
          avatar_url: (user.user_metadata as Record<string, unknown> | null)?.avatar_url || null,
          plan: "free",
          credits_balance: 30,
          credits_unlimited: false,
        })
        .select("plan, credits_balance, credits_unlimited, trial_granted_at, nickname, avatar_url, email")
        .single()

      if (createError || !created) {
        return NextResponse.json({ ok: false, error: createError?.message || "profile create failed" }, { status: 500 })
      }

      resolvedProfile = created as ProfileRow
    } else {
      return NextResponse.json({ ok: false, error: profileError?.message || "profile not found" }, { status: 500 })
    }
  }

  const plan = normalizePlan(resolvedProfile.plan)

  // entitlements: some features (delivery pack) also read from entitlements table
  const { data: entitlements } = await supabase
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", user.id)
    .limit(1)

  const entitlement = entitlements?.[0] || null

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {},
    },
    profile: {
      plan,
      plan_label: PLAN_LABELS[plan],
      credits_balance: Number(resolvedProfile.credits_balance || 0),
      credits_unlimited: Boolean(resolvedProfile.credits_unlimited) || plan === "vip",
      trial_granted_at: (resolvedProfile.trial_granted_at as string | null) ?? null,
      nickname: resolvedProfile.nickname ?? null,
      avatar_url: resolvedProfile.avatar_url ?? null,
    },
    entitlements: entitlement
      ? {
          plan: entitlement.plan ?? null,
          pro_expires_at: entitlement.pro_expires_at ?? null,
        }
      : null,
  })
}

