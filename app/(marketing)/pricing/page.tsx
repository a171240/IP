import Link from "next/link"
import { ArrowRight, Check, Clock, Gift, MessageCircle, Sparkles, X, Zap, Bot, Store, Factory, Palette, LayoutGrid } from "lucide-react"
import { GlassCard, GlowButton } from "@/components/ui/obsidian-primitives"
import { PricingPayButton } from "@/components/pricing-pay-button"

type PlanId = "free" | "basic" | "pro" | "vip"

const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "vip"]

const WECHAT_ID = "like171240"

const START_HREF = "/auth/register?redirect=/dashboard/quick-start"

// Marketing Navigation
const MarketingNav = () => (
  <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)]">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
          IP
        </div>
        <span className="text-xl font-bold text-white">IP内容工厂</span>
      </Link>
      <div className="hidden md:flex items-center gap-8">
        <Link href="/pricing" className="text-white text-sm">
          定价方案
        </Link>
        <Link href="/#features" className="text-zinc-400 hover:text-white transition-colors text-sm">
          核心功能
        </Link>
        <Link href="/#workflow" className="text-zinc-400 hover:text-white transition-colors text-sm">
          工作流程
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/auth/login">
          <button className="text-zinc-400 hover:text-white transition-colors text-sm px-4 py-2">登录</button>
        </Link>
        <Link href={START_HREF}>
          <GlowButton primary className="text-sm px-5 py-2.5">
            免费体验
          </GlowButton>
        </Link>
      </div>
    </div>
  </nav>
)

const plans = [
  {
    id: "free" as const,
    name: "体验版",
    price: "￥0",
    period: "/长期",
    description: "适合先跑通一条交付：快速体验 + 研究定位（P1–P2）。",
    features: [
      { text: "快速体验：交付脚本包（4类）", included: true },
      { text: "工坊：研究定位（P1–P2）", included: true },
      { text: "报告沉淀：可保存到「报告」", included: true },
      { text: "新手试用：最高 30 积分（同设备仅一次）", included: true },
      { text: "智能体库：可消耗积分体验", included: true },
      { text: "定位与人设（P3–P5 + IP传记）", included: false },
      { text: "Plus专属智能体（100+个）", included: false },
      { text: "Pro专属智能体与下载", included: false },
    ],
    highlighted: false,
    badge: undefined as string | undefined,
    cta: "免费开始",
    ctaHref: START_HREF,
    productId: null as string | null,
  },
  {
    id: "basic" as const,
    name: "Plus",
    price: "￥199",
    period: "/月",
    description: "完成定位与人设资产：解锁 P3–P5 + IP传记 + 100+专属智能体。",
    features: [
      { text: "包含体验版全部能力", included: true },
      { text: "工坊：情绪价值分析（P3）", included: true },
      { text: "工坊：IP传记采访", included: true },
      { text: "工坊：IP概念 + 文风（P4–P5）", included: true },
      { text: "🎁 实体营销全家桶 13模块100+智能体", included: true, highlight: true },
      { text: "🎁 46行业情绪选题生成器", included: true, highlight: true },
      { text: "每月赠送 300 积分", included: true },
      { text: "Pro专属智能体与下载", included: false },
    ],
    highlighted: false,
    badge: "超值" as string | undefined,
    cta: "升级Plus",
    ctaHref: "/pay?product=basic_month",
    productId: "basic_month" as string | null,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "￥599",
    period: "/月",
    description: "解锁全部智能体 + 内容生产循环（P6–P10）+ 资源下载权限。",
    features: [
      { text: "包含Plus全部能力", included: true },
      { text: "工坊：4X4内容规划（P6）", included: true },
      { text: "工坊：内容生产循环（P7–P10）", included: true },
      { text: "🎁 12赛博IP人设模板", included: true, highlight: true },
      { text: "🎁 内容矩阵规划工具包", included: true, highlight: true },
      { text: "🎁 全部智能体资源可下载", included: true, highlight: true },
      { text: "每月赠送 1200 积分", included: true },
      { text: "团队协作/权限（规划中）", included: false },
    ],
    highlighted: true,
    badge: "推荐",
    cta: "升级Pro",
    ctaHref: "/pay?product=pro_month",
    productId: "pro_month" as string | null,
  },
  {
    id: "vip" as const,
    name: "企业版",
    price: "定制",
    period: "",
    description: "适合品牌中台 / MCN：培训、权限与定制工作流，支持私有化（可选）。",
    features: [
      { text: "包含Pro全部能力", included: true },
      { text: "专属实施与培训（可选）", included: true },
      { text: "权限/多团队管理（可选）", included: true },
      { text: "定制工作流与交付标准（可选）", included: true },
      { text: "API/私有化部署（可选）", included: true },
      { text: "SLA/对公/发票（可选）", included: true },
      { text: "积分不限量 / 额度按需定制", included: true },
    ],
    highlighted: false,
    badge: undefined as string | undefined,
    cta: "联系开通",
    ctaHref: "#contact",
    productId: null as string | null,
  },
]

