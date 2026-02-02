"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Copy, Download, FileText } from "lucide-react"
import { Header, GlassCard, GlowButton } from "@/components/ui/obsidian"
import { track } from "@/lib/analytics/client"
import type { DeliveryPackOutput } from "@/lib/delivery-pack/schema"
import { QUESTIONS, INDUSTRY_LABELS } from "@/lib/diagnosis/questions"

const safeArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

type DeliveryPackClientProps = {
  packId: string
  userId?: string | null
  downloadUrl?: string
  status: string
  createdAt: string
  errorMessage?: string | null
  output: DeliveryPackOutput | null
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

const PLATFORM_OPTIONS = QUESTIONS.find((q) => q.id === "platform")?.options ?? []
const INDUSTRY_OPTIONS = QUESTIONS.find((q) => q.id === "industry")?.options ?? []
const TONE_OPTIONS = QUESTIONS.find((q) => q.id === "tone")?.options ?? []
const PRICE_OPTIONS = QUESTIONS.find((q) => q.id === "price_range")?.options ?? []

function resolveLabel(options: Array<{ value: string; label: string }>, value: string | undefined) {
  if (!value) return ""
  return options.find((opt) => opt.value === value)?.label || value
}

export default function DeliveryPackClient({
  packId,
  userId,
  downloadUrl,
  status,
  createdAt,
  errorMessage,
  output,
}: DeliveryPackClientProps) {
  const [copyingKey, setCopyingKey] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    track("delivery_pack_view", { packId, userId, landingPath: window.location.pathname })
  }, [packId, userId])

  const copyText = useCallback(
    async (value: string, key: string, eventName: string, extraProps?: Record<string, unknown>) => {
      if (!value) return
      try {
        await navigator.clipboard.writeText(value)
        setCopyingKey(key)
        track(eventName, { packId, userId, landingPath: window.location.pathname, ...(extraProps || {}) })
      } finally {
        setTimeout(() => setCopyingKey(null), 800)
      }
    },
    [packId, userId]
  )

  const calendar = useMemo(() => safeArray(output?.calendar_7d), [output])

  const buildOnboardingPayload = useCallback((): OnboardingPayload | null => {
    if (typeof window === "undefined") return null
    const dayOne = calendar[0]
    try {
      const saved = window.localStorage.getItem("latestDiagnosisAnswers")
      if (saved) {
        const parsed = JSON.parse(saved) as {
          answers?: Record<string, string | string[]>
          customIndustry?: string
        }
        const answers = parsed.answers || {}
        const platform = String(answers.platform || "")
        const industry = String(answers.industry || "")
        const offerDesc = String(answers.offer_desc || "")
        const targetAudience = String(answers.target_audience || "")
        if (platform && industry && offerDesc && targetAudience) {
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
            day: dayOne?.day || 1,
            topic: dayOne?.title || "",
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    if (output?.meta) {
      const industryLabel =
        INDUSTRY_LABELS[output.meta.industry] ||
        resolveLabel(INDUSTRY_OPTIONS, output.meta.industry) ||
        output.meta.industry
      return {
        platform_label: output.meta.platform || "",
        industry_label: industryLabel,
        offer_desc: output.meta.offer_desc || "",
        day: dayOne?.day || 1,
        topic: dayOne?.title || "",
      }
    }

    return null
  }, [calendar, output])

  const goToWorkshop = useCallback(
    (stepId: "P7" | "P8") => {
      const payload = buildOnboardingPayload()
      track("workshop_enter", {
        packId,
        stepId,
        userId,
        landingPath: window.location.pathname,
        mode: payload ? "one_click" : "default",
      })
      if (typeof window !== "undefined" && payload) {
        try {
          localStorage.setItem("workshop_onboarding", JSON.stringify(payload))
          localStorage.setItem("workshop_onboarding_done", "1")
        } catch {
          // ignore storage errors
        }
        window.location.href = `/dashboard/workflow/${stepId}?onboarding=1`
        return
      }
      const shouldOnboard = typeof window !== "undefined" && !localStorage.getItem("workshop_onboarding_done")
      if (shouldOnboard) {
        window.location.href = `/dashboard/workflow/onboarding?target=${stepId}`
        return
      }
      window.location.href = `/dashboard/workflow/${stepId}`
    },
    [buildOnboardingPayload, packId, userId]
  )

  const pollPackStatus = useCallback(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(3000)
      const response = await fetch(`/api/delivery-pack/${packId}`)
      if (!response.ok) continue
      const data = (await response.json()) as { status?: string; errorMessage?: string }
      if (data.status === "done") return { status: "done" as const }
      if (data.status === "failed") return { status: "failed" as const, errorMessage: data.errorMessage }
    }
    return { status: "timeout" as const }
  }, [packId])

  const handleDownload = useCallback(async () => {
    if (isDownloading) return
    setDownloadError(null)
    setIsDownloading(true)
    track("delivery_pack_download", {
      packId,
      userId,
      landingPath: window.location.pathname,
      mode: "download",
    })

    if (downloadUrl) {
      window.location.href = downloadUrl
      setTimeout(() => setIsDownloading(false), 800)
      return
    }

    if (status === "done") {
      window.location.href = `/api/delivery-pack/${packId}/download`
      setTimeout(() => setIsDownloading(false), 800)
      return
    }

    try {
      const downloadResp = await fetch(`/api/delivery-pack/${packId}/download`, { redirect: "manual" })
      if (downloadResp.type === "opaqueredirect") {
        window.location.href = `/api/delivery-pack/${packId}/download`
        return
      }
      if (downloadResp.status === 409) {
        const pollResult = await pollPackStatus()
        if (pollResult.status === "done") {
          window.location.href = `/api/delivery-pack/${packId}/download`
          return
        }
        if (pollResult.status === "failed") {
          setDownloadError("交付包生成失败，请稍后重试")
          return
        }
        setDownloadError("仍在生成中，请稍后再试")
        return
      }
      if (downloadResp.status === 401) {
        setDownloadError("请先登录后再下载")
        return
      }
      if (downloadResp.status >= 400) {
        setDownloadError("下载失败，请稍后再试")
        return
      }
      const location = downloadResp.headers.get("Location")
      if (location) {
        window.location.href = location
        return
      }
      window.location.href = `/api/delivery-pack/${packId}/download`
    } finally {
      setIsDownloading(false)
    }
  }, [downloadUrl, isDownloading, packId, pollPackStatus, status, userId])

  const topics = useMemo(() => safeArray(output?.topics_10), [output])
  const scripts = useMemo(() => safeArray(output?.scripts_3), [output])
  const topActions = useMemo(() => safeArray(output?.top_actions), [output])
  const topActionTitles = useMemo(() => {
    if (topActions.length) return topActions.map((item) => item.title)
    return ["明确本周交付目标", "固定7天排产节奏", "建立发布质检清单"]
  }, [topActions])

  const dayOne = calendar[0]
  const tomorrowText = dayOne
    ? `标题：${dayOne.title}\n3秒钩子：${dayOne.hook}\n结构：${dayOne.outline.join(" / ")}\nCTA：${dayOne.cta}`
    : ""
  const tomorrowPost = output?.tomorrow_post
  const tomorrowPostText = tomorrowPost
    ? `标题：${tomorrowPost.title}\n封面文字：${tomorrowPost.cover_text}\n正文：${tomorrowPost.body}\n置顶评论：${tomorrowPost.pinned_comment}`
    : ""
  const calendarText = useMemo(() => {
    if (!calendar.length) return ""
    return calendar
      .map(
        (item) =>
          `Day ${item.day}（${item.type}）\n标题：${item.title}\n3秒钩子：${item.hook}\n结构：${item.outline.join(
            " / "
          )}\nCTA：${item.cta}\n脚本：${item.script_id}`
      )
      .join("\n\n")
  }, [calendar])
  const qcText = useMemo(() => {
    if (!output?.qc_checklist) return ""
    const { title, body, cta_and_compliance } = output.qc_checklist
    return [
      "标题检查",
      ...(title || []),
      "",
      "结构检查",
      ...(body || []),
      "",
      "CTA 与合规",
      ...(cta_and_compliance || []),
    ]
      .filter(Boolean)
      .join("\n")
  }, [output])
  const archiveText = useMemo(() => {
    if (!output?.archive_rules) return ""
    const { naming, tags, dedupe } = output.archive_rules
    return [
      `命名规范：${naming}`,
      `标签体系：${(tags || []).join(" / ")}`,
      `去重规则：${(dedupe || []).join(" / ")}`,
    ]
      .filter(Boolean)
      .join("\n")
  }, [output])

  if (!output) {
    return (
      <div className="min-h-screen">
        <Header breadcrumbs={[{ label: "首页", href: "/" }, { label: "交付包预览" }]} />
        <main className="p-6 lg:p-8">
          <GlassCard className="p-6 max-w-3xl mx-auto">
            <h1 className="text-lg font-semibold text-white">交付包暂不可用</h1>
            <p className="mt-2 text-sm text-zinc-400">{errorMessage || "请稍后重试"}</p>
            <div className="mt-4">
              <Link href="/diagnosis/quiz" className="text-emerald-400 text-sm">
                返回诊断
              </Link>
            </div>
          </GlassCard>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "首页", href: "/" }, { label: "交付包预览" }]} />
      <main className="p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-white">交付包在线预览</h1>
                <p className="text-sm text-zinc-400">
                  {new Date(createdAt).toLocaleDateString("zh-CN")} · 状态：{status}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  PDF 操作
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <GlowButton
                    primary
                    onClick={() => {
                      track("delivery_pack_download", {
                        packId,
                        userId,
                        landingPath: window.location.pathname,
                        mode: "open",
                      })
                      window.open(`/api/delivery-pack/${packId}/download`, "_blank")
                    }}
                    disabled={isDownloading}
                    className="px-6 py-3.5 rounded-2xl text-base bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 shadow-xl shadow-purple-500/40 hover:brightness-110"
                  >
                    <FileText className="w-4 h-4" />
                    打开 PDF
                  </GlowButton>
                  <GlowButton
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="px-5 py-3 rounded-xl border border-purple-500/40 dark:bg-zinc-900/60 bg-white/90 dark:text-zinc-100 text-zinc-900 hover:border-purple-400/60 hover:shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? "准备下载..." : "下载 PDF"}
                  </GlowButton>
                </div>
              </div>
            </div>
            {status !== "done" ? (
              <p className="mt-3 text-sm text-emerald-200">交付包仍在后台生成，可直接点击下载按钮等待完成。</p>
            ) : null}
            {downloadError ? <p className="mt-3 text-sm text-rose-400">{downloadError}</p> : null}
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">核心瓶颈</h2>
            <p className="mt-3 text-sm text-zinc-300">{output.bottleneck}</p>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-zinc-200">Top3 动作</h3>
              <ul className="mt-2 space-y-2 text-sm text-zinc-400 list-disc list-inside">
                {topActionTitles.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </GlassCard>

          {dayOne ? (
            <GlassCard className="p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-white">明天第一条发什么</h2>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                  onClick={() => copyText(tomorrowText, "tomorrow", "copy_script")}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copyingKey === "tomorrow" ? "已复制" : "一键复制"}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                <div>标题：{dayOne.title}</div>
                <div>3秒钩子：{dayOne.hook}</div>
                <div>结构：{dayOne.outline.join(" / ")}</div>
                <div className="text-emerald-400">CTA：{dayOne.cta}</div>
              </div>
            </GlassCard>
          ) : null}

          {tomorrowPost ? (
            <GlassCard className="p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-white">明天第一条完整文案</h2>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                  onClick={() => copyText(tomorrowPostText, "tomorrow-full", "copy_script", { target: "full_post" })}
                  disabled={!tomorrowPostText}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copyingKey === "tomorrow-full" ? "已复制" : "复制完整文案"}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm text-zinc-300">
                <div>标题：{tomorrowPost.title}</div>
                <div className="text-zinc-400">封面文字：{tomorrowPost.cover_text}</div>
                <div className="text-zinc-400 whitespace-pre-wrap">正文：{tomorrowPost.body}</div>
                <div className="text-emerald-400">置顶评论：{tomorrowPost.pinned_comment}</div>
              </div>
            </GlassCard>
          ) : null}

          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">7 天成交排产</h2>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                onClick={() => copyText(calendarText, "calendar", "copy_calendar")}
                disabled={!calendarText}
              >
                <Copy className="w-3.5 h-3.5" />
                {copyingKey === "calendar" ? "已复制" : "复制排产"}
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {calendar.map((item) => (
                <div key={`${item.day}-${item.title}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-emerald-400">{item.type}</div>
                  <div className="mt-1 text-sm font-semibold text-white">第{item.day}天 · {item.title}</div>
                  <div className="mt-2 text-xs text-zinc-400">3秒钩子：{item.hook}</div>
                  <div className="mt-2 text-xs text-zinc-400">结构：{item.outline.join(" / ")}</div>
                  <div className="mt-2 text-xs text-emerald-400">CTA：{item.cta} · 脚本 {item.script_id}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">10 条高意图选题</h2>
            <div className="mt-4 space-y-4">
              {topics.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-emerald-400">{item.type}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{index + 1}. {item.title}</div>
                  <div className="mt-2 text-xs text-zinc-400">人群：{item.audience} · 场景：{item.scene}</div>
                  <div className="mt-2 text-xs text-zinc-400">痛点：{item.pain}</div>
                  <div className="mt-2 text-xs text-emerald-400">关键词：{item.keywords.join(" / ")}</div>
                  <div className="mt-2 text-xs text-emerald-400">CTA：{item.cta}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">3 条成交脚本</h2>
            <div className="mt-4 space-y-5">
              {scripts.map((script, index) => {
                const scriptLabel = script.id || `S${index + 1}`
                const copyKey = `script-${scriptLabel}-${index}`
                return (
                  <div key={copyKey} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-white">
                        {scriptLabel} · {script.type} · {script.duration}
                      </div>
                      <button
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                        onClick={() =>
                          copyText(
                            script.shots.map((shot) => `${shot.t} ${shot.line}`).join("\n"),
                            copyKey,
                            "copy_script"
                          )
                        }
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copyingKey === copyKey ? "已复制" : "复制脚本"}
                      </button>
                    </div>
                  {script.shots.map((shot, index) => (
                    <div key={`${script.id}-${index}`} className="text-xs text-zinc-400">
                      {shot.t}：{shot.line}（画面：{shot.visual}）
                    </div>
                  ))}
                  <div className="text-xs text-emerald-400">CTA：{script.cta}</div>
                  <div className="text-xs text-zinc-400">标题备选：{script.title_options.join(" / ")}</div>
                  <div className="text-xs text-zinc-400">置顶评论：{script.pinned_comment}</div>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">发布质检清单</h2>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                onClick={() => copyText(qcText, "qc", "copy_qc")}
              >
                <Copy className="w-3.5 h-3.5" />
                {copyingKey === "qc" ? "已复制" : "复制清单"}
              </button>
            </div>
            <div className="mt-4 grid sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">标题检查</div>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc list-inside">
                  {output.qc_checklist.title.map((item, index) => (
                    <li key={`title-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">结构检查</div>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc list-inside">
                  {output.qc_checklist.body.map((item, index) => (
                    <li key={`body-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">CTA 与合规</div>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc list-inside">
                  {output.qc_checklist.cta_and_compliance.map((item, index) => (
                    <li key={`cta-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">归档与去重规则</h2>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10 self-start sm:self-auto"
                onClick={() => copyText(archiveText, "archive", "copy_archive")}
              >
                <Copy className="w-3.5 h-3.5" />
                {copyingKey === "archive" ? "已复制" : "复制规则"}
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <div>命名规范：{output.archive_rules.naming}</div>
              <div>标签体系：{output.archive_rules.tags.join(" / ")}</div>
              <div>去重规则：{output.archive_rules.dedupe.join(" / ")}</div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">升级建议</h2>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300 list-disc list-inside">
              {output.upsell.when_to_upgrade.map((item, index) => (
                <li key={`upgrade-${index}`}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-emerald-400">{output.upsell.cta}</p>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">用交付包直接开始产出</h2>
            <p className="mt-2 text-sm text-zinc-400">
              你刚拿到的是诊断版交付包；内容工坊是持续生产版本（每天能用）。
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <GlowButton
                primary
                onClick={() => goToWorkshop("P7")}
                className="px-6 py-4 rounded-2xl text-base bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 shadow-xl shadow-purple-500/40 hover:brightness-110"
              >
                进入内容工坊：生成7天日历
              </GlowButton>
              <GlowButton
                onClick={() => goToWorkshop("P8")}
                className="px-5 py-3 rounded-xl border border-purple-500/40 dark:bg-zinc-900/60 bg-white/90 dark:text-zinc-100 text-zinc-900 hover:border-purple-400/60 hover:shadow-md"
              >
                进入内容工坊：生成3条脚本
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}
