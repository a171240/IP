import { DIMENSIONS } from './scoring'
import { Dimension } from './questions'
import { AIReport, WORKFLOW_STEPS } from './ai-prompt'

interface DiagnosisResult {
  total: number
  level: 'excellent' | 'good' | 'pass' | 'needs_improvement'
  levelLabel: string
  dimensions: Record<Dimension, {
    score: number
    maxScore: number
    status: 'strong' | 'normal' | 'weak'
    insight: string
  }>
  insights: any[]
}

const LEVEL_EMOJIS: Record<string, string> = {
  excellent: '🏆',
  good: '✨',
  pass: '📈',
  needs_improvement: '🚀'
}

const SEVERITY_LABELS: Record<string, string> = {
  high: '🔴 高优先级',
  medium: '🟡 中优先级',
  low: '🟢 低优先级'
}

const PLAN_LABELS: Record<string, string> = {
  free: '免费',
  plus: 'Plus会员',
  pro: 'Pro会员'
}

/**
 * 生成诊断报告的 Markdown 格式
 */
export function generateReportMarkdown(
  result: DiagnosisResult,
  industry: string,
  createdAt: string,
  aiReport?: AIReport | null
): string {
  const date = new Date(createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const lines: string[] = []

  // 标题
  lines.push('# IP内容健康诊断报告')
  lines.push('')
  lines.push(`> 生成日期：${date}`)
  if (industry) {
    lines.push(`> 所属行业：${industry}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // 总分概览
  lines.push('## 📊 诊断概览')
  lines.push('')
  lines.push(`### 综合评分：${result.total} 分 ${LEVEL_EMOJIS[result.level]}`)
  lines.push('')
  lines.push(`**等级评定**：${result.levelLabel}`)
  lines.push('')

  // 五维能力概览
  lines.push('### 五维能力一览')
  lines.push('')
  lines.push('| 维度 | 得分 | 状态 |')
  lines.push('|------|------|------|')

  Object.entries(result.dimensions).forEach(([key, dim]) => {
    const dimName = DIMENSIONS[key as Dimension]?.name || key
    const statusText = dim.status === 'strong' ? '✅ 优势' :
                       dim.status === 'weak' ? '⚠️ 待改进' : '➖ 正常'
    lines.push(`| ${dimName} | ${dim.score}/10 | ${statusText} |`)
  })
  lines.push('')

  // AI 深度分析
  if (aiReport) {
    lines.push('---')
    lines.push('')
    lines.push('## 🤖 AI 深度分析')
    lines.push('')

    // 总结
    lines.push('### 诊断总结')
    lines.push('')
    lines.push(`> ${aiReport.summary}`)
    lines.push('')

    // 你的亮点
    if (aiReport.achievements && aiReport.achievements.length > 0) {
      lines.push('### 🌟 你的亮点')
      lines.push('')
      lines.push('以下是你在内容创作中表现出色的地方：')
      lines.push('')

      aiReport.achievements.forEach((achievement, index) => {
        const dimName = DIMENSIONS[achievement.dimension]?.name || achievement.dimension
        lines.push(`#### ${index + 1}. ${achievement.title}`)
        lines.push('')
        lines.push(`**所属维度**：${dimName}`)
        lines.push('')
        lines.push(achievement.content)
        lines.push('')
      })
    }

    // 需要改进
    if (aiReport.insights && aiReport.insights.length > 0) {
      lines.push('### ⚡ 需要改进')
      lines.push('')
      lines.push('以下是当前影响你内容效果的主要问题：')
      lines.push('')

      aiReport.insights.forEach((insight, index) => {
        const dimName = DIMENSIONS[insight.dimension]?.name || insight.dimension
        const severityLabel = SEVERITY_LABELS[insight.severity] || insight.severity
        lines.push(`#### ${index + 1}. ${insight.title}`)
        lines.push('')
        lines.push(`**所属维度**：${dimName} | **优先级**：${severityLabel}`)
        lines.push('')
        lines.push(insight.content)
        lines.push('')
      })
    }

    // 行动建议
    if (aiReport.recommendations && aiReport.recommendations.length > 0) {
      lines.push('### 📋 行动建议')
      lines.push('')
      lines.push('根据你的诊断结果，我们建议你按以下优先级执行：')
      lines.push('')

      const sortedRecs = [...aiReport.recommendations].sort((a, b) => a.priority - b.priority)
      sortedRecs.forEach((rec, index) => {
        lines.push(`#### 建议 ${index + 1}：${rec.title}`)
        lines.push('')
        lines.push(rec.content)
        lines.push('')
      })
    }

    // 推荐工作流
    if (aiReport.workflowSteps && aiReport.workflowSteps.length > 0) {
      lines.push('### 🛠️ 推荐工作流')
      lines.push('')
      lines.push('以下工作流可以帮助你系统性地解决上述问题：')
      lines.push('')

      const sortedSteps = [...aiReport.workflowSteps].sort((a, b) => a.priority - b.priority)
      sortedSteps.forEach((step, index) => {
        const stepInfo = WORKFLOW_STEPS[step.stepId]
        const planLabel = PLAN_LABELS[step.requiredPlan || 'free'] || step.requiredPlan

        lines.push(`#### ${index + 1}. ${step.stepId}：${step.title}`)
        lines.push('')
        lines.push(`| 属性 | 值 |`)
        lines.push(`|------|------|`)
        lines.push(`| 会员等级 | ${planLabel} |`)
        if (step.estimatedTime) {
          lines.push(`| 预计时间 | ${step.estimatedTime} |`)
        }
        if (step.expectedROI) {
          lines.push(`| 预期收益 | ${step.expectedROI} |`)
        }
        lines.push('')
        lines.push('**推荐理由**：')
        lines.push('')
        lines.push(step.reason)
        lines.push('')
      })
    }
  }

  // 五维详细分析
  lines.push('---')
  lines.push('')
  lines.push('## 📈 五维能力详情')
  lines.push('')

  Object.entries(result.dimensions).forEach(([key, dim]) => {
    const dimInfo = DIMENSIONS[key as Dimension]
    const dimName = dimInfo?.name || key
    const statusText = dim.status === 'strong' ? '✅ 优势维度' :
                       dim.status === 'weak' ? '⚠️ 待改进维度' : '➖ 正常维度'

    lines.push(`### ${dimName}`)
    lines.push('')
    lines.push(`**得分**：${dim.score}/10 | **状态**：${statusText}`)
    lines.push('')
    if (dimInfo?.description) {
      lines.push(`**说明**：${dimInfo.description}`)
      lines.push('')
    }
    lines.push(`**诊断洞察**：${dim.insight}`)
    lines.push('')
  })

  // 页脚
  lines.push('---')
  lines.push('')
  lines.push('*本报告由 IP内容工厂 AI 自动生成*')
  lines.push('')
  lines.push(`*生成时间：${new Date().toLocaleString('zh-CN')}*`)

  return lines.join('\n')
}

/**
 * 下载 Markdown 文件
 */
export function downloadMarkdown(content: string, filename?: string): void {
  const defaultFilename = `IP诊断报告_${new Date().toISOString().split('T')[0]}.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || defaultFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
