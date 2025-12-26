import { Question, QUESTIONS, DIMENSIONS, Dimension } from './questions'

export interface ScoreResult {
  total: number
  level: 'excellent' | 'good' | 'pass' | 'needs_improvement'
  levelLabel: string
  percentile: number
  dimensions: Record<Dimension, DimensionScore>
  insights: Insight[]
  recommendations: Recommendation[]
  actionPlan: ActionPlanItem[]
}

export interface DimensionScore {
  score: number
  maxScore: number
  percentage: number
  status: 'strong' | 'normal' | 'weak'
  insight: string
}

export interface Insight {
  dimension: Dimension
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

export interface Recommendation {
  title: string
  description: string
  stepId: string
  agentId: string
  link: string
  priority: number
}

export interface ActionPlanItem {
  week: number
  title: string
  tasks: string[]
  stepIds: string[]
}

export function calculateScore(answers: Record<string, string | string[]>): ScoreResult {
  // 1. 按维度计算得分（跳过分类题 Q1）
  const dimensionScores: Record<Dimension, { weighted: number; totalWeight: number }> = {
    positioning: { weighted: 0, totalWeight: 0 },
    content: { weighted: 0, totalWeight: 0 },
    efficiency: { weighted: 0, totalWeight: 0 },
    emotion: { weighted: 0, totalWeight: 0 },
    conversion: { weighted: 0, totalWeight: 0 }
  }

  QUESTIONS.forEach(q => {
    // 跳过分类题（如 Q1 行业选择）
    if (q.isClassification || !q.dimension || !q.weight) return

    const answer = answers[q.id]
    if (!answer) return

    let score = 0
    if (q.type === 'multiple' && Array.isArray(answer)) {
      // 多选题：取最严重问题的分数（最低分）
      const selectedOptions = q.options.filter(o => answer.includes(o.value))
      if (selectedOptions.length > 0) {
        score = Math.min(...selectedOptions.map(o => o.score || 0))
      }
    } else {
      // 单选题：直接取分
      const selectedOption = q.options.find(o => o.value === answer)
      score = selectedOption?.score || 0
    }

    // 累加加权得分和权重总和（用于归一化）
    dimensionScores[q.dimension].weighted += score * q.weight
    dimensionScores[q.dimension].totalWeight += q.weight
  })

  // 2. 计算各维度最终得分（权重归一化）
  const dimensions: Record<Dimension, DimensionScore> = {} as Record<Dimension, DimensionScore>
  let totalScore = 0

  Object.entries(DIMENSIONS).forEach(([key, dim]) => {
    const { weighted, totalWeight } = dimensionScores[key as Dimension]
    // 归一化：加权得分 / 权重总和，得到 0-100 的分数
    const normalizedScore = totalWeight > 0 ? weighted / totalWeight : 0

    // 映射到维度最大分
    const scaledScore = Math.round((normalizedScore / 100) * dim.maxScore)
    totalScore += scaledScore

    const percentage = Math.round((scaledScore / dim.maxScore) * 100)
    let status: 'strong' | 'normal' | 'weak' = 'normal'
    let insight = ''

    if (percentage >= 80) {
      status = 'strong'
      insight = `你的${dim.name}表现优秀，继续保持`
    } else if (percentage >= 50) {
      status = 'normal'
      insight = `你的${dim.name}还有提升空间`
    } else {
      status = 'weak'
      insight = `你的${dim.name}是主要瓶颈，需要重点改进`
    }

    dimensions[key as Dimension] = {
      score: scaledScore,
      maxScore: dim.maxScore,
      percentage,
      status,
      insight
    }
  })

  // 3. 确定等级
  let level: ScoreResult['level']
  let levelLabel: string
  if (totalScore >= 85) {
    level = 'excellent'
    levelLabel = '优秀'
  } else if (totalScore >= 70) {
    level = 'good'
    levelLabel = '良好'
  } else if (totalScore >= 50) {
    level = 'pass'
    levelLabel = '及格'
  } else {
    level = 'needs_improvement'
    levelLabel = '需改进'
  }

  // 4. 生成洞察
  const insights = generateInsights(dimensions, answers)

  // 5. 生成推荐
  const recommendations = generateRecommendations(dimensions)

  // 6. 生成行动计划
  const actionPlan = generateActionPlan(dimensions, answers)

  // 7. 计算击败百分比（预估）
  const percentile = calculatePercentile(totalScore)

  return {
    total: totalScore,
    level,
    levelLabel,
    percentile,
    dimensions,
    insights,
    recommendations,
    actionPlan
  }
}

function generateInsights(
  dimensions: Record<Dimension, DimensionScore>,
  answers: Record<string, string | string[]>
): Insight[] {
  const insights: Insight[] = []

  // 找出最弱的维度
  const sortedDimensions = Object.entries(dimensions)
    .sort((a, b) => a[1].percentage - b[1].percentage)

  // 添加最弱维度的洞察
  sortedDimensions.slice(0, 3).forEach(([key, dim]) => {
    if (dim.status === 'weak') {
      insights.push({
        dimension: key as Dimension,
        title: `${DIMENSIONS[key as Dimension].name}需要重点改进`,
        description: getInsightDescription(key as Dimension, answers),
        severity: 'high'
      })
    } else if (dim.status === 'normal') {
      insights.push({
        dimension: key as Dimension,
        title: `${DIMENSIONS[key as Dimension].name}有提升空间`,
        description: getInsightDescription(key as Dimension, answers),
        severity: 'medium'
      })
    }
  })

  return insights
}

function getInsightDescription(dimension: Dimension, answers: Record<string, string | string[]>): string {
  const descriptions: Record<Dimension, string> = {
    positioning: '你的IP定位还不够清晰，缺乏差异化记忆点。建议使用P1-P5定位工作流，系统梳理你的IP人设。',
    content: '你的内容生产能力需要加强，选题和脚本创作效率较低。建议使用P7选题生成器和P8脚本中心提升效率。',
    efficiency: '你的内容生产效率较低，缺乏系统化的工作流程。建议使用P6规划工具建立稳定的内容节奏。',
    emotion: '你的内容缺乏情绪价值，难以引发用户共鸣。建议使用P3情绪分析工具挖掘情绪触点。',
    conversion: '你的内容转化能力较弱，流量难以变现。建议优化4X4内容配比，增加转化型内容占比。'
  }
  return descriptions[dimension]
}

function generateRecommendations(dimensions: Record<Dimension, DimensionScore>): Recommendation[] {
  const recommendations: Recommendation[] = []

  // 按得分从低到高排序，优先推荐弱项
  const sortedDimensions = Object.entries(dimensions)
    .sort((a, b) => a[1].percentage - b[1].percentage)

  sortedDimensions.forEach(([key, dim], index) => {
    if (dim.status === 'weak' || (dim.status === 'normal' && index < 2)) {
      const dimConfig = DIMENSIONS[key as Dimension]

      dimConfig.relatedSteps.forEach(step => {
        recommendations.push({
          title: getStepTitle(step),
          description: getStepDescription(step),
          stepId: step,
          agentId: dimConfig.agentIds[0],
          link: `/dashboard/workflow/${step.toLowerCase()}`,
          priority: dim.status === 'weak' ? 1 : 2
        })
      })
    }
  })

  return recommendations.slice(0, 5)
}

function getStepTitle(step: string): string {
  const titles: Record<string, string> = {
    'P1': '行业目标分析',
    'P2': '认知深度分析',
    'P3': '情绪价值分析',
    'P4': 'IP概念生成',
    'P5': 'IP类型定位',
    'P6': '4X4内容规划',
    'P7': '选题库生成',
    'P8': '脚本创作中心',
    'P9': '口语化优化',
    'P10': '迭代管理',
    'IP传记': 'IP传记采访',
    '4X4配比': '4X4内容配比',
    '转化内容': '转化型内容'
  }
  return titles[step] || step
}

function getStepDescription(step: string): string {
  const descriptions: Record<string, string> = {
    'P1': '使用第一性原理分析你的行业定位和目标受众',
    'P2': '从道法术器势五个层面深度分析行业认知',
    'P3': '挖掘所有情绪触点，建立情绪价值全景图',
    'P4': '生成差异化的IP视觉锤和语言钉',
    'P5': '基于7大IP画布确定你的IP类型定位',
    'P6': '制定60期内容规划，平衡4类内容配比',
    'P7': '一次生成150个多维度选题',
    'P8': '6种脚本框架，10分钟完成一条脚本',
    'P9': '消除AI痕迹，让脚本更自然口语化',
    'P10': '记录数据反馈，持续优化内容策略',
    'IP传记': '深度访谈挖掘20+张力故事素材',
    '4X4配比': '优化引流、理性、产品、情绪内容配比',
    '转化内容': '设计高转化率的内容结构'
  }
  return descriptions[step] || ''
}

function generateActionPlan(
  dimensions: Record<Dimension, DimensionScore>,
  answers: Record<string, string | string[]>
): ActionPlanItem[] {
  const plan: ActionPlanItem[] = []

  // 第1周：定位
  if (dimensions.positioning.status !== 'strong') {
    plan.push({
      week: 1,
      title: '完成IP定位',
      tasks: [
        '完成P1行业目标分析',
        '完成P2认知深度分析',
        '填写IP传记问卷',
        '生成IP概念方案'
      ],
      stepIds: ['P1', 'P2', 'IP传记', 'P4']
    })
  }

  // 第2周：选题
  plan.push({
    week: 2,
    title: '建立选题库',
    tasks: [
      '使用P7生成150个选题',
      '筛选出30个高优先级选题',
      '建立选题分类体系',
      '制定未来2周的发布计划'
    ],
    stepIds: ['P7', 'P6']
  })

  // 第3周：内容生产
  plan.push({
    week: 3,
    title: '批量生产脚本',
    tasks: [
      '每天使用P8生成3条脚本',
      '使用P9优化脚本口语化',
      '完成15条待发布内容储备',
      '建立脚本模板库'
    ],
    stepIds: ['P8', 'P9']
  })

  // 第4周：优化迭代
  plan.push({
    week: 4,
    title: '优化迭代',
    tasks: [
      '分析前3周内容数据',
      '识别高互动内容类型',
      '优化内容配比策略',
      '制定下月内容规划'
    ],
    stepIds: ['P10', 'P6']
  })

  return plan
}

export function calculatePercentile(score: number): number {
  // 基于正态分布预估击败百分比
  // 假设平均分60，标准差15
  const mean = 60
  const stdDev = 15
  const z = (score - mean) / stdDev

  // 简化的累积分布函数
  const percentile = Math.round((1 / (1 + Math.exp(-1.702 * z))) * 100)
  return Math.min(99, Math.max(1, percentile))
}

export { DIMENSIONS }
