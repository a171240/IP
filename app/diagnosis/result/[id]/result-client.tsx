"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { ArrowRight, Download, Loader2, Sparkles } from "lucide-react"
import { DIMENSIONS } from "@/lib/diagnosis/scoring"
import { Dimension, INDUSTRY_LABELS } from "@/lib/diagnosis/questions"
import { track } from "@/lib/analytics/client"

interface ResultClientProps {
  result: {
    total: number
    level: "excellent" | "good" | "pass" | "needs_improvement"
    levelLabel: string
    dimensions: Record<
      Dimension,
      {
        score: number
        maxScore: number
        status: "strong" | "normal" | "weak"
        insight: string
      }
    >
    recommendations: string[]
    actionPlan: unknown[]
  }
  industry: string
  createdAt: string
  diagnosisId?: string
  answers?: Record<string, string | string[]>
  isPro?: boolean
  proExpiresAt?: string | null
  userId?: string | null
}

const problemLabels: Record<string, string> = {
  topic_system_missing: "选题体系缺失",
  calendar_blocked: "内容日历排不出来",
  script_slow: "脚本产出慢/质量不稳",
  qc_missing: "返工多口径乱（缺质检标准）",
  conversion_weak: "转化链路不清",
  archive_weak: "素材/知识不沉淀",
}

const problemActions: Record<string, string> = {
  topic_system_missing: "先搭建选题体系，整理高意图场景清单",
  calendar_blocked: "先做 7 天内容日历，锁定节奏与负责人",
  script_slow: "固定 3 套脚本模板，减少反复沟通",
  qc_missing: "建立 10 项质检清单，减少返工",
  conversion_weak: "补齐成交链路，明确 CTA 与承接动作",
  archive_weak: "制定归档规则，保证素材可复用",
}

const paywallCopy = {
  title: "解锁「7天交付包」",
  bullets: [
    "7天成交排产（PDF）",
    "10条高意图选题（PDF）",
    "3条成交脚本（PDF）",
    "质检清单（PDF）",
    "成交结论 + 行动清单（PDF）",
  ],
  ctaActivate: "/activate",
  ctaDemo: "/demo",
}

