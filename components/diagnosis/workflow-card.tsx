'use client'

import { useRouter } from 'next/navigation'
import { GlassCard, GlowButton } from '@/components/ui/obsidian'
import { ArrowRight, Sparkles } from 'lucide-react'
import { WORKFLOW_STEPS } from '@/lib/diagnosis/ai-prompt'

interface WorkflowStep {
  stepId: string
  title: string
  reason: string
  priority: number
  estimatedTime?: string
  expectedROI?: string
  requiredPlan?: 'free' | 'plus' | 'pro'
}

interface WorkflowCardProps {
  steps: WorkflowStep[]
}

// 会员等级配置
const planConfig = {
  free: {
    label: '免费',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400'
  },
  plus: {
    label: 'Plus',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400'
  },
  pro: {
    label: 'Pro',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400'
  }
}

// 步骤对应的渐变色
const stepGradients: Record<string, string> = {
  'P1': 'from-blue-500 to-cyan-500',
  'P2': 'from-indigo-500 to-purple-500',
  'P3': 'from-pink-500 to-rose-500',
  'P4': 'from-emerald-500 to-teal-500',
  'P5': 'from-amber-500 to-orange-500',
  'P6': 'from-violet-500 to-purple-500',
  'P7': 'from-cyan-500 to-blue-500',
  'P8': 'from-rose-500 to-pink-500',
  'P9': 'from-lime-500 to-green-500',
  'P10': 'from-orange-500 to-red-500',
  'IP传记': 'from-fuchsia-500 to-pink-500'
}

// 步骤对应的路由
const stepRoutes: Record<string, string> = {
  'P1': '/dashboard/workflow/P1',
  'P2': '/dashboard/workflow/P2',
  'P3': '/dashboard/workflow/P3',
  'P4': '/dashboard/workflow/P4',
  'P5': '/dashboard/workflow/P5',
  'P6': '/dashboard/workflow/P6',
  'P7': '/dashboard/workflow/P7',
  'P8': '/dashboard/workflow/P8',
  'P9': '/dashboard/workflow/P9',
  'P10': '/dashboard/workflow/P10',
  'IP传记': '/dashboard/workflow/IP传记'
}

