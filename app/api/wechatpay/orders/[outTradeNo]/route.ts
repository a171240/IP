import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

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
    .select("out_trade_no,status,amount_total,currency,description,paid_at,wx_transaction_id,created_at")
    .eq("out_trade_no", outTradeNo)
    .eq("client_secret", secret)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 })
  }

  return NextResponse.json(data)
}
