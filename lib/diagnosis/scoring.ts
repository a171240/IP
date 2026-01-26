import { QUESTIONS, DIMENSIONS, Dimension } from "./questions"

export interface ScoreResult {
  total: number
  level: "excellent" | "good" | "pass" | "needs_improvement"
  levelLabel: string
  dimensions: Record<Dimension, DimensionScore>
  insights: Insight[]
  recommendations: string[]
  actionPlan: string[]
  coreBottleneck: string
  topActions: string[]
}

export interface DimensionScore {
  score: number
  maxScore: number
  status: "strong" | "normal" | "weak"
  insight: string
}

export interface Insight {
  dimension: Dimension
  title: string
  description: string
  severity: "high" | "medium" | "low"
}

const PROBLEM_LABELS: Record<string, string> = {
  topic_system_missing: "选题体系缺失",
  calendar_blocked: "内容日历排不出来",
  script_slow: "脚本产出慢/质量不稳",
  qc_missing: "返工多口径乱（缺质检标准）",
  conversion_weak: "转化链路不清",
  archive_weak: "素材/知识不沉淀",
}

const PROBLEM_ACTIONS: Record<string, string> = {
  topic_system_missing: "先搭建选题体系，整理高意图场景清单",
  calendar_blocked: "先做 7 天内容日历，锁定节奏与负责人",
  script_slow: "固定 3 套脚本模板，减少反复沟通",
  qc_missing: "建立 10 项质检清单，减少返工",
  conversion_weak: "补齐成交链路，明确 CTA 与承接动作",
  archive_weak: "制定归档规则，保证素材可复用",
}

export function calculateScore(answers: Record<string, string | string[]>): ScoreResult {
  const dimensionScores: Record<Dimension, { weighted: number; totalWeight: number }> = {
    positioning: { weighted: 0, totalWeight: 0 },
    content: { weighted: 0, totalWeight: 0 },
    efficiency: { weighted: 0, totalWeight: 0 },
    emotion: { weighted: 0, totalWeight: 0 },
    conversion: { weighted: 0, totalWeight: 0 },
  }

  QUESTIONS.forEach((q) => {
    if (q.isClassification || !q.dimension) return

    const answer = answers[q.id]
    if (!answer) return

    let score = 0
    if (q.type === "multiple" && Array.isArray(answer)) {
      const selectedOptions = q.options.filter((o) => answer.includes(o.value))
      if (selectedOptions.length > 0) {
        score = Math.min(...selectedOptions.map((o) => o.score ?? 0))
      }
    } else {
      const selectedOption = q.options.find((o) => o.value === answer)
      score = selectedOption?.score ?? 0
    }

    const weight = q.weight ?? 1
    dimensionScores[q.dimension].weighted += score * weight
    dimensionScores[q.dimension].totalWeight += weight
  })

  const dimensions = {} as Record<Dimension, DimensionScore>
  let totalScore = 0

  Object.entries(DIMENSIONS).forEach(([key, dim]) => {
    const { weighted, totalWeight } = dimensionScores[key as Dimension]
    const avg = totalWeight > 0 ? weighted / totalWeight : 0
    const normalized = Math.max(0, Math.min(10, Math.round(avg)))
    totalScore += normalized

    let status: "strong" | "normal" | "weak" = "normal"
    if (normalized >= 8) status = "strong"
    else if (normalized < 5) status = "weak"

    const insight =
      status === "strong"
        ? `你的${dim.name}较为稳健`
        : status === "normal"
          ? `你的${dim.name}还有可优化空间`
          : `你的${dim.name}是当前主要瓶颈`

    dimensions[key as Dimension] = {
      score: normalized,
      maxScore: dim.maxScore,
      status,
      insight,
    }
  })

  const level = getLevelFromTotal(totalScore)
  const levelLabel = getLevelLabel(level)
  const insights = generateInsights(dimensions)

  const { coreBottleneck, topActions } = deriveBottleneckAndActions(answers, dimensions)

  return {
    total: totalScore,
    level,
    levelLabel,
    dimensions,
    insights,
    recommendations: topActions,
    actionPlan: [],
    coreBottleneck,
    topActions,
  }
}

function getLevelFromTotal(totalScore: number): ScoreResult["level"] {
  if (totalScore >= 42) return "excellent"
  if (totalScore >= 34) return "good"
  if (totalScore >= 26) return "pass"
  return "needs_improvement"
}

function getLevelLabel(level: ScoreResult["level"]): string {
  const labels: Record<ScoreResult["level"], string> = {
    excellent: "优秀",
    good: "良好",
    pass: "及格",
    needs_improvement: "需改进",
  }
  return labels[level]
}

function generateInsights(dimensions: Record<Dimension, DimensionScore>): Insight[] {
  const insights: Insight[] = []
  const sortedDimensions = Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)

  sortedDimensions.slice(0, 3).forEach(([key, dim]) => {
    if (dim.status === "weak") {
      insights.push({
        dimension: key as Dimension,
        title: `${DIMENSIONS[key as Dimension].name}需要补齐`,
        description: dim.insight,
        severity: "high",
      })
    } else if (dim.status === "normal") {
      insights.push({
        dimension: key as Dimension,
        title: `${DIMENSIONS[key as Dimension].name}可以提升`,
        description: dim.insight,
        severity: "medium",
      })
    }
  })

  return insights
}

function deriveBottleneckAndActions(
  answers: Record<string, string | string[]>,
  dimensions: Record<Dimension, DimensionScore>
) {
  const problems = Array.isArray(answers.current_problem) ? answers.current_problem : []
  const coreProblem = problems[0]
  const coreBottleneck =
    (coreProblem && PROBLEM_LABELS[coreProblem]) ||
    DIMENSIONS[getLowestDimension(dimensions)].name

  const actionCandidates = problems
    .map((problem) => PROBLEM_ACTIONS[problem])
    .filter(Boolean)

  const topActions = [...new Set(actionCandidates)]

  while (topActions.length < 3) {
    topActions.push(getFallbackAction(topActions.length))
  }

  return {
    coreBottleneck,
    topActions: topActions.slice(0, 3),
  }
}

function getLowestDimension(dimensions: Record<Dimension, DimensionScore>): Dimension {
  return Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)[0]?.[0] as Dimension
}

function getFallbackAction(index: number): string {
  const defaults = [
    "明确本周交付目标，拆成可执行动作",
    "为每个岗位定义交付口径与检查项",
    "安排一次复盘，沉淀可复用模板",
  ]
  return defaults[index] || defaults[defaults.length - 1]
}

export { DIMENSIONS }