export function ResultClient({
  result,
  industry,
  createdAt,
  diagnosisId,
  answers,
  isPro,
  proExpiresAt,
  userId,
}: ResultClientProps) {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [packId, setPackId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [thinkingSummary, setThinkingSummary] = useState<string[] | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [progressValue, setProgressValue] = useState(0)

  const isProUser = Boolean(isPro)
  const industryLabel = INDUSTRY_LABELS[industry] || industry || "当前行业"
  const progressSteps = useMemo(
    () => ["校验权益与配额", "生成成交内容", "生成脚本与选题", "渲染PDF交付包", "上传文件并就绪"],
    []
  )

  useEffect(() => {
    if (!isGenerating) {
      setProgressStep(0)
      setProgressValue(0)
      return
    }
    setProgressValue(10)
    const interval = setInterval(() => {
      setProgressStep((prev) => (prev + 1) % progressSteps.length)
      setProgressValue((prev) => (prev >= 90 ? 90 : prev + 10))
    }, 1600)
    return () => clearInterval(interval)
  }, [isGenerating, progressSteps.length])

  const dimensionCards = useMemo(
    () =>
      Object.entries(result.dimensions).map(([key, dim]) => {
        const name = DIMENSIONS[key as Dimension]?.name || key
        const percentage = Math.round((dim.score / dim.maxScore) * 100)
        return {
          key,
          name,
          score: dim.score,
          percentage,
        }
      }),
    [result.dimensions]
  )

  const coreBottleneck = useMemo(() => {
    const problems = Array.isArray(answers?.current_problem) ? answers?.current_problem : []
    if (problems?.length) {
      return problemLabels[problems[0]] || problems[0]
    }
    const lowest = dimensionCards.slice().sort((a, b) => a.score - b.score)[0]
    return lowest ? `${lowest.name}偏弱` : "交付体系需要补齐"
  }, [answers, dimensionCards])

  const topActions = useMemo(() => {
    const actions = new Set<string>()
    const problems = Array.isArray(answers?.current_problem) ? answers?.current_problem : []
    problems.forEach((problem) => {
      const action = problemActions[problem]
      if (action) actions.add(action)
    })
    const defaults = [
      "明确本周交付目标，拆成可执行动作",
      "为每个岗位定义交付口径与检查项",
      "安排一次复盘，沉淀可复用模板",
    ]
    defaults.forEach((item) => actions.add(item))
    return Array.from(actions).slice(0, 3)
  }, [answers])

  const previewCalendar = [
    { day: "Day1", theme: "交付定位与目标拆解", deliverable: "目标画像 + 承接口径" },
    { day: "Day2", theme: "高意图选题池", deliverable: "10条选题清单" },
    { day: "Day3", theme: "脚本模板搭建", deliverable: "3条可拍脚本" },
  ]

  const previewScripts = [
    "客户为什么迟迟不转化？先拆掉 3 个隐性漏斗",
    "7 天排产怎么排：3 个动作锁住节奏",
    "一页纸 SOP：把交付口径写清楚",
  ]

  const previewChecklist = ["选题是否直指痛点", "脚本是否有明确开场钩子", "CTA 是否清晰可执行"]

  useEffect(() => {
    if (!isProUser) {
      track("paywall_view", {
        diagnosisId,
        source: answers?.platform,
        userId,
        landingPath: window.location.pathname,
      })
    }
  }, [answers?.platform, diagnosisId, isProUser, userId])

  const handleGeneratePack = useCallback(async () => {
    setGenerateError(null)
    setThinkingSummary(null)
    setIsGenerating(true)
    setProgressStep(0)
    setProgressValue(10)
    track("delivery_pack_generate_start", {
      diagnosisId,
      source: answers?.platform,
      userId,
      landingPath: window.location.pathname,
    })

    try {
      const payload = {
        industry: String(industry || "other"),
        platform: String(answers?.platform || "xiaohongshu"),
        account_type: String(answers?.account_type || "unknown"),
        team_size: String(answers?.team_size || "unknown"),
        delivery_mode: String(answers?.delivery_mode || "unknown"),
        weekly_output: String(answers?.weekly_output || "unknown"),
        goal: String(answers?.goal || "unknown"),
        current_problem: Array.isArray(answers?.current_problem) ? answers?.current_problem : [],
      }

      const response = await fetch("/api/delivery-pack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
        return
      }

      const data = (await response.json()) as {
        ok: boolean
        packId?: string
        error?: string
        thinkingSummary?: string[]
      }

      if (!response.ok || !data.ok) {
        track("delivery_pack_generate_fail", {
          diagnosisId,
          source: answers?.platform,
          userId,
          landingPath: window.location.pathname,
          error: data.error || response.status,
        })
        if (response.status === 429) {
          setGenerateError("今日生成次数已经用完")
          return
        }
        if (response.status === 403) {
          setGenerateError("需要先激活体验卡或升级权限。")
          return
        }
        if (response.status === 504 || data.error === "llm_timeout") {
          setGenerateError("模型响应超时，请稍后再试。")
          return
        }
        setGenerateError("生成失败，请稍后再试。")
        return
      }

      setPackId(data.packId || null)
      setThinkingSummary(data.thinkingSummary?.length ? data.thinkingSummary : null)
      setProgressStep(progressSteps.length - 1)
      setProgressValue(100)
      track("delivery_pack_generate_success", {
        diagnosisId,
        source: answers?.platform,
        userId,
        landingPath: window.location.pathname,
        packId: data.packId,
      })
    } catch {
      track("delivery_pack_generate_fail", {
        diagnosisId,
        source: answers?.platform,
        userId,
        landingPath: window.location.pathname,
        error: "network_error",
      })
      setGenerateError("网络异常，请稍后再试。")
    } finally {
      setIsGenerating(false)
    }
  }, [answers, diagnosisId, industry, progressSteps.length, router, userId])

  const handleDownload = useCallback(async () => {
    if (!packId) {
      setGenerateError("请先生成交付包")
      return
    }
    setGenerateError(null)
    setIsDownloading(true)
    track("delivery_pack_download", {
      diagnosisId,
      source: answers?.platform,
      userId,
      landingPath: window.location.pathname,
      packId,
    })
    try {
      const downloadResp = await fetch(`/api/delivery-pack/${packId}/download`, { redirect: "manual" })
      if (downloadResp.type === "opaqueredirect") {
        window.location.href = `/api/delivery-pack/${packId}/download`
        return
      }
      if (downloadResp.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      if (downloadResp.status === 409) {
        setGenerateError("交付包还在生成，请稍后再试。")
        return
      }
      if (downloadResp.status === 429) {
        setGenerateError("今日生成次数已经用完")
        return
      }
      if (downloadResp.status >= 400) {
        setGenerateError("下载失败，请稍后再试。")
        return
      }
      const location = downloadResp.headers.get("Location")
      if (location) {
        window.location.href = location
        return
      }
      window.location.href = `/api/delivery-pack/${packId}/download`
    } catch {
      setGenerateError("下载失败，请稍后再试。")
    } finally {
      setIsDownloading(false)
    }
  }, [answers?.platform, diagnosisId, packId, router, userId])

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: "主页", href: "/" },
          { label: "内容交付系统诊断", href: "/diagnosis" },
          { label: "诊断结果" },
        ]}
      />

      <main className="p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold dark:text-white text-zinc-900">
                  交付系统诊断结果
                </h1>
                <p className="text-sm dark:text-zinc-400 text-zinc-500">
                  {new Date(createdAt).toLocaleDateString("zh-CN")} · {industryLabel}
                </p>
              </div>
              {isProUser && proExpiresAt ? (
                <div className="text-xs text-emerald-400">
                  体验权益有效期至 {new Date(proExpiresAt).toLocaleDateString("zh-CN")}
                </div>
              ) : null}
            </div>
          </GlassCard>

          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h2 className="text-lg font-semibold dark:text-white text-zinc-900">五维评分（0-10）</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {dimensionCards.map((dim) => (
                  <div key={dim.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between text-sm text-zinc-300">
                      <span>{dim.name}</span>
                      <span className="font-semibold text-white">{dim.score}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${dim.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">核心瓶颈</h2>
              <p className="mt-3 text-sm text-zinc-300">{coreBottleneck}</p>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Top3 优先级动作</h3>
                <ul className="mt-3 space-y-2 text-sm text-zinc-400 list-disc list-inside">
                  {topActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">交付包预览</h2>
              <span className="text-xs text-zinc-500">
                {isProUser ? "已解锁" : "未解锁"} · 单份PDF交付包
              </span>
            </div>

            <div className="mt-4 grid lg:grid-cols-3 gap-4">
              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">PDF封面 + 目录</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>成交结论摘要</li>
                  <li>7天排产目录</li>
                  <li>脚本与选题索引</li>
                </ul>
              </div>

              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">成交脚本</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>成交导向脚本</li>
                  <li>共鸣信任脚本</li>
                  <li>专业观点脚本</li>
                </ul>
              </div>

              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">排产与质检</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>7天成交排产</li>
                  <li>10条高意图选题</li>
                  <li>质检清单（可判定）</li>
                </ul>
              </div>
            </div>
          </GlassCard>

          {isProUser ? (
            <GlassCard className="p-6">
              <div className="flex flex-col gap-4">
                {isGenerating ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent px-5 py-4 text-sm text-emerald-100 shadow-[0_0_40px_-20px_rgba(16,185,129,0.5)]">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">后台处理中…</div>
                      <span className="text-xs text-emerald-200/70">预计 60-120 秒</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-emerald-900/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500"
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-emerald-200/80">
                      {progressSteps.map((step, index) => (
                        <div key={step} className="flex items-center gap-2">
                          <span
                            className={[
                              "inline-flex h-2 w-2 rounded-full",
                              index < progressStep
                                ? "bg-emerald-300"
                                : index === progressStep
                                  ? "bg-emerald-400 animate-pulse"
                                  : "bg-emerald-400/30",
                            ].join(" ")}
                          />
                          <span className={index === progressStep ? "text-emerald-50" : ""}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {thinkingSummary?.length ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-zinc-200">
                    <div className="text-sm font-semibold text-white">思考摘要（可读版本）</div>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-300 list-disc list-inside">
                      {thinkingSummary.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}


                {generateError ? <p className="text-sm text-rose-400">{generateError}</p> : null}

                <div className="flex flex-col sm:flex-row gap-3">
                  <GlowButton primary onClick={handleGeneratePack} disabled={isGenerating}>
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        生成交付包
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </GlowButton>
                  <GlowButton onClick={handleDownload} disabled={!packId || isDownloading}>
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        准备下载...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        下载PDF
                      </>
                    )}
                  </GlowButton>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">{paywallCopy.title}</h2>
              <ul className="mt-4 space-y-2 text-sm text-zinc-400 list-disc list-inside">
                {paywallCopy.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link
                  href={paywallCopy.ctaActivate}
                  onClick={() =>
                    track("paywall_cta_click", {
                      diagnosisId,
                      source: answers?.platform,
                      userId,
                      landingPath: window.location.pathname,
                      target: "activate",
                    })
                  }
                  className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold"
                >
                  去激活体验卡
                </Link>
                <Link
                  href={paywallCopy.ctaDemo}
                  onClick={() =>
                    track("paywall_cta_click", {
                      diagnosisId,
                      source: answers?.platform,
                      userId,
                      landingPath: window.location.pathname,
                      target: "demo",
                    })
                  }
                  className="inline-flex items-center justify-center px-5 py-2 rounded-xl border border-white/10 text-sm text-zinc-300 hover:text-white"
                >
                  预约顾问演示
                </Link>
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </div>
  )
}
