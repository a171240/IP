import Link from "next/link"
import type { Metadata } from "next"
import {
  ArrowRight,
  ChevronRight,
  Zap,
  Target,
  User,
  Gift,
  Shield,
  Quote,
  Search,
  Calendar,
  Sparkles,
  Bot,
  FileText,
  Lightbulb,
  TrendingUp,
  Mic,
  CheckCircle,
  type LucideIcon
} from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { MobileStickyCta } from "@/components/marketing/mobile-sticky-cta"
import { PageView } from "@/components/analytics/page-view"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { HERO_TRUST_TAGS, INDUSTRY_TAGS, MARKETING_METRICS, WECHAT_ID } from "@/lib/marketing/content"

export const metadata: Metadata = {
  title: "IP内容工厂 | 交付可控的内容工作流",
  description:
    "面向代运营、MCN、企业内容团队的交付工作流与智能体模板，提供免费诊断、样本预览与团队方案演示。",
  openGraph: {
    title: "IP内容工厂 | 交付可控的内容工作流",
    description:
      "面向代运营、MCN、企业内容团队的交付工作流与智能体模板，提供免费诊断、样本预览与团队方案演示。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IP内容工厂 | 交付可控的内容工作流",
    description:
      "面向代运营、MCN、企业内容团队的交付工作流与智能体模板，提供免费诊断、样本预览与团队方案演示。",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IP内容工厂",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "面向代运营、MCN、企业内容团队的交付工作流与智能体模板。",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "CNY",
    description: "提供免费诊断与团队方案演示。",
  },
}

// 典型使用场景 - 代运营 / MCN / 企业内容团队
const testimonials = [
  {
    name: "美妆MCN内容组",
    role: "多账号矩阵",
    avatar: "妆",
    avatarGradient: "from-pink-500 to-rose-500",
    quote: "以前选题、脚本、改稿散在各个群里，项目一多就乱。现在把定位→选题→日历→脚本→质检跑成工作流，新人也能按SOP更快上手。",
    result: "新人也能按SOP更快上手，交付节奏更稳",
    highlight: "交付更稳定",
    highlightColor: "emerald",
    duration: "适用：多账号矩阵"
  },
  {
    name: "代运营项目经理",
    role: "多客户交付",
    avatar: "代",
    avatarGradient: "from-blue-500 to-cyan-500",
    quote: "每个客户的调性、禁词、卖点都不一样，最怕反复返工。用行业分析+风格复刻+最终审核把口径统一起来，交付边界清晰，改稿更少。",
    result: "口径统一后，返工与改稿更少",
    highlight: "口径更一致",
    highlightColor: "blue",
    duration: "适用：多客户协作"
  },
  {
    name: "企业内容中台",
    role: "知识库沉淀",
    avatar: "企",
    avatarGradient: "from-purple-500 to-violet-500",
    quote: "把行业认知（道法术器势）、情绪价值点全景图和选题记录沉淀成资产，项目换人也能接得住，复盘有据可查。",
    result: "资产可追溯，项目换人也能接得住",
    highlight: "资产可复用",
    highlightColor: "purple",
    duration: "适用：内容中台"
  },
  {
    name: "知识付费团队",
    role: "双轨内容",
    avatar: "课",
    avatarGradient: "from-amber-500 to-orange-500",
    quote: "用双轨策略把内容拆成情绪价值与专业价值两条线：一条负责泛流量，一条负责建立信任与转化，节奏排好后就能持续输出。",
    result: "双轨节奏更清晰，持续输出更稳定",
    highlight: "双轨可复制",
    highlightColor: "amber",
    duration: "适用：内容节奏"
  },
  {
    name: "本地生活连锁",
    role: "门店增长",
    avatar: "店",
    avatarGradient: "from-teal-500 to-emerald-500",
    quote: "不同门店同一套打法，关键是模板与SOP统一。用行业模板库+去重归档把内容做成可复制的“门店增长手册”。",
    result: "门店模板统一，复制落地更快",
    highlight: "模板化交付",
    highlightColor: "teal",
    duration: "适用：连锁门店"
  }
]


// 高亮颜色映射
const highlightColors: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  teal: "bg-teal-500/10 text-teal-400 border-teal-500/20"
}

