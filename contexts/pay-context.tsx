"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react"
import { useAuth } from "./auth-context"

// 智能轮询配置
const POLL_CONFIG = {
  initialInterval: 1500,    // 初始轮询间隔 1.5 秒
  maxInterval: 8000,        // 最大轮询间隔 8 秒
  fastPollCount: 10,        // 前 N 次快速轮询
}

const STORAGE_KEY = "wechatpay:pending_order"

type Product = {
  id: string
  name: string
  plan: "free" | "basic" | "pro" | "vip"
  amount_total: number
  currency: string
  description: string
  credits_grant: number
}

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
  product_id?: string | null
  paid_at: string | null
  wx_transaction_id: string | null
  claimed_at?: string | null
  grant_status?: string | null
  granted_at?: string | null
  grant_error?: string | null
  created_at: string
}

type PendingOrder = {
  out_trade_no: string
  client_secret: string
  code_url: string
  product_id: string
  returnUrl?: string
}

type PayState = "idle" | "creating" | "polling" | "paid" | "claiming" | "granted" | "error"

interface PayContextValue {
  // 弹窗控制
  isOpen: boolean
  openPayDialog: (productId: string, returnUrl?: string) => void
  closePayDialog: () => void

  // 支付状态
  payState: PayState
  error: string | null

  // 产品信息
  products: Product[]
  productsLoading: boolean
  currentProduct: Product | null

  // 订单信息
  order: PendingOrder | null
  orderStatus: OrderStatusResponse | null
  qrDataUrl: string | null

  // 返回 URL
  returnUrl: string | null

  // 操作
  retryPayment: () => void
  clearPendingOrder: () => void
}

const PayContext = createContext<PayContextValue | null>(null)

export function usePay() {
  const ctx = useContext(PayContext)
  if (!ctx) {
    throw new Error("usePay must be used within a PayProvider")
  }
  return ctx
}

