"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, CheckCircle, ClipboardList, DownloadCloud } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { track } from "@/lib/analytics/client"

const LAST_RESULT_KEY = "latestDiagnosisId"

export default function ExecuteGuidePage() {
  const [latestResultId, setLatestResultId] = useState<string | null>(null)

  useEffect(() => {
    track("execution_guide_open", { landingPath: window.location.pathname })
    const stored = window.localStorage.getItem(LAST_RESULT_KEY)
    if (stored) setLatestResultId(stored)
  }, [])

  const resultHref = latestResultId ? `/diagnosis/result/${latestResultId}` : "/diagnosis/quiz"

  return (
    <div className="relative min-h-[100dvh] bg-[#030304] text-zinc-200 font-sans selection:bg-purple-500/30 selection:text-purple-200 overflow-x-hidden">
      <ObsidianBackgroundLite />

      <main className="relative pt-24 pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <section className="rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300 mb-6">
              执行指引
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">交付包执行清单（新人第一天）</h1>
            <p className="text-sm text-zinc-400 mt-3">
              目标：在 1 小时内完成第一条内容发布，并建立 7 天内容节奏。
            </p>
          </section>

          <section className="grid md:grid-cols-3 gap-5">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <DownloadCloud className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step A：下载交付包</h3>
              <p className="text-sm text-zinc-400 mt-2">在诊断结果页下载 PDF，里面包含 7 天排产、脚本与质检清单。</p>
              <Link href={resultHref} className="mt-4 inline-flex items-center text-sm text-purple-300 hover:text-purple-200">
                去下载
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <ClipboardList className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step B：照表执行</h3>
              <p className="text-sm text-zinc-400 mt-2">挑选第 1 天内容主题，按脚本拍摄，使用质检清单确认发布质量。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
              <CheckCircle className="w-6 h-6 text-purple-300" />
              <h3 className="text-lg font-semibold text-white mt-4">Step C：复盘与升级</h3>
              <p className="text-sm text-zinc-400 mt-2">发布后 24 小时复盘数据，确定下一轮优化动作。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">还没有诊断结果？</h3>
              <p className="text-sm text-zinc-400 mt-1">先完成诊断，系统会自动生成你的交付包。</p>
            </div>
            <GlowButton primary className="px-6 py-3" onClick={() => (window.location.href = "/diagnosis/quiz")}>
              去完成诊断
              <ArrowRight className="w-4 h-4" />
            </GlowButton>
          </section>
        </div>
      </main>
    </div>
  )
}
