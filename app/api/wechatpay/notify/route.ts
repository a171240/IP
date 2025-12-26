import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { decryptWechatpayResource, verifyWechatpayCallbackSignature } from "@/lib/wechatpay/wechatpay.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const bodyText = await request.text()

  const verified = verifyWechatpayCallbackSignature({ headers: request.headers, bodyText })
  if (!verified) {
    return new Response("invalid signature", { status: 401 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return new Response("invalid body", { status: 400 })
  }

  const resource = (parsed as { resource?: { ciphertext?: string; nonce?: string; associated_data?: string } }).resource
  if (!resource?.ciphertext || !resource?.nonce) {
    return new Response("missing resource", { status: 400 })
  }

  const decrypted = decryptWechatpayResource({
    ciphertext: resource.ciphertext,
    nonce: resource.nonce,
    associated_data: resource.associated_data,
  })

  const outTradeNo = typeof decrypted.out_trade_no === "string" ? decrypted.out_trade_no : ""
  const tradeState = typeof decrypted.trade_state === "string" ? decrypted.trade_state : ""
  const transactionId = typeof decrypted.transaction_id === "string" ? decrypted.transaction_id : null

  if (!outTradeNo) {
    return new Response("missing out_trade_no", { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const nextStatus = tradeState === "SUCCESS" ? "paid" : "failed"
  const update: Record<string, unknown> = {
    status: nextStatus,
    wx_transaction_id: transactionId,
    raw_notify: decrypted,
  }

  if (tradeState === "SUCCESS") {
    update.paid_at = new Date().toISOString()
  }

  await admin.from("wechatpay_orders").update(update).eq("out_trade_no", outTradeNo)

  return NextResponse.json({ code: "SUCCESS", message: "成功" })
}
