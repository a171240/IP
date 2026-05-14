import "server-only"

import crypto from "node:crypto"

import { getWechatpayProduct, listWechatpayProducts, type WechatpayProduct } from "@/lib/wechatpay/products"

export type VirtualPayConfig = {
  appId: string
  appSecret: string
  offerId: string
  appKey: string
  env: 0 | 1
  currencyType: "CNY"
  platform: string
  zoneId: string
  mode: string
}

export type VirtualPayOrderParams = {
  outTradeNo: string
  product: WechatpayProduct
  sessionKey: string
  platform?: string
}

export type VirtualPayParams = {
  signData: string
  paySig: string
  signature: string
  mode: string
}

export type VirtualPayQueryOrder = {
  errcode?: number
  errmsg?: string
  order?: {
    order_id?: string
    wx_order_id?: string
    status?: number
    order_fee?: number
    paid_fee?: number
    wxpay_order_id?: string
    WechatPayInfo?: {
      TransactionId?: string
      PaidTime?: number
    }
  }
}

type WechatSession = {
  openid: string
  sessionKey: string
  unionid: string
}

function firstText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function envInt(name: string): number | null {
  const raw = process.env[name]
  if (!raw) return null

  const n = Number(raw)
  if (!Number.isInteger(n)) return null
  return n
}

function requireText(value: string, message: string): string {
  if (!value) throw new Error(message)
  return value
}

function paySigFor(uri: string, bodyText: string, appKey: string): string {
  return crypto.createHmac("sha256", appKey).update(`${uri}&${bodyText}`).digest("hex")
}

export function getVirtualPayConfig(): VirtualPayConfig {
  const envRaw = envInt("WECHAT_VIRTUAL_PAY_ENV") ?? envInt("WECHAT_XPAY_ENV") ?? 0
  const env = envRaw === 1 ? 1 : 0
  const appKey =
    env === 1
      ? firstText(process.env.WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY, process.env.WECHAT_XPAY_SANDBOX_APP_KEY, process.env.WECHAT_VIRTUAL_PAY_APP_KEY, process.env.WECHAT_XPAY_APP_KEY)
      : firstText(process.env.WECHAT_VIRTUAL_PAY_APP_KEY, process.env.WECHAT_XPAY_APP_KEY)

  return {
    appId: requireText(firstText(process.env.WECHAT_MINI_APPID, process.env.WX_MINI_APPID), "缺少 WECHAT_MINI_APPID"),
    appSecret: requireText(firstText(process.env.WECHAT_MINI_SECRET, process.env.WX_MINI_SECRET), "缺少 WECHAT_MINI_SECRET"),
    offerId: requireText(firstText(process.env.WECHAT_VIRTUAL_PAY_OFFER_ID, process.env.WECHAT_XPAY_OFFER_ID), "缺少 WECHAT_VIRTUAL_PAY_OFFER_ID"),
    appKey: requireText(appKey, env === 1 ? "缺少 WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY" : "缺少 WECHAT_VIRTUAL_PAY_APP_KEY"),
    env,
    currencyType: "CNY",
    platform: firstText(process.env.WECHAT_VIRTUAL_PAY_PLATFORM, process.env.WECHAT_XPAY_PLATFORM, "android"),
    zoneId: firstText(process.env.WECHAT_VIRTUAL_PAY_ZONE_ID, process.env.WECHAT_XPAY_ZONE_ID, "1"),
    mode: firstText(process.env.WECHAT_VIRTUAL_PAY_MODE, process.env.WECHAT_XPAY_MODE, "short_series_goods"),
  }
}

export async function getWechatAccessToken(config = getVirtualPayConfig()): Promise<string> {
  const globalStore = globalThis as typeof globalThis & {
    __wechatMiniAccessToken?: { token: string; expiresAt: number }
  }
  const cached = globalStore.__wechatMiniAccessToken
  if (cached?.token && cached.expiresAt > Date.now() + 60_000) return cached.token

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token")
  url.searchParams.set("grant_type", "client_credential")
  url.searchParams.set("appid", config.appId)
  url.searchParams.set("secret", config.appSecret)

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(`微信 access_token 获取失败: ${res.status}`)

  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }
    | null
  if (!data?.access_token) throw new Error(data?.errmsg || "微信 access_token 缺失")

  globalStore.__wechatMiniAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000,
  }
  return data.access_token
}

