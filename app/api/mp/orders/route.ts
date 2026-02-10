import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitRaw = url.searchParams.get("limit")
  const limit = Math.min(50, Math.max(1, Number(limitRaw || 20) || 20))

  const { data: orders, error } = await supabase
    .from("wechatpay_orders")
    .select(
      "out_trade_no,status,amount_total,currency,description,product_id,paid_at,grant_status,granted_at,created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "orders query failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, orders: orders || [] })
}

