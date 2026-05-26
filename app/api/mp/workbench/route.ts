import { NextRequest, NextResponse } from "next/server"

import { buildMpAiProfilePayload, resolveMpAiBillingContext } from "@/lib/mp/ai-points.server"
import { resolveXhsCoverImageUrl } from "@/lib/xhs/cover-url.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const { ctx, profileRow } = billing
  const supabase = ctx.supabase

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select("plan, pro_expires_at")
    .eq("user_id", ctx.userId)
    .limit(1)

  const entitlement = entitlements?.[0] || null

  const [{ data: xhsDrafts }, { data: packs }, { data: orders }] = await Promise.all([
    supabase
      .from("xhs_drafts")
      .select(
        "id, created_at, updated_at, status, result_title, danger_risk_level, cover_storage_path, publish_qr_url, publish_qr_storage_path, publish_url, published_at"
      )
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("delivery_packs")
      .select("id, status, created_at, pdf_path, error_message")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("wechatpay_orders")
      .select("out_trade_no,status,amount_total,currency,product_id,paid_at,grant_status,created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(3),
  ])

  const xhsDraftRows = await Promise.all((xhsDrafts || []).map(async (d) => ({
      ...d,
      cover_url: await resolveXhsCoverImageUrl(d.id, d.cover_storage_path, d.updated_at),
      qr_url: d.publish_qr_url || d.publish_qr_storage_path ? `/api/mp/xhs/qrs/${d.id}` : null,
    })))

  const recent = {
    xhs_drafts: xhsDraftRows,
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
    profile: buildMpAiProfilePayload(ctx, {
      nickname: profileRow.nickname ?? null,
      avatar_url: profileRow.avatar_url ?? null,
    }),
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
