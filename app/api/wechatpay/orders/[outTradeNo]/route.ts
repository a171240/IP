import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { wechatpayQueryByOutTradeNo } from "@/lib/wechatpay/wechatpay.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ outTradeNo: string }> }) {
  const { outTradeNo } = await params

  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-order-secret")

  if (!secret) {
    return NextResponse.json({ error: "缺少 secret" }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("wechatpay_orders")
    .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
    .eq("out_trade_no", outTradeNo)
    .eq("client_secret", secret)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 })
  }

  // Fallback: if notify callback didn't arrive, query WeChat Pay to sync order status.
  if (data.status !== "paid") {
    try {
      const wx = await wechatpayQueryByOutTradeNo(outTradeNo)
      if (wx.trade_state === "SUCCESS") {
        const paidAt = wx.success_time || new Date().toISOString()
        const transactionId = wx.transaction_id || null
        const { data: updated } = await admin
          .from("wechatpay_orders")
          .update({ status: "paid", paid_at: paidAt, wx_transaction_id: transactionId })
          .eq("out_trade_no", outTradeNo)
          .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
          .single()

        if (updated) {
          return NextResponse.json(updated)
        }
      }
    } catch {
      // ignore and return stored status
    }
  }

  return NextResponse.json(data)
}

