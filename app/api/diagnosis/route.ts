import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculateScore, QUESTIONS } from "@/lib/diagnosis"
import { z } from "zod"

const diagnosisSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
  industry: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const validationResult = diagnosisSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "无效的请求数据", details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { answers, industry } = validationResult.data
    const normalizedAnswers: Record<string, string | string[]> = Object.fromEntries(
      Object.entries(answers).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, value.map((item) => String(item))]
        }
        return [key, String(value)]
      })
    )

    const requiredQuestions = QUESTIONS
    const answeredIds = Object.keys(answers)
    const missingQuestions = requiredQuestions.filter((question) => !answeredIds.includes(question.id))

    if (missingQuestions.length > 0) {
      return NextResponse.json(
        {
          error: "请回答所有问题",
          missing: missingQuestions.map((question) => question.id),
        },
        { status: 400 }
      )
    }

    const scoreResult = calculateScore(normalizedAnswers)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("diagnostic_results")
      .insert({
        answers,
        industry: industry || answers["industry"] || "unknown",
        total_score: scoreResult.total,
        level: scoreResult.level,
        scores: scoreResult.dimensions,
        recommendations: scoreResult.topActions,
        action_plan: scoreResult.actionPlan,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single()

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      result: {
        total: scoreResult.total,
        level: scoreResult.level,
        levelLabel: scoreResult.levelLabel,
      },
    })
  } catch (error) {
    console.error("Diagnosis API error:", error)
    return NextResponse.json({ error: "服务异常，请稍后重试" }, { status: 500 })
  }
}
