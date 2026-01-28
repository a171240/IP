"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { track } from "@/lib/analytics/client"

type ActivateClientProps = {
  utm: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  user?: { id?: string; email?: string } | null
  isPro?: boolean
  proExpiresAt?: string | null
}

const benefits = [
  "7天成交排产（PDF）",
  "10条高意图选题（PDF）",
  "3条成交脚本（PDF）",
  "质检清单 + 归档规则（PDF）",
]

export default function ActivateClient({ user, isPro, proExpiresAt }: ActivateClientProps) {
  const router = useRouter()

  useEffect(() => {
    track("activation_open", {
      userId: user?.id,
      landingPath: window.location.pathname,
    })
    if (isPro) {
      track("activate_success", {
        userId: user?.id,
        landingPath: window.location.pathname,
      })
    }
  }, [isPro, user?.id])

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("zh-CN")
  }

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
          <Link href="/demo" className="text-sm text-zinc-400 hover:text-white transition-colors">
            预约顾问演示
          </Link>
        </div>
      </nav>

      <main className="relative pt-28 pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-start">
          <section>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 mb-6">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              体验卡已绑定
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              进入交付系统诊断，生成高价值 PDF
            </h1>
            <p className="text-lg text-zinc-400 mt-4 max-w-2xl">
              本页面用于确认账号与权益，确保交付包可下载。完成诊断后即可生成一份可执行 PDF。
            </p>

            <div className="mt-8 space-y-4 text-sm text-zinc-400">
              {benefits.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-emerald-300">
                    ✓
                  </span>
                  <div className="text-zinc-200">{item}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-transparent rounded-3xl blur-2xl opacity-70" />
            <div className="relative rounded-3xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-8 sm:p-10">
              {user?.id ? (
                <div className="text-center space-y-5 py-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    {isPro ? "已开通 Pro 权益" : "尚未开通 Pro"}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    当前账号：{user.email || "已登录"}
                    {isPro && formatDate(proExpiresAt)
                      ? ` · 有效期至 ${formatDate(proExpiresAt)}`
                      : null}
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <GlowButton
                      primary
                      className="w-full sm:w-auto px-6 py-3 text-sm"
                      onClick={() => {
                        track("start_diagnosis_click", {
                          userId: user?.id,
                          landingPath: window.location.pathname,
                        })
                        router.push("/diagnosis/quiz")
                      }}
                    >
                      开始内容交付系统诊断
                      <ArrowRight size={16} />
                    </GlowButton>
                    <Link
                      href="/demo"
                      className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-200 hover:text-white hover:border-white/20 transition-colors"
                    >
                      预约顾问演示
                    </Link>
                  </div>

                  {!isPro ? (
                    <div className="text-xs text-zinc-500">
                      如果已兑换但未生效，请返回 /redeem 重新兑换或联系客服处理。
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center space-y-4 py-6">
                  <h2 className="text-2xl font-semibold text-white">请先登录或注册</h2>
                  <p className="text-sm text-zinc-400">登录后可查看权益并继续诊断。</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                      href="/auth/login?redirect=/activate"
                      className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_4px_16px_-4px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-400 transition-colors"
                    >
                      去登录
                      <ArrowRight size={16} className="ml-2" />
                    </Link>
                    <Link
                      href="/auth/register?redirect=/activate"
                      className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-200 hover:text-white hover:border-white/20 transition-colors"
                    >
                      注册新账号
                    </Link>
                  </div>
                  <Link href="/redeem" className="text-xs text-emerald-300 hover:text-emerald-200">
                    我有兑换码，先去兑换 →
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
