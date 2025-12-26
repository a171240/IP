import Link from "next/link"
import { ArrowRight, Sparkles, Shield, Zap, BarChart3, Users, Globe, ChevronRight, Play, Store, Factory, Palette, LayoutGrid, Gift } from "lucide-react"
import { GlassCard, GlowButton } from "@/components/ui/obsidian-primitives"

// Marketing Navigation
const MarketingNav = () => (
  <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)]">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-900/50 group-hover:scale-105 transition-transform">
          IP
        </div>
        <span className="text-xl font-bold text-white">IP内容工厂</span>
      </Link>

      {/* Nav Links */}
      <div className="hidden md:flex items-center gap-8">
        <Link href="/pricing" className="text-zinc-400 hover:text-white transition-colors text-sm">
          定价方案
        </Link>
        <Link href="#features" className="text-zinc-400 hover:text-white transition-colors text-sm">
          核心功能
        </Link>
        <Link href="#workflow" className="text-zinc-400 hover:text-white transition-colors text-sm">
          工作流程
        </Link>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-4">
        <Link href="/auth/login">
          <button className="text-zinc-400 hover:text-white transition-colors text-sm px-4 py-2">登录</button>
        </Link>
        <Link href="/diagnosis">
          <GlowButton primary className="text-sm px-5 py-2.5">
            免费快速诊断
          </GlowButton>
        </Link>
      </div>
    </div>
  </nav>
)

// Hero Section
const HeroSection = () => (
  <section className="relative pt-32 pb-20 px-4 sm:px-6">
    {/* Glowing orb behind hero */}

    <div className="max-w-5xl mx-auto text-center relative">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8">
        <Sparkles size={14} className="text-indigo-400" />
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">AI驱动的商业IP营销系统</span>
      </div>

      {/* Main Headline */}
      <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight text-balance">
        一站式打造你的{" "}
        <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
          商业IP内容
        </span>
      </h1>

      {/* Subheadline */}
      <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed text-pretty">
        基于4X4方法论，从行业分析到IP传记，从人设定位到脚本输出，AI智能体全流程协作，助你打造高转化商业IP
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
        <Link href="/diagnosis">
          <GlowButton primary className="text-base px-8 py-4">
            免费快速诊断IP健康
            <ArrowRight size={18} className="ml-2" />
          </GlowButton>
        </Link>
        <button className="flex items-center gap-2 px-4 sm:px-6 py-4 text-zinc-400 hover:text-white transition-colors group">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
            <Play size={16} fill="currentColor" />
          </div>
          <span>观看演示</span>
        </button>
      </div>

      {/* Hero Image / Dashboard Preview */}
      <div className="relative">
        <GlassCard className="p-2 shadow-2xl shadow-black/50">
          <div className="aspect-[16/9] bg-zinc-950 rounded-2xl overflow-hidden border border-white/5">
            <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center">
                  <BarChart3 size={32} className="text-white" />
                </div>
                <p className="text-zinc-500 text-sm">工作台预览</p>
              </div>
            </div>
          </div>
        </GlassCard>
        {/* Decorative glow */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-indigo-600/30 blur-[80px] rounded-full" />
      </div>
    </div>
  </section>
)

// Features Section
const features = [
  {
    icon: Shield,
    title: "行业深度分析",
    description: "AI智能体自动搜索行业数据，运用第一性原理和价值链分析，精准定位你的目标受众和市场机会。",
  },
  {
    icon: Zap,
    title: "4X4方法论引擎",
    description: "50%引流+30%理性+15%产品+5%情绪的黄金配比，科学规划60期内容矩阵，持续吸引精准流量。",
  },
  {
    icon: BarChart3,
    title: "IP传记生成",
    description: "深度访谈式AI对话，挖掘20+张力故事，构建2万字专业IP传记，奠定人设根基。",
  },
  {
    icon: Users,
    title: "多人设矩阵",
    description: "支持单账号多人设管理，针对不同受众群体定制差异化内容策略，最大化商业价值。",
  },
  {
    icon: Globe,
    title: "46行业情绪选题",
    description: "覆盖餐饮、教育、医美、法律等46个行业的正反观点情绪选题，Plus会员专属免费使用。",
  },
  {
    icon: Sparkles,
    title: "一键脚本生成",
    description: "从选题到成稿，AI自动匹配IP风格和平台调性，批量生成高质量短视频脚本。",
  },
]

const FeaturesSection = () => (
  <section id="features" className="py-24 px-4 sm:px-6">
    <div className="max-w-6xl mx-auto">
      {/* Section Header */}
      <div className="text-center mb-16">
        <p className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-4">核心功能</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">商业IP内容创作的完整解决方案</h2>
        <p className="text-zinc-400 max-w-xl mx-auto">
          从定位到变现，10步流程全覆盖，让每一位中小企业主都能拥有专业级的IP内容体系
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => (
          <GlassCard key={feature.title} hover className="p-6 group">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <feature.icon size={24} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  </section>
)

// Stats Section
const stats = [
  { value: "80+", label: "AI智能体" },
  { value: "46", label: "行业覆盖" },
  { value: "4大", label: "解决方案包" },
  { value: "10步", label: "工作流程" },
]

const StatsSection = () => (
  <section className="py-16 px-4 sm:px-6 border-y border-white/5">
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-3xl md:text-4xl font-bold text-white mb-2">{stat.value}</div>
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
)

// Agent Solutions Section
const solutionPacks = [
  { name: "实体营销全家桶", count: 13, icon: Store, color: "orange", badge: "Plus专属", badgeColor: "amber" },
  { name: "46行业选题生成器", count: 46, icon: Factory, color: "cyan", badge: "Plus专属", badgeColor: "amber" },
  { name: "赛博IP人设模板", count: 12, icon: Palette, color: "pink", badge: "Pro专属", badgeColor: "purple" },
  { name: "内容矩阵规划包", count: 5, icon: LayoutGrid, color: "indigo", badge: "Pro专属", badgeColor: "purple" },
]

const AgentShowcaseSection = () => (
  <section className="py-24 px-4 sm:px-6">
    <div className="max-w-6xl mx-auto">
      {/* Section Header */}
      <div className="text-center mb-16">
        <p className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-4">智能体解决方案</p>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">80+专业智能体，覆盖内容创作全场景</h2>
        <p className="text-zinc-400 max-w-xl mx-auto">
          从行业分析到脚本创作，从人设定位到营销转化，一站式解决商业IP内容创作需求
        </p>
      </div>

      {/* Solution Packs Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {solutionPacks.map((pack) => (
          <GlassCard key={pack.name} hover className="p-6 group relative">
            {/* Badge */}
            <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-medium ${
              pack.badgeColor === "amber"
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
            }`}>
              {pack.badge}
            </div>

            <div className={`w-12 h-12 rounded-xl bg-${pack.color}-500/10 border border-${pack.color}-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <pack.icon size={24} className={`text-${pack.color}-400`} />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{pack.name}</h3>
            <p className="text-sm text-zinc-500">
              <span className="text-2xl font-bold text-white">{pack.count}</span> 个智能体
            </p>
          </GlassCard>
        ))}
      </div>

      {/* Value Proposition */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
          <Gift size={16} className="text-amber-400" />
          <span className="text-sm text-amber-300">升级Plus立享100+专属智能体，价值超过￥3000</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/pricing">
            <GlowButton className="text-base px-6 py-3">
              查看会员权益
              <ChevronRight size={16} className="ml-1" />
            </GlowButton>
          </Link>
          <Link href="/dashboard/profiles">
            <GlowButton primary className="text-base px-6 py-3">
              浏览智能体库
              <ArrowRight size={16} className="ml-2" />
            </GlowButton>
          </Link>
        </div>
      </div>
    </div>
  </section>
)

