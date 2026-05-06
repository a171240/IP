import { NextRequest, NextResponse } from "next/server"

import { buildMpAiProfilePayload, resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"

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

  return NextResponse.json({
    ok: true,
    user: {
      id: ctx.userId,
      email: ctx.userEmail,
      user_metadata: ctx.userMetadata,
    },
    profile: buildMpAiProfilePayload(ctx, {
      nickname: profileRow.nickname ?? null,
      avatar_url: profileRow.avatar_url ?? null,
    }),
    entitlements: entitlement
      ? {
          plan: entitlement.plan ?? null,
          pro_expires_at: entitlement.pro_expires_at ?? null,
        }
      : null,
  })
}
