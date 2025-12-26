import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 验证 ID 格式 (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: '无效的诊断ID' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('diagnostic_results')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: '未找到诊断结果' },
        { status: 404 }
      )
    }

    // 检查是否已过期
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { error: '诊断结果已过期' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        industry: data.industry,
        totalScore: data.total_score,
        level: data.level,
        scores: data.scores,
        recommendations: data.recommendations,
        actionPlan: data.action_plan,
        createdAt: data.created_at
      }
    })

  } catch (error) {
    console.error('Get diagnosis API error:', error)
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}
