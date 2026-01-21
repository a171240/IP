import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { tryFulfillWechatpayOrder } from "@/lib/wechatpay/fulfill.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 })
  }

  const outTradeNo = typeof (body as { out_trade_no?: unknown }).out_trade_no === "string" ? (body as { out_trade_no: string }).out_trade_no : ""
  const secret = typeof (body as { client_secret?: unknown }).client_secret === "string" ? (body as { client_secret: string }).client_secret : ""

  if (!outTradeNo || !secret) {
    return NextResponse.json({ error: "缺少 out_trade_no / client_secret" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from("wechatpay_orders")
    .update({ user_id: user.id, claimed_at: new Date().toISOString() })
    .eq("out_trade_no", outTradeNo)
    .eq("client_secret", secret)
    .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: "绑定失败（订单不存在或 secret 不正确）" }, { status: 404 })
  }

  // 绑定成功后，尝试自动开通权限
  if (updated.status === "paid") {
    await tryFulfillWechatpayOrder(outTradeNo)

    // 重新查询订单获取最新的 grant_status
    const { data: finalOrder } = await admin
      .from("wechatpay_orders")
      .select("out_trade_no,status,amount_total,currency,description,product_id,paid_at,wx_transaction_id,claimed_at,grant_status,granted_at,grant_error,created_at")
      .eq("out_trade_no", outTradeNo)
      .single()

    if (finalOrder) {
      return NextResponse.json(finalOrder)
    }
  }

  return NextResponse.json(updated)
}





