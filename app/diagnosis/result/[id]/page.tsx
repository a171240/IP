import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { calculatePercentile, DIMENSIONS } from '@/lib/diagnosis/scoring'
import { Dimension } from '@/lib/diagnosis/questions'
import { ResultClient } from './result-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ResultPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: result, error } = await supabase
    .from('diagnostic_results')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !result) {
    notFound()
  }

  // 构造 ScoreResult 对象
  const scoreResult = {
    total: result.total_score,
    level: result.level as 'excellent' | 'good' | 'pass' | 'needs_improvement',
    levelLabel: getLevelLabel(result.level),
    percentile: calculatePercentile(result.total_score),
    dimensions: result.scores as Record<Dimension, {
      score: number
      maxScore: number
      percentage: number
      status: 'strong' | 'normal' | 'weak'
      insight: string
    }>,
    insights: generateInsightsFromScores(result.scores),
    recommendations: result.recommendations || [],
    actionPlan: result.action_plan || []
  }

  return (
    <ResultClient
      result={scoreResult}
      industry={result.industry}
      createdAt={result.created_at}
      diagnosisId={id}
      answers={result.answers || {}}
      cachedAiReport={result.ai_report || null}
    />
  )
}

function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    pass: '及格',
    needs_improvement: '需改进'
  }
  return labels[level] || level
}

function generateInsightsFromScores(scores: Record<string, any>) {
  const insights: any[] = []

  Object.entries(scores).forEach(([key, dim]) => {
    if (dim.status === 'weak') {
      insights.push({
        dimension: key,
        title: `${DIMENSIONS[key as Dimension]?.name || key}需要重点改进`,
        description: dim.insight,
        severity: 'high'
      })
    } else if (dim.status === 'normal') {
      insights.push({
        dimension: key,
        title: `${DIMENSIONS[key as Dimension]?.name || key}有提升空间`,
        description: dim.insight,
        severity: 'medium'
      })
    }
  })

  return insights.slice(0, 3)
}
