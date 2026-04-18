import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { pumpVoiceCoachAnalysisJobs } from "@/lib/voice-coach/jobs.server"
import { refreshVoiceCoachReport } from "@/lib/voice-coach/report-refresh"
import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

async function signAudioExamples(report: any) {
  const examples = report?.tabs?.organization?.audio_examples
  if (!Array.isArray(examples)) return report

  const signed = await Promise.all(
    examples.map(async (example: any) => {
      const audioPath = typeof example?.audio_path === "string" ? example.audio_path : ""
      if (!audioPath) return example
      try {
        const audioUrl = await signVoiceCoachAudio(audioPath)
        return { ...example, audio_url: audioUrl }
      } catch {
        return example
      }
    }),
  )

  return {
    ...report,
    tabs: {
      ...report.tabs,
      organization: {
        ...report.tabs.organization,
        audio_examples: signed,
      },
    },
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const supabase = await createServerSupabaseClientForRequest(request)
    const admin = createAdminSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select(
        "id, scenario_id, status, ended_at, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
      )
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { report } = await refreshVoiceCoachReport({
      ops: {
        async fetchSession() {
          const { data, error } = await supabase
            .from("voice_coach_sessions")
            .select(
              "id, scenario_id, status, ended_at, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
            )
            .eq("id", sessionId)
            .single()
          if (error || !data) return null
          return data
        },
        async fetchTurns() {
          const { data, error } = await supabase
            .from("voice_coach_turns")
            .select(
              "id, role, text, emotion, audio_path, audio_seconds, asr_confidence, analysis_json, features_json, turn_index",
            )
            .eq("session_id", sessionId)
            .order("turn_index", { ascending: true })
          if (error) throw new Error(error.message || "turns_query_failed")
          return (data || []) as any[]
        },
        async countPendingAnalysisJobs() {
          const { count, error } = await admin
            .from("voice_coach_jobs")
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId)
            .eq("user_id", user.id)
            .eq("stage", "analysis_pending")
            .in("status", ["queued", "processing"])
          if (error) throw new Error(error.message || "analysis_jobs_count_failed")
          return Number(count || 0)
        },
        async pumpAnalysisJobs({ maxJobs }) {
          return pumpVoiceCoachAnalysisJobs({
            sessionId,
            userId: user.id,
            maxJobs,
          })
        },
        async saveReport({ report: nextReport, totalScore, dimensionScores, status, endedAt }) {
          const payload: any = {
            report_json: nextReport,
            total_score: totalScore,
            dimension_scores: dimensionScores,
          }
          if (status) payload.status = status
          if (typeof endedAt === "string" && endedAt) payload.ended_at = endedAt

          const { error } = await supabase.from("voice_coach_sessions").update(payload).eq("id", sessionId)
          if (error) throw new Error(error.message || "report_save_failed")
        },
      },
    })

    const hydrated = await signAudioExamples(report)
    return NextResponse.json({ report: hydrated })
  } catch (error: any) {
    return jsonError(500, "voice_coach_error", { message: error?.message || String(error) })
  }
}
