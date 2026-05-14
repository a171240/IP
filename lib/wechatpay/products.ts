import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

export type WechatpayProductId = "basic_month" | "pro_month" | "test_1fen"

export type WechatpayProduct = {
  id: WechatpayProductId
  name: string
  plan: PlanId
  amount_total: number // cents
  currency: "CNY"
  description: string
  credits_grant: number
}

function envInt(name: string): number | null {
  const raw = process.env[name]
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function envFlag(name: string): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

function priceCentsFor(productId: WechatpayProductId): number {
  if (productId === "test_1fen") return envInt("WECHAT_VIRTUAL_PAY_TEST_PRICE_CENTS") ?? 1
  if (productId === "basic_month") return envInt("WECHATPAY_PRICE_BASIC_CENTS") ?? 19900
  if (productId === "pro_month") return envInt("WECHATPAY_PRICE_PRO_CENTS") ?? 59900
  return 1
}

function isVirtualPayTestProductEnabled(): boolean {
  return envFlag("WECHAT_VIRTUAL_PAY_TEST_ENABLED")
}

export function getWechatpayProduct(productId: string | null | undefined): WechatpayProduct | null {
  const id =
    productId === "basic_month" || productId === "pro_month" || productId === "test_1fen"
      ? productId
      : null
  if (!id) return null

  if (id === "test_1fen") {
    if (!isVirtualPayTestProductEnabled()) return null

    return {
      id,
      name: "Test 0.01",
      plan: normalizePlan("free"),
      amount_total: priceCentsFor(id),
      currency: "CNY",
      description: "Virtual payment test product",
      credits_grant: envInt("WECHAT_VIRTUAL_PAY_TEST_CREDITS") ?? 1,
    }
  }

  if (id === "basic_month") {
    return {
      id,
      name: "Plus",
      plan: normalizePlan("basic"),
      amount_total: priceCentsFor(id),
      currency: "CNY",
      description: "Plus 会员购买",
      credits_grant: 300,
    }
  }

  return {
    id,
    name: "Pro",
    plan: normalizePlan("pro"),
    amount_total: priceCentsFor(id),
    currency: "CNY",
    description: "Pro 会员购买",
    credits_grant: 1200,
  }
}

export function listWechatpayProducts(): WechatpayProduct[] {
  return [
    getWechatpayProduct("test_1fen"),
    getWechatpayProduct("basic_month"),
    getWechatpayProduct("pro_month"),
  ].filter(Boolean) as WechatpayProduct[]
}

