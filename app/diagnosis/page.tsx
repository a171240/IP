import { Suspense, type ReactNode } from "react"
import Link from "next/link"
import { Activity, ArrowRight, CheckCircle, ClipboardList, FileText, Calendar, Target, Zap } from "lucide-react"
import { MarketingHeader } from "@/components/ui/marketing-header"
import DiagnosisRedirect from "./redirect-client"

const deliverables = [
  { icon: Target, text: "五维评分（0-10）", desc: "交付系统体检单" },
  { icon: CheckCircle, text: "Top3 优先动作", desc: "7天只做3件事" },
  { icon: Calendar, text: "7天成交排产（PDF）", desc: "可直接执行" },
  { icon: FileText, text: "10条高意图选题（PDF）", desc: "标题/钩子/CTA" },
  { icon: ClipboardList, text: "3条成交脚本（PDF）", desc: "结构+话术" },
  { icon: Zap, text: "质检清单与归档规则（PDF）", desc: "减少返工" },
]

const dimensions = [
  { name: "交付定位", desc: "团队角色与交付方向" },
  { name: "内容供给", desc: "选题与脚本产出" },
  { name: "产能效率", desc: "协作节奏与排产" },
  { name: "质检复盘", desc: "口径与质量稳定" },
  { name: "成交转化", desc: "内容到成交承接" },
]

const cardBase =
  "relative backdrop-blur-none md:backdrop-blur-xl border rounded-2xl transition-all duration-300 ease-out dark:bg-zinc-900/50 bg-white/80 dark:border-white/10 border-black/[0.08] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_0_0_rgba(255,255,255,0.5)]"

const glowCard = `${cardBase} dark:shadow-[0_0_60px_-15px_rgba(16,185,129,0.25),inset_0_0_30px_rgba(16,185,129,0.08)] shadow-[0_0_60px_-15px_rgba(16,185,129,0.18),inset_0_0_30px_rgba(16,185,129,0.05)]`

const primaryButton =
  "relative px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ease-out overflow-hidden group flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_4px_16px_-4px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-teal-500 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_0_30px_-4px_rgba(16,185,129,0.6)] active:scale-[0.98] active:shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_0_40px_-4px_rgba(16,185,129,0.7)]"

const GlowLink = ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
  <Link href={href} className={[primaryButton, className].filter(Boolean).join(" ")}>
    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    <span className="relative flex items-center gap-2">{children}</span>
  </Link>
)

export default function DiagnosisPage() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <DiagnosisRedirect />
      </Suspense>
      <MarketingHeader breadcrumbs={[{ label: "首页", href: "/" }, { label: "内容交付系统诊断" }]} />

      <main className="p-6 lg:p-8 pb-28 md:pb-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <section className={`${cardBase} p-8 relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-emerald-600/10 to-transparent rounded-full blur-3xl" />
            <div className="relative text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-4">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold dark:text-white text-zinc-900 mb-2">
                内容交付系统诊断（5分钟）
              </h1>
              <p className="text-lg dark:text-zinc-400 text-zinc-500 max-w-xl mx-auto">
                找出交付卡点，直接生成 7 天排产 + 脚本 + 质检清单，一份 PDF 可执行
              </p>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <GlowLink href="/diagnosis/quiz" className="px-10 py-3 text-base sm:text-lg w-full sm:w-auto">
                  <Activity className="w-5 h-5" />
                  开始诊断
                  <ArrowRight className="w-5 h-5" />
                </GlowLink>
                <span className="text-xs sm:text-sm dark:text-zinc-500 text-zinc-400">
                  无需注册 · 10 题 · 一份 PDF 交付包
                </span>
              </div>

              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-left">
                {deliverables.map((item) => (
                  <div
                    key={item.text}
                    className="px-4 py-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5"
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium dark:text-white text-zinc-900">{item.text}</span>
                    </div>
                    <p className="text-[10px] dark:text-zinc-500 text-zinc-400 mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={`${cardBase} p-6 content-visibility-auto`}>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">五维评分结构</h2>
            </div>
            <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-6">
              评分全部以 0-10 呈现，不使用同行排名或不可验证百分比。
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {dimensions.map((dim) => (
                <div
                  key={dim.name}
                  className="p-4 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5 text-center"
                >
                  <h3 className="font-medium dark:text-white text-zinc-900 text-sm">{dim.name}</h3>
                  <p className="text-[10px] dark:text-zinc-500 text-zinc-400 mt-1">{dim.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`${glowCard} p-6 text-center`}>
            <GlowLink href="/diagnosis/quiz" className="px-12 py-4 text-lg w-full sm:w-auto">
              <Activity className="w-5 h-5" />
              开始诊断
              <ArrowRight className="w-5 h-5" />
            </GlowLink>
            <p className="text-xs dark:text-zinc-500 text-zinc-400 mt-3">
              诊断完成后即可生成可下载的 PDF 交付包
            </p>
          </section>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="border-t dark:border-white/10 border-black/[0.08] bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl px-4 pt-2 pb-[calc(var(--safe-area-bottom)+0.75rem)]">
            <GlowLink href="/diagnosis/quiz" className="w-full px-6 py-3 text-base">
              <Activity className="w-5 h-5" />
              开始诊断
              <ArrowRight className="w-5 h-5" />
            </GlowLink>
            <p className="mt-2 text-[10px] text-center dark:text-zinc-500 text-zinc-400">
              一份 PDF · 手机可直接打开
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
