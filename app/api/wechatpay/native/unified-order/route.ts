import { NextRequest, NextResponse } from "next/server"

import crypto from "node:crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { wechatpayCreateNativeOrder } from "@/lib/wechatpay/wechatpay.server"
import { getWechatpayProduct } from "@/lib/wechatpay/products"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function randomOutTradeNo(): string {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const hh = String(now.getHours()).padStart(2, "0")
  const mi = String(now.getMinutes()).padStart(2, "0")
  const ss = String(now.getSeconds()).padStart(2, "0")
  const stamp = `${yyyy}${mm}${dd}${hh}${mi}${ss}`

  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const bytes = crypto.randomBytes(8)
  let rand = ""
  for (const b of bytes) rand += alphabet[b % alphabet.length]

  return `IPGC${stamp}${rand}`
}

function randomClientSecret(): string {
  return crypto.randomBytes(24).toString("base64url")
}

function isOrdersSchemaMissing(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes("relation") && m.includes("wechatpay_orders") && m.includes("does not exist")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return jsonError(400, "无效的请求体")

    // 支持 product_id 模式和自定义金额模式
    const productIdRaw = (body as { product_id?: unknown }).product_id
    const productId = typeof productIdRaw === "string" ? productIdRaw : null
    const product = getWechatpayProduct(productId)

    let amountTotal: number
    let description: string

    if (product) {
      // 使用产品配置的金额和描述
      amountTotal = product.amount_total
      description = product.description
    } else {
      // 自定义金额模式
      amountTotal = Number((body as { amount_total?: unknown }).amount_total)
      const descriptionRaw = (body as { description?: unknown }).description

      if (!Number.isInteger(amountTotal) || amountTotal <= 0) {
        return jsonError(400, "amount_total 必须是 > 0 的整数（单位：分）")
      }

      description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : ""
      if (!description) {
        return jsonError(400, "缺少 description")
      }
    }

    const notifyUrl = process.env.WECHATPAY_NOTIFY_URL
    if (!notifyUrl) {
      return jsonError(500, "缺少 WECHATPAY_NOTIFY_URL")
    }

    const admin = createAdminSupabaseClient()

    const outTradeNo = randomOutTradeNo()
    const clientSecret = randomClientSecret()

    const { error: insertError } = await admin.from("wechatpay_orders").insert({
      user_id: null,
      out_trade_no: outTradeNo,
      client_secret: clientSecret,
      description,
      amount_total: amountTotal,
      currency: "CNY",
      status: "created",
      product_id: product?.id || null,
    })

    if (insertError) {
      if (isOrdersSchemaMissing(insertError.message)) {
        return jsonError(500, "支付订单表未初始化，请先在 Supabase 执行 lib/supabase/wechatpay.sql")
      }
      return jsonError(500, `创建订单失败: ${insertError.message}`)
    }

    let codeUrl: string
    try {
      const created = await wechatpayCreateNativeOrder({
        outTradeNo,
        description,
        amountTotal,
        currency: "CNY",
        notifyUrl,
      })
      codeUrl = created.codeUrl
    } catch (error) {
      const msg = error instanceof Error ? error.message : "微信下单失败"
      await admin.from("wechatpay_orders").update({ status: "failed" }).eq("out_trade_no", outTradeNo)
      return jsonError(502, msg)
    }

    const { error: updateError } = await admin
      .from("wechatpay_orders")
      .update({ code_url: codeUrl })
      .eq("out_trade_no", outTradeNo)

    if (updateError) {
      return jsonError(500, `保存 code_url 失败: ${updateError.message}`, {
        out_trade_no: outTradeNo,
        code_url: codeUrl,
      })
    }

    return NextResponse.json({ out_trade_no: outTradeNo, client_secret: clientSecret, code_url: codeUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败"
    return jsonError(500, message)
  }
}
