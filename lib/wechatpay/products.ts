import { normalizePlan, type PlanId } from "@/lib/pricing/rules"

export type WechatpayProductId = "basic_month" | "pro_month"

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

function priceCentsFor(productId: WechatpayProductId): number {
  if (productId === "basic_month") return envInt("WECHATPAY_PRICE_BASIC_CENTS") ?? 19900
  if (productId === "pro_month") return envInt("WECHATPAY_PRICE_PRO_CENTS") ?? 59900
  return 1
}

export function getWechatpayProduct(productId: string | null | undefined): WechatpayProduct | null {
  const id = productId === "basic_month" || productId === "pro_month" ? productId : null
  if (!id) return null

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
  return [getWechatpayProduct("basic_month"), getWechatpayProduct("pro_month")].filter(Boolean) as WechatpayProduct[]
}

