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
  coreBottleneck?: string
  topActions?: string[]
}

const paywallCopy = {
  title: "解锁「7天交付包」",
  bullets: [
    "7天成交排产（PDF）",
    "10条高意图选题（PDF）",
    "3条成交脚本（PDF）",
    "质检清单（PDF）",
    "归档规则与升级建议（PDF）",
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
  coreBottleneck,
  topActions,
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
    () => ["校验权益", "生成结论", "生成排产与脚本", "渲染PDF", "上传完成"],
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

  const fallbackBottleneck = useMemo(() => {
    const lowest = dimensionCards.slice().sort((a, b) => a.score - b.score)[0]
    return lowest ? `${lowest.name}偏弱` : "交付系统需要补齐"
  }, [dimensionCards])

  const coreBottleneckText = coreBottleneck || fallbackBottleneck
  const fallbackActions = ["明确本周交付目标", "固定7天排产节奏", "建立发布质检清单"]
  const topActionsList = (
    topActions?.length ? topActions : result.recommendations?.length ? result.recommendations : fallbackActions
  ).slice(0, 3)

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
    track("pdf_generate_start", {
      diagnosisId,
      source: answers?.platform,
      userId,
      landingPath: window.location.pathname,
    })

    try {
      const resolvedIndustry =
        answers?.industry === "other" ? industry : String(answers?.industry || industry || "other")

      const payload = {
        team_type: String(answers?.team_type || "unknown"),
        team_size: String(answers?.team_size || "unknown"),
        industry: String(resolvedIndustry),
        platform: String(answers?.platform || "xiaohongshu"),
        offer_type: String(answers?.offer_type || "service"),
        offer_desc: String(answers?.offer_desc || "暂未填写"),
        sop_level: String(answers?.sop_level || ""),
        guideline_level: String(answers?.guideline_level || ""),
        topic_library: String(answers?.topic_library || ""),
        multi_project: String(answers?.multi_project || ""),
        script_review: String(answers?.script_review || ""),
        qc_process: String(answers?.qc_process || ""),
        conversion_path: String(answers?.conversion_path || ""),
        review_frequency: String(answers?.review_frequency || ""),
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
        track("pdf_generate_fail", {
          diagnosisId,
          source: answers?.platform,
          userId,
          landingPath: window.location.pathname,
          error: data.error || response.status,
        })
        if (response.status === 429) {
          setGenerateError("今日生成次数已用完")
          return
        }
        if (response.status === 403) {
          setGenerateError("需要先激活体验卡或升级权限")
          return
        }
        if (response.status === 504 || data.error === "llm_timeout") {
          setGenerateError("模型响应超时，请稍后再试")
          return
        }
        setGenerateError("生成失败，请稍后再试")
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
      track("pdf_generate_success", {
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
      track("pdf_generate_fail", {
        diagnosisId,
        source: answers?.platform,
        userId,
        landingPath: window.location.pathname,
        error: "network_error",
      })
      setGenerateError("网络异常，请稍后再试")
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
    track("pdf_download", {
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
        setGenerateError("交付包仍在生成中，请稍后再试")
        return
      }
      if (downloadResp.status === 429) {
        setGenerateError("今日生成次数已用完")
        return
      }
      if (downloadResp.status >= 400) {
        setGenerateError("下载失败，请稍后再试")
        return
      }
      const location = downloadResp.headers.get("Location")
      if (location) {
        window.location.href = location
        return
      }
      window.location.href = `/api/delivery-pack/${packId}/download`
    } catch {
      setGenerateError("下载失败，请稍后再试")
    } finally {
      setIsDownloading(false)
    }
  }, [answers?.platform, diagnosisId, packId, router, userId])

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: "首页", href: "/" },
          { label: "内容交付系统诊断", href: "/diagnosis" },
          { label: "诊断结果" },
        ]}
      />

      <main className="p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold dark:text-white text-zinc-900">交付系统诊断结果</h1>
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
              <p className="mt-3 text-sm text-zinc-300">{coreBottleneckText}</p>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Top3 优先动作</h3>
                <ul className="mt-3 space-y-2 text-sm text-zinc-400 list-disc list-inside">
                  {topActionsList.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">交付包预览</h2>
              <span className="text-xs text-zinc-500">{isProUser ? "已解锁" : "未解锁"} · 一份PDF</span>
            </div>

            <div className="mt-4 grid lg:grid-cols-3 gap-4">
              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">一页结论 + 目录</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>核心瓶颈与Top3动作</li>
                  <li>明天第一条可直接发布</li>
                  <li>行动清单指引</li>
                </ul>
              </div>

              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">成交脚本</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>镜头+台词+画面</li>
                  <li>标题备选+置顶评论</li>
                  <li>成交话术模板</li>
                </ul>
              </div>

              <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${isProUser ? "" : "blur-sm"}`}>
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">排产与质检</h3>
                <ul className="space-y-2 text-xs text-zinc-400 list-disc list-inside">
                  <li>7天成交排产</li>
                  <li>10条高意图选题</li>
                  <li>质检清单与归档规则</li>
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
                    <div className="text-sm font-semibold text-white">思考摘要（可读版）</div>
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
