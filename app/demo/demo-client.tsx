"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle, MessageSquare, Users, Workflow } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { track, getStoredUtm } from "@/lib/analytics/client"
import { WECHAT_ID } from "@/lib/marketing/content"

type DemoClientProps = {
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  calendlyUrl?: string
}

const teamSizeOptions = [
  { value: "1-3", label: "1-3人" },
  { value: "4-8", label: "4-8人" },
  { value: "9-20", label: "9-20人" },
  { value: "20+", label: "20人以上" },
]

const statusOptions = [
  { value: "no-sop", label: "交付流程不稳定，缺少SOP" },
  { value: "multi-project", label: "多项目并行，口径难统一" },
  { value: "low-conversion", label: "有内容但转化效果不稳定" },
  { value: "need-scale", label: "准备规模化，需要标准流程" },
]

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

function persistUtmValues(values: DemoClientProps["utm"]) {
  if (typeof document === "undefined") return

  UTM_KEYS.forEach((key) => {
    const value = values[key]
    if (!value) return
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    try {
      localStorage.setItem(key, value)
    } catch {
      // Ignore storage write failures.
    }
  })
}

export default function DemoClient({ utm, calendlyUrl }: DemoClientProps) {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const mergedUtm = useMemo(() => ({ ...getStoredUtm(), ...utm }), [utm])
  const calendlyHref = calendlyUrl?.trim() || "#"

  useEffect(() => {
    persistUtmValues(utm)
    track("view_demo")
  }, [utm])

  const handleCopyWechat = async () => {
    if (!WECHAT_ID) return
    try {
      await navigator.clipboard.writeText(WECHAT_ID)
      setCopyStatus("已复制微信号")
      setTimeout(() => setCopyStatus(null), 2000)
    } catch {
      setCopyStatus("复制失败，请手动复制")
      setTimeout(() => setCopyStatus(null), 2000)
    }
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
          <Link href="/diagnosis" className="text-sm text-zinc-400 hover:text-white transition-colors">
            免费快速诊断
          </Link>
        </div>
      </nav>

      <main className="relative pt-28 pb-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300 mb-8">
              <span className="inline-flex h-2 w-2 rounded-full bg-purple-400" />
              预约顾问演示 / 团队方案
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              让交付流程可控
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500">
                用一次演示对齐团队方案与落地路径
              </span>
            </h1>

            <p className="text-lg text-zinc-400 mt-6 max-w-2xl">
              填写团队规模与当前现状，我们会在 1 个工作日内联系你，提供可落地的流程建议与方案配置。
            </p>

            <div className="mt-10 space-y-4 text-sm text-zinc-400">
              <div className="flex items-center gap-3">
                <Users size={18} className="text-purple-400" />
                适合代运营、MCN、企业内容团队与内容中台
              </div>
              <div className="flex items-center gap-3">
                <Workflow size={18} className="text-emerald-400" />
                覆盖定位、选题、日历、脚本、质检全流程
              </div>
              <div className="flex items-center gap-3">
                <MessageSquare size={18} className="text-amber-400" />
                提供诊断报告样本与交付SOP参考
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-purple-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {!submitted ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setError(null)
                    setLoading(true)

                    const formData = new FormData(event.currentTarget)
                    const honeypot = String(formData.get("website") || "").trim()

                    if (honeypot) {
                      track("submit_demo_fail", { reason: "honeypot" })
                      setSubmitted(true)
                      setLoading(false)
                      return
                    }

                    const teamSize = String(formData.get("team-size") || "").trim()
                    const currentStatus = String(formData.get("current-status") || "").trim()
                    const contact = String(formData.get("contact") || "").trim()

                    try {
                      const response = await fetch("/api/leads", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          team_size: teamSize,
                          current_status: currentStatus,
                          contact,
                          landing_path: "/demo",
                          utm: mergedUtm,
                        }),
                      })

                      const data = (await response.json()) as { ok: boolean; error?: string; lead_id?: string }

                      if (response.ok && data.ok) {
                        track("submit_demo_success", { lead_id: data.lead_id })
                        setSubmitted(true)
                      } else {
                        track("submit_demo_fail", { status: response.status, error: data.error })
                        if (response.status === 429) {
                          setError("提交过于频繁，请稍后再试。")
                        } else if (data.error === "invalid_contact") {
                          setError("联系方式格式不正确，请确认后再提交。")
                        } else if (data.error === "duplicate_lead") {
                          setError("同一联系方式今日已提交过，我们会尽快联系你。")
                        } else {
                          setError("提交失败，请稍后再试。")
                        }
                      }
                    } catch (submitError) {
                      track("submit_demo_fail", { error: "network_error" })
                      setError("网络异常，请稍后再试。")
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="space-y-6"
                >
                  <div>
                    <label htmlFor="team-size" className="block text-sm text-zinc-300 mb-2">
                      团队规模
                    </label>
                    <select
                      id="team-size"
                      name="team-size"
                      required
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
                    >
                      <option value="">请选择团队规模</option>
                      {teamSizeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="current-status" className="block text-sm text-zinc-300 mb-2">
                      当前现状
                    </label>
                    <select
                      id="current-status"
                      name="current-status"
                      required
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
                    >
                      <option value="">请选择当前现状</option>
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="contact" className="block text-sm text-zinc-300 mb-2">
                      联系方式
                    </label>
                    <input
                      id="contact"
                      name="contact"
                      type="text"
                      required
                      placeholder="手机号 / 微信 / 邮箱"
                      className="w-full rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
                    />
                  </div>

                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  {error ? <p className="text-sm text-rose-400">{error}</p> : null}

                  <GlowButton primary className="w-full py-4 text-base" type="submit" disabled={loading}>
                    {loading ? "提交中..." : "提交预约"}
                    <ArrowRight size={16} />
                  </GlowButton>

                  <p className="text-xs text-zinc-500 text-center">
                    提交即表示同意我们通过上述方式联系你，仅用于方案沟通。
                  </p>
                </form>
              ) : (
                <div className="text-center space-y-5 py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">已收到你的信息</h2>
                  <p className="text-sm text-zinc-400">
                    我们将在 1 个工作日内联系你，提供团队诊断与方案建议。
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <a
                      href={calendlyHref}
                      target={calendlyHref === "#" ? undefined : "_blank"}
                      rel={calendlyHref === "#" ? undefined : "noreferrer"}
                      className="px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-[0_0_0_1px_rgba(147,51,234,0.3),0_4px_16px_-4px_rgba(147,51,234,0.4)] hover:from-purple-400 hover:to-purple-500 transition-colors"
                    >
                      立刻预约时间
                    </a>
                    <Link
                      href="/diagnosis"
                      className="px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-300 hover:text-white transition-colors"
                    >
                      先做免费诊断
                    </Link>
                    <Link
                      href="/"
                      className="px-6 py-3 text-sm text-zinc-400 hover:text-white border border-white/10 rounded-xl transition-colors"
                    >
                      返回首页
                    </Link>
                  </div>

                  {WECHAT_ID ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-zinc-500">
                      <span>如需加微信沟通，可复制：</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-300 font-medium select-all">{WECHAT_ID}</span>
                        <button
                          type="button"
                          onClick={handleCopyWechat}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-zinc-300 hover:text-white transition-colors"
                        >
                          复制微信号
                        </button>
                      </div>
                      {copyStatus ? <span className="text-emerald-300">{copyStatus}</span> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
