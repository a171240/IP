"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { withRetry } from "@/lib/utils/timeout"
import {
  Play,
  Sparkles,
  FileText,
  Target,
  User,
  Lightbulb,
  ArrowRight,
  Check,
  Clock,
  Lock,
  BarChart3,
  BookOpen,
  Layers,
  PenTool,
  MessageSquare,
  Zap,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Database,
  Loader2
} from "lucide-react"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { useAuth } from "@/contexts/auth-context"
import { getCompletedSteps } from "@/lib/supabase"

// 知识库文档类型
type KnowledgeDoc = {
  id: string
  name: string
  status: "completed" | "pending" | "in_progress"
  generatedBy: string // 由哪个步骤生成
  requiredFor: string[] // 哪些步骤需要使用
}

// 知识库文档初始配置（定义文档与步骤的映射关系）
const knowledgeBaseConfig: Omit<KnowledgeDoc, 'status'>[] = [
  { id: "industry-analysis", name: "行业目标分析报告", generatedBy: "P1", requiredFor: ["P2", "P3", "P4", "P5", "P6", "P7"] },
  { id: "depth-analysis", name: "行业认知深度分析", generatedBy: "P2", requiredFor: ["P3", "P4", "P5", "P6"] },
  { id: "emotion-map", name: "情绪价值点全景图", generatedBy: "P3", requiredFor: ["P7"] },
  { id: "ip-biography", name: "IP传记", generatedBy: "IP传记", requiredFor: ["P4", "P5", "P6", "P7"] },
  { id: "ip-concept", name: "IP概念", generatedBy: "P4", requiredFor: ["P5", "P6"] },
  { id: "ip-type-positioning", name: "IP类型定位报告", generatedBy: "P5", requiredFor: ["P6"] },
  { id: "4x4-plan", name: "4X4内容规划", generatedBy: "P6", requiredFor: ["P7"] },
  { id: "topic-library", name: "选题库", generatedBy: "P7", requiredFor: ["P8"] },
  { id: "script-draft", name: "脚本初稿", generatedBy: "P8", requiredFor: ["P9"] },
  { id: "optimized-script", name: "优化终稿", generatedBy: "P9", requiredFor: ["P10"] },
  { id: "iteration-feedback", name: "迭代反馈", generatedBy: "P10", requiredFor: ["P7", "P8", "P9"] },
]

