import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import { tryFulfillWechatpayOrder } from "@/lib/wechatpay/fulfill.server"
import { isVirtualPayOrderPaid, notifyVirtualPayGoods, queryVirtualPayOrder } from "@/lib/wechatpay/virtual-pay.server"

export const runtime = "nodejs"

function textFrom(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function metadataOpenid(user: { user_metadata?: unknown }) {
  const meta = user.user_metadata
  if (!meta || typeof meta !== "object") return ""
  return textFrom((meta as Record<string, unknown>).wechat_openid)
}

function isStoreStaffAccount(role: unknown) {
  const value = String(role || "").trim()
  return value === "staff" || value === "employee"
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 })
  }

  const orderId = textFrom((body as { order_id?: unknown }).order_id) || textFrom((body as { out_trade_no?: unknown }).out_trade_no) || textFrom((body as { mch_order_id?: unknown }).mch_order_id)
  const secret = textFrom((body as { client_secret?: unknown }).client_secret)

  if (!orderId || !secret) {
    return NextResponse.json({ error: "缺少 order_id / client_secret" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const account = await resolveMpAccountContextForUser({
    userId: user.id,
    userEmail: user.email ?? null,
    userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
  }).catch(() => null)
  if (account && isStoreStaffAccount(account.role) && (account.companyId || account.storeId)) {
    return NextResponse.json(
      { error: "员工账号不需要单独购买服务包，请联系店长或负责人补充门店服务包。", code: "staff_purchase_blocked" },
      { status: 403 }
    )
  }

  const admin = createAdminSupabaseClient()
  const { data: order, error } = await admin
    .from("wechatpay_orders")
    .update({ user_id: user.id, claimed_at: new Date().toISOString() })
    .eq("out_trade_no", orderId)
    .eq("client_secret", secret)
    .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
    .single()

  if (error || !order) {
    return NextResponse.json({ error: "绑定失败（订单不存在或 secret 不正确）" }, { status: 404 })
  }

  let current = order
  if (current.status !== "paid") {
    const openid = metadataOpenid(user)
    if (openid) {
      try {
        const wxOrder = await queryVirtualPayOrder(orderId, openid)
        if (isVirtualPayOrderPaid(wxOrder)) {
          const { data: updated } = await admin
            .from("wechatpay_orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              wx_transaction_id:
                wxOrder.order?.wxpay_order_id ||
                wxOrder.order?.WechatPayInfo?.TransactionId ||
                wxOrder.order?.wx_order_id ||
                null,
              raw_notify: { provider: "wechat_virtual_pay", query_order: wxOrder },
            })
            .eq("out_trade_no", orderId)
            .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
            .single()
          if (updated) current = updated
        }
      } catch {
        // Keep stored status; frontend can retry claim later.
      }
    }
  }

  if (current.status === "paid") {
    await tryFulfillWechatpayOrder(orderId)
    await notifyVirtualPayGoods(orderId).catch(() => null)

    const { data: finalOrder } = await admin
      .from("wechatpay_orders")
      .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
      .eq("out_trade_no", orderId)
      .single()

    if (finalOrder) return NextResponse.json(finalOrder)
  }

  return NextResponse.json(current)
}