// CTA Section
const CTASection = () => (
  <section className="py-24 px-4 sm:px-6">
    <div className="max-w-4xl mx-auto">
      <GlassCard className="p-12 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">准备好打造你的商业IP了吗？</h2>
          <p className="text-zinc-400 mb-4 max-w-xl mx-auto">
            立即开始使用IP内容工厂，新用户赠送30积分体验
          </p>
          <p className="text-indigo-400 text-sm mb-8">
            升级Plus解锁100+专属智能体 · 升级Pro畅享全部智能体+下载权限
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/diagnosis">
              <GlowButton primary className="text-base px-8 py-4">
                免费快速诊断IP健康
                <ArrowRight size={18} className="ml-2" />
              </GlowButton>
            </Link>
            <Link href="/pricing">
              <GlowButton className="text-base px-8 py-4">
                查看定价方案
                <ChevronRight size={18} className="ml-1" />
              </GlowButton>
            </Link>
          </div>
        </div>
      </GlassCard>
    </div>
  </section>
)

// Footer
const Footer = () => (
  <footer className="py-12 px-4 sm:px-6 border-t border-white/5">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
          IP
        </div>
        <span className="text-zinc-500 text-sm">IP内容工厂</span>
      </div>
      <div className="flex items-center gap-6 text-sm text-zinc-500">
        <Link href="#" className="hover:text-white transition-colors">
          隐私政策
        </Link>
        <Link href="#" className="hover:text-white transition-colors">
          使用条款
        </Link>
        <Link href="#" className="hover:text-white transition-colors">
          联系我们
        </Link>
      </div>
      <p className="text-xs text-zinc-600">© 2025 IP内容工厂 · 星盒出品</p>
    </div>
  </footer>
)

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <MarketingNav />
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <AgentShowcaseSection />
      <CTASection />
      <Footer />
    </main>
  )
}

