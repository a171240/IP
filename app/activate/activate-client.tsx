"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, CheckCircle } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { getStoredUtm, track } from "@/lib/analytics/client"
import { getSupabaseClient } from "@/lib/supabase"

type ActivateClientProps = {
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  user?: { id?: string; email?: string } | null
  isPro?: boolean
  proExpiresAt?: string | null
}

const benefits = [
  "7天成交排产（PDF）",
  "10条高意图选题（PDF）",
  "3条成交脚本（PDF）",
  "质检清单 + 归档规则（PDF）",
]

export default function ActivateClient({ utm, user, isPro, proExpiresAt }: ActivateClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [redeemCode, setRedeemCode] = useState("")
  const [redeemEmail, setRedeemEmail] = useState(user?.email || "")
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemSuccess, setRedeemSuccess] = useState(false)
  const [redeemLoginRequired, setRedeemLoginRequired] = useState(false)
  const [redeemExpiresAt, setRedeemExpiresAt] = useState<string | null>(null)
  const [redeemPlan, setRedeemPlan] = useState<string | null>(null)

  const mergedUtm = useMemo(() => ({ ...getStoredUtm(), ...utm }), [utm])

  useEffect(() => {
    track("activate_view", {
      userId: user?.id,
      landingPath: window.location.pathname,
    })
  }, [user?.id])

  useEffect(() => {
    const code = searchParams?.get("code") || ""
    const email = searchParams?.get("email") || ""
    if (code && !redeemCode) setRedeemCode(code)
    if (email && !redeemEmail) setRedeemEmail(email)
  }, [searchParams, redeemCode, redeemEmail])

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("zh-CN")
  }

  const needsEmail = !user?.id

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
        <div className="max-w-4xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-start">
          <section>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 mb-6">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              7天Pro体验卡激活
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              绑定账号 → 开通权益 → 去生成交付包
            </h1>
            <p className="text-lg text-zinc-400 mt-4 max-w-2xl">
              体验卡路径优先站内闭环。完成激活后即可生成一份高价值 PDF 交付包，并进入诊断流程。
            </p>

            <div className="mt-8 space-y-4 text-sm text-zinc-400">
              {benefits.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                    ✓
                  </span>
                  <div className="text-zinc-200">{item}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {isPro ? (
                <div className="text-center space-y-5 py-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">已开通 Pro 权益</h2>
                  <p className="text-sm text-zinc-400">
                    当前账号：{user?.email || "已登录"}
                    {formatDate(proExpiresAt) ? ` · 有效期至 ${formatDate(proExpiresAt)}` : null}
                  </p>

                  <GlowButton
                    primary
                    className="w-full px-6 py-3 text-sm"
                    onClick={() => {
                      track("start_diagnosis_click", {
                        userId: user?.id,
                        landingPath: window.location.pathname,
                      })
                      router.push("/activate/success")
                    }}
                  >
                    进入交付包主线
                    <ArrowRight size={16} />
                  </GlowButton>
                </div>
              ) : (
                <div className="space-y-5">
                  <h2 className="text-2xl font-semibold text-white">输入兑换码，立刻开通</h2>
                  <p className="text-sm text-zinc-400">
                    未登录也可兑换，填写邮箱即可自动创建账号并绑定权益。
                  </p>

                  {!redeemSuccess ? (
                    <form
                      className="grid gap-4"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        setRedeemError(null)
                        setRedeemLoading(true)

                        track("redeem_submit", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                        })
                        track("activate_submit", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                        })

                        const normalizedCode = redeemCode.replace(/\s+/g, "").toUpperCase()
                        const normalizedEmail = redeemEmail.trim().toLowerCase()

                        if (!normalizedCode) {
                          setRedeemError("请输入完整兑换码")
                          setRedeemLoading(false)
                          return
                        }

                        if (needsEmail) {
                          if (!normalizedEmail) {
                            setRedeemError("请输入邮箱")
                            setRedeemLoading(false)
                            return
                          }
                          if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
                            setRedeemError("邮箱格式不正确")
                            setRedeemLoading(false)
                            return
                          }
                        }

                        try {
                          const response = await fetch("/api/redeem", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              code: normalizedCode,
                              email: needsEmail ? normalizedEmail : undefined,
                              utm: mergedUtm,
                            }),
                          })

                          const data = (await response.json()) as {
                            ok?: boolean
                            error?: string
                            plan?: string
                            expiresAt?: string
                            isRenewal?: boolean
                            loginRequired?: boolean
                            session?: {
                              access_token?: string
                              refresh_token?: string
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
                            if (data.isRenewal) {
                              track("redeem_renew_success", {
                                userId: user?.id,
                                landingPath: window.location.pathname,
                              })
                            }

                            setRedeemPlan(data.plan ?? null)
                            setRedeemExpiresAt(data.expiresAt ?? null)
                            setRedeemLoginRequired(Boolean(data.loginRequired))
                            setRedeemSuccess(true)

                            if (!data.loginRequired) {
                              setTimeout(() => router.push("/activate/success"), 800)
                            }
                          } else {
                            track("redeem_fail", {
                              userId: user?.id,
                              landingPath: window.location.pathname,
                              error: data.error || response.status,
                            })
                            if (response.status === 404) {
                              setRedeemError("兑换码无效，请检查后重试")
                            } else if (response.status === 409) {
                              setRedeemError("兑换码已使用，请更换新的兑换码")
                            } else if (response.status === 410) {
                              setRedeemError("兑换码已过期，请联系工作人员")
                            } else if (response.status === 429) {
                              setRedeemError("操作过于频繁，请稍后再试")
                            } else {
                              setRedeemError(data.error || "兑换失败，请稍后再试")
                            }
                          }
                        } catch {
                          track("redeem_fail", {
                            userId: user?.id,
                            landingPath: window.location.pathname,
                            error: "network_error",
                          })
                          setRedeemError("网络异常，请稍后再试")
                        } finally {
                          setRedeemLoading(false)
                        }
                      }}
                    >
                      <div className="grid gap-2">
                        <label className="text-xs text-zinc-400">兑换码</label>
                        <input
                          value={redeemCode}
                          onChange={(event) => setRedeemCode(event.target.value)}
                          placeholder="输入完整兑换码"
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                      </div>
                      {needsEmail ? (
                        <div className="grid gap-2">
                          <label className="text-xs text-zinc-400">登录邮箱</label>
                          <input
                            value={redeemEmail}
                            onChange={(event) => setRedeemEmail(event.target.value)}
                            placeholder="用于绑定账号"
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          />
                        </div>
                      ) : null}

                      {redeemError ? <p className="text-xs text-rose-400">{redeemError}</p> : null}

                      <GlowButton
                        primary
                        className="w-full px-6 py-3 text-sm"
                        type="submit"
                        disabled={redeemLoading}
                      >
                        {redeemLoading ? "提交中..." : "提交兑换并开通"}
                        <ArrowRight size={16} />
                      </GlowButton>
                    </form>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                        <CheckCircle size={24} className="text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white">兑换成功</h3>
                      <p className="text-sm text-zinc-400">
                        已开通 {redeemPlan || "trial_pro"} · 有效期至 {formatDate(redeemExpiresAt) || "7天后"}
                      </p>
                      {redeemLoginRequired ? (
                        <Link
                          href="/auth/login?redirect=/activate/success"
                          className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                        >
                          去登录继续主线
                          <ArrowRight size={16} className="ml-2" />
                        </Link>
                      ) : (
                        <GlowButton
                          primary
                          className="w-full px-6 py-3 text-sm"
                          onClick={() => router.push("/activate/success")}
                        >
                          进入交付包主线
                          <ArrowRight size={16} />
                        </GlowButton>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
