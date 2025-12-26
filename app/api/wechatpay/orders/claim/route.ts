import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

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

  const supabase = await createServerSupabaseClient()
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
    .select("out_trade_no,status,amount_total,currency,description,paid_at,wx_transaction_id,claimed_at,created_at")
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: "绑定失败（订单不存在或 secret 不正确）" }, { status: 404 })
  }

  return NextResponse.json(updated)
}