// 4个核心智能体数据
const coreAgents = [
  {
    name: "IP定位器",
    fullName: "IP概念生成器2.0",
    icon: Target,
    color: "purple",
    tagline: "明确定位与人设",
    description: "从你的故事中提炼独特定位",
    output: "IP定位方案"
  },
  {
    name: "素材挖掘器",
    fullName: "MX产品调研记者",
    icon: Search,
    color: "blue",
    tagline: "挖掘痛点与情绪触点",
    description: "深度挖掘你的内容素材库",
    output: "痛点素材库"
  },
  {
    name: "内容规划师",
    fullName: "4X4内容运营总监",
    icon: Calendar,
    color: "emerald",
    tagline: `生成${MARKETING_METRICS.contentCalendar}期内容日历`,
    description: "科学配比，完整内容日历",
    output: `${MARKETING_METRICS.contentCalendar}期规划表`
  },
  {
    name: "脚本生成器",
    fullName: "IP风格复刻创作",
    icon: Sparkles,
    color: "amber",
    tagline: "一键生成可拍脚本",
    description: "匹配你的风格，快速出稿",
    output: "可用脚本"
  }
]

// 智能体矩阵数据 - 以 agentsConfig 统计为准
const agentMatrix: Record<string, { icon: LucideIcon; color: string; count: number; agents: string[] }> = {
  "核心工作流": {
    icon: Bot,
    color: "purple",
    count: 6,
    agents: ["行业分析", "IP传记", "4X4内容规划", "脚本创作中心"]
  },
  "研究分析": {
    icon: Search,
    color: "blue",
    count: 27,
    agents: ["行业分析工作台", "竞品分析", "风格提取", "内容去重"]
  },
  "内容创作": {
    icon: FileText,
    color: "emerald",
    count: 47,
    agents: ["金句脚本", "共情内容", "故事脚本", "分镜脚本"]
  },
  "选题策划": {
    icon: Lightbulb,
    color: "amber",
    count: 53,
    agents: ["热点选题", "情绪选题", "平台选择", "爆点前置"]
  },
  "营销转化": {
    icon: TrendingUp,
    color: "rose",
    count: 31,
    agents: ["营销诊断", "引流获客", "评论区运营", "信息流策略"]
  },
  "效率优化": {
    icon: Zap,
    color: "cyan",
    count: 25,
    agents: ["口语化优化", "脚本批改", "风格质检", "格式转换"]
  }
}

// 颜色映射工具
const agentColorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  purple: { bg: "bg-purple-500/5", border: "border-purple-500/20 hover:border-purple-500/40", text: "text-purple-400", iconBg: "bg-purple-500/10" },
  blue: { bg: "bg-blue-500/5", border: "border-blue-500/20 hover:border-blue-500/40", text: "text-blue-400", iconBg: "bg-blue-500/10" },
  emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/20 hover:border-emerald-500/40", text: "text-emerald-400", iconBg: "bg-emerald-500/10" },
  amber: { bg: "bg-amber-500/5", border: "border-amber-500/20 hover:border-amber-500/40", text: "text-amber-400", iconBg: "bg-amber-500/10" },
  cyan: { bg: "bg-cyan-500/5", border: "border-cyan-500/20 hover:border-cyan-500/40", text: "text-cyan-400", iconBg: "bg-cyan-500/10" },
  rose: { bg: "bg-rose-500/5", border: "border-rose-500/20 hover:border-rose-500/40", text: "text-rose-400", iconBg: "bg-rose-500/10" }
}