export function listVirtualPayProducts() {
  return listWechatpayProducts().map((product) => ({
    ...product,
    ai_points_grant: product.credits_grant,
    virtual_product_id: virtualProductIdFor(product.id),
  }))
}

export function getVirtualPayProduct(productId: string | null | undefined) {
  return getWechatpayProduct(productId)
}

export function virtualProductIdFor(productId: string): string {
  const normalized = productId.toUpperCase().replace(/[^A-Z0-9_]/g, "_")
  return firstText(process.env[`WECHAT_VIRTUAL_PAY_PRODUCT_${normalized}`], process.env[`WECHAT_XPAY_PRODUCT_${normalized}`], productId)
}

export async function exchangeWechatCodeForSession(code: string, config = getVirtualPayConfig()): Promise<WechatSession> {
  if (!code) throw new Error("缺少 login_code")

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session")
  url.searchParams.set("appid", config.appId)
  url.searchParams.set("secret", config.appSecret)
  url.searchParams.set("js_code", code)
  url.searchParams.set("grant_type", "authorization_code")

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(`微信登录态换取失败: ${res.status}`)

  const data = (await res.json().catch(() => null)) as
    | { errcode?: number; errmsg?: string; openid?: string; session_key?: string; unionid?: string }
    | null

  if (!data || data.errcode || !data.openid || !data.session_key) {
    throw new Error(data?.errmsg || "微信登录态缺少 openid/session_key")
  }

  return {
    openid: data.openid,
    sessionKey: data.session_key,
    unionid: data.unionid || "",
  }
}

export function buildVirtualPayParams(params: VirtualPayOrderParams, config = getVirtualPayConfig()): VirtualPayParams {
  const signPayload = {
    offerId: config.offerId,
    buyQuantity: 1,
    env: config.env,
    currencyType: config.currencyType,
    platform: firstText(params.platform, config.platform, "android"),
    zoneId: config.zoneId,
    productId: virtualProductIdFor(params.product.id),
    goodsPrice: params.product.amount_total,
    outTradeNo: params.outTradeNo,
    attach: JSON.stringify({ productId: params.product.id, outTradeNo: params.outTradeNo }),
  }
  const signData = JSON.stringify(signPayload)

  const paySig = crypto.createHmac("sha256", config.appKey).update(`requestVirtualPayment&${signData}`).digest("hex")
  const signature = crypto.createHmac("sha256", params.sessionKey).update(signData).digest("hex")

  return {
    signData,
    paySig,
    signature,
    mode: config.mode,
  }
}

async function postVirtualPayApi<T>(uri: string, body: Record<string, unknown>, config = getVirtualPayConfig()): Promise<T> {
  const accessToken = await getWechatAccessToken(config)
  const bodyText = JSON.stringify(body)
  const url = new URL(`https://api.weixin.qq.com${uri}`)
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("pay_sig", paySigFor(uri, bodyText, config.appKey))

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyText,
    cache: "no-store",
  })
  const data = (await res.json().catch(() => null)) as T & { errcode?: number; errmsg?: string }
  if (!res.ok) throw new Error(`微信虚拟支付接口请求失败: ${res.status}`)
  if (data?.errcode) throw new Error(data.errmsg || `微信虚拟支付接口错误: ${data.errcode}`)
  return data
}

export async function queryVirtualPayOrder(orderId: string, openid: string, config = getVirtualPayConfig()) {
  return postVirtualPayApi<VirtualPayQueryOrder>("/xpay/query_order", {
    openid,
    env: config.env,
    order_id: orderId,
  }, config)
}

export async function notifyVirtualPayGoods(orderId: string, config = getVirtualPayConfig()) {
  return postVirtualPayApi<{ errcode?: number; errmsg?: string }>("/xpay/notify_provide_goods", {
    order_id: orderId,
    env: config.env,
  }, config)
}

export function isVirtualPayOrderPaid(wxOrder: VirtualPayQueryOrder | null | undefined): boolean {
  const status = Number(wxOrder?.order?.status)
  return status === 2 || status === 3 || status === 4
}
