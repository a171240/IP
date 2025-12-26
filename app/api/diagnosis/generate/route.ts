import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Dimension } from '@/lib/diagnosis/questions'
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  buildUserPrompt,
  parseAIReport
} from '@/lib/diagnosis/ai-prompt'

// APIMart 配置 - 使用快速模型
const APIMART_API_KEY = process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY
const APIMART_BASE_URL = process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || 'https://api.apimart.ai/v1'
const APIMART_MODEL = process.env.APIMART_QUICK_MODEL || 'kimi-k2-thinking-turbo'

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { diagnosisId, answers, scores, totalScore, level, industry } = body

    // 验证必要参数
    if (!answers || !scores || totalScore === undefined || !level) {
      return jsonError(400, '缺少必要的诊断数据')
    }

    // 检查 API 配置
    if (!APIMART_API_KEY || APIMART_API_KEY === 'your-api-key-here') {
      return jsonError(500, '请在 .env.local 中配置 APIMART_API_KEY')
    }

    // 构建消息
    const systemPrompt = DIAGNOSIS_SYSTEM_PROMPT
    const userPrompt = buildUserPrompt(
      answers,
      scores as Record<Dimension, { score: number; percentage: number; status: string }>,
      totalScore,
      level,
      industry || ''
    )

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    // 调用 APIMart API
    const upstream = await fetch(`${APIMART_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIMART_API_KEY}`,
      },
      body: JSON.stringify({
        model: APIMART_MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
      }),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text()
      console.error('APIMart API Error:', errorText)
      return jsonError(upstream.status, `AI 服务错误: ${upstream.status}`)
    }

    // 流式转换
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            return
          }

          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta

            // 处理 reasoning_content（思考过程）
            const reasoning = delta?.reasoning_content
            if (reasoning) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoning })}\n\n`))
            }

            // 处理正常内容
            const content = delta?.content
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          } catch {
            // 忽略解析错误（部分块）
          }
        }
      },
    })

    return new Response(upstream.body?.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Diagnosis Generate API Error:', error)
    return jsonError(500, '服务器错误')
  }
}

// 保存 AI 报告到数据库（可选，用于缓存）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { diagnosisId, aiReport } = body

    if (!diagnosisId || !aiReport) {
      return jsonError(400, '缺少必要参数')
    }

    const supabase = await createClient()

    // 验证报告格式
    const parsed = parseAIReport(JSON.stringify(aiReport))
    if (!parsed) {
      return jsonError(400, 'AI报告格式无效')
    }

    // 更新数据库（假设有 ai_report 字段）
    const { error } = await supabase
      .from('diagnostic_results')
      .update({
        ai_report: aiReport,
        ai_generated_at: new Date().toISOString()
      })
      .eq('id', diagnosisId)

    if (error) {
      // 如果字段不存在，静默忽略
      if (error.message?.includes('column') || error.message?.includes('ai_report')) {
        console.warn('ai_report column not found, skipping save')
        return Response.json({ success: true, cached: false })
      }
      throw error
    }

    return Response.json({ success: true, cached: true })
  } catch (error) {
    console.error('Save AI Report Error:', error)
    return jsonError(500, '保存失败')
  }
}
