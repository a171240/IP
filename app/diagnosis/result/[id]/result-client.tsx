'use client'

import { useRouter } from 'next/navigation'
import { GlassCard, GlowButton, Header } from '@/components/ui/obsidian'
import {
  Activity,
  ArrowRight,
  Download,
  Share2,
  RotateCcw,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Loader2
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { generateReportMarkdown, downloadMarkdown } from '@/lib/diagnosis/markdown-generator'
import { DIMENSIONS } from '@/lib/diagnosis/scoring'
import { Dimension } from '@/lib/diagnosis/questions'
import { AIReportDisplay, ExclusiveBenefitsCard, GrowthPathCard } from '@/components/diagnosis'
import { AIReport, parseAIReport } from '@/lib/diagnosis/ai-prompt'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts'

interface ResultClientProps {
  result: {
    total: number
    level: 'excellent' | 'good' | 'pass' | 'needs_improvement'
    levelLabel: string
    percentile: number
    dimensions: Record<Dimension, {
      score: number
      maxScore: number
      percentage: number
      status: 'strong' | 'normal' | 'weak'
      insight: string
    }>
    insights: any[]
    recommendations: string[]
    actionPlan: string[]
  }
  industry: string
  createdAt: string
  diagnosisId?: string
  answers?: Record<string, string | string[]>
  cachedAiReport?: AIReport | null
}

export function ResultClient({ result, industry, createdAt, diagnosisId, answers, cachedAiReport }: ResultClientProps) {
  const router = useRouter()
  const [shareSuccess, setShareSuccess] = useState(false)

  // AI 报告状态
  const [aiReport, setAiReport] = useState<AIReport | null>(cachedAiReport || null)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiStreamContent, setAiStreamContent] = useState('')
  const [thinkingContent, setThinkingContent] = useState('')
  const hasStartedGeneration = useRef(false)

  const levelConfig = {
    excellent: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    good: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    pass: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    needs_improvement: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' }
  }

  const radarData = Object.entries(result.dimensions).map(([key, dim]) => ({
    dimension: DIMENSIONS[key as Dimension]?.name || key,
    score: dim.percentage,
    fullMark: 100
  }))

  const handleDownloadMarkdown = () => {
    try {
      const markdown = generateReportMarkdown(result, industry, createdAt, aiReport)
      downloadMarkdown(markdown)
    } catch (error) {
      console.error('Markdown生成失败:', error)
      alert('下载失败，请重试')
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'IP内容健康度诊断报告',
          text: `我的IP内容健康度得分是${result.total}分，来测测你的吧！`,
          url
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('分享失败:', error)
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setShareSuccess(true)
        setTimeout(() => setShareSuccess(false), 2000)
      } catch (error) {
        console.error('复制链接失败:', error)
      }
    }
  }

  // 保存 AI 报告到数据库
  const saveAiReport = useCallback(async (report: AIReport) => {
    if (!diagnosisId) return
    try {
      await fetch('/api/diagnosis/generate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosisId, aiReport: report })
      })
    } catch (error) {
      console.error('保存AI报告失败:', error)
    }
  }, [diagnosisId])

  // 生成 AI 报告
  const handleGenerateAIReport = useCallback(async () => {
    if (isGeneratingAI) return

    setIsGeneratingAI(true)
    setAiError(null)
    setAiStreamContent('')
    setThinkingContent('')

    try {
      // 构建评分数据
      const scores: Record<string, { score: number; percentage: number; status: string }> = {}
      Object.entries(result.dimensions).forEach(([key, dim]) => {
        scores[key] = {
          score: dim.score,
          percentage: dim.percentage,
          status: dim.status
        }
      })

      const response = await fetch('/api/diagnosis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosisId,
          answers: answers || {},
          scores,
          totalScore: result.total,
          level: result.level,
          industry
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '生成失败')
      }

      // 处理流式响应
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let fullContent = ''
      let thinkingText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') {
            // 解析完整内容
            const parsed = parseAIReport(fullContent)
            if (parsed) {
              setAiReport(parsed)
              // 保存到数据库
              saveAiReport(parsed)
            } else {
              setAiError('AI报告格式解析失败，请重试')
            }
            break
          }

          try {
            const json = JSON.parse(data)
            // 处理思考内容
            if (json.reasoning) {
              thinkingText += json.reasoning
              setThinkingContent(thinkingText)
            }
            // 处理正常内容
            if (json.content) {
              fullContent += json.content
              setAiStreamContent(fullContent)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      console.error('AI报告生成失败:', error)
      setAiError(error instanceof Error ? error.message : '生成失败，请稍后重试')
    } finally {
      setIsGeneratingAI(false)
    }
  }, [isGeneratingAI, result, diagnosisId, answers, industry, saveAiReport])

  // 自动生成 AI 报告（只在没有缓存时）
  useEffect(() => {
    if (!cachedAiReport && !hasStartedGeneration.current) {
      hasStartedGeneration.current = true
      handleGenerateAIReport()
    }
  }, [cachedAiReport, handleGenerateAIReport])

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[
        { label: "主页", href: "/dashboard" },
        { label: "IP健康诊断", href: "/diagnosis" },
        { label: "诊断报告" }
      ]} />

      <main className="p-6 lg:p-8">
        <div id="report-content" className="max-w-4xl mx-auto space-y-6">
          {/* 总分卡片 */}
          <GlassCard className="p-8 relative overflow-hidden" glow>
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-emerald-600/10 to-transparent rounded-full blur-3xl" />
            <div className="relative text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-4">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold dark:text-white text-zinc-900 mb-2">
                你的IP内容诊断报告
              </h1>
              <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-6">
                生成于 {new Date(createdAt).toLocaleDateString('zh-CN')}
                {industry && ` · ${industry}行业`}
              </p>

              <div className="text-7xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2">
                {result.total}
              </div>
              <div className="text-lg dark:text-zinc-400 text-zinc-500 mb-3">
                综合健康度评分
              </div>

              <div className="flex items-center justify-center gap-4 mb-4">
                <span className={`px-4 py-1.5 rounded-full text-sm font-medium border ${levelConfig[result.level].bg} ${levelConfig[result.level].color}`}>
                  {result.levelLabel}
                </span>
              </div>

              <p className="text-sm dark:text-zinc-400 text-zinc-500">
                击败了约 <span className="font-bold text-emerald-400">{result.percentile}%</span> 的同行业账号
                <span className="text-xs dark:text-zinc-500 text-zinc-400 ml-1">（基于1,234份诊断数据）</span>
              </p>
            </div>
          </GlassCard>

          {/* 五维雷达图 */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">五维能力分析</h2>
            </div>

            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                  />
                  <Radar
                    name="得分"
                    dataKey="score"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* AI 深度分析 */}
          <GlassCard className="p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-600/10 to-transparent rounded-full blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-semibold dark:text-white text-zinc-900">AI 深度分析</h2>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    免费
                  </span>
                </div>
                {/* 重新生成按钮 */}
                {aiReport && !isGeneratingAI && (
                  <GlowButton onClick={handleGenerateAIReport} className="text-xs">
                    <RotateCcw className="w-3 h-3" />
                    重新生成
                  </GlowButton>
                )}
              </div>

              {/* 生成中状态 */}
              {isGeneratingAI && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    <span className="text-sm dark:text-zinc-300 text-zinc-600">
                      {thinkingContent ? 'AI 正在深度思考...' : 'AI 正在分析你的诊断数据...'}
                    </span>
                  </div>

                  {/* 思考过程显示 */}
                  {thinkingContent && (
                    <div className="p-4 rounded-xl dark:bg-purple-500/5 bg-purple-50 border dark:border-purple-500/20 border-purple-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-purple-400">思考过程</span>
                      </div>
                      <div className="max-h-40 overflow-auto">
                        <p className="text-xs dark:text-purple-300/70 text-purple-600/70 whitespace-pre-wrap leading-relaxed">
                          {thinkingContent}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 输出内容显示 - 隐藏原始JSON */}
                  {aiStreamContent && !thinkingContent && (
                    <div className="p-4 rounded-xl dark:bg-zinc-900/60 bg-zinc-50 border dark:border-white/5 border-zinc-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs dark:text-zinc-400 text-zinc-500">正在生成报告内容...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 错误状态 */}
              {aiError && !isGeneratingAI && (
                <div className="py-4">
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                    <p className="text-red-400 text-sm mb-3">{aiError}</p>
                    <GlowButton onClick={handleGenerateAIReport}>
                      <RotateCcw className="w-4 h-4" />
                      重新生成
                    </GlowButton>
                  </div>
                </div>
              )}

              {/* AI 报告内容 */}
              {aiReport && !isGeneratingAI && (
                <AIReportDisplay report={aiReport} />
              )}
            </div>
          </GlassCard>

          {/* 改进建议（仅在没有AI报告时显示） */}
          {!aiReport && result.insights.length > 0 && (
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-semibold dark:text-white text-zinc-900">重点改进建议</h2>
              </div>

              <div className="space-y-3">
                {result.insights.map((insight, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border ${
                      insight.severity === 'high'
                        ? 'dark:bg-red-500/5 bg-red-50 dark:border-red-500/20 border-red-200'
                        : 'dark:bg-yellow-500/5 bg-yellow-50 dark:border-yellow-500/20 border-yellow-200'
                    }`}
                  >
                    <h3 className={`font-medium mb-1 ${
                      insight.severity === 'high' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {insight.title}
                    </h3>
                    <p className="text-sm dark:text-zinc-400 text-zinc-500">
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        {/* 专属权益卡片 + 成长路径图 */}
        <div className="max-w-4xl mx-auto mt-6 grid md:grid-cols-2 gap-6">
          <ExclusiveBenefitsCard industry={industry} createdAt={createdAt} />
          <GrowthPathCard currentScore={result.total} level={result.level} />
        </div>

        {/* 操作按钮 */}
        <div className="max-w-4xl mx-auto mt-6">
          <GlassCard className="p-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <GlowButton
                primary
                onClick={handleDownloadMarkdown}
                className="w-full"
              >
                <Download className="w-4 h-4" />
                下载诊断报告
              </GlowButton>

              <GlowButton onClick={handleShare} className="w-full">
                <Share2 className="w-4 h-4" />
                {shareSuccess ? '已复制链接' : '分享结果'}
              </GlowButton>

              <GlowButton onClick={() => router.push('/diagnosis')} className="w-full">
                <RotateCcw className="w-4 h-4" />
                重新诊断
              </GlowButton>

              <GlowButton onClick={() => router.push('/dashboard/quick-start')} className="w-full">
                <ArrowRight className="w-4 h-4" />
                去快速体验
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  )
}
