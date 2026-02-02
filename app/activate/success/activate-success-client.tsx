"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle, Download, FileText, Loader2, Sparkles } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlassCard, GlowButton } from "@/components/ui/obsidian"
import { track } from "@/lib/analytics/client"
import { QUESTIONS, INDUSTRY_LABELS } from "@/lib/diagnosis/questions"

type ActivateSuccessClientProps = {
  user: { id: string; email?: string } | null
  isPro: boolean
  proExpiresAt?: string | null
}

type OnboardingPayload = {
  platform?: string
  platform_label?: string
  industry?: string
  industry_label?: string
  offer_desc?: string
  target_audience?: string
  tone?: string
  tone_label?: string
  price_range?: string
  price_range_label?: string
  current_problem?: string[]
  day?: number
  topic?: string
}

type DeliveryPackGeneratePayload = {
  team_type: string
  team_size: string
  industry: string
  platform: string
  offer_type: string
  offer_desc: string
  delivery_mode: string
  guideline_level: string
  qc_process: string
  conversion_path: string
  current_problem?: string[]
  target_audience: string
  price_range: string
  tone: string
}

type PackStatus = "idle" | "needs_diagnosis" | "generating" | "done" | "failed"

const PLATFORM_OPTIONS = QUESTIONS.find((q) => q.id === "platform")?.options ?? []
const INDUSTRY_OPTIONS = QUESTIONS.find((q) => q.id === "industry")?.options ?? []
const TONE_OPTIONS = QUESTIONS.find((q) => q.id === "tone")?.options ?? []
const PRICE_OPTIONS = QUESTIONS.find((q) => q.id === "price_range")?.options ?? []

function resolveLabel(options: Array<{ value: string; label: string }>, value: string | undefined) {
  if (!value) return ""
  return options.find((opt) => opt.value === value)?.label || value
}

const steps = [
  { id: "redeem", label: "兑换成功" },
  { id: "generate", label: "生成交付包" },
  { id: "complete", label: "完成下载 + 去发布" },
]

