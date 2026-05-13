import { NextRequest, NextResponse } from "next/server"

import crypto from "node:crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import {
  buildVirtualPayParams,
  exchangeWechatCodeForSession,
  getVirtualPayProduct,
} from "@/lib/wechatpay/virtual-pay.server"

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

  return `IPVP${stamp}${crypto.randomBytes(5).toString("hex")}`
}

function randomClientSecret(): string {
  return crypto.randomBytes(24).toString("base64url")
}

function getRateLimitStore() {
  const globalStore = globalThis as typeof globalThis & {
    __virtualPayOrderRateLimit?: Map<string, RateLimitEntry>
  }
  if (!globalStore.__virtualPayOrderRateLimit) {
    globalStore.__virtualPayOrderRateLimit = new Map()
  }
  return globalStore.__virtualPayOrderRateLimit
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

function textFrom(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function metadataOpenid(user: { user_metadata?: unknown }) {
  const meta = user.user_metadata
  if (!meta || typeof meta !== "object") return ""
  const value = (meta as Record<string, unknown>).wechat_openid
  return textFrom(value)
}

function isStoreStaffAccount(role: unknown) {
  const value = String(role || "").trim()
  return value === "staff" || value === "employee"
}

async function ensureProfileRowExists(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  user: { id: string; email?: string | null; user_metadata?: unknown }
) {
  const { data: existing, error } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (!error && existing?.id) return

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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return jsonError(400, "无效的请求体")

    const productId = textFrom((body as { product_id?: unknown }).product_id)
    if (!productId) return jsonError(400, "缺少 product_id")

    const loginCode = textFrom((body as { login_code?: unknown }).login_code)
    if (!loginCode) return jsonError(400, "缺少 login_code", { code: "missing_login_code" })
    const platform = textFrom((body as { platform?: unknown }).platform)

    const product = getVirtualPayProduct(productId)
    if (!product) return jsonError(400, "未知的 product_id")

    const account = await resolveMpAccountContextForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
    }).catch(() => null)
    if (account && isStoreStaffAccount(account.role) && (account.companyId || account.storeId)) {
      return jsonError(403, "员工账号不需要单独购买服务包，请联系店长或负责人补充门店服务包。", {
        code: "staff_purchase_blocked",
      })
    }

    const wechatSession = await exchangeWechatCodeForSession(loginCode)
    const boundOpenid = metadataOpenid(user)
    if (boundOpenid && boundOpenid !== wechatSession.openid) {
      return jsonError(400, "微信登录态与当前账号不一致，请重新登录", { code: "wechat_session_mismatch" })
    }

    const admin = createAdminSupabaseClient()
    await ensureProfileRowExists(admin, user)

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
      idempotency_key: null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      origin: origin || null,
      raw_notify: {
        provider: "wechat_virtual_pay",
        account_context: account
          ? {
              role: account.role,
              company_id: account.companyId,
              store_id: account.storeId,
              scope_label: account.scopeLabel,
            }
          : null,
      },
    })

    if (insertError) {
      return jsonError(500, `创建订单失败: ${insertError.message}`)
    }

    const pay = buildVirtualPayParams({
      outTradeNo,
      product,
      sessionKey: wechatSession.sessionKey,
      platform,
    })

    return NextResponse.json({
      order_id: outTradeNo,
      out_trade_no: outTradeNo,
      client_secret: clientSecret,
      pay,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败"
    return jsonError(500, message)
  }
}