const stepCatalog: Array<{ id: string; title: string; requiredPlan: PlanId }> = [
  { id: "P1", title: "行业目标分析", requiredPlan: "free" },
  { id: "P2", title: "行业认知深度", requiredPlan: "free" },
  { id: "P3", title: "情绪价值分析", requiredPlan: "basic" },
  { id: "IP传记", title: "IP传记采访", requiredPlan: "basic" },
  { id: "P4", title: "IP概念", requiredPlan: "basic" },
  { id: "P5", title: "IP类型定位", requiredPlan: "basic" },
  { id: "P6", title: "4X4内容规划", requiredPlan: "pro" },
  { id: "P7", title: "引流内容（50%）", requiredPlan: "pro" },
  { id: "P8", title: "理性内容（30%）", requiredPlan: "pro" },
  { id: "P9", title: "产品内容（15%）", requiredPlan: "pro" },
  { id: "P10", title: "情绪内容（5%）", requiredPlan: "pro" },
]

function isStepIncluded(current: PlanId, required: PlanId) {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required)
}

// Pricing Card Component
const PricingCard = ({
  plan,
}: {
  plan: (typeof plans)[0]
}) => (
  <div className="relative h-full pt-4">
    {plan.badge && (
      <div className="absolute -top-0 left-1/2 -translate-x-1/2 z-10">
        <div className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full text-xs font-bold text-white shadow-lg shadow-purple-500/30 whitespace-nowrap">
          {plan.badge}
        </div>
      </div>
    )}
    <GlassCard
      className={`p-6 h-full flex flex-col ${
        plan.highlighted ? "border-purple-500/30 shadow-[0_0_60px_-15px_rgba(168,85,247,0.3)]" : ""
      }`}
    >
      <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold text-white">{plan.price}</span>
        {plan.period && <span className="text-zinc-500 text-sm">{plan.period}</span>}
      </div>

      <p className="text-sm text-zinc-400 mb-5 leading-relaxed min-h-[44px]">{plan.description}</p>

      <div className="mb-6">
        {plan.productId ? (
          <PricingPayButton productId={plan.productId} highlighted={plan.highlighted} className="w-full">
            {plan.cta}
          </PricingPayButton>
        ) : (
          <Link href={plan.ctaHref}>
            <GlowButton primary={plan.highlighted} className="w-full">
              {plan.cta}
              <ArrowRight size={16} className="ml-2" />
            </GlowButton>
          </Link>
        )}
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feature) => {
          const isHighlight = "highlight" in feature && feature.highlight
          return (
            <li key={feature.text} className="flex items-start gap-2.5">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isHighlight
                    ? "bg-amber-500/10 border border-amber-500/20"
                    : feature.included
                      ? "bg-purple-500/10 border border-purple-500/20"
                      : "bg-zinc-800/50 border border-zinc-700/50"
                }`}
              >
                {isHighlight ? (
                  <Gift size={10} className="text-amber-400" />
                ) : feature.included ? (
                  <Check size={10} className="text-purple-400" />
                ) : (
                  <X size={10} className="text-zinc-600" />
                )}
              </div>
              <span className={`text-xs ${isHighlight ? "text-amber-300" : feature.included ? "text-zinc-300" : "text-zinc-600"}`}>
                {feature.text}
              </span>
            </li>
          )
        })}
      </ul>
    </GlassCard>
  </div>
)

// 显示的套餐（不包含企业版）
const displayPlans = plans.filter(plan => plan.id !== "vip")

const PlanMatrix = () => (
  <section className="pb-24 px-4 sm:px-6">
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">WORKFLOW ACCESS</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white">每个套餐解锁哪些工作流步骤？</h2>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
          你的付费不是为"次数"，而是为"阶段解锁 + 团队可复用的交付资产"。
        </p>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className="px-5 py-4 text-zinc-400 font-medium whitespace-nowrap">步骤</th>
                {displayPlans.map((plan) => (
                  <th key={plan.id} className="px-5 py-4 text-zinc-200 font-medium whitespace-nowrap">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stepCatalog.map((step) => (
                <tr key={step.id} className="border-t border-white/5">
                  <td className="px-5 py-4">
                    <div className="text-white font-medium">{step.id}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{step.title}</div>
                  </td>
                  {displayPlans.map((plan) => {
                    const ok = isStepIncluded(plan.id, step.requiredPlan)
                    return (
                      <td key={`${step.id}-${plan.id}`} className="px-5 py-4">
                        <div className="inline-flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-zinc-900/40 border border-white/5"
                            }`}
                          >
                            {ok ? <Check size={12} className="text-emerald-400" /> : <X size={12} className="text-zinc-600" />}
                          </div>
                          <span className={`text-xs ${ok ? "text-zinc-300" : "text-zinc-600"}`}>{ok ? "包含" : "需升级"}</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  </section>
)

