import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { generateVoiceCoachReport, type VoiceCoachTurnRow } from "@/lib/voice-coach/report.server"
import { getScenario } from "@/lib/voice-coach/scenarios"
import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

async function signAudioExamples(report: any) {
  const examples = report?.tabs?.organization?.audio_examples
  if (!Array.isArray(examples)) return report

  const signed = await Promise.all(
    examples.map(async (ex: any) => {
      const path = typeof ex?.audio_path === "string" ? ex.audio_path : ""
      if (!path) return ex
      try {
        const url = await signVoiceCoachAudio(path)
        return { ...ex, audio_url: url }
      } catch {
        return ex
      }
    })
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

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const body = (await request.json().catch(() => null)) as { mode?: unknown } | null
    const mode = typeof body?.mode === "string" ? body.mode : "view_report"

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, scenario_id, status, report_json")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    if (mode === "end_only") {
      const { error: updateError } = await supabase
        .from("voice_coach_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", sessionId)
      if (updateError) return jsonError(500, "end_failed", { message: updateError.message })
      return NextResponse.json({ ok: true })
    }

    // view_report
    let report = session.report_json

    if (!report) {
      const { data: turns, error: turnsError } = await supabase
        .from("voice_coach_turns")
        .select("id, role, text, emotion, audio_path, audio_seconds, asr_confidence, analysis_json, features_json, turn_index")
        .eq("session_id", sessionId)
        .order("turn_index", { ascending: true })
      if (turnsError) return jsonError(500, "turns_query_failed", { message: turnsError.message })

      const scenario = getScenario(session.scenario_id)
      report = generateVoiceCoachReport({
        scenario,
        turns: (turns || []) as unknown as VoiceCoachTurnRow[],
      })

      const dimensionScores: Record<string, number> = {}
      for (const d of report.dimension || []) {
        if (d && typeof d.id === "string" && typeof d.score === "number") {
          dimensionScores[d.id] = d.score
        }
      }

      const { error: saveError } = await supabase
        .from("voice_coach_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          report_json: report,
          total_score: report.total_score,
          dimension_scores: dimensionScores,
        })
        .eq("id", sessionId)
      if (saveError) return jsonError(500, "report_save_failed", { message: saveError.message })
    }

    const hydrated = await signAudioExamples(report)
    return NextResponse.json({ report: hydrated })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
