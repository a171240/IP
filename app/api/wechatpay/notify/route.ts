import { NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { decryptWechatpayResource, verifyWechatpayCallbackSignature } from "@/lib/wechatpay/wechatpay.server"
import { tryFulfillWechatpayOrder } from "@/lib/wechatpay/fulfill.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const bodyText = await request.text()

  const verified = verifyWechatpayCallbackSignature({ headers: request.headers, bodyText })
  if (!verified) {
    console.error("wechatpay notify invalid signature", {
      serial: request.headers.get("wechatpay-serial"),
      timestamp: request.headers.get("wechatpay-timestamp"),
      nonce: request.headers.get("wechatpay-nonce"),
      hasSignature: Boolean(request.headers.get("wechatpay-signature")),
    })
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
  const successTime = typeof decrypted.success_time === "string" ? decrypted.success_time : null

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
    update.paid_at = successTime || new Date().toISOString()
  }

  const { error } = await admin.from("wechatpay_orders").update(update).eq("out_trade_no", outTradeNo)
  if (error) {
    console.error("wechatpay notify db update failed", { outTradeNo, message: error.message })
    return new Response("db update failed", { status: 500 })
  }

  // 支付成功后，尝试自动开通权限（如果订单已绑定用户）
  if (tradeState === "SUCCESS") {
    try {
      await tryFulfillWechatpayOrder(outTradeNo)
    } catch (e) {
      // 开通失败不影响回调响应，记录日志即可
      console.error("wechatpay notify fulfill failed", { outTradeNo, error: e })
    }
  }

  return NextResponse.json({ code: "SUCCESS", message: "成功" })
}