// Agent Benefits Section
const agentBenefits = [
  {
    name: "实体营销全家桶",
    icon: Store,
    color: "orange",
    countLabel: "13模块100+智能体",
    value: "价值￥1999",
    free: "12积分/次",
    plus: "免费",
    pro: "免费",
    vip: "免费",
  },
  {
    name: "46行业选题生成器",
    icon: Factory,
    color: "cyan",
    countLabel: "46个智能体",
    value: "价值￥999",
    free: "12积分/次",
    plus: "免费",
    pro: "免费",
    vip: "免费",
  },
  {
    name: "赛博IP人设模板",
    icon: Palette,
    color: "pink",
    countLabel: "12个智能体",
    value: "价值￥599",
    free: "16积分/次",
    plus: "8积分/次",
    pro: "免费",
    vip: "免费",
  },
  {
    name: "内容矩阵规划包",
    icon: LayoutGrid,
    color: "indigo",
    countLabel: "5个智能体",
    value: "价值￥499",
    free: "16积分/次",
    plus: "8积分/次",
    pro: "免费",
    vip: "免费",
  },
  {
    name: "资源下载权限",
    icon: Bot,
    color: "purple",
    countLabel: null,
    value: null,
    free: "不可下载",
    plus: "Plus专属包可下载",
    pro: "全部可下载",
    vip: "全部可下载",
  },
]

