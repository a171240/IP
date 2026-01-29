"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download } from "lucide-react"
import { Header, GlassCard, GlowButton } from "@/components/ui/obsidian"
import { track } from "@/lib/analytics/client"
import type { DeliveryPackOutput } from "@/lib/delivery-pack/schema"

const safeArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

type DeliveryPackClientProps = {
  packId: string
  status: string
  createdAt: string
  errorMessage?: string | null
  output: DeliveryPackOutput | null
}

export default function DeliveryPackClient({
  packId,
  status,
  createdAt,
  errorMessage,
  output,
}: DeliveryPackClientProps) {
  const [copyingKey, setCopyingKey] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    track("delivery_pack_view", { packId, landingPath: window.location.pathname })
  }, [packId])

  const copyText = useCallback(
    async (value: string, key: string, eventName: string) => {
      if (!value) return
      setCopyingKey(key)
      try {
        await navigator.clipboard.writeText(value)
        track(eventName, { packId, landingPath: window.location.pathname })
      } finally {
        setTimeout(() => setCopyingKey(null), 800)
      }
    },
    [packId]
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
    setDownloadError(null)
    setIsDownloading(true)
    const attemptDownload = async (): Promise<void> => {
      const downloadResp = await fetch(`/api/delivery-pack/${packId}/download`, { redirect: "manual" })
      if (downloadResp.type === "opaqueredirect") {
        window.location.href = `/api/delivery-pack/${packId}/download`
        return
      }
      if (downloadResp.status === 409) {
        const pollResult = await pollPackStatus()
        if (pollResult.status === "done") {
          await attemptDownload()
          return
        }
        if (pollResult.status === "failed") {
          setDownloadError("交付包生成失败，请稍后重试")
          return
        }
        setDownloadError("仍在生成中，请稍后再试")
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
    }
    try {
      await attemptDownload()
    } finally {
      setIsDownloading(false)
    }
  }, [packId, pollPackStatus])

  const calendar = useMemo(() => safeArray(output?.calendar_7d), [output])
  const topics = useMemo(() => safeArray(output?.topics_10), [output])
  const scripts = useMemo(() => safeArray(output?.scripts_3), [output])
  const topActions = useMemo(() => safeArray(output?.top_actions), [output])

  const dayOne = calendar[0]
  const tomorrowText = dayOne
    ? `标题：${dayOne.title}\n3秒钩子：${dayOne.hook}\n结构：${dayOne.outline.join(" / ")}\nCTA：${dayOne.cta}`
    : ""

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
              <div className="flex flex-col sm:flex-row gap-3">
                <GlowButton onClick={handleDownload} disabled={isDownloading}>
                  <Download className="w-4 h-4" />
                  {isDownloading ? "准备下载..." : "下载 PDF"}
                </GlowButton>
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
                {topActions.map((item) => (
                  <li key={item.title}>{item.title}</li>
                ))}
              </ul>
            </div>
          </GlassCard>

          {dayOne ? (
            <GlassCard className="p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white">明天第一条发什么</h2>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
                  onClick={() => copyText(tomorrowText, "tomorrow", "copy_script")}
                >
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

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">7 天成交排产</h2>
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
              {scripts.map((script) => (
                <div key={script.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">
                      {script.id} · {script.type} · {script.duration}
                    </div>
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
                      onClick={() =>
                        copyText(
                          script.shots.map((shot) => `${shot.t} ${shot.line}`).join("\n"),
                          `script-${script.id}`,
                          "copy_script"
                        )
                      }
                    >
                      {copyingKey === `script-${script.id}` ? "已复制" : "复制脚本"}
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
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-white">发布质检清单</h2>
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
            <h2 className="text-lg font-semibold text-white">归档与去重规则</h2>
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
            <div className="flex flex-col sm:flex-row gap-3">
              <GlowButton primary onClick={() => (window.location.href = "/dashboard/workflow")}>
                进入内容工坊继续生成
              </GlowButton>
              <GlowButton onClick={() => (window.location.href = "/dashboard/quick-start")}>
                继续诊断流程
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}
