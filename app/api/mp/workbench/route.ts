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

async function getOrCreateProfileRow(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  user: { id: string; email?: string | null; user_metadata?: unknown }
): Promise<ProfileRow> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, credits_balance, credits_unlimited, trial_granted_at, nickname, avatar_url, email")
    .eq("id", user.id)
    .single()

  if (!profileError && profile) return profile as ProfileRow

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
      throw new Error(createError?.message || "profile create failed")
    }
    return created as ProfileRow
  }

  throw new Error(profileError?.message || "profile not found")
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  let profileRow: ProfileRow
  try {
    profileRow = await getOrCreateProfileRow(supabase, user)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "profile_failed" }, { status: 500 })
  }

  const plan = normalizePlan(profileRow.plan)
  const credits_balance = Number(profileRow.credits_balance || 0)
  const credits_unlimited = Boolean(profileRow.credits_unlimited) || plan === "vip"
  const trial_granted_at = (profileRow.trial_granted_at as string | null) ?? null

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", user.id)
    .limit(1)

  const entitlement = entitlements?.[0] || null

  const [{ data: xhsDrafts }, { data: packs }, { data: orders }] = await Promise.all([
    supabase
      .from("xhs_drafts")
      .select(
        "id, created_at, status, result_title, danger_risk_level, cover_storage_path, publish_qr_url, publish_qr_storage_path, publish_url, published_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("delivery_packs")
      .select("id, status, created_at, pdf_path, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("wechatpay_orders")
      .select("out_trade_no,status,amount_total,currency,product_id,paid_at,grant_status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ])

  const recent = {
    xhs_drafts: (xhsDrafts || []).map((d) => ({
      ...d,
      cover_url: d.cover_storage_path ? `/api/mp/xhs/covers/${d.id}` : null,
      qr_url: d.publish_qr_url || d.publish_qr_storage_path ? `/api/mp/xhs/qrs/${d.id}` : null,
    })),
    delivery_packs: (packs || []).map((p) => ({
      ...p,
      download_url: p.pdf_path ? `/api/mp/delivery-pack/${p.id}/download` : null,
    })),
    orders: orders || [],
  }

  const hasXhs = recent.xhs_drafts.length > 0
  const hasPack = recent.delivery_packs.some((p) => p.status === "done")
  const hasPaid = recent.orders.some((o) => o.status === "paid")
  const doneCount = [hasXhs, hasPack, hasPaid].filter(Boolean).length
  const percent = Math.round((doneCount / 3) * 100)

  return NextResponse.json({
    ok: true,
    profile: {
      plan,
      plan_label: PLAN_LABELS[plan],
      credits_balance,
      credits_unlimited,
      trial_granted_at,
      nickname: profileRow.nickname ?? null,
      avatar_url: profileRow.avatar_url ?? null,
    },
    entitlements: entitlement
      ? { plan: entitlement.plan ?? null, pro_expires_at: entitlement.pro_expires_at ?? null }
      : null,
    progress: {
      percent,
      tasks: {
        has_xhs_draft: hasXhs,
        has_delivery_pack: hasPack,
        has_paid_order: hasPaid,
      },
    },
    recent,
  })
}
