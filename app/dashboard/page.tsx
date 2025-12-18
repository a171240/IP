"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Bot, FileText, Layers, Loader2, Play, Sparkles, Users, Zap } from "lucide-react"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { useAuth } from "@/contexts/auth-context"
import { getCompletedSteps, getUserReportCount, getUserReportsPreview, type ReportPreview } from "@/lib/supabase"
import { withRetry } from "@/lib/utils/timeout"

type StepDefinition = {
  id: string
  phase: "研究定位" | "人设构建" | "内容生产"
  title: string
  summary: string
}

const WORKFLOW_STEPS: StepDefinition[] = [
  { id: "P1", phase: "研究定位", title: "行业目标分析", summary: "确定赛道、目标受众与可切入的内容机会。" },
  { id: "P2", phase: "研究定位", title: "行业认知深度", summary: "梳理认知层级与最佳内容切入点。" },
  { id: "P3", phase: "研究定位", title: "情绪价值分析", summary: "穷举目标受众的情绪触发点与表达方式。" },
  { id: "IP传记", phase: "研究定位", title: "IP传记采访", summary: "沉淀可复用的人物故事与张力素材库。" },
  { id: "P4", phase: "人设构建", title: "IP概念", summary: "输出差异化定位、表达锚点与人设框架。" },
  { id: "P5", phase: "人设构建", title: "IP类型定位", summary: "确定专业型/娱乐型/记者型定位，输出1主2副模型。" },
  { id: "P6", phase: "人设构建", title: "4X4内容规划", summary: "基于IP类型制定60期内容规划，匹配最佳呈现形式。" },
  { id: "P7", phase: "内容生产", title: "引流内容（50%）", summary: "用共鸣与冲突触达更广受众，拉高分发效率。" },
  { id: "P8", phase: "内容生产", title: "理性内容（30%）", summary: "用专业解释与方法论建立信任与记忆点。" },
  { id: "P9", phase: "内容生产", title: "产品内容（15%）", summary: "把价值与场景说清楚，引导转化动作。" },
  { id: "P10", phase: "内容生产", title: "情绪内容（5%）", summary: "用真实生活与价值观连接，拉近关系。" },
]

const planLabels: Record<string, string> = {
  free: "体验版",
  basic: "Plus",
  pro: "Pro",
  vip: "企业版",
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (hours < 1) return "刚刚"
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString("zh-CN")
}

