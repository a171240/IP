import { NextRequest, NextResponse } from "next/server"

import crypto from "node:crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { wechatpayBuildJsapiPayParams, wechatpayCreateJsapiOrder } from "@/lib/wechatpay/wechatpay.server"
import { getWechatpayProduct } from "@/lib/wechatpay/products"

export const runtime = "nodejs"

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

type RateLimitEntry = {
  count: number
  resetAt: number
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error, ...(extra || {}) }), {
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

function getRateLimitStore() {
  const globalStore = globalThis as typeof globalThis & {
    __wechatpayJsapiRateLimit?: Map<string, RateLimitEntry>
  }
  if (!globalStore.__wechatpayJsapiRateLimit) {
    globalStore.__wechatpayJsapiRateLimit = new Map()
  }
  return globalStore.__wechatpayJsapiRateLimit
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

function isUniqueViolation(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes("duplicate key") || m.includes("unique")
}

async function fetchLatestOrderByIdempotency(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  idempotencyKey: string
) {
  return admin
    .from("wechatpay_orders")
    .select("out_trade_no,client_secret,status,product_id,description,amount_total,created_at")
    .eq("idempotency_key", idempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function ensureProfileRowExists(admin: ReturnType<typeof createAdminSupabaseClient>, user: { id: string; email?: string | null; user_metadata?: unknown }) {
  const { data: existing, error } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (!error && existing?.id) return

  // If the profile row doesn't exist yet (e.g. first-time silent login), insert a default row
  // so that FK (wechatpay_orders.user_id -> profiles.id) won't fail.
  await admin.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
    nickname: (user.user_metadata as Record<string, unknown> | null)?.nickname || user.email?.split("@")[0] || "User",
    avatar_url: (user.user_metadata as Record<string, unknown> | null)?.avatar_url || null,
    plan: "free",
    credits_balance: 30,
    credits_unlimited: false,
  })
}

export async function POST(request: NextRequest) {
  try {
    const ipAddress = getClientIp(request)
    if (isRateLimited(ipAddress)) {
      return jsonError(429, "请求过于频繁，请稍后再试")
    }

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const openid = (user.user_metadata as Record<string, unknown> | null)?.wechat_openid
    if (typeof openid !== "string" || !openid.trim()) {
      // JSAPI requires openid; force re-login to refresh metadata.
      return jsonError(400, "缺少 openid，请退出后重新登录", { code: "missing_openid" })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return jsonError(400, "无效的请求体")

    const productIdRaw = (body as { product_id?: unknown }).product_id
    const productId = typeof productIdRaw === "string" ? productIdRaw.trim() : ""
    if (!productId) return jsonError(400, "缺少 product_id")

    const product = getWechatpayProduct(productId)
    if (!product) return jsonError(400, "未知的 product_id")

    const notifyUrl = process.env.WECHATPAY_NOTIFY_URL
    if (!notifyUrl) return jsonError(500, "缺少 WECHATPAY_NOTIFY_URL")

    const headerIdempotencyKey = request.headers.get("idempotency-key") || request.headers.get("Idempotency-Key")
    const bodyIdempotencyKey = (body as { idempotency_key?: unknown }).idempotency_key
    const idempotencyKey =
      (typeof headerIdempotencyKey === "string" ? headerIdempotencyKey.trim() : "") ||
      (typeof bodyIdempotencyKey === "string" ? bodyIdempotencyKey.trim() : "")

    const admin = createAdminSupabaseClient()
    await ensureProfileRowExists(admin, user)

    if (idempotencyKey) {
      const { data: existing } = await fetchLatestOrderByIdempotency(admin, idempotencyKey)
      if (existing?.out_trade_no && existing.status === "created" && existing.product_id === productId) {
        const created = await wechatpayCreateJsapiOrder({
          outTradeNo: existing.out_trade_no,
          description: existing.description,
          amountTotal: existing.amount_total,
          currency: "CNY",
          notifyUrl,
          payerOpenid: openid,
        })

        return NextResponse.json({
          out_trade_no: existing.out_trade_no,
          client_secret: existing.client_secret,
          prepay_id: created.prepayId,
          pay: wechatpayBuildJsapiPayParams({ prepayId: created.prepayId }),
        })
      }
    }

    const outTradeNo = randomOutTradeNo()
    const clientSecret = randomClientSecret()
    const userAgent = request.headers.get("user-agent") || ""
    const origin = request.headers.get("origin") || ""

    const { error: insertError } = await admin.from("wechatpay_orders").insert({
      user_id: user.id,
      out_trade_no: outTradeNo,
      client_secret: clientSecret,
      description: product.description,
      amount_total: product.amount_total,
      currency: "CNY",
      status: "created",
      product_id: product.id,
      idempotency_key: idempotencyKey || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      origin: origin || null,
    })

    if (insertError) {
      if (idempotencyKey && isUniqueViolation(insertError.message)) {
        const { data: existing } = await fetchLatestOrderByIdempotency(admin, idempotencyKey)
        if (existing?.out_trade_no && existing.status === "created" && existing.product_id === productId) {
          const created = await wechatpayCreateJsapiOrder({
            outTradeNo: existing.out_trade_no,
            description: existing.description,
            amountTotal: existing.amount_total,
            currency: "CNY",
            notifyUrl,
            payerOpenid: openid,
          })

          return NextResponse.json({
            out_trade_no: existing.out_trade_no,
            client_secret: existing.client_secret,
            prepay_id: created.prepayId,
            pay: wechatpayBuildJsapiPayParams({ prepayId: created.prepayId }),
          })
        }
        return jsonError(409, "订单创建处理中，请稍后重试")
      }

      return jsonError(500, `创建订单失败: ${insertError.message}`)
    }

    let prepayId: string
    try {
      const created = await wechatpayCreateJsapiOrder({
        outTradeNo,
        description: product.description,
        amountTotal: product.amount_total,
        currency: "CNY",
        notifyUrl,
        payerOpenid: openid,
      })
      prepayId = created.prepayId
    } catch (error) {
      const msg = error instanceof Error ? error.message : "微信下单失败"
      await admin.from("wechatpay_orders").update({ status: "failed" }).eq("out_trade_no", outTradeNo)
      return jsonError(502, msg)
    }

    // Best-effort store prepay_id (requires a schema update; safe to ignore any errors).
    const { error: storeErr } = await admin
      .from("wechatpay_orders")
      .update({ prepay_id: prepayId })
      .eq("out_trade_no", outTradeNo)
    void storeErr

    return NextResponse.json({
      out_trade_no: outTradeNo,
      client_secret: clientSecret,
      prepay_id: prepayId,
      pay: wechatpayBuildJsapiPayParams({ prepayId }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败"
    return jsonError(500, message)
  }
}