// 3阶段工作流定义 - 基于双轨与4X4方法论优化
const workflowPhases = [
  {
    id: 1,
    name: "研究定位",
    subtitle: "首次必做，后续可更新",
    description: "深入了解行业、挖掘IP故事、分析情绪价值",
    color: "purple",
    icon: Target,
    isReusable: false,
    steps: [
      {
        id: "P1",
        title: "行业目标分析",
        description: "AI运用第一性原理分析行业，精准定位目标受众",
        icon: Target,
        features: ["市场规模分析", "竞争格局研究", "目标受众5A分析", "白痴指数评估"],
        output: "《行业目标分析报告》",
        estimatedTime: "15-30分钟",
        requiredPlan: "free",
        dependencies: [],
      },
      {
        id: "P2",
        title: "行业认知深度",
        description: "道法术器势框架，分析最佳内容切入点",
        icon: BarChart3,
        features: ["认知层次分析", "专栏策略建议", "内容难度评估", "平台匹配度"],
        output: "《行业认知深度分析报告》",
        estimatedTime: "10-20分钟",
        requiredPlan: "free",
        dependencies: ["P1"],
      },
      {
        id: "P3",
        title: "情绪价值分析",
        description: "穷举目标受众可能响应的所有情绪价值点",
        icon: Sparkles,
        features: ["行业特定情绪(50%)", "向上延展情绪(50%)", "五分制评分", "口播适应性"],
        output: "《情绪价值点全景图》",
        estimatedTime: "15-25分钟",
        requiredPlan: "basic",
        dependencies: ["P1", "P2"],
      },
      {
        id: "IP传记",
        title: "IP传记采访",
        description: "AI记者深度访谈，挖掘20+张力故事",
        icon: BookOpen,
        features: ["工作身份挖掘", "家庭身份挖掘", "社交身份挖掘", "自由身份挖掘"],
        output: "《IP传记》(2万字)",
        estimatedTime: "60-90分钟",
        requiredPlan: "basic",
        dependencies: [],
      },
    ]
  },
  {
    id: 2,
    name: "人设构建",
    subtitle: "首次必做，后续可调整",
    description: "确定IP概念、设定文风、规划内容矩阵",
    color: "blue",
    icon: User,
    isReusable: false,
    steps: [
      {
        id: "P4",
        title: "IP概念生成",
        description: "生成差异化IP定位、视觉锤、语言钉",
        icon: User,
        features: ["内核分析", "外在表现", "视觉锤设计", "口头语体系"],
        output: "《IP概念》",
        estimatedTime: "15-25分钟",
        requiredPlan: "basic",
        dependencies: ["P1", "IP传记"],
      },
      {
        id: "P5",
        title: "IP类型定位",
        description: "基于7大IP画布确定专业型/娱乐型/记者型定位",
        icon: PenTool,
        features: ["7大IP类型分析", "1主2副模型", "变现路径规划", "爆款方向建议"],
        output: "《IP类型定位报告》",
        estimatedTime: "15-25分钟",
        requiredPlan: "basic",
        dependencies: ["P4"],
      },
      {
        id: "P6",
        title: "4X4内容规划",
        description: "基于IP类型定位制定60期内容规划，匹配10种呈现形式",
        icon: Layers,
        features: ["60期内容规划", "10种呈现形式", "3个置顶视频", "黄金三秒开头"],
        output: "《4X4内容运营规划》",
        estimatedTime: "15-25分钟",
        requiredPlan: "pro",
        dependencies: ["P1", "P4", "P5"],
      },
    ]
  },
  {
    id: 3,
    name: "内容生产",
    subtitle: "循环复用，核心变现",
    description: "选题库生成 → 脚本创作 → 口语化优化 → 迭代管理",
    color: "emerald",
    icon: RefreshCw,
    isReusable: true,
    steps: [
      {
        id: "P7",
        title: "选题库生成",
        description: "整合热点引流、IP故事张力、行业正反观点三大选题来源",
        icon: Target,
        features: ["热点选题(50个)", "IP故事选题(20个)", "行业情绪选题(80个)", "TOP20推荐"],
        output: "《选题库》",
        estimatedTime: "15-25分钟",
        requiredPlan: "pro",
        dependencies: ["P1", "P3", "P6", "IP传记"],
        isLoop: true,
      },
      {
        id: "P8",
        title: "脚本创作中心",
        description: "多智能体选择，按选题类型匹配最优创作框架",
        icon: PenTool,
        features: ["深度共鸣(16框架)", "金句型(20人设)", "人生故事(4框架)", "促销/产品展示"],
        output: "脚本初稿",
        estimatedTime: "10-15分钟/条",
        requiredPlan: "pro",
        dependencies: ["P7"],
        isLoop: true,
      },
      {
        id: "P9",
        title: "口语化优化",
        description: "AI味检测+三步改写法，让文案读起来像真人分享",
        icon: MessageSquare,
        features: ["A/B/C级禁用词检测", "三步改写法", "朗读测试", "真实感检验"],
        output: "优化终稿",
        estimatedTime: "5-10分钟/条",
        requiredPlan: "pro",
        dependencies: ["P8"],
        isLoop: true,
      },
      {
        id: "P10",
        title: "迭代管理",
        description: "版本记录、日志保存、智能迭代建议",
        icon: RefreshCw,
        features: ["200字迭代日志", "版本对比", "一键回滚", "迭代建议"],
        output: "迭代管理报告",
        estimatedTime: "3-5分钟/条",
        requiredPlan: "pro",
        dependencies: ["P9"],
        isLoop: true,
      },
    ]
  },
]

// 会员等级对应关系
const planLabels: Record<string, { label: string; color: string }> = {
  free: { label: "体验版", color: "zinc" },
  basic: { label: "Plus", color: "blue" },
  pro: { label: "Pro", color: "purple" },
  vip: { label: "企业版", color: "amber" },
}

// 颜色变体 - Premium色调
const colorVariants: Record<string, { bg: string; border: string; text: string; glow: string; gradient: string }> = {
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-400",
    glow: "shadow-purple-500/20",
    gradient: "from-purple-500/20 to-purple-900/10"
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    glow: "shadow-blue-500/20",
    gradient: "from-blue-500/20 to-blue-900/10"
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    glow: "shadow-emerald-500/20",
    gradient: "from-emerald-500/20 to-emerald-900/10"
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    glow: "shadow-amber-500/20",
    gradient: "from-amber-500/20 to-amber-900/10"
  },
  zinc: {
    bg: "bg-white/[0.03]",
    border: "border-white/[0.08]",
    text: "text-zinc-500",
    glow: "shadow-white/5",
    gradient: "from-zinc-500/10 to-zinc-900/10"
  },
}

