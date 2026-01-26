import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DIMENSIONS } from '@/lib/diagnosis/scoring'
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

  let isPro = false
  let proExpiresAt: string | null = null
  let userId: string | null = null

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      userId = user.id
      const { data: profiles } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .limit(1)

      const plan = profiles?.[0]?.plan as string | undefined

      const { data: entitlements } = await supabase
        .from('entitlements')
        .select('plan, pro_expires_at')
        .eq('user_id', user.id)
        .limit(1)

      const entitlement = entitlements?.[0]
      proExpiresAt = entitlement?.pro_expires_at ?? null

      const now = new Date()
      if (proExpiresAt) {
        const expiry = new Date(proExpiresAt)
        if (expiry > now) {
          isPro = true
        }
      }

      if (plan === 'pro' || plan === 'vip' || plan === 'trial_pro') {
        isPro = true
      }
    }
  } catch {
    isPro = false
  }

  // 构造 ScoreResult 对象
  const scoreResult = {
    total: result.total_score,
    level: result.level as 'excellent' | 'good' | 'pass' | 'needs_improvement',
    levelLabel: getLevelLabel(result.level),
    dimensions: result.scores as Record<Dimension, {
      score: number
      maxScore: number
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
      isPro={isPro}
      proExpiresAt={proExpiresAt}
      userId={userId}
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

function generateInsightsFromScores(
  scores: Record<string, { status: 'strong' | 'normal' | 'weak'; insight: string }>
) {
  const insights: Array<{
    dimension: string
    title: string
    description: string
    severity: 'high' | 'medium'
  }> = []

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
