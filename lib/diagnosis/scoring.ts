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

const DIMENSION_BOTTLENECKS: Record<Dimension, string> = {
  positioning: "交付定位不清晰，导致内容方向反复",
  content: "内容供给不足，选题与脚本无法稳定产出",
  efficiency: "排产节奏不稳，团队协作效率偏低",
  emotion: "质检复盘薄弱，交付质量不稳定",
  conversion: "成交路径不清，内容承接弱",
}

const DIMENSION_ACTIONS: Record<Dimension, string[]> = {
  positioning: ["统一口径与风格规范", "明确团队角色与交付边界", "绑定核心成交场景"],
  content: ["建立可复用选题库", "固定7天排产节奏", "脚本模板化输出"],
  efficiency: ["锁定每周排产节奏", "明确责任人+交付口径", "每周复盘输出清单"],
  emotion: ["建立发布质检清单", "脚本多轮审核机制", "发布后复盘归档"],
  conversion: ["明确成交路径与承接动作", "CTA统一成一句话", "提升成交型内容占比"],
}

const PROBLEM_SCORE_ADJUSTMENTS: Record<string, Partial<Record<Dimension, number>>> = {
  topic_system_missing: { content: -3 },
  calendar_blocked: { content: -2, efficiency: -1 },
  script_slow: { efficiency: -2, content: -1 },
  qc_missing: { emotion: -3, efficiency: -1 },
  conversion_unclear: { conversion: -3 },
  archive_weak: { content: -1, efficiency: -1 },
}

function deriveScoresFromProblems(answers: Record<string, string | string[]>): Partial<Record<Dimension, number>> {
  const problems = answers.current_problem
  if (!problems) return {}
  const list = Array.isArray(problems) ? problems : [problems]
  if (!list.length) return {}

  const base: Record<Dimension, number> = {
    positioning: 7,
    content: 7,
    efficiency: 7,
    emotion: 7,
    conversion: 7,
  }

  list.forEach((problem) => {
    const adjustment = PROBLEM_SCORE_ADJUSTMENTS[problem]
    if (!adjustment) return
    ;(Object.keys(adjustment) as Dimension[]).forEach((dimension) => {
      base[dimension] += adjustment[dimension] ?? 0
    })
  })

  ;(Object.keys(base) as Dimension[]).forEach((dimension) => {
    base[dimension] = Math.max(3, Math.min(9, Math.round(base[dimension])))
  })

  return base
}

export function calculateScore(answers: Record<string, string | string[]>): ScoreResult {
  const dimensionScores: Record<Dimension, { weighted: number; totalWeight: number }> = {
    positioning: { weighted: 0, totalWeight: 0 },
    content: { weighted: 0, totalWeight: 0 },
    efficiency: { weighted: 0, totalWeight: 0 },
    emotion: { weighted: 0, totalWeight: 0 },
    conversion: { weighted: 0, totalWeight: 0 },
  }

  QUESTIONS.forEach((question) => {
    if (question.isClassification || !question.dimension) return

    const answer = answers[question.id]
    if (!answer) return

    let score = 0
    if (question.type === "multiple" && Array.isArray(answer)) {
      const selectedOptions = (question.options || []).filter((option) => answer.includes(option.value))
      if (selectedOptions.length > 0) {
        score = Math.min(...selectedOptions.map((option) => option.score ?? 0))
      }
    } else {
      const selectedOption = (question.options || []).find((option) => option.value === answer)
      score = selectedOption?.score ?? 0
    }

    const weight = question.weight ?? 1
    dimensionScores[question.dimension].weighted += score * weight
    dimensionScores[question.dimension].totalWeight += weight
  })

  const dimensions = {} as Record<Dimension, DimensionScore>
  let totalScore = 0

  const derivedScores = deriveScoresFromProblems(answers)

  Object.entries(DIMENSIONS).forEach(([key, dim]) => {
    const { weighted, totalWeight } = dimensionScores[key as Dimension]
    const fallback = derivedScores[key as Dimension] ?? 6
    const avg = totalWeight > 0 ? weighted / totalWeight : fallback
    const normalized = Math.max(1, Math.min(10, Math.round(avg)))
    totalScore += normalized

    let status: "strong" | "normal" | "weak" = "normal"
    if (normalized >= 8) status = "strong"
    else if (normalized < 5) status = "weak"

    const insight =
      status === "strong"
        ? `你的${dim.name}表现稳定，可复制扩展`
        : status === "normal"
          ? `你的${dim.name}仍有提升空间`
          : `你的${dim.name}是当前主要短板`

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

  const lowestDimension = getLowestDimension(dimensions)
  const coreBottleneck = DIMENSION_BOTTLENECKS[lowestDimension]

  const topActions = [
    ...new Set([
      ...DIMENSION_ACTIONS[lowestDimension],
      ...DIMENSION_ACTIONS[getSecondLowestDimension(dimensions, lowestDimension)],
    ]),
  ].slice(0, 3)

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
    needs_improvement: "待提升",
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
        title: `${DIMENSIONS[key as Dimension].name}可继续提升`,
        description: dim.insight,
        severity: "medium",
      })
    }
  })

  return insights
}

function getLowestDimension(dimensions: Record<Dimension, DimensionScore>): Dimension {
  return Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)[0]?.[0] as Dimension
}

function getSecondLowestDimension(
  dimensions: Record<Dimension, DimensionScore>,
  lowest: Dimension
): Dimension {
  const sorted = Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)
  const second = sorted.find(([key]) => key !== lowest)?.[0]
  return (second || lowest) as Dimension
}

export { DIMENSIONS }
