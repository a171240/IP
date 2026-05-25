import { NextRequest, NextResponse } from "next/server"

import { buildMpAiProfilePayload, resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { BAIBAITU_BRAND_CODE, resolveBaibaituTrainingAccess } from "@/lib/voice-training/baibaitu.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const { ctx, profileRow } = billing

  // entitlements: some features (delivery pack) also read from entitlements table
  const { data: entitlements } = await ctx.supabase
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", ctx.userId)
    .limit(1)

  const entitlement = entitlements?.[0] || null
  let baibaituTrainingEnabled = false
  let brandCode = ""
  try {
    const admin = createAdminSupabaseClient()
    const account = await resolveMpAccountContextForUser({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      userMetadata: ctx.userMetadata,
      profileFallback: profileRow,
    })
    const access = await resolveBaibaituTrainingAccess({
      admin,
      ctx: account,
      user: { id: ctx.userId, email: ctx.userEmail },
    })
    baibaituTrainingEnabled = Boolean(access.enabled)
    brandCode = access.enabled ? BAIBAITU_BRAND_CODE : ""
  } catch {
    baibaituTrainingEnabled = false
    brandCode = ""
  }
  const profile = buildMpAiProfilePayload(ctx, {
    nickname: profileRow.nickname ?? null,
    avatar_url: profileRow.avatar_url ?? null,
  })

  return NextResponse.json({
    ok: true,
    user: {
      id: ctx.userId,
      email: ctx.userEmail,
      user_metadata: ctx.userMetadata,
    },
    profile: {
      ...profile,
      brand_code: brandCode,
      features: {
        ...(typeof (profile as any).features === "object" ? (profile as any).features : {}),
        baibaitu_training: baibaituTrainingEnabled,
      },
      feature_flags: {
        ...(typeof (profile as any).feature_flags === "object" ? (profile as any).feature_flags : {}),
        baibaitu_training: baibaituTrainingEnabled,
      },
    },
    entitlements: entitlement
      ? {
          plan: entitlement.plan ?? null,
          pro_expires_at: entitlement.pro_expires_at ?? null,
        }
      : null,
  })
}
