"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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

const DEMO_FAQS = [
  {
    question: "演示会展示哪些内容？",
    answer: "展示从诊断→交付包→内容工坊的全链路示例，并给到适配你行业的模板建议。",
  },
  {
    question: "是否支持团队协作？",
    answer: "支持多项目并行、统一口径与质检清单，可配置多角色协作节点。",
  },
  {
    question: "需要准备什么？",
    answer: "准备团队规模、主营行业、当前交付瓶颈即可，其他由我们在演示中梳理。",
  },
]

const DEMO_CASES = [
  {
    name: "MCN矩阵团队",
    challenge: "多账号多项目并行，选题与脚本口径混乱。",
    result: "用统一模板 + 质检清单后，交付周期缩短 35%。",
  },
  {
    name: "企业品牌内容组",
    challenge: "跨部门协作，素材与话术重复、复用率低。",
    result: "交付资产可追溯，复用率提升到 60%+。",
  },
  {
    name: "代运营项目组",
    challenge: "提案与交付脱节，客户觉得“不落地”。",
    result: "交付包对齐行动清单，首轮交付通过率显著提升。",
  },
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
  const formStartRef = useRef<number | null>(null)

  const mergedUtm = useMemo(() => ({ ...getStoredUtm(), ...utm }), [utm])
  const calendlyHref = calendlyUrl?.trim() || "#"
  const hasCalendly = calendlyHref !== "#"

  useEffect(() => {
    persistUtmValues(utm)
    formStartRef.current = performance.now()
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

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { title: "交付路线图", desc: "明确7天交付节奏与关键节点" },
                { title: "团队SOP模板", desc: "统一口径与质检清单，降低返工" },
                { title: "落地工具清单", desc: "流程、模板与协作节点配置建议" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 text-xs text-zinc-400"
                >
                  <div className="flex items-center gap-2 text-sm text-white mb-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    {item.title}
                  </div>
                  <p className="text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-white/5 bg-zinc-900/40 px-5 py-4 text-xs text-zinc-500">
              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                <span className="text-zinc-400">演示流程：</span>
                <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">提交信息</span>
                <span className="text-zinc-600">→</span>
                <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">确认需求</span>
                <span className="text-zinc-600">→</span>
                <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">1:1 演示</span>
              </div>
              <p className="mt-2">建议准备：团队规模、行业方向、当前交付瓶颈。</p>
            </div>

            <div className="mt-10 space-y-4">
              <h3 className="text-base font-semibold text-white">团队场景与效果</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {DEMO_CASES.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4 text-xs text-zinc-400"
                  >
                    <div className="text-sm text-white mb-2">{item.name}</div>
                    <p className="text-zinc-500 leading-relaxed">{item.challenge}</p>
                    <div className="mt-3 text-emerald-300">{item.result}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 space-y-3">
              <h3 className="text-base font-semibold text-white">常见问题</h3>
              <div className="grid gap-3">
                {DEMO_FAQS.map((item) => (
                  <div
                    key={item.question}
                    className="rounded-2xl border border-white/5 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400"
                  >
                    <div className="text-sm text-white mb-2">{item.question}</div>
                    <p className="text-zinc-500 leading-relaxed">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-purple-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {hasCalendly ? (
                <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-3">
                  <span>已有明确需求？可直接预约演示时间。</span>
                  <a
                    href={calendlyHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track("demo_calendly_click", { source: "top" })}
                    className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/30 transition-colors"
                  >
                    立即预约
                  </a>
                </div>
              ) : null}
              {!submitted ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setError(null)
                    setLoading(true)

                    const formData = new FormData(event.currentTarget)
                    const honeypot = String(formData.get("website") || "").trim()

                    if (honeypot) {
                      track("demo_submit_fail", { reason: "honeypot" })
                      track("demo_submit_success", { lead_id: "honeypot" })
                      setSubmitted(true)
                      setLoading(false)
                      return
                    }

                    const teamSize = String(formData.get("team-size") || "").trim()
                    const currentStatus = String(formData.get("current-status") || "").trim()
                    const contact = String(formData.get("contact") || "").trim()
                    const industry = String(formData.get("industry") || "").trim()

                    try {
                      const elapsedMs = formStartRef.current
                        ? Math.round(performance.now() - formStartRef.current)
                        : undefined

                      track("demo_submit_start", {
                        team_size: teamSize,
                        current_status: currentStatus,
                        has_industry: Boolean(industry),
                      })

                      const response = await fetch("/api/leads", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          teamSize,
                          currentStatus,
                          contact,
                          industry: industry || undefined,
                          landingPath: `${window.location.pathname}${window.location.search}`,
                          referrer: document.referrer || undefined,
                          userAgent: navigator.userAgent || undefined,
                          source: "demo",
                          elapsedMs,
                          utmSource: mergedUtm.utm_source,
                          utmMedium: mergedUtm.utm_medium,
                          utmCampaign: mergedUtm.utm_campaign,
                          utmContent: mergedUtm.utm_content,
                          utmTerm: mergedUtm.utm_term,
                        }),
                      })

                      const data = (await response.json()) as { ok: boolean; error?: string; lead_id?: string }

                      const leadId = data.lead_id
                      if (response.ok && data.ok) {
                        track("demo_submit_success", { lead_id: leadId })
                        setSubmitted(true)
                      } else {
                        track("demo_submit_fail", { status: response.status, error: data.error })
                        if (response.status === 429) {
                          setError("提交过于频繁，请稍后再试。")
                        } else if (data.error === "invalid_contact") {
                          setError("联系方式格式不正确，请确认后再提交。")
                        } else if (data.error === "duplicate_lead" || data.error === "too_fast") {
                          setError("我们已经收到过你的信息，会尽快联系你。")
                          setSubmitted(true)
                          track("demo_submit_success", { lead_id: leadId || data.error })
                        } else {
                          setError("提交失败，请稍后再试。")
                        }
                      }
                    } catch (submitError) {
                      track("demo_submit_fail", { error: "network_error" })
                      setError("网络异常，请稍后再试。")
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-xl font-semibold text-white">预约信息</h2>
                    <p className="text-xs text-zinc-500 mt-1">提交后 1 个工作日内联系你。</p>
                  </div>
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

                  <div>
                    <label htmlFor="industry" className="block text-sm text-zinc-300 mb-2">
                      行业方向（可选）
                    </label>
                    <input
                      id="industry"
                      name="industry"
                      type="text"
                      placeholder="例如：美业 / 教培 / 本地生活 / 3C / 餐饮"
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

                  {WECHAT_ID ? (
                    <div className="rounded-2xl border border-white/10 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-400 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-white">或直接加微信沟通</div>
                        <div className="text-emerald-300 font-medium select-all">{WECHAT_ID}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyWechat}
                        className="px-3 py-2 rounded-xl border border-white/10 text-zinc-200 hover:text-white transition-colors"
                      >
                        复制微信号
                      </button>
                    </div>
                  ) : null}
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
                      target={hasCalendly ? "_blank" : undefined}
                      rel={hasCalendly ? "noreferrer" : undefined}
                      onClick={() => track("demo_calendly_click", { source: "success" })}
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