export function PayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // 弹窗状态
  const [isOpen, setIsOpen] = useState(false)
  const [productId, setProductId] = useState<string | null>(null)
  const [returnUrl, setReturnUrl] = useState<string | null>(null)

  // 产品列表
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)

  // 订单状态
  const [order, setOrder] = useState<PendingOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<OrderStatusResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // 支付流程状态
  const [payState, setPayState] = useState<PayState>("idle")
  const [error, setError] = useState<string | null>(null)

  // 轮询相关
  const pollTimer = useRef<number | null>(null)
  const pollAttempts = useRef(0)

  // 当前产品
  const currentProduct = productId ? products.find(p => p.id === productId) || null : null

  // 加载产品列表
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setProductsLoading(true)
      try {
        const res = await fetch("/api/wechatpay/products")
        const data = (await res.json()) as { products?: Product[]; error?: string }
        if (!res.ok) throw new Error(data.error || "获取套餐失败")
        if (!cancelled) setProducts(Array.isArray(data.products) ? data.products : [])
      } catch {
        if (!cancelled) setProducts([])
      } finally {
        if (!cancelled) setProductsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 从 localStorage 恢复待支付订单
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PendingOrder
        if (parsed?.out_trade_no && parsed?.client_secret && parsed?.code_url) {
          setOrder(parsed)
          setProductId(parsed.product_id)
          if (parsed.returnUrl) setReturnUrl(parsed.returnUrl)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // 生成二维码
  useEffect(() => {
    if (!order?.code_url) {
      setQrDataUrl(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const QRCode = (await import("qrcode")).default
        const url = await QRCode.toDataURL(order.code_url, { margin: 1, width: 280 })
        if (!cancelled) setQrDataUrl(url)
      } catch {
        if (!cancelled) setQrDataUrl(null)
      }
    })()

    return () => { cancelled = true }
  }, [order?.code_url])

  // 查询订单状态
  const refreshStatus = useCallback(async () => {
    if (!order?.out_trade_no || !order?.client_secret) return null

    const res = await fetch(
      `/api/wechatpay/orders/${encodeURIComponent(order.out_trade_no)}?secret=${encodeURIComponent(order.client_secret)}`
    )
    const data = (await res.json()) as OrderStatusResponse | { error: string }
    if (!res.ok) {
      throw new Error("error" in data ? data.error : "查单失败")
    }

    setOrderStatus(data as OrderStatusResponse)
    return data as OrderStatusResponse
  }, [order?.out_trade_no, order?.client_secret])

  // 绑定订单（内部方法）
  const claimOrderInternal = useCallback(async () => {
    if (!order?.out_trade_no || !order?.client_secret) return

    setPayState("claiming")

    try {
      const res = await fetch("/api/wechatpay/orders/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          out_trade_no: order.out_trade_no,
          client_secret: order.client_secret,
        }),
      })
      const data = (await res.json()) as OrderStatusResponse | { error: string }
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "绑定失败")
      }

      setOrderStatus(data as OrderStatusResponse)

      if ((data as OrderStatusResponse).grant_status === "granted") {
        setPayState("granted")
        // 清除本地存储
        localStorage.removeItem(STORAGE_KEY)
      } else if ((data as OrderStatusResponse).grant_status === "failed") {
        setPayState("error")
        setError((data as OrderStatusResponse).grant_error || "开通失败")
      }
    } catch (e) {
      setPayState("error")
      setError(e instanceof Error ? e.message : "绑定失败")
    }
  }, [order?.out_trade_no, order?.client_secret])

  // 智能轮询
  useEffect(() => {
    if (!order?.out_trade_no || !order?.client_secret) return
    if (payState !== "polling") return

    let stopped = false
    pollAttempts.current = 0

    const poll = async () => {
      if (stopped) return

      try {
        const status = await refreshStatus()
        if (status?.status === "paid") {
          setPayState("paid")
          // 自动绑定订单（如果已登录）
          if (user) {
            await claimOrderInternal()
          }
          return
        }
        if (status?.status === "closed" || status?.status === "failed") {
          setPayState("error")
          setError("订单已关闭或失败")
          return
        }
      } catch {
        // ignore polling errors
      }

      pollAttempts.current++

      // 计算下次轮询间隔
      let nextInterval = POLL_CONFIG.initialInterval
      if (pollAttempts.current > POLL_CONFIG.fastPollCount) {
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

    poll()

    return () => {
      stopped = true
      if (pollTimer.current) {
        window.clearTimeout(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [order?.out_trade_no, order?.client_secret, payState, refreshStatus, user, claimOrderInternal])


  // 用户登录后自动绑定待支付订单
  useEffect(() => {
    if (!user) return
    if (orderStatus?.status !== "paid") return
    if (orderStatus?.claimed_at) return
    if (payState === "claiming" || payState === "granted") return

    claimOrderInternal()
  }, [user, orderStatus?.status, orderStatus?.claimed_at, payState, claimOrderInternal])

  // 创建订单
  const createOrder = useCallback(async (targetProductId: string, targetReturnUrl?: string) => {
    setError(null)
    setPayState("creating")

    try {
      const res = await fetch("/api/wechatpay/native/unified-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: targetProductId }),
      })

      const data = (await res.json()) as UnifiedOrderResponse | { error: string }
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "下单失败")
      }

      const newOrder: PendingOrder = {
        out_trade_no: (data as UnifiedOrderResponse).out_trade_no,
        client_secret: (data as UnifiedOrderResponse).client_secret,
        code_url: (data as UnifiedOrderResponse).code_url,
        product_id: targetProductId,
        returnUrl: targetReturnUrl,
      }

      setOrder(newOrder)
      setOrderStatus(null)
      setPayState("polling")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder))
    } catch (e) {
      setPayState("error")
      setError(e instanceof Error ? e.message : "下单失败")
    }
  }, [])

  // 打开支付弹窗
  const openPayDialog = useCallback((targetProductId: string, targetReturnUrl?: string) => {
    setProductId(targetProductId)
    setReturnUrl(targetReturnUrl || null)
    setError(null)
    setIsOpen(true)

    // 检查是否有未完成的同产品订单
    if (order && order.product_id === targetProductId && order.code_url) {
      // 复用已有订单，开始轮询
      setPayState("polling")
    } else {
      // 创建新订单
      createOrder(targetProductId, targetReturnUrl)
    }
  }, [order, createOrder])

  // 关闭支付弹窗
  const closePayDialog = useCallback(() => {
    setIsOpen(false)
    // 不清除订单状态，允许用户稍后继续
  }, [])

  // 重试支付
  const retryPayment = useCallback(() => {
    if (productId) {
      createOrder(productId, returnUrl || undefined)
    }
  }, [productId, returnUrl, createOrder])

  // 清除待支付订单
  const clearPendingOrder = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setOrder(null)
    setOrderStatus(null)
    setQrDataUrl(null)
    setPayState("idle")
    setError(null)
  }, [])

  const value: PayContextValue = {
    isOpen,
    openPayDialog,
    closePayDialog,
    payState,
    error,
    products,
    productsLoading,
    currentProduct,
    order,
    orderStatus,
    qrDataUrl,
    returnUrl,
    retryPayment,
    clearPendingOrder,
  }

  return (
    <PayContext.Provider value={value}>
      {children}
    </PayContext.Provider>
  )
}