function LoadingState() {
  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "主页" }]} />
      <div className="flex-1 flex items-center justify-center p-8">
        <GlassCard className="p-8 text-center">
          <Loader2 size={32} className="animate-spin text-purple-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium dark:text-white text-zinc-900 mb-2">正在加载工作台...</h2>
          <p className="text-sm dark:text-zinc-400 text-zinc-500">请稍候</p>
        </GlassCard>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [reportPreviews, setReportPreviews] = useState<ReportPreview[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setCompletedSteps([])
      setReportPreviews([])
      setReportCount(0)
      setIsLoading(false)
      return
    }

    const load = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const [done, userReports, reportTotal] = await Promise.all([
          withRetry(
            () => getCompletedSteps(undefined, user.id),
            {
              retries: 2,
              timeout: 10000,
              onRetry: (attempt, error) => {
                console.warn(`获取完成步骤失败，正在重试 (${attempt}/2)...`, error.message)
              }
            }
          ).catch(error => {
            console.error("获取完成步骤失败:", error)
            return []
          }),
          withRetry(
            () => getUserReportsPreview(undefined, 5, user.id),
            {
              retries: 2,
              timeout: 10000,
              onRetry: (attempt, error) => {
                console.warn(`获取报告列表失败，正在重试 (${attempt}/2)...`, error.message)
              }
            }
          ).catch(error => {
            console.error("获取报告列表失败:", error)
            return []
          }),
          withRetry(
            () => getUserReportCount(undefined, user.id),
            {
              retries: 2,
              timeout: 10000,
              onRetry: (attempt, error) => {
                console.warn(`获取报告统计失败，正在重试 (${attempt}/2)...`, error.message)
              }
            }
          ).catch(error => {
            console.error("获取报告统计失败:", error)
            return 0
          })
        ])

        setCompletedSteps(done)
        setReportPreviews(userReports)
        setReportCount(reportTotal)
      } catch (error) {
        console.error("Failed to load dashboard data:", error)
        setLoadError("工作台数据加载失败，请检查网络连接后重试")
      } finally {
        setIsLoading(false)
      }

    }

    load()
  }, [user, authLoading, reloadNonce])

  const workflowStepIdSet = useMemo(() => new Set(WORKFLOW_STEPS.map((s) => s.id)), [])

  const completedWorkflowStepSet = useMemo(() => {
    const set = new Set<string>()
    for (const stepId of completedSteps) {
      if (workflowStepIdSet.has(stepId)) set.add(stepId)
    }
    return set
  }, [completedSteps, workflowStepIdSet])

  const completedCount = completedWorkflowStepSet.size
  const totalCount = WORKFLOW_STEPS.length
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  const nextStep = useMemo(() => {
    return WORKFLOW_STEPS.find((s) => !completedWorkflowStepSet.has(s.id)) || null
  }, [completedWorkflowStepSet])

  const displayName =
    profile?.nickname ||
    (user?.email ? user.email.split("@")[0] : null) ||
    "你好"

  const isNewUser = completedCount === 0 && reportCount === 0

  const phaseStats = useMemo(() => {
    const byPhase: Record<StepDefinition["phase"], { done: number; total: number }> = {
      "研究定位": { done: 0, total: 0 },
      "人设构建": { done: 0, total: 0 },
      "内容生产": { done: 0, total: 0 },
    }

    for (const s of WORKFLOW_STEPS) {
      byPhase[s.phase].total += 1
      if (completedWorkflowStepSet.has(s.id)) byPhase[s.phase].done += 1
    }

    return byPhase
  }, [completedWorkflowStepSet])

  const latestReports = reportPreviews.slice(0, 5)

  if (authLoading || isLoading) {
    return <LoadingState />
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <Header breadcrumbs={[{ label: "主页" }]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <GlassCard className="p-8 text-center max-w-md">
            <h2 className="text-lg font-medium dark:text-white text-zinc-900 mb-2">未登录</h2>
            <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-5">请先登录后再进入工作台</p>
                        <GlowButton primary className="w-full" onClick={() => router.push("/auth/login")}>
              去登录
              <ArrowRight size={16} />
            </GlowButton>
          </GlassCard>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "主页" }]} />

      <main className="p-6 lg:p-8 space-y-6">
        <div className="grid lg:grid-cols-5 gap-6">
          <GlassCard className="lg:col-span-3 p-7 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-purple-600/10 to-transparent rounded-full blur-3xl" />

            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold dark:text-white text-zinc-900">内容交付工作台</h1>
                    {profile?.plan && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 font-semibold">
                        {planLabels[profile.plan] || profile.plan}
                      </span>
                    )}
                  </div>
                  <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-1">
                    把定位、选题、脚本与复盘沉淀成可复用资产，让团队交付有据可查。
                  </p>
                </div>

                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Sparkles size={14} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">欢迎，{displayName}</span>
                </div>
              </div>

              {loadError && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between gap-3">
                  <span className="min-w-0">{loadError}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/30 hover:text-purple-300 transition-colors"
                    onClick={() => setReloadNonce((n) => n + 1)}
                  >
                    重试
                  </button>
                </div>
              )}

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                  <p className="text-[10px] dark:text-zinc-400 text-zinc-500">工作流进度</p>
                  <p className="mt-1 text-lg font-bold dark:text-white text-zinc-900">
                    {completedCount}/{totalCount}
                  </p>
                </div>
                <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                  <p className="text-[10px] dark:text-zinc-400 text-zinc-500">已生成报告</p>
                  <p className="mt-1 text-lg font-bold dark:text-white text-zinc-900">{reportCount}</p>
                </div>
                <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                  <p className="text-[10px] dark:text-zinc-400 text-zinc-500">完成度</p>
                  <p className="mt-1 text-lg font-bold dark:text-white text-zinc-900">{progressPercent}%</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="w-full h-2 rounded-full dark:bg-zinc-800 bg-zinc-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-violet-600"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {(Object.keys(phaseStats) as Array<keyof typeof phaseStats>).map((phase) => (
                    <div
                      key={phase}
                      className="text-[10px] dark:text-zinc-400 text-zinc-500 flex items-center justify-between"
                    >
                      <span>{phase}</span>
                      <span className="text-zinc-600">{phaseStats[phase].done}/{phaseStats[phase].total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <GlowButton primary onClick={() => router.push("/dashboard/quick-start")}>
                  <Zap size={16} />
                  快速体验
                </GlowButton>
                <GlowButton onClick={() => router.push("/dashboard/workflow")}>
                  <Layers size={16} />
                  进入工坊
                </GlowButton>
                <GlowButton onClick={() => router.push("/dashboard/reports")}>
                  <FileText size={16} />
                  查看报告
                </GlowButton>
                <GlowButton onClick={() => router.push("/dashboard/profiles")}>
                  <Bot size={16} />
                  智能体库
                </GlowButton>
              </div>

              {isNewUser && (
                <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-transparent border border-amber-500/20">
                  <p className="text-sm dark:text-white text-zinc-900 font-medium">
                    建议从“快速体验”开始，把第一条脚本跑通；然后进入工坊从 P1 开始沉淀你的行业与人设资产。
                  </p>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1">
                    所有输出会自动进入“报告”，方便复用、交付与复盘。
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-2 p-7">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Play size={16} className="text-purple-400" />
                <h2 className="text-sm font-medium dark:text-white text-zinc-900">下一步</h2>
              </div>
              <Link
                href="/dashboard/workflow"
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
              >
                全部步骤
                <ArrowRight size={12} />
              </Link>
            </div>

            {nextStep ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">{nextStep.phase}</p>
                      <p className="mt-1 text-base font-semibold dark:text-white text-zinc-900 truncate">{nextStep.id} · {nextStep.title}</p>
                      <p className="mt-1 text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed">{nextStep.summary}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-zinc-500">当前完成度</p>
                      <p className="text-lg font-bold dark:text-white text-zinc-900">{progressPercent}%</p>
                    </div>
                  </div>
                </div>

                <GlowButton primary className="w-full" onClick={() => router.push(`/dashboard/workflow/${encodeURIComponent(nextStep.id)}`)}>
                  继续下一步
                  <ArrowRight size={16} />
                </GlowButton>

                <div className="text-[10px] dark:text-zinc-400 text-zinc-500">
                  不确定从哪里开始？建议按“研究定位 → 人设构建 → 内容生产”的顺序跑通一轮，再进入循环复用。
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                <p className="text-sm dark:text-white text-zinc-900 font-medium">你已完成全部步骤</p>
                <p className="mt-1 text-xs dark:text-zinc-400 text-zinc-500">
                  去“报告”回看资产，或进入“工坊”继续生成内容生产环节的脚本。
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <GlowButton onClick={() => router.push("/dashboard/reports")}>查看报告</GlowButton>
                  <GlowButton primary onClick={() => router.push("/dashboard/workflow")}>进入工坊</GlowButton>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium dark:text-white text-zinc-900">快捷入口</h2>
            <span className="text-xs dark:text-zinc-400 text-zinc-500">把常用动作放在一屏完成</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/dashboard/quick-start">
              <GlassCard hover className="p-4 h-full cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Zap size={20} className="text-white" />
                </div>
                <h3 className="text-sm font-medium dark:text-white text-zinc-900 mb-1">快速体验</h3>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">快速生成脚本草案，验证方向</p>
              </GlassCard>
            </Link>

            <Link href="/dashboard/workflow">
              <GlassCard hover className="p-4 h-full cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Layers size={20} className="text-white" />
                </div>
                <h3 className="text-sm font-medium dark:text-white text-zinc-900 mb-1">工坊</h3>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">按步骤输出研究、人设与规划</p>
              </GlassCard>
            </Link>

            <Link href="/dashboard/reports">
              <GlassCard hover className="p-4 h-full cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <FileText size={20} className="text-white" />
                </div>
                <h3 className="text-sm font-medium dark:text-white text-zinc-900 mb-1">报告</h3>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">沉淀可复用产物与交付记录</p>
              </GlassCard>
            </Link>

            <Link href="/dashboard/profiles">
              <GlassCard hover className="p-4 h-full cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Bot size={20} className="text-white" />
                </div>
                <h3 className="text-sm font-medium dark:text-white text-zinc-900 mb-1">智能体</h3>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">100+AI智能体与提示词库</p>
              </GlassCard>
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <GlassCard className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h2 className="text-sm font-medium dark:text-white text-zinc-900">最近输出</h2>
              </div>
              <Link href="/dashboard/reports" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                查看全部
              </Link>
            </div>

            {latestReports.length > 0 ? (
              <div className="space-y-2">
                {latestReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center gap-3 p-3 rounded-xl dark:bg-zinc-900/30 bg-zinc-50 border dark:border-white/5 border-black/5 hover:border-purple-500/20 transition-all cursor-pointer group"
                    onClick={() => router.push("/dashboard/reports")}
                  >
                    <div className="w-9 h-9 rounded-lg dark:bg-zinc-800/50 bg-zinc-200/50 flex items-center justify-center group-hover:bg-purple-500/10 transition-colors">
                      <FileText size={14} className="text-zinc-500 group-hover:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm dark:text-white text-zinc-900 truncate">{report.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
                          {report.step_id}
                        </span>
                        <span className="text-[10px] text-zinc-500">{formatRelativeTime(report.created_at)}</span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-purple-400" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-2xl dark:bg-zinc-900/30 bg-zinc-50 border dark:border-white/5 border-black/5">
                <p className="text-sm dark:text-white text-zinc-900 font-medium">还没有报告产物</p>
                <p className="mt-1 text-xs dark:text-zinc-400 text-zinc-500">
                  从 P1 开始输出第一份《行业目标分析》，你会更快进入可复用的交付节奏。
                </p>
                <div className="mt-4">
                  <GlowButton primary onClick={() => router.push("/dashboard/workflow/P1")}>
                    开始 P1
                    <ArrowRight size={16} />
                  </GlowButton>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={16} className="text-emerald-400" />
              <h2 className="text-sm font-medium dark:text-white text-zinc-900">交付口径</h2>
            </div>
            <div className="space-y-3 text-sm dark:text-zinc-300 text-zinc-700">
              <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                <p className="text-xs dark:text-zinc-400 text-zinc-500 mb-1">1) 研究定位</p>
                <p className="text-sm">先把行业与受众看清楚，再谈选题与脚本。</p>
              </div>
              <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                <p className="text-xs dark:text-zinc-400 text-zinc-500 mb-1">2) 人设构建</p>
                <p className="text-sm">把口吻、表达边界、差异点写成团队可复刻的规范。</p>
              </div>
              <div className="p-3 rounded-xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                <p className="text-xs dark:text-zinc-400 text-zinc-500 mb-1">3) 内容生产</p>
                <p className="text-sm">按 4X4 配比循环产出，用“报告”做复盘与迭代。</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}

