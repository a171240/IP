"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, CheckCircle, ClipboardCheck, Sparkles, Target } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { getStoredUtm, track } from "@/lib/analytics/client"
import { getSupabaseClient } from "@/lib/supabase"

type StartClientProps = {
  user: { id: string; email?: string } | null
  remainingDays: number
  isPro: boolean
}

const LAST_RESULT_KEY = "latestDiagnosisId"

export default function StartClient({ user, remainingDays, isPro }: StartClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [latestResultId, setLatestResultId] = useState<string | null>(null)
  const [redeemCode, setRedeemCode] = useState("")
  const [redeemEmail, setRedeemEmail] = useState("")
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemSuccess, setRedeemSuccess] = useState(false)
  const [redeemLoginRequired, setRedeemLoginRequired] = useState(false)
  const [redeemExpiresAt, setRedeemExpiresAt] = useState<string | null>(null)
  const [redeemPlan, setRedeemPlan] = useState<string | null>(null)

  const codeFromQuery = searchParams?.get("code") ?? ""
  const emailFromQuery = searchParams?.get("email") ?? ""
  const sourceFromQuery = searchParams?.get("from") ?? "start"
  const mergedUtm = useMemo(
    () => ({
      ...getStoredUtm(),
      utm_source: searchParams?.get("utm_source") ?? undefined,
      utm_medium: searchParams?.get("utm_medium") ?? undefined,
      utm_campaign: searchParams?.get("utm_campaign") ?? undefined,
      utm_content: searchParams?.get("utm_content") ?? undefined,
      utm_term: searchParams?.get("utm_term") ?? undefined,
    }),
    [searchParams]
  )

  useEffect(() => {
    track("trial_view", { remaining_days: remainingDays, is_pro: isPro })
  }, [remainingDays, isPro])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(LAST_RESULT_KEY)
    if (stored) {
      setLatestResultId(stored)
    }
  }, [])

  useEffect(() => {
    if (redeemCode || !codeFromQuery) return
    setRedeemCode(codeFromQuery)
  }, [codeFromQuery, redeemCode])

  useEffect(() => {
    if (redeemEmail || !emailFromQuery) return
    setRedeemEmail(emailFromQuery)
  }, [emailFromQuery, redeemEmail])

  useEffect(() => {
    if (!user?.email) return
    if (redeemEmail) return
    setRedeemEmail(user.email)
  }, [user?.email, redeemEmail])

  const proLabel = isPro
    ? remainingDays > 0
      ? `Pro 体验剩余 ${remainingDays} 天`
      : "已开通 Pro 权益"
    : "尚未开通 Pro 体验"

  const resultHref = latestResultId ? `/diagnosis/result/${latestResultId}` : "/diagnosis/quiz"
  const resultHint = latestResultId ? "继续查看上次诊断结果" : "先完成诊断后解锁"
  const needsEmail = !user?.id
  const shouldShowSticky = isPro || redeemSuccess || redeemLoginRequired
  const stickyCta = redeemLoginRequired
    ? { href: "/auth/login?redirect=/activate", label: "登录继续" }
    : { href: "/diagnosis/quiz?from=start", label: "开始诊断" }

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("zh-CN")
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#030304] text-zinc-200 font-sans selection:bg-purple-500/30 selection:text-purple-200 overflow-x-hidden">
      <ObsidianBackgroundLite />

      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)] bg-[#030304]/90 border-b border-white/[0.02]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow cursor-pointer">
              IP
            </div>
            <span className="text-white/90 font-medium tracking-tight cursor-pointer">IP内容工厂</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/activate" className="text-zinc-400 hover:text-white transition-colors">
              兑换码激活
            </Link>
            <Link href="/pricing" className="text-zinc-400 hover:text-white transition-colors">
              升级方案
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative pt-28 pb-32 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-10">
          <section className="rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300 mb-4">
                  交付引导
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white">开始 Pro 体验的 7 天加速计划</h1>
                <p className="text-sm text-zinc-400 mt-3">
                  {user?.email ? `当前账号：${user.email}` : "登录后可查看剩余体验天数"}
                </p>
              </div>
              <div className="text-sm text-emerald-300">{proLabel}</div>
            </div>

            {!user ? (
              <div className="mt-6">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold"
                >
                  登录查看权益
                </Link>
              </div>
            ) : null}
          </section>

          {!isPro ? (
            <section className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 sm:p-8">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">Step 0：兑换码快速激活</h2>
                  <p className="text-sm text-zinc-400 mt-1">输入兑换码后立即开通 7 天 Pro，然后直接开始诊断。</p>
                </div>
                <span className="text-xs text-emerald-300">来源：{sourceFromQuery || "start"}</span>
              </div>

              {!redeemSuccess ? (
                <form
                  className="mt-6 grid gap-4"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setRedeemError(null)
                    setRedeemLoading(true)

                    track("redeem_submit", {
                      userId: user?.id,
                      landingPath: window.location.pathname,
                      source: sourceFromQuery,
                      code_present: Boolean(redeemCode),
                      email_present: Boolean(redeemEmail),
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
                          source: sourceFromQuery,
                        })
                        if (data.isRenewal) {
                          track("redeem_renew_success", {
                            userId: user?.id,
                            landingPath: window.location.pathname,
                            source: sourceFromQuery,
                          })
                        }

                        setRedeemPlan(data.plan ?? null)
                        setRedeemExpiresAt(data.expiresAt ?? null)
                        setRedeemLoginRequired(Boolean(data.loginRequired))
                        setRedeemSuccess(true)

                        if (!data.loginRequired) {
                          setTimeout(() => router.push("/diagnosis/quiz?from=start"), 800)
                        }
                      } else {
                        track("redeem_fail", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                          source: sourceFromQuery,
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
                        source: sourceFromQuery,
                        error: "network_error",
                      })
                      setRedeemError("网络异常，请稍后再试")
                    } finally {
                      setRedeemLoading(false)
                    }
                  }}
                >
                  {needsEmail ? (
                    <div>
                      <label className="block text-sm text-zinc-300 mb-2">邮箱</label>
                      <input
                        type="email"
                        value={redeemEmail}
                        onChange={(event) => setRedeemEmail(event.target.value)}
                        placeholder="填写你的邮箱"
                        className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                      />
                      <p className="mt-2 text-xs text-zinc-500">用于创建账号并绑定权益</p>
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-sm text-zinc-300 mb-2">兑换码</label>
                    <input
                      type="text"
                      value={redeemCode}
                      onChange={(event) => setRedeemCode(event.target.value)}
                      placeholder="输入完整兑换码"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
                    />
                    <p className="mt-2 text-xs text-zinc-500">支持粘贴，系统会自动去空格并转大写</p>
                  </div>

                  {redeemError ? <p className="text-sm text-rose-400">{redeemError}</p> : null}

                  <GlowButton primary className="w-full py-3 text-base" type="submit" disabled={redeemLoading}>
                    {redeemLoading ? "提交中..." : "立即兑换开通"}
                    <ArrowRight className="w-4 h-4" />
                  </GlowButton>
                </form>
              ) : (
                <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-300" />
                    <span>兑换成功，已开通 {redeemPlan || "Pro"} 权益</span>
                  </div>
                  <p className="mt-2 text-xs text-emerald-200">
                    {redeemLoginRequired
                      ? "已为该邮箱开通权益，请登录后继续"
                      : formatDate(redeemExpiresAt)
                        ? `有效期至 ${formatDate(redeemExpiresAt)}`
                        : "现在可以直接开始诊断"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {redeemLoginRequired ? (
                      <Link
                        href="/auth/login?redirect=/activate"
                        className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 text-white"
                      >
                        登录继续
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    ) : (
                      <Link
                        href="/diagnosis/quiz?from=start"
                        className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 text-white"
                      >
                        立即开始诊断
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    )}
                    <Link
                      href="/activate"
                      className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg border border-white/10 text-zinc-200"
                    >
                      查看权益详情
                    </Link>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="md:hidden rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
            <h3 className="text-lg font-semibold text-white">3 步开始</h3>
            <p className="text-sm text-zinc-400 mt-1">用最短路径拿到第一条可发布内容。</p>
            <ol className="mt-4 space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-purple-200 text-xs font-semibold">1</span>
                完成 5 分钟诊断，拿到瓶颈与优先级。
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-purple-200 text-xs font-semibold">2</span>
                生成交付包（排产 + 脚本 + 质检）。
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-purple-200 text-xs font-semibold">3</span>
                复制第一条脚本，当天发布。
              </li>
            </ol>
          </section>

          <section className="hidden md:grid md:grid-cols-3 gap-5">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <Target className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step 1：完成诊断</h3>
              <p className="text-sm text-zinc-400 mt-2">先完成 5 分钟诊断，生成团队交付瓶颈与优先级。</p>
              <Link href="/diagnosis/quiz" className="mt-4 inline-flex items-center text-sm text-purple-300 hover:text-purple-200">
                去诊断
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <Sparkles className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step 2：生成交付包</h3>
              <p className="text-sm text-zinc-400 mt-2">在诊断结果页生成单份 PDF 交付包（排产 + 脚本 + 质检）。</p>
              <Link href={resultHref} className="mt-4 inline-flex items-center text-sm text-purple-300 hover:text-purple-200">
                {resultHint}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <ClipboardCheck className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step 3：执行与发布</h3>
              <p className="text-sm text-zinc-400 mt-2">按 7 天排产执行，发布第一条内容并建立交付节奏。</p>
              <Link href="/start/execute" className="mt-4 inline-flex items-center text-sm text-purple-300 hover:text-purple-200">
                查看执行指引
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </section>

          <section className="hidden md:flex rounded-2xl border border-white/10 bg-zinc-950/60 p-6 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">需要长期 Pro 权益？</h3>
              <p className="text-sm text-zinc-400 mt-1">升级即可持续使用交付包与下载功能。</p>
            </div>
            <GlowButton
              primary
              className="px-6 py-3"
              type="button"
              onClick={() => {
                track("upgrade_click", { source: "start" })
                router.push("/pricing")
              }}
            >
              立即升级
              <ArrowRight className="w-4 h-4" />
            </GlowButton>
          </section>
        </div>
      </main>

      {shouldShowSticky ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="mx-auto max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="rounded-2xl border border-purple-500/30 bg-zinc-950/90 backdrop-blur shadow-[0_0_30px_-12px_rgba(168,85,247,0.45)]">
              <div className="p-3">
                <Link
                  href={stickyCta.href}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 shadow-xl shadow-purple-500/40 hover:brightness-110"
                >
                  {stickyCta.label}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
