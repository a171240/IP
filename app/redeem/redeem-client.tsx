"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { getStoredUtm, track } from "@/lib/analytics/client"
import { getSupabaseClient } from "@/lib/supabase"

type RedeemClientProps = {
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  user?: { id?: string; email?: string } | null
}

type RedeemInfo = {
  plan?: string
  expiresAt?: string
  loginRequired?: boolean
  email?: string
}

export default function RedeemClient({ utm, user }: RedeemClientProps) {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeemInfo, setRedeemInfo] = useState<RedeemInfo | null>(null)
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)

  const mergedUtm = useMemo(() => ({ ...getStoredUtm(), ...utm }), [utm])
  const emailValue = user?.email?.trim() || ""
  const needsEmail = !user?.id

  useEffect(() => {
    track("redeem_view", {
      userId: user?.id,
      landingPath: window.location.pathname,
    })
  }, [user?.id])

  useEffect(() => {
    if (!submitted || redeemInfo?.loginRequired) return
    setRedirectCountdown(3)
    const timer = window.setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null) return prev
        if (prev <= 1) {
          window.clearInterval(timer)
          router.push("/activate")
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [redeemInfo?.loginRequired, router, submitted])

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("zh-CN")
  }

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
              兑换码激活
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              输入兑换码，自动开通 7 天 Pro
            </h1>
            <p className="text-lg text-zinc-400 mt-4 max-w-2xl">
              无需订单后四位，也不需要人工审核。未登录也可直接输入邮箱完成兑换。
            </p>

            <div className="mt-8 space-y-4 text-sm text-zinc-400">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                  1
                </span>
                <div>
                  <div className="text-zinc-200">输入兑换码</div>
                  <div className="text-xs text-zinc-500">支持粘贴与自动去空格</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                  2
                </span>
                <div>
                  <div className="text-zinc-200">自动绑定账号</div>
                  <div className="text-xs text-zinc-500">未登录会自动创建账号</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                  3
                </span>
                <div>
                  <div className="text-zinc-200">开始诊断</div>
                  <div className="text-xs text-zinc-500">生成可执行 PDF 交付包</div>
                </div>
              </div>
            </div>

            {needsEmail ? (
              <div className="mt-8 text-sm text-zinc-400">
                已有账号？
                <Link href="/auth/login?redirect=/redeem" className="ml-2 text-emerald-300 hover:text-emerald-200">
                  去登录
                </Link>
                <span className="mx-2 text-zinc-600">|</span>
                <Link href="/auth/register?redirect=/redeem" className="text-emerald-300 hover:text-emerald-200">
                  注册新账号
                </Link>
              </div>
            ) : (
              <div className="mt-8 text-sm text-emerald-300">已登录：{emailValue}</div>
            )}
          </section>

          <section className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {!submitted ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setError(null)
                    setLoading(true)
                    track("redeem_submit", {
                      userId: user?.id,
                      landingPath: window.location.pathname,
                    })

                    const formData = new FormData(event.currentTarget)
                    const rawCode = String(formData.get("redeem-code") || "")
                    const code = rawCode.replace(/\s+/g, "").toUpperCase()
                    const inputEmail = needsEmail
                      ? String(formData.get("redeem-email") || "").trim().toLowerCase()
                      : ""

                    if (!code) {
                      setError("请输入完整兑换码")
                      setLoading(false)
                      return
                    }

                    if (needsEmail) {
                      if (!inputEmail) {
                        setError("请输入邮箱")
                        setLoading(false)
                        return
                      }
                      if (!/^\S+@\S+\.\S+$/.test(inputEmail)) {
                        setError("邮箱格式不正确")
                        setLoading(false)
                        return
                      }
                    }

                    try {
                      const response = await fetch("/api/redeem", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code, email: inputEmail || undefined, utm: mergedUtm }),
                      })

                      const data = (await response.json()) as {
                        ok?: boolean
                        error?: string
                        plan?: string
                        expiresAt?: string
                        loginRequired?: boolean
                        session?: {
                          access_token?: string
                          refresh_token?: string
                          expires_in?: number
                        }
                      }

                      if (response.ok && data.ok) {
                        if (data.session?.access_token && data.session?.refresh_token) {
                          const supabase = getSupabaseClient()
                          await supabase.auth.setSession({
                            access_token: data.session.access_token,
                            refresh_token: data.session.refresh_token,
                          })
                        }

                        track("redeem_success", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                        })
                        setRedeemInfo({
                          plan: data.plan,
                          expiresAt: data.expiresAt,
                          loginRequired: data.loginRequired,
                          email: inputEmail || emailValue,
                        })
                        setSubmitted(true)
                      } else {
                        track("redeem_fail", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                          error: data.error || response.status,
                        })
                        if (response.status === 404) {
                          setError("兑换码无效，请检查后重试")
                        } else if (response.status === 409) {
                          setError("兑换码已使用，请更换新的兑换码")
                        } else if (response.status === 410) {
                          setError("兑换码已过期，请联系工作人员")
                        } else if (response.status === 429) {
                          setError("操作过于频繁，请稍后再试")
                        } else if (response.status === 400 && data.error === "email_required") {
                          setError("请输入邮箱")
                        } else {
                          setError(data.error || "兑换失败，请稍后再试")
                        }
                      }
                    } catch {
                      track("redeem_fail", {
                        userId: user?.id,
                        landingPath: window.location.pathname,
                        error: "network_error",
                      })
                      setError("网络异常，请稍后再试")
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="space-y-6"
                >
                  {needsEmail ? (
                    <div>
                      <label htmlFor="redeem-email" className="block text-sm text-zinc-300 mb-2">
                        邮箱
                      </label>
                      <input
                        id="redeem-email"
                        name="redeem-email"
                        type="email"
                        required
                        placeholder="填写你的邮箱"
                        className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                      />
                      <p className="mt-2 text-xs text-zinc-500">用于创建账号并绑定权益</p>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="redeem-code" className="block text-sm text-zinc-300 mb-2">
                      兑换码
                    </label>
                    <input
                      id="redeem-code"
                      name="redeem-code"
                      type="text"
                      required
                      placeholder="输入完整兑换码"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                    />
                    <p className="mt-2 text-xs text-zinc-500">支持粘贴，系统会自动去空格并转大写</p>
                  </div>

                  {error ? <p className="text-sm text-rose-400">{error}</p> : null}

                  <GlowButton primary className="w-full py-4 text-base" type="submit" disabled={loading}>
                    {loading ? "提交中..." : "立即兑换开通"}
                    <ArrowRight size={16} />
                  </GlowButton>

                  <p className="text-xs text-zinc-500 text-center">兑换成功后即可开始诊断</p>
                </form>
              ) : (
                <div className="text-center space-y-5 py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">兑换成功，已开通 7 天 Pro</h2>
                  <p className="text-sm text-zinc-400">
                    {redeemInfo?.loginRequired
                      ? `已为 ${redeemInfo?.email || "该邮箱"} 开通权益，请登录后继续`
                      : formatDate(redeemInfo?.expiresAt)
                        ? `有效期至 ${formatDate(redeemInfo?.expiresAt)}`
                        : "现在可以开始诊断"}
                  </p>

                  {redeemInfo?.loginRequired ? (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Link
                        href="/auth/login?redirect=/activate"
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_4px_16px_-4px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-400 transition-colors"
                      >
                        去登录继续
                        <ArrowRight size={16} className="ml-2" />
                      </Link>
                      <Link
                        href="/activate"
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-200 hover:text-white hover:border-white/20 transition-colors"
                      >
                        查看权益说明
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Link
                        href="/activate"
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_4px_16px_-4px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-400 transition-colors"
                      >
                        进入激活页继续
                        <ArrowRight size={16} className="ml-2" />
                      </Link>
                      <Link
                        href="/diagnosis/quiz"
                        onClick={() =>
                          track("start_diagnosis_click", {
                            userId: user?.id,
                            landingPath: window.location.pathname,
                          })
                        }
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-200 hover:text-white hover:border-white/20 transition-colors"
                      >
                        直接开始诊断
                      </Link>
                    </div>
                  )}

                  {!redeemInfo?.loginRequired && redirectCountdown !== null ? (
                    <p className="text-xs text-zinc-500">将于 {redirectCountdown} 秒后自动进入激活页</p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
