import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { tryFulfillWechatpayOrder } from "@/lib/wechatpay/fulfill.server"
import { isVirtualPayOrderPaid, queryVirtualPayOrder } from "@/lib/wechatpay/virtual-pay.server"

export const runtime = "nodejs"

function metadataOpenid(user: { user_metadata?: unknown }) {
  const meta = user.user_metadata
  if (!meta || typeof meta !== "object") return ""
  const value = (meta as Record<string, unknown>).wechat_openid
  return typeof value === "string" ? value.trim() : ""
}

function toPublicOrder(order: Record<string, unknown>) {
  const safeOrder = { ...order }
  delete safeOrder.client_secret
  delete safeOrder.user_id
  return safeOrder
}

async function refreshPublicOrder(admin: ReturnType<typeof createAdminSupabaseClient>, orderId: string) {
  const { data } = await admin
    .from("wechatpay_orders")
    .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
    .eq("out_trade_no", orderId)
    .single()

  return data
}

async function fulfillAndReturn(admin: ReturnType<typeof createAdminSupabaseClient>, orderId: string, fallback: Record<string, unknown>) {
  await tryFulfillWechatpayOrder(orderId)
  const finalOrder = await refreshPublicOrder(admin, orderId)
  return NextResponse.json(toPublicOrder(finalOrder || fallback))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-order-secret") || ""

  if (!secret) {
    return NextResponse.json({ error: "缺少 secret" }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("wechatpay_orders")
    .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at,client_secret,user_id")
    .eq("out_trade_no", orderId)
    .eq("client_secret", secret)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 })
  }

  if (data.status === "paid") {
    if (data.grant_status !== "granted") {
      return fulfillAndReturn(admin, orderId, data)
    }

    return NextResponse.json(toPublicOrder(data))
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const openid = user ? metadataOpenid(user) : ""
  if (!openid) {
    return NextResponse.json(toPublicOrder(data))
  }

  try {
    const wxOrder = await queryVirtualPayOrder(orderId, openid)
    if (isVirtualPayOrderPaid(wxOrder)) {
      const paidAt = new Date().toISOString()
      const wxTransactionId =
        wxOrder.order?.wxpay_order_id ||
        wxOrder.order?.WechatPayInfo?.TransactionId ||
        wxOrder.order?.wx_order_id ||
        null
      const { data: updated } = await admin
        .from("wechatpay_orders")
        .update({
          status: "paid",
          paid_at: paidAt,
          wx_transaction_id: wxTransactionId,
          raw_notify: { provider: "wechat_virtual_pay", query_order: wxOrder },
        })
        .eq("out_trade_no", orderId)
        .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
        .single()

      if (updated) return fulfillAndReturn(admin, orderId, updated)
    }
  } catch {
    // Return stored status when WeChat query is temporarily unavailable.
  }

  return NextResponse.json(toPublicOrder(data))
}
