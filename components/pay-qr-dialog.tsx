"use client"

import { useRouter } from "next/navigation"
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react"

import { usePay } from "@/contexts/pay-context"
import { useAuth } from "@/contexts/auth-context"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function PayQRDialog() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    isOpen,
    closePayDialog,
    payState,
    error,
    currentProduct,
    qrDataUrl,
    orderStatus,
    returnUrl,
    retryPayment,
    clearPendingOrder,
  } = usePay()

  const handleClose = () => {
    closePayDialog()
  }

  const handleSuccess = () => {
    closePayDialog()
    clearPendingOrder()
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.push("/dashboard")
    }
  }

  const handleLogin = () => {
    // 关闭弹窗，跳转登录页，登录后会自动绑定订单
    closePayDialog()
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "/"
    router.push(`/auth/login?redirect=${encodeURIComponent(returnUrl || currentPath)}`)
  }

  const handleRegister = () => {
    closePayDialog()
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "/"
    router.push(`/auth/register?redirect=${encodeURIComponent(returnUrl || currentPath)}`)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {payState === "granted" ? "支付成功" : "微信扫码支付"}
          </DialogTitle>
          <DialogDescription>
            {currentProduct ? (
              <>
                {currentProduct.name} - ¥{(currentProduct.amount_total / 100).toFixed(2)}
              </>
            ) : (
              "正在加载..."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* 创建订单中 */}
          {payState === "creating" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">正在创建订单...</p>
            </div>
          )}

          {/* 二维码显示 */}
          {(payState === "polling" || payState === "paid") && (
            <>
              {qrDataUrl ? (
                <div className="rounded-xl border bg-white p-2">
                  <img
                    src={qrDataUrl}
                    alt="微信支付二维码"
                    className="h-[200px] w-[200px]"
                  />
                </div>
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-xl border">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                请使用微信扫一扫完成支付
              </p>
              {payState === "polling" && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  等待支付中...
                </p>
              )}
            </>
          )}

          {/* 支付成功，等待绑定 */}
          {payState === "paid" && !user && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 w-full">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-semibold text-emerald-400">支付成功</p>
              <p className="text-sm text-muted-foreground text-center">
                请登录或注册账号以完成权限开通
              </p>
              <div className="flex gap-2 mt-2">
                <Button onClick={handleLogin}>去登录</Button>
                <Button variant="outline" onClick={handleRegister}>
                  去注册
                </Button>
              </div>
            </div>
          )}

          {/* 正在绑定 */}
          {payState === "claiming" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm text-muted-foreground">正在开通权限...</p>
            </div>
          )}

          {/* 开通成功 */}
          {payState === "granted" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 w-full">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-semibold text-emerald-400">开通成功</p>
              <p className="text-sm text-muted-foreground text-center">
                您的 {currentProduct?.name || "会员"} 已成功开通
                {currentProduct?.credits_grant && (
                  <>，已赠送 {currentProduct.credits_grant} 积分</>
                )}
              </p>
              <Button onClick={handleSuccess} className="mt-2">
                {returnUrl ? "继续使用" : "进入控制台"}
              </Button>
            </div>
          )}

          {/* 错误状态 */}
          {payState === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 w-full">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="font-semibold text-red-400">支付失败</p>
              <p className="text-sm text-muted-foreground text-center">
                {error || "订单处理失败，请重试"}
              </p>
              <div className="flex gap-2 mt-2">
                <Button onClick={retryPayment} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重试
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  关闭
                </Button>
              </div>
            </div>
          )}

          {/* 订单状态信息 */}
          {orderStatus && payState !== "granted" && payState !== "error" && (
            <div className="w-full text-xs text-muted-foreground border-t pt-3 mt-2">
              <div className="flex justify-between">
                <span>订单状态</span>
                <span className="font-mono">
                  {orderStatus.status === "created" && "待支付"}
                  {orderStatus.status === "paid" && "已支付"}
                  {orderStatus.status === "closed" && "已关闭"}
                  {orderStatus.status === "failed" && "失败"}
                </span>
              </div>
              {orderStatus.wx_transaction_id && (
                <div className="flex justify-between mt-1">
                  <span>微信交易号</span>
                  <span className="font-mono truncate max-w-[180px]">
                    {orderStatus.wx_transaction_id}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