export default function LandingPage() {

  return (
      <div className="relative min-h-[100dvh] bg-[#030304] text-zinc-200 font-sans selection:bg-purple-500/30 selection:text-purple-200 overflow-x-hidden">
      <ObsidianBackgroundLite />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageView eventName="view_home" />

            {/* ============ Navigation ============ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)] bg-[#030304]/90 border-b border-white/[0.02]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow cursor-pointer">
              IP
            </div>
            <span className="text-white/90 font-medium tracking-tight cursor-pointer">IP内容工厂</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <a href="#workflow" className="hover:text-white transition-colors">
              工作流程
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              核心功能
            </a>
            <Link href="/pricing" className="hover:text-white transition-colors">
              定价
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/pricing"
              className="hidden sm:block md:hidden px-3 py-2 text-xs sm:text-sm text-zinc-500 hover:text-white transition-colors"
            >
              定价
            </Link>
            <Link href="/auth/login" className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm text-zinc-500 hover:text-white transition-colors">
              登录
            </Link>
            <Link href="/diagnosis">
            <GlowButton
              primary
              className="px-3 sm:px-6 py-2.5 text-xs sm:text-sm whitespace-nowrap"
            >
              <Zap size={16} />
              免费快速诊断
              <ArrowRight size={14} />
            </GlowButton>
            </Link>
          </div>
        </div>
      </nav>

      {/* ============ Hero Section ============ */}
      <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 pt-24 pb-12">
        {/* 背景光效 */}

        <div className="relative w-full max-w-4xl mx-auto text-center">
          {/* 品类定义 */}
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] mb-8">
            <span className="text-[11px] sm:text-sm text-zinc-400">面向代运营 / MCN / 内容中台交付团队</span>
          </div>

          <h1 className="text-[2.05rem] sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            交付周期可控
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500 bg-clip-text text-transparent">
              把商业IP内容交付做成团队可复制的工作流
            </span>
          </h1>

          {/* 核心价值主张 */}
          <p className="text-base sm:text-xl md:text-2xl text-zinc-400 mb-10 max-w-2xl mx-auto">
            统一口径与质检，返工更少，交付更稳
            <br className="hidden sm:block" />
            把定位 → 选题 → 日历 → 脚本 → 质检写进一条工作流
          </p>

          {/* 价值标签组 - 结果导向 */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20">
              <span className="text-xs sm:text-sm text-purple-400">交付周期可控</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
              <span className="text-xs sm:text-sm text-blue-400">改稿更少</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs sm:text-sm text-emerald-400">口径一致</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="text-xs sm:text-sm text-amber-400">资产可复用</span>
            </div>
          </div>

                              {/* CTA */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
              <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                <TrackedLink
                  href="/diagnosis"
                  eventName="cta_click"
                  eventProps={{ source: "hero_diagnosis" }}
                >
                  <GlowButton
                    primary
                    className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 text-base sm:text-lg font-medium"
                  >
                    <Zap size={20} />
                    免费快速诊断
                    <ArrowRight size={18} />
                  </GlowButton>
                </TrackedLink>
                <span className="text-xs text-zinc-500">
                  5分钟 · 10道题 · 五维评分 + 行动清单
                </span>
              </div>

              <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                <TrackedLink
                  href="#report-sample"
                  eventName="cta_click"
                  eventProps={{ source: "hero_sample" }}
                  className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 text-base sm:text-lg font-medium text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl transition-colors text-center"
                >
                  查看样本预览
                </TrackedLink>
                <span className="text-xs text-zinc-500">
                  先看输出样本，了解交付格式与字段
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-600">
              <span className="px-3 py-1 rounded-full bg-white/[0.02] border border-white/5">无需注册</span>
              <span className="px-3 py-1 rounded-full bg-white/[0.02] border border-white/5">可下载诊断报告</span>
              <Link href="#report-sample" className="px-3 py-1 rounded-full bg-white/[0.02] border border-white/5 hover:text-white transition-colors">
                查看样本预览
              </Link>
            </div>
          </div>


          <div className="mt-12">
            <p className="text-xs text-zinc-600 mb-3">已在这些场景跑通</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {HERO_TRUST_TAGS.map((label) => (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-zinc-500"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 数据指标 */}
        <div className="relative w-full max-w-4xl mx-auto mt-20">
          <div className="flex items-center justify-center">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 md:gap-12">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-purple-400 tracking-tight font-mono tabular-nums">
                  {MARKETING_METRICS.workflowTemplates}
                </p>
                <p className="text-xs md:text-sm text-zinc-500 mt-2">工作流智能体模板</p>
                <p className="text-[10px] text-zinc-600 mt-1">减少重复搭建</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-400 tracking-tight font-mono tabular-nums">
                  {MARKETING_METRICS.workflowSteps}步
                </p>
                <p className="text-xs md:text-sm text-zinc-500 mt-2">交付闭环</p>
                <p className="text-[10px] text-zinc-600 mt-1">流程可追溯</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-400 tracking-tight font-mono tabular-nums">
                  {MARKETING_METRICS.contentCalendar}期
                </p>
                <p className="text-xs md:text-sm text-zinc-500 mt-2">内容日历</p>
                <p className="text-[10px] text-zinc-600 mt-1">节奏可落地</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-amber-400 tracking-tight font-mono tabular-nums">
                  {MARKETING_METRICS.industryTemplates}
                </p>
                <p className="text-xs md:text-sm text-zinc-500 mt-2">行业模板</p>
                <p className="text-[10px] text-zinc-600 mt-1">跨行业快速复用</p>
              </div>
            </div>
          </div>
        </div>

        {/* 向下滚动提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex flex-col items-center gap-2 text-zinc-600 animate-pulse">
            <ChevronRight size={20} className="rotate-90" />
          </div>
        </div>
      </section>


      {/* ============ 交付产物 ============ */}
      <section className="py-24 md:py-32 px-4 sm:px-6 content-visibility-auto">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] mb-6">
              <FileText size={16} className="text-emerald-400" />
              <span className="text-sm text-zinc-400">交付产物</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              每一次产出都能沉淀为可复用资产
            </h2>
            <p className="text-zinc-500 text-base sm:text-lg max-w-2xl mx-auto">
              把策略、口径、脚本与质检标准固化下来，新人按SOP也能稳定交付。
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-purple-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Target size={20} className="text-purple-400" />
                </div>
                <h3 className="text-white font-semibold">行业目标分析报告</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                行业定位、受众画像、竞争格局与价值链一页看清，减少方向跑偏与试错成本。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-blue-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <TrendingUp size={20} className="text-blue-400" />
                </div>
                <h3 className="text-white font-semibold">认知切入点（道法术器势）</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                判断用户认知层级，选对内容入口，缩短“种草→信任→转化”的路径。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Sparkles size={20} className="text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold">情绪价值点全景图</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                穷举行业内与向上延展的情绪触点，降低选题重复与撞题风险。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Calendar size={20} className="text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold">{MARKETING_METRICS.contentCalendar}期内容日历（4X4配比）</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                按“拉新/建信/转化/留存”配比排好节奏，交付周期更可控。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-amber-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <FileText size={20} className="text-amber-400" />
                </div>
                <h3 className="text-white font-semibold">可拍脚本（口播/分镜/标题）</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                从选题到结构、金句、镜头与标题，一次性出到“能直接拍”的版本，减少反复沟通。
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Shield size={20} className="text-zinc-300" />
                </div>
                <h3 className="text-white font-semibold">风格质检 + 去重归档</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                用统一检查清单保障口吻一致，选题记录与归档减少同质化与返工。
              </p>
            </div>
          </div>

          <div className="flex justify-center mt-10">
            <Link href="/diagnosis">
            <GlowButton
              primary
              className="px-10 py-4 text-base"
            >
              <Zap size={18} />
              免费快速诊断，领取专属报告
              <ArrowRight size={16} />
            </GlowButton>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ 交付样本预览 ============ */}
      <section id="report-sample" className="py-20 md:py-28 px-4 sm:px-6 content-visibility-auto">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] mb-6">
              <FileText size={16} className="text-emerald-400" />
              <span className="text-sm text-zinc-400">交付样本预览</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              诊断完成后你会拿到什么
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              不是“方法论”，而是可执行的交付输出与行动清单（示例为格式展示）
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
              <h3 className="text-white font-semibold mb-3">诊断报告包含</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                {[
                  "五维评分与短板定位",
                  "关键卡点与改进优先级",
                  "30天行动清单与里程碑",
                  "适配的工作流与模板建议"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500 mt-4">可下载报告，方便转交团队对齐口径</p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
              <h3 className="text-white font-semibold mb-3">交付SOP包示例</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                {[
                  "行业目标分析报告（定位与受众）",
                  `${MARKETING_METRICS.contentCalendar}期内容日历（4X4配比）`,
                  "可拍脚本清单（口播/分镜/标题）",
                  "风格质检清单 + 去重归档规范"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/diagnosis">
                  <GlowButton primary className="px-6 py-3 text-sm">
                    领取专属诊断报告
                    <ArrowRight size={16} />
                  </GlowButton>
                </Link>
                <TrackedLink
                  href="/delivery-pack/sample"
                  eventName="cta_click"
                  eventProps={{ source: "sample_pdf" }}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  查看样本PDF
                </TrackedLink>
                <TrackedLink
                  href="/demo"
                  eventName="cta_click"
                  eventProps={{ source: "sample_demo" }}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  预约顾问演示
                </TrackedLink>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
              <h3 className="text-white font-semibold mb-4">诊断报告片段（示例）</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">定位清晰度</p>
                    <p className="text-xl font-semibold text-white">62/100</p>
                  </div>
                  <span className="px-2.5 py-1 text-xs rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                    需强化差异化
                  </span>
                </div>

                <div className="space-y-2">
                  {[
                    { label: "定位", width: "62%", color: "bg-purple-500/70" },
                    { label: "内容", width: "54%", color: "bg-blue-500/70" },
                    { label: "情绪", width: "71%", color: "bg-rose-500/70" },
                    { label: "转化", width: "48%", color: "bg-emerald-500/70" },
                    { label: "运营", width: "57%", color: "bg-amber-500/70" }
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500 w-8">{item.label}</span>
                      <div className="h-2 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: item.width }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 text-xs text-zinc-400">
                  关键卡点：定位描述过泛，客户难记
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                  <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/5">第1周：统一口径</span>
                  <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/5">第2周：选题日历</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
              <h3 className="text-white font-semibold mb-4">脚本交付包片段（示例）</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  标题：上班族3分钟轻食怎么做？
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 text-xs text-zinc-400">
                  3秒钩子：今天不教你减脂，我教你省时间
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 mb-2">分镜结构</p>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-500">
                    {["镜头1 开场", "镜头2 痛点", "镜头3 方法"].map((item) => (
                      <div key={item} className="rounded-md bg-white/[0.03] border border-white/5 px-2 py-1">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  口播：开场 → 痛点 → 方法 → 收尾
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
              <h3 className="text-white font-semibold mb-4">内容日历片段（示例）</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-8 rounded-md border border-white/5 ${
                        idx % 4 === 0
                          ? "bg-amber-500/20"
                          : idx % 4 === 1
                            ? "bg-blue-500/20"
                            : idx % 4 === 2
                              ? "bg-purple-500/20"
                              : "bg-emerald-500/20"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                  <span className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">引流</span>
                  <span className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">建信</span>
                  <span className="px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">转化</span>
                  <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">留存</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  周一 引流｜同城轻食踩坑 · 周三 建信｜热量&分量 · 周五 转化｜3分钟套餐
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-zinc-600 mt-6">
            * 样本为格式示意，具体内容将基于你的行业与诊断结果生成
          </p>
        </div>
      </section>

      {/* ============ 用户案例 - 无限滚动 ============ */}
      <section className="py-24 md:py-32 relative overflow-hidden content-visibility-auto">
        {/* 背景 */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-950/5 via-transparent to-transparent" />

        <div className="relative">
          {/* 标题 */}
          <div className="text-center mb-16 px-4 sm:px-6">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              典型场景：内容团队这样规模化交付
            </h2>
            <p className="text-zinc-500 text-lg">
              把个人经验沉淀成SOP，多项目并行也能更好对齐口径
            </p>
          </div>

          {/* 案例滚动容器 */}
                    <div className="relative overflow-hidden px-4 sm:px-6 pb-4">
            <div className="flex w-max marquee-track">
              {Array.from({ length: 2 }).map((_, copyIndex) =>
                testimonials.map((t, idx) => (
                  <div
                    key={`${copyIndex}-${idx}`}
                    aria-hidden={copyIndex === 1}
                    className="flex-shrink-0 w-[340px] md:w-[400px] p-8 mr-6 rounded-2xl bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 border border-white/[0.04] hover:border-white/10 transition-colors group"
                  >
                    <Quote size={24} className="text-white/5 mb-6" />

                    {/* 用户信息 */}
                    <div className="flex items-center gap-4 mb-6">
                      <div
                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${t.avatarGradient} flex items-center justify-center text-lg text-white font-semibold`}
                      >
                        {t.avatar}
                      </div>
                      <div>
                        <p className="text-white font-medium">{t.name}</p>
                        <p className="text-zinc-500 text-sm">{t.role}</p>
                      </div>
                    </div>

                    {/* 引用 */}
                    <p className="text-zinc-300 text-[15px] leading-relaxed mb-4 min-h-[72px]">
                      "{t.quote}"
                    </p>

                    <p className="text-xs text-zinc-500 mb-6">
                      <span className="text-zinc-600">结果：</span>
                      {t.result}
                    </p>

                    {/* 效果标签 */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-1.5 rounded-full text-sm border ${highlightColors[t.highlightColor]}`}
                      >
                        {t.highlight}
                      </span>
                      <span className="text-zinc-600 text-sm">{t.duration}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#030304] to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#030304] to-transparent pointer-events-none" />
        </div>

        <p className="text-center text-xs text-zinc-700 mt-8 px-4 sm:px-6">
          * 以下为典型使用场景示意，效果因行业与执行而异
        </p>
      </section>

      {/* ============ 4X4方法论可视化 ============ */}
      <section className="py-24 md:py-32 px-4 sm:px-6 content-visibility-auto">
        <div className="max-w-4xl mx-auto">
          {/* 标题 */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <span className="text-sm text-emerald-400 font-medium">情绪/专业双轨 × 4X4 方法论</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              交付稳定来自配比与节奏
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              把4类内容写进日历，减少断更与返工，比例可按阶段与行业微调
            </p>
          </div>

          {/* 4X4配比展示 */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* 爆款引流 50% */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-amber-500/10 hover:border-amber-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Zap size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">爆款引流</h3>
                    <p className="text-xs text-zinc-500">让陌生人看到你</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-amber-400 font-mono tabular-nums">50%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: '50%' }} />
              </div>
              <p className="text-sm text-zinc-500 mt-3">人生故事、金句输出、情绪共鸣...</p>
            </div>

            {/* 专业信任 30% */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-blue-500/10 hover:border-blue-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Target size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">专业信任</h3>
                    <p className="text-xs text-zinc-500">让用户相信你</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-blue-400 font-mono tabular-nums">30%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" style={{ width: '30%' }} />
              </div>
              <p className="text-sm text-zinc-500 mt-3">专业知识、避坑指南、行业洞察...</p>
            </div>

            {/* 产品转化 15% */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-purple-500/10 hover:border-purple-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Gift size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">产品转化</h3>
                    <p className="text-xs text-zinc-500">让用户下单</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-purple-400 font-mono tabular-nums">15%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full" style={{ width: '15%' }} />
              </div>
              <p className="text-sm text-zinc-500 mt-3">产品展示、体验对比、福利活动...</p>
            </div>

            {/* 人设温度 5% */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <User size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">人设温度</h3>
                    <p className="text-xs text-zinc-500">让用户记住你</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">5%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: '5%' }} />
              </div>
              <p className="text-sm text-zinc-500 mt-3">价值观表达、日常片段、真实流露...</p>
            </div>
          </div>

          {/* 底部说明 */}
          <div className="text-center">
            <p className="text-zinc-500 text-sm">
              单一内容类型容易跑偏。<br />
              <span className="text-white">4X4让每条内容各司其职，写进日历，可复盘、可复用。</span>
            </p>
          </div>
        </div>
      </section>

      {/* ============ 核心智能体展示区 ============ */}
      <section id="workflow" className="scroll-mt-24 py-24 md:py-32 px-4 sm:px-6 relative overflow-hidden content-visibility-auto">
        {/* 背景光效 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-r from-purple-600/10 via-blue-600/10 to-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          {/* 标题 */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
              <Bot size={16} className="text-purple-400" />
              <span className="text-sm text-purple-400 font-medium">交付工作流</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              4步跑通交付闭环：定位 → 选题 → 日历 → 脚本
            </h2>
            <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
              每一步都有明确产物：定位方案 / 素材库 / {MARKETING_METRICS.contentCalendar}期内容日历 / 可拍脚本，用于对齐口径与减少返工
            </p>
          </div>

          {/* 4个核心智能体 - 流程式展示 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-3 mb-12">
            {coreAgents.map((agent, idx) => {
              const colors = agentColorMap[agent.color]
              const IconComponent = agent.icon
              return (
                <div key={agent.name} className="relative">
                  {/* 连接箭头 - 只在桌面端显示 */}
                  {idx < coreAgents.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-2 z-10 w-4 h-4 items-center justify-center">
                      <ChevronRight size={16} className="text-zinc-600" />
                    </div>
                  )}

                  {/* 卡片 */}
                  <div className={`p-6 rounded-2xl ${colors.bg} border ${colors.border} transition-all duration-300 h-full group cursor-pointer`}>
                    {/* 步骤标识 */}
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-xs font-medium ${colors.text} opacity-60`}>Step {idx + 1}</span>
                      <div className={`w-8 h-8 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
                        <IconComponent size={18} className={colors.text} />
                      </div>
                    </div>

                    {/* 智能体名称 */}
                    <h3 className="text-lg font-semibold text-white mb-1">{agent.name}</h3>
                    <p className="text-xs text-zinc-500 mb-3">{agent.fullName}</p>

                    {/* 核心价值 */}
                    <p className={`text-sm ${colors.text} font-medium mb-2`}>{agent.tagline}</p>
                    <p className="text-xs text-zinc-500">{agent.description}</p>

                    {/* 输出标识 */}
                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <ArrowRight size={12} className="text-zinc-600" />
                        <span className="text-xs text-zinc-400">输出：{agent.output}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="flex justify-center">
            <Link href="/diagnosis">
            <GlowButton
              primary
              className="px-10 py-4 text-base"
            >
              <Zap size={18} />
              免费快速诊断，5分钟拿到评分与行动清单
              <ArrowRight size={16} />
            </GlowButton>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ 智能体矩阵展示 - 卡片墙 ============ */}
      <section id="features" className="scroll-mt-24 py-24 md:py-32 px-4 sm:px-6 relative overflow-hidden content-visibility-auto">
        {/* 背景 */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/5 to-transparent" />

        <div className="relative max-w-6xl mx-auto">
          {/* 标题 - 强调数量 */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-emerald-500/10 border border-white/10 mb-6">
              <Bot size={18} className="text-purple-400" />
              <span className="text-sm text-white font-medium">工作流模板库</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400 font-mono">
                {MARKETING_METRICS.workflowTemplates}
              </span>
              <span className="text-white ml-3">工作流智能体模板</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              覆盖{MARKETING_METRICS.industryTemplates}行业模板，从行业分析到脚本与质检，帮助新赛道更快落地
            </p>
          </div>

          {/* 分类统计卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            {Object.entries(agentMatrix).map(([category, data]) => {
              const colors = agentColorMap[data.color]
              const IconComponent = data.icon
              return (
                <div
                  key={category}
                  className={`p-4 rounded-xl ${colors.bg} border ${colors.border} transition-all duration-300 text-center`}
                >
                  <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center mx-auto mb-3`}>
                    <IconComponent size={20} className={colors.text} />
                  </div>
                  <p className={`text-2xl font-bold ${colors.text} font-mono tabular-nums`}>{data.count}</p>
                  <p className="text-xs text-zinc-500 mt-1">{category}</p>
                </div>
              )
            })}
          </div>

          {/* 行业覆盖 - 精简版 */}
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {INDUSTRY_TAGS.map((industry) => (
              <span key={industry} className="px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-zinc-400">
                {industry}
              </span>
            ))}
            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              +{MARKETING_METRICS.industryTemplates - INDUSTRY_TAGS.length} 行业模板
            </span>
          </div>
        </div>
      </section>

            {/* ============ 交付对比 - 工作流化 ============ */}
      <section className="py-28 md:py-40 px-4 sm:px-6 relative overflow-hidden content-visibility-auto">
        {/* 背景光效 */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-br from-red-950/20 via-transparent to-transparent" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-bl from-emerald-950/20 via-transparent to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-purple-500/5 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          {/* 标题区 */}
          <div className="text-center mb-16 md:mb-20">
            <div className="inline-flex items-center gap-3 px-4 sm:px-6 py-3 rounded-full bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-sm text-emerald-400 font-medium">把交付从碎片化变成工作流</span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight tracking-tight">
              从“灵感驱动”到“流程驱动”
            </h2>

            <p className="text-zinc-500 text-lg max-w-3xl mx-auto">
              把定位、选题、内容日历、脚本、质检与去重归档串成一条线，让团队多项目并行也能更好对齐口径与节奏。
            </p>
          </div>

          {/* 对比可视化 */}
          <div className="relative">
            {/* 中间VS标识 */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center shadow-2xl">
                <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-emerald-400">VS</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 md:gap-12">
              {/* 传统做法 */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent rounded-3xl" />
                <div className="relative p-8 md:p-10 rounded-3xl bg-zinc-900/80 border border-red-500/20 backdrop-blur-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-4 h-4 rounded-full bg-red-500/50 ring-4 ring-red-500/20" />
                    <h3 className="text-2xl font-bold text-zinc-400">传统做法</h3>
                    <span className="ml-auto px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400">碎片化</span>
                  </div>

                  <div className="space-y-4 text-sm text-zinc-400">
                    {[
                      "选题靠灵感，项目切换就断档",
                      "调研/拆解重复做，知识不沉淀",
                      "风格不一致：口吻、结构、节奏随人变",
                      "改稿靠主观，没有统一质检清单",
                      "素材散落各处，复用困难、交付难追溯",
                      "去重缺失，容易同质化或撞稿风险"
                    ].map((item) => (
                      <div key={item} className="flex gap-3">
                        <span className="mt-0.5 text-red-400">×</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 工作流化 */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 rounded-3xl" />
                <div className="absolute -inset-0.5 bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
                <div className="relative p-8 md:p-10 rounded-3xl bg-zinc-900/80 border border-emerald-500/30 backdrop-blur-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-500/30 animate-pulse" />
                    <h3 className="text-2xl font-bold text-emerald-400">IP内容工厂</h3>
                    <span className="ml-auto px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">工作流化</span>
                  </div>

                  <div className="space-y-4 text-sm text-zinc-300">
                    {[
                      "双轨内容：情绪价值 + 专业价值模板化，兼顾泛流量与精准转化",
                      "4X4配比：把拉新/建信/转化/留存写进内容日历",
                      "行业目标分析 + 认知深度（道法术器势）+ 情绪价值全景图，先把底层打透",
                      "风格复刻 + 最终审核：统一口吻、结构、节奏，减少返工",
                      "去重归档 + 选题记录：内容资产沉淀，可追溯、可复用",
                      "团队协作交付：同一套标准，多项目并行也能对齐口径"
                    ].map((item) => (
                      <div key={item} className="flex gap-3">
                        <CheckCircle size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 mt-10">
            <Link href="/diagnosis">
              <GlowButton primary className="px-10 py-4 text-base">
                免费快速诊断
                <ArrowRight size={16} />
              </GlowButton>
            </Link>
            <TrackedLink
              href="/demo"
              eventName="cta_click"
              eventProps={{ source: "workflow_demo" }}
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              预约顾问演示
            </TrackedLink>
            <p className="text-xs text-zinc-600">诊断完成后可获得流程卡点与交付SOP建议</p>
          </div>

          {/* 免责声明 */}
          <div className="flex justify-center mt-12">
            <div className="inline-flex items-center gap-4 px-4 sm:px-6 py-3 rounded-full bg-white/[0.02] border border-white/5 text-sm text-zinc-400">
              <Shield size={16} className="text-zinc-500" />
              <span>示例为典型流程对比，不构成效果承诺</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 企业级服务 ============ */}
      <section className="py-20 px-4 sm:px-6 content-visibility-auto">
        <div className="max-w-2xl mx-auto">
          <div className="relative p-10 md:p-14 rounded-3xl overflow-hidden">
            {/* 背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-950/30 via-violet-950/20 to-zinc-900/50" />
            <div className="absolute inset-0 border border-purple-500/10 rounded-3xl" />
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl" />

            <div className="relative text-center">
              {/* 标签 */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
                <Gift size={16} className="text-purple-400" />
                <span className="text-sm text-purple-400 font-medium">团队 / 企业版</span>
              </div>

              {/* 标题 */}
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                面向团队的落地方案
              </h3>

              <p className="text-zinc-400 text-lg mb-8 max-w-md mx-auto">
                从小团队到内容中台，把方法论、模板与交付SOP跑通，支持陪跑顾问与私有化部署（可选）
              </p>

              {/* 服务亮点 */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">SOP</p>
                  <p className="text-xs text-zinc-500 mt-1">交付标准化</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-400">协作</p>
                  <p className="text-xs text-zinc-500 mt-1">多项目协作</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">7天</p>
                  <p className="text-xs text-zinc-500 mt-1">体验期</p>
                </div>
              </div>

              {/* CTA */}
              <div className="flex justify-center">
                <TrackedLink href="/demo" eventName="cta_click" eventProps={{ source: "team_demo" }}>
                  <GlowButton
                    primary
                    className="px-10 py-4 text-lg"
                  >
                    查看团队方案
                    <ArrowRight size={18} />
                  </GlowButton>
                </TrackedLink>
              </div>

              {/* 已服务客户 */}
              <p className="text-sm text-zinc-600 mt-6">
                适用于代运营 / MCN / 企业内容团队
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 最终 CTA - 强化系统价值 ============ */}
      <section id="final-cta" className="py-32 md:py-40 px-4 sm:px-6 content-visibility-auto">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight tracking-tight">
            把交付周期从不确定变成可量化
            <br />
            <span className="text-emerald-400">让团队多项目并行更易对齐</span>
          </h2>

          <p className="text-xl text-zinc-400 mb-10">
            完成诊断即可获得五维评分 + 行动清单 + 交付SOP建议
          </p>

          {/* 双CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 w-full">
            <Link href="/diagnosis" className="w-full sm:w-auto">
            <GlowButton
              primary
              className="w-full sm:w-auto px-10 py-5 text-lg font-medium"
            >
              <Zap size={20} />
              领取专属诊断报告
              <ArrowRight size={18} />
            </GlowButton>
            </Link>
            <TrackedLink
              href="/demo"
              eventName="cta_click"
              eventProps={{ source: "final_demo" }}
              className="px-10 py-5 text-lg font-medium text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl transition-colors"
            >
              预约顾问演示
            </TrackedLink>
          </div>

          <p className="text-sm text-zinc-600">
            无需注册 · 可下载诊断报告 · <Link href="/pricing" className="hover:text-white transition-colors">查看定价与团队方案</Link>
          </p>
          <p className="text-sm text-zinc-600 mt-4">
            添加微信领取1V1诊断解读：<span className="text-emerald-300 font-medium select-all">{WECHAT_ID}</span>
          </p>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <MobileStickyCta />

      <footer className="py-10 px-4 sm:px-6 border-t border-white/[0.02]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
              IP
            </div>
            <span className="text-zinc-600 text-sm">IP内容工厂</span>
          </Link>

          <div className="flex items-center gap-8 text-sm text-zinc-600">
            <Link href="/pricing" className="hover:text-white transition-colors">价格</Link>
            <Link href="/auth/login" className="hover:text-white transition-colors">登录</Link>
          </div>

          <p className="text-xs text-zinc-700">© 2025 IP内容工厂</p>
        </div>
      </footer>

      {/* 隐藏滚动条样式 */}
    </div>
  )
}
