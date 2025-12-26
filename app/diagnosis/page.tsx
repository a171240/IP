"use client"

import { useRouter } from 'next/navigation'
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import {
  Activity,
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  Gift,
  Target,
  Zap,
  TrendingUp,
  Heart,
  DollarSign,
  RotateCcw
} from 'lucide-react'

const features = [
  { icon: Clock, text: '约5分钟', desc: '8道精准问题' },
  { icon: FileText, text: '专属报告', desc: '五维能力分析' },
  { icon: Gift, text: '免费领取', desc: '行业选题包' },
  { icon: CheckCircle, text: '即时生成', desc: '可下载PDF' }
]

const dimensions = [
  { icon: Target, name: '定位清晰度', desc: '你的IP人设是否精准', color: 'from-blue-500 to-cyan-500' },
  { icon: Zap, name: '内容生产力', desc: '选题与产出效率', color: 'from-yellow-500 to-orange-500' },
  { icon: Heart, name: '情绪共鸣度', desc: '内容是否打动人心', color: 'from-pink-500 to-rose-500' },
  { icon: DollarSign, name: '变现转化力', desc: '内容转化效率', color: 'from-emerald-500 to-teal-500' },
  { icon: RotateCcw, name: '运营持续性', desc: '长期运营能力', color: 'from-purple-500 to-violet-500' }
]

export default function DiagnosisPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "主页", href: "/dashboard" }, { label: "IP健康诊断" }]} />

      <main className="p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Hero */}
          <GlassCard className="p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-emerald-600/10 to-transparent rounded-full blur-3xl" />
            <div className="relative text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-4">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold dark:text-white text-zinc-900 mb-2">
                商业IP内容健康诊断
              </h1>
              <p className="text-lg dark:text-zinc-400 text-zinc-500 max-w-xl mx-auto">
                约5分钟测试，找到你的内容瓶颈，获取专属提升方案
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5"
                  >
                    <div className="flex items-center gap-2">
                      <feature.icon className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium dark:text-white text-zinc-900">{feature.text}</span>
                    </div>
                    <p className="text-[10px] dark:text-zinc-500 text-zinc-400 mt-0.5">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* 五维诊断介绍 */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">五维能力诊断</h2>
            </div>
            <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-6">
              基于200+企业IP打造经验，从5个核心维度精准诊断你的内容健康度
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {dimensions.map((dim, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5 text-center"
                >
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${dim.color} mb-3`}>
                    <dim.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-medium dark:text-white text-zinc-900 text-sm">{dim.name}</h3>
                  <p className="text-[10px] dark:text-zinc-500 text-zinc-400 mt-1">{dim.desc}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 为什么需要诊断 */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold dark:text-white text-zinc-900 mb-4">为什么需要诊断？</h2>
            <div className="space-y-3">
              <p className="text-sm dark:text-zinc-400 text-zinc-500">90%的内容创作者都在盲目努力：</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  '不知道自己的IP定位是否清晰',
                  '不知道选题方向是否正确',
                  '不知道内容配比是否合理',
                  '不知道为什么内容没有效果'
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-sm dark:text-zinc-300 text-zinc-600">{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium dark:text-emerald-400 text-emerald-600 mt-4">
                这套诊断由IP内容工厂团队设计，帮你精准定位问题，给出可落地的改进方案。
              </p>
            </div>
          </GlassCard>

          {/* CTA */}
          <GlassCard className="p-6 text-center" glow>
            <GlowButton
              primary
              className="px-12 py-4 text-lg"
              onClick={() => router.push('/diagnosis/quiz')}
            >
              <Activity className="w-5 h-5" />
              开始诊断
              <ArrowRight className="w-5 h-5" />
            </GlowButton>
            <p className="text-xs dark:text-zinc-500 text-zinc-400 mt-3">
              已有 <span className="font-medium dark:text-emerald-400 text-emerald-600">1,234</span> 人完成诊断
            </p>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}
