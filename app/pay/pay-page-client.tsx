"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"

import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type UnifiedOrderResponse = {
  out_trade_no: string
  client_secret: string
  code_url: string
}

type OrderStatusResponse = {
  out_trade_no: string
  status: "created" | "paid" | "closed" | "failed"
  amount_total: number
  currency: string
  description: string
  paid_at: string | null
  wx_transaction_id: string | null
  claimed_at?: string | null
  created_at: string
}

type StoredOrder = {
  out_trade_no: string
  client_secret: string
  code_url?: string
}

const STORAGE_KEY = "wechatpay:last_order"

function centsFromYuan(input: string): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

export function PayPageClient() {
  const { user, loading: authLoading } = useAuth()

  const [amountYuan, setAmountYuan] = useState("0.01")
  const [description, setDescription] = useState("测试支付")

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [order, setOrder] = useState<StoredOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<OrderStatusResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)

  const pollTimer = useRef<number | null>(null)

  const amountTotal = useMemo(() => centsFromYuan(amountYuan), [amountYuan])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoredOrder
      if (parsed?.out_trade_no && parsed?.client_secret) {
        setOrder(parsed)
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

  useEffect(() => {
    if (!order?.out_trade_no || !order?.client_secret) return

    let stopped = false

    const start = async () => {
      try {
        await refreshStatus()
      } catch {
        // ignore
      }

      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }

      pollTimer.current = window.setInterval(async () => {
        if (stopped) return
        if (orderStatus?.status === "paid" || orderStatus?.status === "closed" || orderStatus?.status === "failed") return
        try {
          await refreshStatus()
        } catch {
          // ignore
        }
      }, 2500)
    }

    start()

    return () => {
      stopped = true
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.out_trade_no, order?.client_secret])

  async function createOrder() {
    setError(null)

    if (!Number.isInteger(amountTotal) || amountTotal <= 0) {
      setError("请输入正确金额（单位：元）")
      return
    }

    const desc = description.trim()
    if (!desc) {
      setError("请输入商品描述")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/wechatpay/native/unified-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_total: amountTotal, description: desc }),
      })

      const data = (await res.json()) as UnifiedOrderResponse | { error: string }
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "下单失败")
      }

      const nextOrder: StoredOrder = {
        out_trade_no: (data as UnifiedOrderResponse).out_trade_no,
        client_secret: (data as UnifiedOrderResponse).client_secret,
        code_url: (data as UnifiedOrderResponse).code_url,
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
      setOrderStatus((prev) => ({
        ...(prev || (data as OrderStatusResponse)),
        claimed_at: new Date().toISOString(),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "绑定失败")
    } finally {
      setClaiming(false)
    }
  }

  const canClaim = Boolean(user) && orderStatus?.status === "paid" && !claimed

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">微信支付（扫码）</h1>
        <p className="mt-2 text-sm text-muted-foreground">下单生成二维码，用微信扫一扫支付。支付成功后页面会自动刷新状态。</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>创建订单</CardTitle>
            <CardDescription>金额单位是元（自动换算为分）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">金额（元）</Label>
              <Input id="amount" value={amountYuan} onChange={(e) => setAmountYuan(e.target.value)} placeholder="例如 9.9" />
              <div className="text-xs text-muted-foreground">将以 {Number.isFinite(amountTotal) ? amountTotal : "-"} 分下单</div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="desc">描述</Label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：会员充值" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={createOrder} disabled={creating}>
                {creating ? "下单中..." : "生成二维码"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEY)
                  setOrder(null)
                  setOrderStatus(null)
                  setQrDataUrl(null)
                  setClaimed(false)
                  setError(null)
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
                  <div className="mt-1 text-muted-foreground">你可以继续注册/登录，然后把订单绑定到账号。</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canClaim ? (
                      <Button onClick={claimOrder} disabled={claiming || authLoading}>
                        {claiming ? "绑定中..." : "绑定到当前账号"}
                      </Button>
                    ) : claimed ? (
                      <Button variant="secondary" disabled>
                        已绑定
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled>
                        {authLoading ? "登录状态读取中..." : "登录后可绑定"}
                      </Button>
                    )}
                    {!user && (
                      <Button asChild variant="outline">
                        <a href="/auth/register">去注册</a>
                      </Button>
                    )}
                    {!user && (
                      <Button asChild variant="outline">
                        <a href="/auth/login">去登录</a>
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