export default function WorkflowPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [expandedPhase, setExpandedPhase] = useState<number | null>(1)

  // 动态状态：从数据库获取
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 从用户 profile 获取会员等级，默认为 free
  // 开发环境下强制设为 vip，方便测试所有功能
  const currentPlan = process.env.NODE_ENV === 'development' ? 'vip' : (profile?.plan || "free")

  // 获取用户的完成状态
  useEffect(() => {
    const fetchProgress = async () => {
      if (!user) {
        setIsLoading(false)
        return
      }

      try {
        // 获取已完成的步骤（带超时和重试）
        const steps = await withRetry(
          () => getCompletedSteps(undefined, user?.id),
          {
            retries: 2,
            timeout: 10000,
            onRetry: (attempt, error) => {
              console.warn(`获取工作流进度失败，正在重试 (${attempt}/2)...`, error.message)
            }
          }
        )
        setCompletedSteps(steps)

        // 基于已完成步骤更新知识库状态
        const updatedKnowledgeBase = knowledgeBaseConfig.map(doc => ({
          ...doc,
          status: steps.includes(doc.generatedBy) ? "completed" as const : "pending" as const
        }))
        setKnowledgeBase(updatedKnowledgeBase)
      } catch (error) {
        console.error('Error fetching progress:', error)
        // 如果获取失败，使用默认空状态（降级处理）
        setCompletedSteps([])
        setKnowledgeBase(knowledgeBaseConfig.map(doc => ({
          ...doc,
          status: "pending" as const
        })))
      } finally {
        setIsLoading(false)
      }
    }

    fetchProgress()
  }, [user])

  // 检查步骤是否可用（基于会员等级）
  const isStepAvailable = (requiredPlan: string) => {
    const planOrder = ["free", "basic", "pro", "vip"]
    return planOrder.indexOf(currentPlan) >= planOrder.indexOf(requiredPlan)
  }

  // 检查步骤是否已完成
  const isStepCompleted = (stepId: string) => completedSteps.includes(stepId)

  // 检查步骤的依赖是否满足
  const areDependenciesMet = (dependencies: string[]) => {
    if (dependencies.length === 0) return true
    return dependencies.every(dep => completedSteps.includes(dep))
  }

  // 获取阶段完成度
  const getPhaseProgress = (phase: typeof workflowPhases[0]) => {
    const completed = phase.steps.filter(s => isStepCompleted(s.id)).length
    return { completed, total: phase.steps.length }
  }

  // 获取知识库文档状态
  const getDocStatus = (docId: string) => {
    return knowledgeBase.find(d => d.id === docId)?.status || "pending"
  }

  // 知识库完成度
  const kbCompleted = knowledgeBase.filter(d => d.status === "completed").length
  const kbTotal = knowledgeBase.length || knowledgeBaseConfig.length

  return (
    <div className="min-h-[100dvh]">
      <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "内容工坊" }]} />

      <main className="p-4 sm:p-6 lg:p-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight mb-2">IP内容工坊</h1>
            <p className="dark:text-zinc-400 text-zinc-500 text-sm">3阶段工作流：研究定位 → 人设构建 → 内容生产（循环复用）</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-600 uppercase tracking-wider">当前方案</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorVariants[planLabels[currentPlan].color].bg} ${colorVariants[planLabels[currentPlan].color].text} ${colorVariants[planLabels[currentPlan].color].border} border`}>
              {planLabels[currentPlan].label}
            </span>
          </div>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
            <Loader2 size={14} className="animate-spin text-purple-400" />
            正在同步工作流进度...
          </div>
        )}

        {/* 新手引导卡片 - 当没有完成任何步骤时显示（加载完成后） */}
        {!isLoading && completedSteps.length === 0 && (
          <GlassCard glow className="p-5 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-transparent to-blue-600/10" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/30">
                  <Sparkles size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold dark:text-white text-zinc-900 mb-1">从这里开始你的IP之旅</h2>
                  <p className="text-sm text-zinc-400">
                    新用户请先完成「<span className="text-purple-400 font-medium">行业目标分析</span>」，这是所有后续步骤的基础。
                    完成后会自动解锁下一步骤。
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setExpandedPhase(1)
                  setSelectedStep("P1")
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium text-sm hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/30 whitespace-nowrap"
              >
                <Target size={18} />
                开始行业分析
                <ArrowRight size={16} />
              </button>
            </div>
          </GlassCard>
        )}

        {/* 知识库状态卡片 */}
        <GlassCard className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-purple-400" />
              <h2 className="text-sm font-medium dark:text-white text-zinc-900">知识库状态</h2>
            </div>
            <span className="text-xs dark:text-zinc-400 text-zinc-500">{kbCompleted}/{kbTotal} 已完成</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {knowledgeBase.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                  doc.status === "completed"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : doc.status === "in_progress"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "dark:bg-zinc-900/50 bg-zinc-100 dark:border-white/10 border-black/10 text-zinc-500"
                }`}
              >
                {doc.status === "completed" ? (
                  <Check size={12} />
                ) : doc.status === "in_progress" ? (
                  <Clock size={12} />
                ) : (
                  <AlertCircle size={12} />
                )}
                <span className="text-xs font-medium">{doc.name}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* 3阶段工作流 - 垂直展示 */}
        <div className="space-y-6">
          {workflowPhases.map((phase) => {
            const colors = colorVariants[phase.color]
            const progress = getPhaseProgress(phase)
            const isExpanded = expandedPhase === phase.id

            return (
              <GlassCard key={phase.id} className="overflow-hidden">
                {/* 阶段头部 */}
                <button
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                  className={`w-full p-5 flex items-center justify-between transition-all ${
                    isExpanded ? `bg-gradient-to-br ${colors.gradient}` : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                      <phase.icon size={22} className={colors.text} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold uppercase tracking-wider ${colors.text}`}>
                          阶段 {phase.id}
                        </span>
                        {phase.isReusable && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <RefreshCw size={10} />
                            循环复用
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-medium dark:text-white text-zinc-900">{phase.name}</h3>
                      <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-0.5">{phase.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* 进度指示器 */}
                    <div className="hidden md:flex items-center gap-2">
                      <div className="w-24 h-1.5 dark:bg-white/[0.06] bg-black/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            phase.color === "purple" ? "bg-purple-500" :
                            phase.color === "blue" ? "bg-blue-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs dark:text-zinc-400 text-zinc-500 tabular-nums">{progress.completed}/{progress.total}</span>
                    </div>
                    <ChevronRight
                      size={20}
                      className={`text-zinc-500 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>

                {/* 展开的步骤列表 */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2">
                    <p className="text-xs dark:text-zinc-400 text-zinc-500 mb-4 pl-1">{phase.description}</p>
                    <div className={`grid ${phase.steps.length <= 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"} gap-3`}>
                      {phase.steps.map((step) => {
                        const isAvailable = isStepAvailable(step.requiredPlan)
                        const isCompleted = isStepCompleted(step.id)
                        const dependenciesMet = areDependenciesMet(step.dependencies)
                        const isSelected = selectedStep === step.id
                        const canEnter = isAvailable

                        return (
                          <div
                            key={step.id}
                            onClick={() => canEnter && setSelectedStep(isSelected ? null : step.id)}
                            className={`relative p-4 rounded-xl border transition-all duration-200 ${
                              isSelected
                                ? `bg-gradient-to-br ${colors.gradient} ${colors.border} border shadow-[0_0_20px_rgba(168,85,247,0.1)]`
                                : isCompleted
                                ? "bg-emerald-500/5 border-emerald-500/20"
                                : canEnter
                                ? `bg-zinc-900/30 border-white/10 hover:${colors.bg} hover:${colors.border} cursor-pointer`
                                : "bg-zinc-900/20 border-white/5 opacity-60"
                            }`}
                          >
                            {/* 锁定覆盖层 */}
                            {!isAvailable && (
                              <div className="absolute inset-0 dark:bg-black/50 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center pointer-events-none z-10">
                                <div className="flex flex-col items-center gap-1">
                                  <Lock size={18} className="text-zinc-600" />
                                  <span className="text-xs text-zinc-600 font-medium">需要{planLabels[step.requiredPlan].label}</span>
                                </div>
                              </div>
                            )}

                            {/* 依赖未满足提示 */}
                            {isAvailable && !dependenciesMet && (
                              <div className="absolute inset-0 dark:bg-black/40 bg-white/70 backdrop-blur-sm rounded-xl flex items-center justify-center pointer-events-none z-10">
                                <div className="flex flex-col items-center gap-1 px-2 text-center">
                                  <AlertCircle size={18} className="text-amber-500/60" />
                                  <span className="text-xs text-amber-500/80 font-medium">需先完成前置步骤</span>
                                </div>
                              </div>
                            )}

                            <div className="flex items-start justify-between mb-3">
                              <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                                <step.icon size={16} className={colors.text} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-zinc-600 font-semibold">{step.id}</span>
                                {isCompleted && (
                                  <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <Check size={10} className="text-white" />
                                  </div>
                                )}
                                {"isLoop" in step && step.isLoop && (
                                  <RefreshCw size={12} className="text-emerald-400" />
                                )}
                              </div>
                            </div>

                            <h4 className="text-base font-medium dark:text-white text-zinc-900 mb-1">{step.title}</h4>
                            <p className="text-sm dark:text-zinc-400 text-zinc-500 leading-relaxed mb-3 line-clamp-2">{step.description}</p>

                            {/* 输出文档 */}
                            <div className="flex items-center gap-1.5 text-xs dark:text-zinc-400 text-zinc-500 mb-2">
                              <FileText size={12} />
                              <span>{step.output}</span>
                            </div>

                            {/* 预计时间 */}
                            <div className="flex items-center gap-1.5 text-xs dark:text-zinc-400 text-zinc-500 mb-3">
                              <Clock size={12} />
                              <span>{step.estimatedTime}</span>
                            </div>

                            {/* 操作区域 */}
                            {canEnter && !isCompleted && (
                              <div className="mt-auto pt-3 border-t dark:border-white/10 border-black/10">
                                {isSelected ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      router.push(`/dashboard/workflow/${encodeURIComponent(step.id)}`)
                                    }}
                                    className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg ${colors.bg} ${colors.border} border ${colors.text} hover:opacity-80 transition-all text-xs font-medium`}
                                  >
                                    <Play size={14} />
                                    立即开始
                                  </button>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5 text-xs dark:text-zinc-400 text-zinc-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    点击选择此步骤
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 已完成状态 */}
                            {isCompleted && (
                              <div className="mt-auto pt-3 border-t border-emerald-500/20">
                                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400">
                                  <Check size={14} />
                                  已完成
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>


        {/* 使用建议 */}
        <GlassCard className="p-5 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={14} className="text-purple-400" />
            <h2 className="text-sm font-medium dark:text-white text-zinc-900">工作流说明</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs text-purple-400 font-bold">1</div>
                <span className="text-sm dark:text-white text-zinc-900 font-medium">研究定位</span>
              </div>
              <p className="text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed">首次使用需完成行业分析和IP传记，这是后续所有步骤的数据基础</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs text-blue-400 font-bold">2</div>
                <span className="text-sm dark:text-white text-zinc-900 font-medium">人设构建</span>
              </div>
              <p className="text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed">IP概念和4X4规划决定你的内容方向，60期规划是你的内容地图</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs text-emerald-400 font-bold">3</div>
                <span className="text-sm dark:text-white text-zinc-900 font-medium">内容生产</span>
              </div>
              <p className="text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed">选题库生成→脚本创作→口语化优化→迭代管理，循环复用的核心变现流程</p>
            </div>
          </div>
        </GlassCard>

        {/* 底部留白，防止固定栏遮挡内容 */}
        {selectedStep && <div className="h-24" />}
      </main>

      {/* 固定底部启动栏 */}
      {selectedStep && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pl-[84px]">
          <div className="dark:bg-zinc-900/98 bg-white/98 backdrop-blur-xl border-t border-purple-500/30 shadow-[0_-10px_60px_rgba(168,85,247,0.15)]">
            <div className="max-w-[1400px] mx-auto px-6 py-5">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                    {(() => {
                      const step = workflowPhases.flatMap(p => p.steps).find(s => s.id === selectedStep)
                      const StepIcon = step?.icon || Target
                      return <StepIcon size={22} className="text-purple-400" />
                    })()}
                  </div>
                  <div>
                    <p className="text-base font-medium dark:text-white text-zinc-900">
                      {workflowPhases.flatMap(p => p.steps).find(s => s.id === selectedStep)?.title}
                    </p>
                    <p className="text-sm text-zinc-400">
                      预计 {workflowPhases.flatMap(p => p.steps).find(s => s.id === selectedStep)?.estimatedTime}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedStep(null)}
                    className="px-5 py-2.5 text-sm text-zinc-400 dark:hover:text-white hover:text-zinc-900 transition-colors border dark:border-white/10 border-black/10 rounded-lg dark:hover:border-white/20 hover:border-black/20"
                  >
                    取消选择
                  </button>
                  <button
                    onClick={() => selectedStep && router.push(`/dashboard/workflow/${encodeURIComponent(selectedStep)}`)}
                    className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold text-base hover:from-purple-500 hover:to-purple-400 transition-all shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]"
                  >
                    <Play size={20} fill="currentColor" />
                    开始执行
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
