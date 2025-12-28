"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import QRCode from "qrcode"

import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// 智能轮询配置
const POLL_CONFIG = {
  initialInterval: 1500,    // 初始轮询间隔 1.5 秒
  maxInterval: 8000,        // 最大轮询间隔 8 秒
  fastPollCount: 10,        // 前 N 次快速轮询
}

type UnifiedOrderResponse = {
  out_trade_no: string
  client_secret: string
  code_url: string
}

type Product = {
  id: string
  name: string
  plan: "free" | "basic" | "pro" | "vip"
  amount_total: number
  currency: string
  description: string
  credits_grant: number
}

type OrderStatusResponse = {
  out_trade_no: string
  status: "created" | "paid" | "closed" | "failed"
  amount_total: number
  currency: string
  description: string
  product_id?: string | null
  paid_at: string | null
  wx_transaction_id: string | null
  claimed_at?: string | null
  grant_status?: string | null
  granted_at?: string | null
  grant_error?: string | null
  created_at: string
}

type StoredOrder = {
  out_trade_no: string
  client_secret: string
  code_url?: string
  product_id?: string | null
}

const STORAGE_KEY = "wechatpay:last_order"

function centsFromYuan(input: string): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

export function PayPageClient() {
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const productFromUrl = searchParams.get("product")
  const allowCustom = searchParams.get("mode") === "custom"

  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(productFromUrl)

  const [amountYuan, setAmountYuan] = useState("0.01")
  const [description, setDescription] = useState("测试支付")

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [order, setOrder] = useState<StoredOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<OrderStatusResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [autoCreateAttempted, setAutoCreateAttempted] = useState(false)

  const pollTimer = useRef<number | null>(null)
  const pollAttempts = useRef(0)

  const amountTotal = useMemo(() => centsFromYuan(amountYuan), [amountYuan])
  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) || null : null),
    [products, selectedProductId]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setProductsLoading(true)
      try {
        const res = await fetch("/api/wechatpay/products")
        const data = (await res.json()) as { products?: Product[]; error?: string }
        if (!res.ok) throw new Error(data.error || "获取套餐失败")
        const list = Array.isArray(data.products) ? data.products : []
        if (!cancelled) setProducts(list)
      } catch {
        if (!cancelled) setProducts([])
      } finally {
        if (!cancelled) setProductsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (productFromUrl) setSelectedProductId(productFromUrl)
  }, [productFromUrl])

  useEffect(() => {
    if (allowCustom) return
    if (selectedProductId) return
    if (productsLoading) return
    if (products.length > 0) setSelectedProductId(products[0]!.id)
  }, [allowCustom, products, productsLoading, selectedProductId])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoredOrder
      if (parsed?.out_trade_no && parsed?.client_secret) {
        setOrder(parsed)
        if (parsed.product_id && !productFromUrl) setSelectedProductId(parsed.product_id)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!order?.code_url) {
      setQrDataUrl(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const url = await QRCode.toDataURL(order.code_url!, { margin: 1, width: 280 })
        if (!cancelled) setQrDataUrl(url)
      } catch (e) {
        if (!cancelled) setQrDataUrl(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [order?.code_url])

  async function refreshStatus() {
    if (!order?.out_trade_no || !order?.client_secret) return

    const res = await fetch(`/api/wechatpay/orders/${encodeURIComponent(order.out_trade_no)}?secret=${encodeURIComponent(order.client_secret)}`)
    const data = (await res.json()) as OrderStatusResponse | { error: string }
    if (!res.ok) {
      throw new Error("error" in data ? data.error : "查单失败")
    }

    setOrderStatus(data as OrderStatusResponse)

    const claimedAt = (data as OrderStatusResponse).claimed_at
    if (claimedAt) setClaimed(true)
  }

  // 智能轮询：前 10 次快速轮询，之后逐渐退避
  useEffect(() => {
    if (!order?.out_trade_no || !order?.client_secret) return

    let stopped = false
    pollAttempts.current = 0

    const poll = async () => {
      if (stopped) return

      // 如果订单已完成，停止轮询
      if (orderStatus?.status === "paid" || orderStatus?.status === "closed" || orderStatus?.status === "failed") {
        return
      }

      try {
        await refreshStatus()
      } catch {
        // ignore
      }

      pollAttempts.current++

      // 计算下次轮询间隔
      let nextInterval = POLL_CONFIG.initialInterval
      if (pollAttempts.current > POLL_CONFIG.fastPollCount) {
        // 快速轮询结束后，逐渐增加间隔
        const factor = Math.min(pollAttempts.current - POLL_CONFIG.fastPollCount, 10)
        nextInterval = Math.min(
          POLL_CONFIG.initialInterval + factor * 500,
          POLL_CONFIG.maxInterval
        )
      }

      if (!stopped) {
        pollTimer.current = window.setTimeout(poll, nextInterval)
      }
    }

    // 立即执行一次查询
    poll()

    return () => {
      stopped = true
      if (pollTimer.current) {
        window.clearTimeout(pollTimer.current)
        pollTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.out_trade_no, order?.client_secret])

  async function createOrder() {
    setError(null)

    const usingProduct = Boolean(selectedProduct)

    if (!usingProduct && !allowCustom) {
      setError("请从定价页面进入购买，或使用 /pay?mode=custom 测试自定义金额")
      return
    }

    if (!usingProduct) {
      if (!Number.isInteger(amountTotal) || amountTotal <= 0) {
        setError("请输入正确金额（单位：元）")
        return
      }

      const desc = description.trim()
      if (!desc) {
        setError("请输入商品描述")
        return
      }
    }

    setCreating(true)
    try {
      const res = await fetch("/api/wechatpay/native/unified-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usingProduct ? { product_id: selectedProduct!.id } : { amount_total: amountTotal, description: description.trim() }
        ),
      })

      const data = (await res.json()) as UnifiedOrderResponse | { error: string }
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "下单失败")
      }

      const nextOrder: StoredOrder = {
        out_trade_no: (data as UnifiedOrderResponse).out_trade_no,
        client_secret: (data as UnifiedOrderResponse).client_secret,
        code_url: (data as UnifiedOrderResponse).code_url,
        product_id: usingProduct ? selectedProduct!.id : null,
      }

      setOrder(nextOrder)
      setOrderStatus(null)
      setClaimed(false)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrder))
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败")
    } finally {
      setCreating(false)
    }
  }

  async function claimOrder() {
    if (!order?.out_trade_no || !order?.client_secret) return
    setError(null)
    setClaiming(true)

    try {
      const res = await fetch("/api/wechatpay/orders/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ out_trade_no: order.out_trade_no, client_secret: order.client_secret }),
      })
      const data = (await res.json()) as OrderStatusResponse | { error: string }
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "绑定失败")
      }
      setClaimed(true)
      setOrderStatus(data as OrderStatusResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "绑定失败")
    } finally {
      setClaiming(false)
    }
  }

  const canClaim = Boolean(user) && orderStatus?.status === "paid" && !claimed

  // 自动创建订单：当从 URL 带有 product 参数且产品加载完成时
  useEffect(() => {
    // 只在从定价页跳转过来时自动创建（有 product 参数）
    if (!productFromUrl) return
    // 产品列表还在加载
    if (productsLoading) return
    // 选中的产品不存在
    if (!selectedProduct) return
    // 已经在创建中
    if (creating) return
    // 已经尝试过自动创建
    if (autoCreateAttempted) return

    // 如果已有未支付订单且产品相同，不重新创建
    if (order && order.product_id === selectedProductId) {
      if (!orderStatus || orderStatus.status === "created") {
        setAutoCreateAttempted(true)
        return
      }
    }

    // 如果已有订单但产品不同，或者订单已完成，则创建新订单
    setAutoCreateAttempted(true)
    createOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productFromUrl, productsLoading, selectedProduct, creating, autoCreateAttempted])

  // 自动绑定：当支付成功且用户已登录时
  useEffect(() => {
    // 必须是已支付状态
    if (orderStatus?.status !== "paid") return
    // 用户必须已登录
    if (!user) return
    // 已经绑定过或正在绑定
    if (claimed || claiming) return
    // 如果订单已有 claimed_at，说明已绑定
    if (orderStatus?.claimed_at) return

    // 自动触发绑定
    claimOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStatus?.status, user, claimed, claiming, orderStatus?.claimed_at])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">微信支付</h1>
        <p className="mt-2 text-sm text-muted-foreground">用微信扫一扫完成支付，支付成功后会自动开通权限。</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{productFromUrl ? "确认订单" : "创建订单"}</CardTitle>
            <CardDescription>
              {productFromUrl ? "正在为您准备支付二维码..." : "选择套餐后生成二维码，用微信扫一扫支付。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>套餐</Label>
              {productsLoading ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
              ) : products.length === 0 ? (
                <div className="text-sm text-red-500">套餐加载失败，请刷新重试</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {products.map((p) => {
                    const active = p.id === selectedProductId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProductId(p.id)}
                        className={`rounded-xl border p-4 text-left transition-colors ${
                          active ? "border-emerald-500/40 bg-emerald-500/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">{p.name}</div>
                          <div className="font-mono text-sm">¥{(p.amount_total / 100).toFixed(2)}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">赠送 {p.credits_grant} 积分</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {allowCustom && (
              <div className="grid gap-3 rounded-xl border p-4">
                <div className="text-sm font-medium">自定义金额（测试模式）</div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">金额（元）</Label>
                  <Input id="amount" value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} placeholder="例如 9.9" />
                  <div className="text-xs text-muted-foreground">将以 {Number.isFinite(amountTotal) ? amountTotal : "-"} 分下单</div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="desc">描述</Label>
                  <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：会员充值" />
                </div>
                <div className="text-xs text-muted-foreground">测试下单不会自动开通权限与积分</div>
                <Button variant="outline" onClick={() => setSelectedProductId(null)}>
                  使用自定义金额下单
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* 从定价页跳转时显示加载状态，否则显示手动按钮 */}
              {productFromUrl && !order && creating ? (
                <Button disabled>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  正在创建订单...
                </Button>
              ) : (
                <Button onClick={createOrder} disabled={creating}>
                  {creating ? "下单中..." : order ? "重新生成二维码" : "生成二维码"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEY)
                  setOrder(null)
                  setOrderStatus(null)
                  setQrDataUrl(null)
                  setClaimed(false)
                  setError(null)
                  setAutoCreateAttempted(false)
                }}
              >
                清空本地订单
              </Button>
              <Button variant="secondary" onClick={() => refreshStatus().catch((e) => setError(e instanceof Error ? e.message : "查单失败"))} disabled={!order}>
                刷新支付状态
              </Button>
            </div>

            {error && <div className="text-sm text-red-500">{error}</div>}
          </CardContent>
        </Card>

        {order && (
          <Card>
            <CardHeader>
              <CardTitle>扫码支付</CardTitle>
              <CardDescription>订单号：{order.out_trade_no}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="微信支付二维码" className="h-[280px] w-[280px] rounded-xl border bg-white p-2" />
                ) : (
                  <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl border text-sm text-muted-foreground">
                    生成二维码中...
                  </div>
                )}
                <div className="text-sm text-muted-foreground">请使用微信扫一扫完成支付</div>
              </div>

              <div className="grid gap-2 rounded-xl border p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">状态</div>
                  <div className="font-medium">{orderStatus?.status || "-"}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">套餐</div>
                  <div className="font-mono text-xs">{orderStatus?.product_id || order.product_id || "-"}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">开通</div>
                  <div className="font-medium">{orderStatus?.grant_status || "-"}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">微信交易号</div>
                  <div className="font-mono text-xs break-all">{orderStatus?.wx_transaction_id || "-"}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">支付时间</div>
                  <div className="font-mono text-xs">{orderStatus?.paid_at || "-"}</div>
                </div>
              </div>

              {orderStatus?.status === "paid" && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
                  <div className="font-semibold text-emerald-400">支付成功</div>
                  {orderStatus?.grant_status === "granted" ? (
                    <div className="mt-1 text-muted-foreground">已自动开通权限与积分，可直接进入产品使用。</div>
                  ) : orderStatus?.grant_status === "failed" ? (
                    <div className="mt-1 text-red-500">自动开通失败：{orderStatus?.grant_error || "请联系客服处理"}</div>
                  ) : claiming ? (
                    <div className="mt-1 text-muted-foreground flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      正在绑定并开通权限...
                    </div>
                  ) : !user ? (
                    <div className="mt-1 text-muted-foreground">支付成功！请登录后自动绑定并开通权限。</div>
                  ) : claimed ? (
                    <div className="mt-1 text-muted-foreground flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      正在开通权限与积分...
                    </div>
                  ) : (
                    <div className="mt-1 text-muted-foreground">正在处理订单...</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {orderStatus?.grant_status === "granted" && (
                      <Button asChild>
                        <a href="/dashboard">进入控制台</a>
                      </Button>
                    )}
                    {!user && (
                      <>
                        <Button asChild>
                          <a href="/auth/login">去登录</a>
                        </Button>
                        <Button asChild variant="outline">
                          <a href="/auth/register">去注册</a>
                        </Button>
                      </>
                    )}
                    {canClaim && (
                      <Button onClick={claimOrder} disabled={claiming || authLoading}>
                        {claiming ? "绑定中..." : "手动绑定"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
