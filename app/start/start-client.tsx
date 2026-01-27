"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, ClipboardCheck, Sparkles, Target } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { track } from "@/lib/analytics/client"

type StartClientProps = {
  user: { id: string; email?: string } | null
  remainingDays: number
  isPro: boolean
}

const LAST_RESULT_KEY = "latestDiagnosisId"

export default function StartClient({ user, remainingDays, isPro }: StartClientProps) {
  const router = useRouter()
  const [latestResultId, setLatestResultId] = useState<string | null>(null)

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

  const proLabel = isPro
    ? remainingDays > 0
      ? `Pro 体验剩余 ${remainingDays} 天`
      : "已开通 Pro 权益"
    : "尚未开通 Pro 体验"

  const resultHref = latestResultId ? `/diagnosis/result/${latestResultId}` : "/diagnosis/quiz"
  const resultHint = latestResultId ? "继续查看上次诊断结果" : "先完成诊断后解锁"

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

      <main className="relative pt-28 pb-24 px-4 sm:px-6">
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

          <section className="grid md:grid-cols-3 gap-5">
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

          <section className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  )
}
