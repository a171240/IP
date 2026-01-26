"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { getStoredUtm, track } from "@/lib/analytics/client"

type ActivateClientProps = {
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  user?: { id?: string; email?: string } | null
  activationStatus?: string | null
  isPro?: boolean
}

const platformValue = "xiaohongshu"

const steps = [
  {
    title: "登录/注册",
    description: "未登录请先登录，已登录会自动填充邮箱",
  },
  {
    title: "提交激活",
    description: "填写邮箱与订单信息",
  },
  {
    title: "生成交付包",
    description: "激活成功后生成单份PDF交付包",
  },
]

export default function ActivateClient({ utm, user, activationStatus, isPro }: ActivateClientProps) {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mergedUtm = useMemo(() => ({ ...getStoredUtm(), ...utm }), [utm])
  const emailValue = user?.email?.trim() || ""
  const isUnlocked = Boolean(isPro)
  const statusLabel =
    (isUnlocked && "已解锁") ||
    (activationStatus === "pending" && "待审核") ||
    (activationStatus === "approved" && "已解锁") ||
    (activationStatus === "rejected" && "已拒绝") ||
    null

  useEffect(() => {
    track("activation_open", {
      source: platformValue,
      userId: user?.id,
      landingPath: window.location.pathname,
    })
  }, [user?.id])

  return (
    <div className="relative min-h-[100dvh] bg-[#030304] text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 overflow-x-hidden">
      <ObsidianBackgroundLite />

      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)] bg-[#030304]/90 border-b border-white/[0.02]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow cursor-pointer">
              IP
            </div>
            <span className="text-white/90 font-medium tracking-tight cursor-pointer">IP内容工厂</span>
          </Link>
          <Link href="/demo" className="text-sm text-zinc-400 hover:text-white transition-colors">
            预约顾问演示
          </Link>
        </div>
      </nav>

      <main className="relative pt-28 pb-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-start">
          <section>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 mb-6">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              体验卡激活
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              你已购买「7天Pro体验卡」
            </h1>
            <p className="text-lg text-zinc-400 mt-4 max-w-2xl">
              请在此提交激活申请，我们将在 1 个工作日内完成开通并通知你。
            </p>

            <div className="mt-8 space-y-4 text-sm text-zinc-400">
              {steps.map((step, index) => (
                <div key={step.title} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-zinc-200">{step.title}</div>
                    <div className="text-xs text-zinc-500">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>

            {!emailValue ? (
              <div className="mt-8 text-sm text-zinc-400">
                还未登录？
                <Link href="/auth/login?redirect=/activate" className="ml-2 text-emerald-300 hover:text-emerald-200">
                  去登录
                </Link>
                <span className="mx-2 text-zinc-600">|</span>
                <Link href="/auth/register?redirect=/activate" className="text-emerald-300 hover:text-emerald-200">
                  注册新账号
                </Link>
              </div>
            ) : (
              <div className="mt-8 text-sm text-emerald-300">
                已登录，邮箱已自动填充：{emailValue}
              </div>
            )}

            {statusLabel ? (
              <div className="mt-4 text-sm text-emerald-300">
                当前状态：{statusLabel}
              </div>
            ) : null}
          </section>

          <section className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {!submitted && !isUnlocked ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setError(null)
                    setLoading(true)
                    track("activation_submit", {
                      source: platformValue,
                      userId: user?.id,
                      landingPath: window.location.pathname,
                    })

                    const formData = new FormData(event.currentTarget)
                    const email = String(formData.get("email") || emailValue).trim()
                    const orderTail = String(formData.get("order-tail") || "").trim()
                    const note = String(formData.get("note") || "").trim()

                    try {
                      const response = await fetch("/api/activation", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          email,
                          platform: platformValue,
                          orderTail,
                          note: note || undefined,
                          source: platformValue,
                          landingPath: `${window.location.pathname}${window.location.search}`,
                          referrer: document.referrer || undefined,
                          userAgent: navigator.userAgent || undefined,
                          utm: mergedUtm,
                        }),
                      })

                      const data = (await response.json()) as { ok: boolean; error?: string }

                      if (response.ok && data.ok) {
                        track("activation_submit_success", {
                          source: platformValue,
                          userId: user?.id,
                          landingPath: window.location.pathname,
                        })
                        setSubmitted(true)
                      } else if (response.status === 429) {
                        setError("操作太频繁，请稍后再试。")
                      } else {
                        setError("提交失败，请检查信息后重试。")
                      }
                    } catch {
                      setError("网络异常，请稍后再试。")
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="space-y-6"
                >
                  <div>
                    <label htmlFor="email" className="block text-sm text-zinc-300 mb-2">
                      登录邮箱
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      defaultValue={emailValue}
                      placeholder="填写用于登录的邮箱"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="order-tail" className="block text-sm text-zinc-300 mb-2">
                      订单号后 4 位
                    </label>
                    <input
                      id="order-tail"
                      name="order-tail"
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={4}
                      minLength={4}
                      placeholder="例如 1234"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="note" className="block text-sm text-zinc-300 mb-2">
                      备注（可选）
                    </label>
                    <textarea
                      id="note"
                      name="note"
                      rows={3}
                      placeholder="可填写订单信息补充说明"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                    />
                  </div>

                  {error ? <p className="text-sm text-rose-400">{error}</p> : null}

                  <GlowButton primary className="w-full py-4 text-base" type="submit" disabled={loading}>
                    {loading ? "提交中..." : "提交激活申请"}
                    <ArrowRight size={16} />
                  </GlowButton>

                  <p className="text-xs text-zinc-500 text-center">
                    平台默认：小红书 · 体验卡权益开通后可生成交付包
                  </p>
                </form>
              ) : (
                <div className="text-center space-y-5 py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    {isUnlocked ? "你已解锁体验权益" : "已收到，我们将在 1 个工作日内开通"}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    {isUnlocked ? "现在可以直接生成交付包。" : "权益开通后可直接生成交付包，你也可以先完成诊断。"}
                  </p>

                  <Link
                    href="/diagnosis"
                    className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_4px_16px_-4px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-400 transition-colors"
                  >
                    去生成交付包
                    <ArrowRight size={16} className="ml-2" />
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