const AgentBenefitsSection = () => (
  <section className="pb-24 px-4 sm:px-6">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">AGENT BENEFITS</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white">智能体权益对比</h2>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
          80+专业智能体，不同会员等级享有不同权益。低级会员可消耗积分体验高级智能体。
        </p>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className="px-5 py-4 text-zinc-400 font-medium">智能体包</th>
                <th className="px-5 py-4 text-zinc-200 font-medium">体验版</th>
                <th className="px-5 py-4 text-zinc-200 font-medium">Plus</th>
                <th className="px-5 py-4 text-zinc-200 font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {agentBenefits.map((benefit) => (
                <tr key={benefit.name} className="border-t border-white/5">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-${benefit.color}-500/10 border border-${benefit.color}-500/20 flex items-center justify-center`}>
                        <benefit.icon size={16} className={`text-${benefit.color}-400`} />
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{benefit.name}</div>
                        {benefit.countLabel && <div className="text-[10px] text-zinc-500">{benefit.countLabel}</div>}
                        {benefit.value && <div className="text-[10px] text-amber-400 font-medium">{benefit.value}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded ${benefit.free === "不可下载" ? "bg-zinc-800 text-zinc-500" : "bg-zinc-800 text-zinc-400"}`}>
                      {benefit.free}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded ${benefit.plus === "免费" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-400"}`}>
                      {benefit.plus}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded ${benefit.pro === "免费" || benefit.pro === "全部可下载" ? "bg-purple-500/10 text-purple-400" : "bg-zinc-800 text-zinc-400"}`}>
                      {benefit.pro}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-4 text-center text-sm text-zinc-500">
        <p>低级会员使用高级智能体时，积分消耗会相应增加（跨1级2倍，跨2级4倍）</p>
      </div>
    </div>
  </section>
)

// Credits Section
const creditCostCatalog = [
  { label: "快速体验（quick-*）", cost: 1, note: "单次生成" },
  { label: "P1–P2（研究定位）", cost: 2, note: "每次对话/生成" },
  { label: "P3–P5（定位人设）", cost: 2, note: "每次对话/生成" },
  { label: "IP传记（深度采访）", cost: 6, note: "每次对话/生成" },
  { label: "P6–P10（内容生产）", cost: 3, note: "每次对话/生成" },
] as const

const CreditsSection = () => (
  <section className="pb-24 px-4 sm:px-6">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">CREDITS</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white">积分怎么消耗？</h2>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">
          每次生成会消耗积分，不同步骤消耗不同。积分用于覆盖模型成本，并减少反复注册薅羊毛。
        </p>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className="px-5 py-4 text-zinc-400 font-medium">项目</th>
                <th className="px-5 py-4 text-zinc-400 font-medium">消耗</th>
                <th className="px-5 py-4 text-zinc-400 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {creditCostCatalog.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="px-5 py-4 text-zinc-200">{row.label}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold">
                      {row.cost}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-500">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-4 grid md:grid-cols-3 gap-4">
        <GlassCard className="p-5">
          <h3 className="text-white font-medium mb-1">试用积分</h3>
          <p className="text-sm text-zinc-400">新用户最高 30 积分（同设备仅一次）。</p>
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="text-white font-medium mb-1">风控规则</h3>
          <p className="text-sm text-zinc-400">同设备重复注册、短时间多账号等行为可能不发放试用积分。</p>
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="text-white font-medium mb-1">积分不足</h3>
          <p className="text-sm text-zinc-400">升级套餐或补充积分（内测期人工开通）。</p>
        </GlassCard>
      </div>
    </div>
  </section>
)
// FAQ Section
const faqs = [
  {
    q: "体验版能做什么？",
    a: "体验版支持快速体验交付脚本包，并解锁工坊 P1–P2（研究定位）。建议先跑通一条交付，再按阶段升级。",
  },
  {
    q: "为什么不按次数计费？",
    a: "行业/人设/内容生产的价值在于“可复用资产”。我们按阶段解锁工作流，让团队可以反复使用同一套交付标准与模板库。",
  },
  {
    q: "可以随时升级套餐吗？",
    a: "可以。当前处于内测阶段，自助支付与发票能力会陆续上线；需要升级请先注册体验版，再在页面底部联系我们。",
  },
  {
    q: "生成的内容版权归谁？",
    a: "你对自己生成的内容拥有使用与发布权；建议在发布前进行事实核查与合规审校。",
  },
  {
    q: "什么是积分？怎么消耗？",
    a: "每次生成/每次对话会消耗一定积分，不同步骤消耗不同（例如：快速体验 1 积分/次，P1–P2 2 积分/次，P3–P5 2 积分/次，IP传记 6 积分/次，P6–P10 3 积分/次）。",
  },
  {
    q: "为什么要引入积分机制？",
    a: "积分用于覆盖模型成本、控制资源公平，并减少反复注册薅羊毛；也方便后续推出积分包、团队额度等。",
  },
  {
    q: "试用积分为什么我拿不到/变少？",
    a: "试用积分同设备仅一次，并会结合网络环境做风控；如果检测到短时间多账号注册，可能会降级或不发放。需要协助请在页底联系我们。",
  },
  {
    q: "积分不足怎么办？",
    a: "升级套餐或补充积分（内测期人工开通，后续会支持自助支付）。",
  },
]

const FAQSection = () => (
  <section className="py-16 px-4 sm:px-6">
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white text-center mb-12">常见问题</h2>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <GlassCard key={faq.q} className="p-6">
            <h3 className="text-white font-medium mb-2">{faq.q}</h3>
            <p className="text-sm text-zinc-400">{faq.a}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  </section>
)

const ContactSection = () => (
  <section id="contact" className="pb-24 px-4 sm:px-6">
    <div className="max-w-3xl mx-auto">
      <GlassCard className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white mb-2">联系客服 / 开通咨询</h2>
          <p className="text-sm text-zinc-400">
            如需升级套餐、企业定制、或有任何问题，欢迎添加客服微信咨询。
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <MessageCircle size={20} className="text-emerald-400" />
            <div>
              <p className="text-[10px] text-zinc-500 leading-tight">客服微信</p>
              <p className="text-base font-semibold text-emerald-300 select-all">{WECHAT_ID}</p>
            </div>
          </div>
          <Link href={START_HREF}>
            <GlowButton primary className="px-6 py-3">
              <Zap size={16} />
              免费体验
              <ArrowRight size={16} />
            </GlowButton>
          </Link>
        </div>
      </GlassCard>
    </div>
  </section>
)

// Footer
const Footer = () => (
  <footer className="py-12 px-4 sm:px-6 border-t border-white/10">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
          IP
        </div>
        <span className="text-zinc-500 text-sm">IP内容工厂</span>
      </div>
      <div className="flex items-center gap-6 text-sm text-zinc-500">
        <Link href="/pricing" className="hover:text-white transition-colors">
          定价方案
        </Link>
        <Link href={START_HREF} className="hover:text-white transition-colors">
          免费体验
        </Link>
        <Link href="#contact" className="hover:text-white transition-colors">
          联系我们
        </Link>
      </div>
      <p className="text-xs text-zinc-600">© 2025 IP内容工厂</p>
    </div>
  </footer>
)

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <MarketingNav />

      {/* Promo Banner */}
      <section className="pt-28 pb-6 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 border border-yellow-500/30 p-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />

            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                  <Gift size={28} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-white">新用户体验计划</h3>
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-xs text-red-400 font-medium flex items-center gap-1">
                      <Clock size={10} />
                      内测
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm">7天Pro体验 + 150积分（解锁全部80+智能体 + P6–P10内容生产）</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">￥9.9</span>
                    <span className="text-sm text-zinc-500 line-through">￥599/月</span>
                  </div>
                  <p className="text-xs text-yellow-400 mt-1">先跑通一次“批量交付”</p>
                </div>
                <Link href={`${START_HREF}&promo=trial`}>
                  <GlowButton primary className="px-8 py-3 text-base whitespace-nowrap">
                    <Zap size={18} />
                    立即领取
                    <ArrowRight size={16} />
                  </GlowButton>
                </Link>
              </div>
            </div>

            <div className="relative mt-4 pt-4 border-t border-white/10 text-center text-xs text-zinc-500">
              提示：当前处于内测阶段，付费开通与发票能力将陆续上线。
            </div>
          </div>
        </div>
      </section>

      {/* Header */}
      <section className="pt-8 pb-16 px-4 sm:px-6 text-center relative">

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <Sparkles size={14} className="text-purple-400" />
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">按阶段解锁 · 更清晰的价值梯度</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">选择适合你的方案</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            体验版先跑通交付；Plus解锁100+专属智能体；Pro畅享全部智能体+资源下载权限。
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {plans.filter(plan => plan.id !== "vip").map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      </section>


      <AgentBenefitsSection />
      <CreditsSection />
      <PlanMatrix />
      <FAQSection />
      <ContactSection />
      <Footer />
    </main>
  )
}