export function WorkflowCard({ steps }: WorkflowCardProps) {
  const router = useRouter()

  // 按优先级排序
  const sortedSteps = [...steps].sort((a, b) => a.priority - b.priority)

  return (
    <div className="space-y-3">
      {sortedSteps.map((step, index) => {
        const gradient = stepGradients[step.stepId] || 'from-gray-500 to-gray-600'
        const route = stepRoutes[step.stepId] || '/dashboard/workflow'
        const stepInfo = WORKFLOW_STEPS[step.stepId]

        const plan = step.requiredPlan || 'free'
        const planStyle = planConfig[plan]

        return (
          <div
            key={step.stepId}
            className="group p-4 rounded-xl dark:bg-zinc-900/60 bg-white border dark:border-white/5 border-zinc-200 hover:border-emerald-500/30 transition-all cursor-pointer"
            onClick={() => router.push(route)}
          >
            <div className="flex items-start gap-4">
              {/* 步骤图标 */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
                <span className="text-white font-bold text-sm">{step.stepId}</span>
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-semibold dark:text-white text-zinc-900">
                    {step.title || stepInfo?.title || step.stepId}
                  </h4>
                  {/* 会员等级标签 */}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${planStyle.bg} ${planStyle.text} border ${planStyle.border}`}>
                    {planStyle.label}
                  </span>
                  {index === 0 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      推荐优先
                    </span>
                  )}
                </div>
                <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-2 line-clamp-2">
                  {step.reason}
                </p>
                {/* 预计时间和预期收益 */}
                <div className="flex items-center gap-4 text-xs mb-2">
                  {step.estimatedTime && (
                    <span className="dark:text-zinc-500 text-zinc-400">
                      {step.estimatedTime}
                    </span>
                  )}
                  {step.expectedROI && (
                    <span className="text-emerald-400">
                      {step.expectedROI}
                    </span>
                  )}
                </div>
                <div className="flex items-center text-xs text-emerald-400 group-hover:translate-x-1 transition-transform">
                  <span>立即开始</span>
                  <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// AI 报告展示组件 - 支持成就-问题-机会三段论
interface AIReportDisplayProps {
  report: {
    summary: string
    // 成就/亮点（新增）
    achievements?: Array<{
      dimension: string
      title: string
      content: string
      percentile?: string
    }>
    insights: Array<{
      dimension: string
      title: string
      content: string
      severity: 'high' | 'medium' | 'low'
    }>
    recommendations: Array<{
      title: string
      content: string
      priority: number
    }>
    workflowSteps: Array<{
      stepId: string
      title: string
      reason: string
      priority: number
      estimatedTime?: string
      expectedROI?: string
      requiredPlan?: 'free' | 'plus' | 'pro'
    }>
  }
}

const severityConfig = {
  high: {
    bg: 'dark:bg-red-500/10 bg-red-50',
    border: 'dark:border-red-500/20 border-red-200',
    text: 'text-red-400'
  },
  medium: {
    bg: 'dark:bg-yellow-500/10 bg-yellow-50',
    border: 'dark:border-yellow-500/20 border-yellow-200',
    text: 'text-yellow-400'
  },
  low: {
    bg: 'dark:bg-blue-500/10 bg-blue-50',
    border: 'dark:border-blue-500/20 border-blue-200',
    text: 'text-blue-400'
  }
}

export function AIReportDisplay({ report }: AIReportDisplayProps) {
  return (
    <div className="space-y-6">
      {/* 一句话总结 */}
      <GlassCard className="p-6 relative overflow-hidden" glow>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-600/10 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold dark:text-white text-zinc-900 mb-2">AI 诊断总结</h3>
            <p className="text-lg dark:text-zinc-200 text-zinc-700">{report.summary}</p>
          </div>
        </div>
      </GlassCard>

      {/* 你的亮点（成就）- 先给正向反馈 */}
      {report.achievements && report.achievements.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500" />
            你的亮点
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              做得好
            </span>
          </h3>
          <div className="space-y-3">
            {report.achievements.map((achievement, index) => (
              <div
                key={index}
                className="p-4 rounded-xl border dark:bg-emerald-500/5 bg-emerald-50 dark:border-emerald-500/20 border-emerald-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-emerald-500">
                    {achievement.title}
                  </h4>
                  {achievement.percentile && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400">
                      {achievement.percentile}
                    </span>
                  )}
                </div>
                <p className="text-sm dark:text-zinc-300 text-zinc-600">
                  {achievement.content}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 需要改进（洞察）- 再指出问题 */}
      {report.insights.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500" />
            需要改进
          </h3>
          <div className="space-y-3">
            {report.insights.map((insight, index) => {
              const config = severityConfig[insight.severity]
              return (
                <div
                  key={index}
                  className={`p-4 rounded-xl border ${config.bg} ${config.border}`}
                >
                  <h4 className={`font-medium mb-2 ${config.text}`}>
                    {insight.title}
                  </h4>
                  <p className="text-sm dark:text-zinc-300 text-zinc-600">
                    {insight.content}
                  </p>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* 行动建议 */}
      {report.recommendations.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-500" />
            行动建议
          </h3>
          <div className="space-y-3">
            {report.recommendations
              .sort((a, b) => a.priority - b.priority)
              .map((rec, index) => (
                <div
                  key={index}
                  className="p-4 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-zinc-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-xs flex items-center justify-center font-bold">
                      {index + 1}
                    </span>
                    <h4 className="font-medium dark:text-white text-zinc-900">
                      {rec.title}
                    </h4>
                  </div>
                  <p className="text-sm dark:text-zinc-400 text-zinc-500 ml-8">
                    {rec.content}
                  </p>
                </div>
              ))}
          </div>
        </GlassCard>
      )}

      {/* 推荐工作流 */}
      {report.workflowSteps.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-purple-500 to-violet-500" />
            推荐工作流
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              一键直达
            </span>
          </h3>
          <WorkflowCard steps={report.workflowSteps} />
        </GlassCard>
      )}
    </div>
  )
}

// 专属权益卡片组件
interface ExclusiveBenefitsCardProps {
  industry: string
  createdAt: string
}

export function ExclusiveBenefitsCard({ industry, createdAt }: ExclusiveBenefitsCardProps) {
  const router = useRouter()

  // 计算权益过期时间（24小时内有效）
  const expiresAt = new Date(createdAt)
  expiresAt.setHours(expiresAt.getHours() + 24)
  const isExpired = new Date() > expiresAt

  const benefits = [
    {
      id: 'p1p2',
      title: '免费体验P1-P2行业分析',
      description: '第一性原理分析你的行业，定位目标受众',
      value: '¥99',
      unlocked: true,
      route: '/dashboard/workflow/P1'
    },
    {
      id: 'topics',
      title: `${industry || '行业'}选题参考包`,
      description: '10个精选选题，助你快速起步',
      value: '¥49',
      unlocked: true,
      route: '/dashboard/quick-start'
    },
    {
      id: 'consult',
      title: '1对1诊断解读',
      description: '资深顾问解读你的诊断报告',
      value: '¥299',
      unlocked: false,
      limited: true,
      remaining: 3,
      route: '/pricing'
    }
  ]

  return (
    <GlassCard className="p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-600/10 to-transparent rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold dark:text-white text-zinc-900 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500" />
            你的专属权益
          </h3>
          {!isExpired && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              24小时内有效
            </span>
          )}
        </div>

        <div className="space-y-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.id}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                benefit.unlocked
                  ? 'dark:bg-emerald-500/5 bg-emerald-50 dark:border-emerald-500/20 border-emerald-200 hover:border-emerald-500/40'
                  : 'dark:bg-zinc-900/40 bg-zinc-50 dark:border-white/5 border-zinc-200 hover:border-amber-500/40'
              }`}
              onClick={() => router.push(benefit.route)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {benefit.unlocked ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400">
                        已解锁
                      </span>
                    ) : benefit.limited ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                        限量 · 仅剩{benefit.remaining}个
                      </span>
                    ) : null}
                    <span className="text-xs dark:text-zinc-500 text-zinc-400 line-through">
                      价值{benefit.value}
                    </span>
                  </div>
                  <h4 className="font-medium dark:text-white text-zinc-900 mb-1">
                    {benefit.title}
                  </h4>
                  <p className="text-sm dark:text-zinc-400 text-zinc-500">
                    {benefit.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 dark:text-zinc-500 text-zinc-400 flex-shrink-0 mt-1" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => router.push('/dashboard/quick-start')}
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            立即领取全部权益 →
          </button>
        </div>
      </div>
    </GlassCard>
  )
}

// 成长路径图组件
interface GrowthPathCardProps {
  currentScore: number
  level: string
}

export function GrowthPathCard({ currentScore, level }: GrowthPathCardProps) {
  const router = useRouter()

  // 成长阶段定义
  const stages = [
    {
      name: '当前',
      scoreRange: `${currentScore}分`,
      steps: [],
      plan: 'current',
      isCurrent: true
    },
    {
      name: '定位清晰',
      scoreRange: '→ 80分',
      targetScore: 80,
      steps: ['P1', 'P2'],
      plan: 'free',
      description: '完成行业分析和认知深度分析'
    },
    {
      name: '人设完善',
      scoreRange: '→ 88分',
      targetScore: 88,
      steps: ['P3', 'P4', 'P5'],
      plan: 'plus',
      description: '构建情绪价值和IP人设'
    },
    {
      name: '内容高产',
      scoreRange: '→ 95分',
      targetScore: 95,
      steps: ['P6', 'P7', 'P8', 'P9', 'P10'],
      plan: 'pro',
      description: '解锁完整内容生产系统'
    }
  ]

  // 找到用户当前应该关注的阶段
  const currentStageIndex = stages.findIndex(s =>
    s.targetScore && currentScore < s.targetScore
  )

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
        <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-cyan-500 to-blue-500" />
        你的成长路径
      </h3>

      <div className="relative">
        {/* 连接线 */}
        <div className="absolute left-4 top-8 bottom-8 w-0.5 dark:bg-zinc-700 bg-zinc-300" />

        <div className="space-y-4">
          {stages.map((stage, index) => {
            const isActive = index === currentStageIndex
            const isPast = currentStageIndex > index || stage.isCurrent
            const planColors = {
              current: 'from-emerald-500 to-teal-500',
              free: 'from-emerald-500 to-teal-500',
              plus: 'from-blue-500 to-cyan-500',
              pro: 'from-purple-500 to-violet-500'
            }
            const planLabels = {
              current: '',
              free: '免费',
              plus: 'Plus ¥199/月',
              pro: 'Pro ¥599/月'
            }

            return (
              <div key={index} className="relative flex items-start gap-4">
                {/* 节点 */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                  stage.isCurrent
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                    : isPast
                      ? 'bg-emerald-500/20 border-2 border-emerald-500'
                      : isActive
                        ? `bg-gradient-to-br ${planColors[stage.plan as keyof typeof planColors]}`
                        : 'dark:bg-zinc-800 bg-zinc-200'
                }`}>
                  {stage.isCurrent && (
                    <span className="text-white text-xs font-bold">{currentScore}</span>
                  )}
                  {!stage.isCurrent && isPast && (
                    <span className="text-emerald-500 text-xs">✓</span>
                  )}
                </div>

                {/* 内容 */}
                <div className={`flex-1 pb-4 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium ${
                      stage.isCurrent || isActive
                        ? 'dark:text-white text-zinc-900'
                        : 'dark:text-zinc-400 text-zinc-500'
                    }`}>
                      {stage.name}
                    </span>
                    <span className="text-sm dark:text-zinc-500 text-zinc-400">
                      {stage.scoreRange}
                    </span>
                    {stage.plan !== 'current' && planLabels[stage.plan as keyof typeof planLabels] && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        stage.plan === 'free'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : stage.plan === 'plus'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}>
                        {planLabels[stage.plan as keyof typeof planLabels]}
                      </span>
                    )}
                  </div>
                  {stage.description && (
                    <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-2">
                      {stage.description}
                    </p>
                  )}
                  {stage.steps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {stage.steps.map(step => (
                        <span
                          key={step}
                          className="px-2 py-0.5 text-xs rounded dark:bg-zinc-800 bg-zinc-200 dark:text-zinc-400 text-zinc-500"
                        >
                          {step}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t dark:border-white/5 border-zinc-200">
        <button
          onClick={() => router.push('/dashboard/workflow')}
          className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          查看完整成长计划
        </button>
      </div>
    </GlassCard>
  )
}
