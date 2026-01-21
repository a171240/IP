import { NextRequest, NextResponse } from "next/server"

import crypto from "node:crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { wechatpayCreateNativeOrder } from "@/lib/wechatpay/wechatpay.server"
import { getWechatpayProduct } from "@/lib/wechatpay/products"

export const runtime = "nodejs"

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const MAX_AMOUNT_TOTAL = 500_000
const DESCRIPTION_MIN_LENGTH = 1
const DESCRIPTION_MAX_LENGTH = 120

type RateLimitEntry = {
  count: number
  resetAt: number
}

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

function getRateLimitStore() {
  const globalStore = globalThis as typeof globalThis & {
    __wechatpayRateLimit?: Map<string, RateLimitEntry>
  }
  if (!globalStore.__wechatpayRateLimit) {
    globalStore.__wechatpayRateLimit = new Map()
  }
  return globalStore.__wechatpayRateLimit
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for") || ""
  const firstForwarded = forwardedFor.split(",")[0]?.trim()
  if (firstForwarded) return firstForwarded
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "unknown"
}

function isRateLimited(ip: string): boolean {
  const store = getRateLimitStore()
  const now = Date.now()
  const entry = store.get(ip)
  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

function normalizeDescription(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < DESCRIPTION_MIN_LENGTH || trimmed.length > DESCRIPTION_MAX_LENGTH) {
    return null
  }
  return trimmed
}

async function fetchIdempotentOrder(admin: ReturnType<typeof createAdminSupabaseClient>, idempotencyKey: string) {
  return admin
    .from("wechatpay_orders")
    .select("out_trade_no,client_secret,code_url,status,created_at")
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["created"])
    .not("code_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function fetchLatestOrderByIdempotency(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  idempotencyKey: string
) {
  return admin
    .from("wechatpay_orders")
    .select("out_trade_no,client_secret,code_url,status,created_at")
    .eq("idempotency_key", idempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
}

function isUniqueViolation(message: string | undefined): boolean {
  if (!message) return false
  return message.toLowerCase().includes("duplicate key") || message.toLowerCase().includes("unique")
}

export async function POST(request: NextRequest) {
  try {
    const ipAddress = getClientIp(request)
    if (isRateLimited(ipAddress)) {
      return jsonError(429, "请求过于频繁，请稍后再试")
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return jsonError(400, "无效的请求体")

    // 支持 product_id 模式和自定义金额模式
    const productIdRaw = (body as { product_id?: unknown }).product_id
    const hasProductId = typeof productIdRaw === "string"
    const productId = hasProductId ? productIdRaw.trim() : null
    const product = productId ? getWechatpayProduct(productId) : null

    let amountTotal: number
    let description: string

    if (hasProductId) {
      if (!product) {
        return jsonError(400, "未知的 product_id")
      }

      amountTotal = product.amount_total
      if (!Number.isInteger(amountTotal) || amountTotal <= 0 || amountTotal > MAX_AMOUNT_TOTAL) {
        return jsonError(400, "商品金额配置无效")
      }

      const normalized = normalizeDescription(product.description)
      if (!normalized) {
        return jsonError(400, "商品描述长度不合法")
      }
      description = normalized
    } else {
      // 自定义金额模式（仅在未提供 product_id 时允许）
      amountTotal = Number((body as { amount_total?: unknown }).amount_total)
      if (!Number.isInteger(amountTotal) || amountTotal <= 0 || amountTotal > MAX_AMOUNT_TOTAL) {
        return jsonError(400, `amount_total 必须是 1-${MAX_AMOUNT_TOTAL} 的整数（单位：分）`)
      }

      const descriptionRaw = (body as { description?: unknown }).description
      if (typeof descriptionRaw !== "string") {
        return jsonError(400, "缺少 description")
      }

      const normalized = normalizeDescription(descriptionRaw)
      if (!normalized) {
        return jsonError(400, `description 长度必须在 ${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} 字符`)
      }
      description = normalized
    }

    const notifyUrl = process.env.WECHATPAY_NOTIFY_URL
    if (!notifyUrl) {
      return jsonError(500, "缺少 WECHATPAY_NOTIFY_URL")
    }

    const admin = createAdminSupabaseClient()

    const headerIdempotencyKey =
      request.headers.get("idempotency-key") || request.headers.get("Idempotency-Key")
    const bodyIdempotencyKey = (body as { idempotency_key?: unknown }).idempotency_key
    const idempotencyKey =
      (typeof headerIdempotencyKey === "string" ? headerIdempotencyKey.trim() : "") ||
      (typeof bodyIdempotencyKey === "string" ? bodyIdempotencyKey.trim() : "")

    if (idempotencyKey) {
      const { data: existingOrder, error: existingError } = await fetchIdempotentOrder(
        admin,
        idempotencyKey
      )
      if (existingError) {
        return jsonError(500, `查询订单失败: ${existingError.message}`)
      }
      if (existingOrder?.code_url) {
        return NextResponse.json({
          out_trade_no: existingOrder.out_trade_no,
          client_secret: existingOrder.client_secret,
          code_url: existingOrder.code_url,
        })
      }
    }

    const outTradeNo = randomOutTradeNo()
    const clientSecret = randomClientSecret()
    const userAgent = request.headers.get("user-agent") || ""
    const origin = request.headers.get("origin") || ""

    const { error: insertError } = await admin.from("wechatpay_orders").insert({
      user_id: null,
      out_trade_no: outTradeNo,
      client_secret: clientSecret,
      description,
      amount_total: amountTotal,
      currency: "CNY",
      status: "created",
      product_id: product?.id || null,
      idempotency_key: idempotencyKey || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      origin: origin || null,
    })

    if (insertError) {
      if (isOrdersSchemaMissing(insertError.message)) {
        return jsonError(500, "支付订单表未初始化，请先在 Supabase 执行 lib/supabase/wechatpay.sql")
      }
      if (idempotencyKey && isUniqueViolation(insertError.message)) {
        const { data: existingOrder } = await fetchLatestOrderByIdempotency(admin, idempotencyKey)
        if (existingOrder?.code_url) {
          return NextResponse.json({
            out_trade_no: existingOrder.out_trade_no,
            client_secret: existingOrder.client_secret,
            code_url: existingOrder.code_url,
          })
        }
        return jsonError(409, "订单创建处理中，请稍后重试")
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