export default function ActivateSuccessClient({ user, isPro, proExpiresAt }: ActivateSuccessClientProps) {
  const router = useRouter()
  const [status, setStatus] = useState<PackStatus>("idle")
  const [packId, setPackId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusHint, setStatusHint] = useState<string | null>(null)

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("zh-CN")
  }

  const buildOnboardingPayload = useCallback((): OnboardingPayload | null => {
    if (typeof window === "undefined") return null
    try {
      const saved = window.localStorage.getItem("latestDiagnosisAnswers")
      if (!saved) return null
      const parsed = JSON.parse(saved) as {
        answers?: Record<string, string | string[]>
        customIndustry?: string
      }
      const answers = parsed.answers || {}
      const platform = String(answers.platform || "")
      const industry = String(answers.industry || "")
      const offerDesc = String(answers.offer_desc || "")
      const targetAudience = String(answers.target_audience || "")
      const industryLabel =
        industry === "other"
          ? String(parsed.customIndustry || "")
          : INDUSTRY_LABELS[industry] || resolveLabel(INDUSTRY_OPTIONS, industry)

      return {
        platform,
        platform_label: resolveLabel(PLATFORM_OPTIONS, platform),
        industry,
        industry_label: industryLabel || industry,
        offer_desc: offerDesc,
        target_audience: targetAudience,
        tone: String(answers.tone || ""),
        tone_label: resolveLabel(TONE_OPTIONS, String(answers.tone || "")),
        price_range: String(answers.price_range || ""),
        price_range_label: resolveLabel(PRICE_OPTIONS, String(answers.price_range || "")),
        current_problem: Array.isArray(answers.current_problem) ? answers.current_problem.map(String) : undefined,
      }
    } catch {
      return null
    }
  }, [])

  const buildDeliveryPackPayload = useCallback((): DeliveryPackGeneratePayload | null => {
    if (typeof window === "undefined") return null
    try {
      const saved = window.localStorage.getItem("latestDiagnosisAnswers")
      if (!saved) return null
      const parsed = JSON.parse(saved) as {
        answers?: Record<string, string | string[]>
        customIndustry?: string
      }
      const answers = parsed.answers || {}
      const resolvedIndustry =
        answers.industry === "other" ? parsed.customIndustry || "other" : String(answers.industry || "other")
      return {
        team_type: String(answers.team_type || "unknown"),
        team_size: String(answers.team_size || "unknown"),
        industry: String(resolvedIndustry),
        platform: String(answers.platform || "xiaohongshu"),
        offer_type: String(answers.offer_type || "service"),
        offer_desc: String(answers.offer_desc || "暂未填写"),
        delivery_mode: String(answers.delivery_mode || ""),
        guideline_level: String(answers.guideline_level || ""),
        qc_process: String(answers.qc_process || ""),
        conversion_path: String(answers.conversion_path || ""),
        current_problem:
          Array.isArray(answers.current_problem) && answers.current_problem.length
            ? (answers.current_problem as string[])
            : undefined,
        target_audience: String(answers.target_audience || ""),
        price_range: String(answers.price_range || ""),
        tone: String(answers.tone || ""),
      }
    } catch {
      return null
    }
  }, [])

  const pollPackStatus = useCallback(async (targetPackId: string) => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(3000)
      const response = await fetch(`/api/delivery-pack/${targetPackId}`)
      if (!response.ok) continue
      const data = (await response.json()) as { status?: string; errorMessage?: string }
      if (data.status === "done") return { status: "done" as const }
      if (data.status === "failed") return { status: "failed" as const, errorMessage: data.errorMessage }
    }
    return { status: "timeout" as const }
  }, [])

  const openWorkshop = useCallback(() => {
    const payload = buildOnboardingPayload()
    track("workshop_open", {
      userId: user?.id,
      landingPath: window.location.pathname,
      mode: payload ? "one_click" : "default",
    })
    if (payload) {
      try {
        localStorage.setItem("workshop_onboarding", JSON.stringify(payload))
        localStorage.setItem("workshop_onboarding_done", "1")
      } catch {
        // ignore storage errors
      }
      window.location.href = "/dashboard/workflow/P7?onboarding=1"
      return
    }
    window.location.href = "/dashboard/workflow/P7"
  }, [buildOnboardingPayload, user?.id])

  const handleDownload = useCallback(() => {
    if (!packId) return
    track("pack_download", {
      packId,
      userId: user?.id,
      landingPath: window.location.pathname,
    })
    window.location.href = `/api/delivery-pack/${packId}/download`
  }, [packId, user?.id])

  useEffect(() => {
    track("activate_success", {
      userId: user?.id,
      landingPath: window.location.pathname,
    })
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    const run = async () => {
      setErrorMessage(null)
      setStatusHint(null)

      if (!isPro) {
        setStatus("failed")
        setErrorMessage("尚未开通体验卡权益，请先完成兑换")
        return
      }

      const storedPackId = typeof window !== "undefined" ? localStorage.getItem("latestDeliveryPackId") : null
      if (storedPackId) {
        setPackId(storedPackId)
        setStatus("generating")
        const pollResult = await pollPackStatus(storedPackId)
        if (cancelled) return
        if (pollResult.status === "done") {
          setStatus("done")
          return
        }
        if (pollResult.status === "failed") {
          setStatus("failed")
          setErrorMessage(pollResult.errorMessage || "交付包生成失败，请稍后重试")
          return
        }
        setStatus("failed")
        setErrorMessage("生成超时，请稍后在交付包页面查看")
        return
      }

      try {
        const latestResp = await fetch("/api/delivery-pack/latest")
        if (latestResp.ok) {
          const latestData = (await latestResp.json()) as { ok?: boolean; packId?: string; status?: string }
          if (latestData?.ok && latestData.packId) {
            if (cancelled) return
            setPackId(latestData.packId)
            setStatus(latestData.status === "done" ? "done" : "generating")
            if (latestData.status !== "done") {
              const pollResult = await pollPackStatus(latestData.packId)
              if (cancelled) return
              if (pollResult.status === "done") {
                setStatus("done")
                return
              }
              if (pollResult.status === "failed") {
                setStatus("failed")
                setErrorMessage(pollResult.errorMessage || "交付包生成失败，请稍后重试")
                return
              }
              setStatus("failed")
              setErrorMessage("生成超时，请稍后在交付包页面查看")
              return
            } else {
              return
            }
          }
        }
      } catch {
        // ignore
      }

      const payload = buildDeliveryPackPayload()
      if (!payload) {
        setStatus("needs_diagnosis")
        setStatusHint("需要先完成诊断问卷，才能生成交付包。")
        return
      }

      setStatus("generating")
      setStatusHint("已开始生成交付包，预计 60-120 秒")
      track("pack_generate_start", {
        userId: user?.id,
        landingPath: window.location.pathname,
      })

      const response = await fetch("/api/delivery-pack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 401) {
        router.push(`/auth/login?redirect=${encodeURIComponent("/activate/success")}`)
        return
      }

      const data = (await response.json()) as { ok?: boolean; packId?: string; status?: string; error?: string }

      if (!response.ok || !data.ok || !data.packId) {
        setStatus("failed")
        if (response.status === 403) {
          setErrorMessage("当前账号未开通体验权益，请先完成兑换")
          return
        }
        if (response.status === 429) {
          setErrorMessage("今日生成次数已用完，请稍后再试")
          return
        }
        setErrorMessage(data.error || "交付包生成失败，请稍后重试")
        return
      }

      if (cancelled) return
      setPackId(data.packId)
      try {
        localStorage.setItem("latestDeliveryPackId", data.packId)
      } catch {
        // ignore storage errors
      }

      if (data.status === "pending") {
        const pollResult = await pollPackStatus(data.packId)
        if (cancelled) return
        if (pollResult.status === "done") {
          setStatus("done")
          track("pack_generate_success", {
            packId: data.packId,
            userId: user?.id,
            landingPath: window.location.pathname,
          })
          return
        }
        if (pollResult.status === "failed") {
          setStatus("failed")
          setErrorMessage(pollResult.errorMessage || "交付包生成失败，请稍后重试")
          return
        }
        setStatus("failed")
        setErrorMessage("生成超时，请稍后在交付包页面查看")
        return
      }

      setStatus("done")
      track("pack_generate_success", {
        packId: data.packId,
        userId: user?.id,
        landingPath: window.location.pathname,
      })
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [buildDeliveryPackPayload, isPro, pollPackStatus, router, user?.id])

  const stepStatus = useMemo(() => {
    return {
      redeem: "done" as const,
      generate:
        status === "generating"
          ? ("active" as const)
          : status === "done"
            ? ("done" as const)
            : status === "failed"
              ? ("error" as const)
              : ("pending" as const),
      complete: status === "done" ? ("active" as const) : ("pending" as const),
    }
  }, [status])

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
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors">
            回到工作台
          </Link>
        </div>
      </nav>

      <main className="relative pt-28 pb-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <GlassCard className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                  体验卡主线
                </div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">激活成功，交付包马上生成</h1>
                <p className="mt-2 text-sm text-zinc-400">
                  {user?.email ? `当前账号：${user.email}` : "已登录"}
                  {formatDate(proExpiresAt) ? ` · 有效期至 ${formatDate(proExpiresAt)}` : null}
                </p>
              </div>
              {status === "generating" ? (
                <div className="inline-flex items-center gap-2 text-sm text-emerald-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </div>
              ) : status === "done" ? (
                <div className="inline-flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle className="w-4 h-4" />
                  已生成
                </div>
              ) : null}
            </div>
          </GlassCard>

          <GlassCard className="p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {steps.map((step) => {
                const current = stepStatus[step.id as keyof typeof stepStatus]
                return (
                  <div
                    key={step.id}
                    className={`rounded-2xl border px-4 py-4 text-sm ${
                      current === "done"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                        : current === "active"
                          ? "border-purple-500/40 bg-purple-500/10 text-purple-100"
                          : current === "error"
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                            : "border-white/10 bg-white/5 text-zinc-400"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-widest">Step</div>
                    <div className="mt-2 font-semibold text-base">{step.label}</div>
                  </div>
                )
              })}
            </div>
            {statusHint ? <p className="mt-4 text-sm text-emerald-200">{statusHint}</p> : null}
            {errorMessage ? <p className="mt-4 text-sm text-rose-400">{errorMessage}</p> : null}
          </GlassCard>

          {status === "needs_diagnosis" ? (
            <GlassCard className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">先完成 5 分钟诊断</h2>
                  <p className="mt-2 text-sm text-zinc-400">诊断结果会自动用于生成交付包。</p>
                </div>
                <GlowButton
                  primary
                  className="px-6 py-3"
                  onClick={() => router.push("/diagnosis/quiz?from=activate-success")}
                >
                  开始诊断
                  <Sparkles className="w-4 h-4" />
                </GlowButton>
              </div>
            </GlassCard>
          ) : null}

          {status === "done" ? (
            <GlassCard className="p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-white">交付包已准备好</h2>
              <p className="mt-2 text-sm text-zinc-400">现在可以直接下载 PDF 或打开可复制版报告。</p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <GlowButton primary className="px-6 py-3" onClick={handleDownload} disabled={!packId}>
                  <Download className="w-4 h-4" />
                  下载 PDF
                </GlowButton>
                <GlowButton
                  className="px-6 py-3"
                  onClick={() => packId && router.push(`/pack/${packId}`)}
                  disabled={!packId}
                >
                  <FileText className="w-4 h-4" />
                  打开可复制版报告
                </GlowButton>
                <GlowButton className="px-6 py-3" onClick={openWorkshop}>
                  去内容工坊生成第一条
                </GlowButton>
              </div>
            </GlassCard>
          ) : null}

          {status === "failed" ? (
            <GlassCard className="p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-white">生成遇到问题</h2>
              <p className="mt-2 text-sm text-zinc-400">请稍后重试或从诊断结果页重新生成。</p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <GlowButton
                  primary
                  className="px-6 py-3"
                  onClick={() => router.push("/diagnosis/quiz?from=activate-success")}
                >
                  重新诊断
                </GlowButton>
                <GlowButton className="px-6 py-3" onClick={() => router.push("/diagnosis")}
                >
                  返回诊断中心
                </GlowButton>
              </div>
            </GlassCard>
          ) : null}
        </div>
      </main>
    </div>
  )
}
