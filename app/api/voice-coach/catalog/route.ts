import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import {
  listCrisisGoalTemplates,
  listVoiceCoachCategories,
  recommendCategoryFromReport,
} from "@/lib/voice-coach/script-packs"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: latestSession } = await supabase
      .from("voice_coach_sessions")
      .select("id, total_score, dimension_scores, report_json, ended_at")
      .eq("user_id", user.id)
      .eq("status", "ended")
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const recommendation = recommendCategoryFromReport(latestSession || null)

    return NextResponse.json({
      categories: listVoiceCoachCategories(),
      recommendation,
      crisis_goal_templates: listCrisisGoalTemplates(),
      style: {
        communication_style: "professional_warm",
        forbidden: [
          "高压逼单",
          "恐吓式表达",
          "医疗诊断结论",
          "绝对化承诺",
        ],
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
