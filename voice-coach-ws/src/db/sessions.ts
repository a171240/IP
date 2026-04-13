import { createAdminSupabaseClient } from "./supabase.js"
import type { VoiceCoachReport } from "../shared/report.js"

export type VoiceCoachSessionRow = {
  id: string
  created_at?: string
  user_id: string
  scenario_id: string
  status: "active" | "ended"
  started_at?: string | null
  ended_at?: string | null
  report_json?: VoiceCoachReport | null
  total_score?: number | null
  dimension_scores?: unknown | null
}

/**
 * Insert a new voice coach session row.
 */
export async function createSession(row: {
  id: string
  user_id: string
  scenario_id: string
  started_at?: string
}): Promise<VoiceCoachSessionRow> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from("voice_coach_sessions")
    .insert({
      id: row.id,
      user_id: row.user_id,
      scenario_id: row.scenario_id,
      status: "active",
      started_at: row.started_at || new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) throw error
  return data as VoiceCoachSessionRow
}

/**
 * Mark a session as ended.
 */
export async function endSession(sessionId: string, endedAt = new Date().toISOString()): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from("voice_coach_sessions")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", sessionId)
  if (error) throw error
}

/**
 * Update the final report payload for a session.
 */
export async function updateReport(params: {
  sessionId: string
  reportJson: VoiceCoachReport
  totalScore?: number
  dimensionScores?: unknown
}): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from("voice_coach_sessions")
    .update({
      report_json: params.reportJson,
      total_score: params.totalScore ?? params.reportJson.total_score,
      dimension_scores: params.dimensionScores ?? params.reportJson.dimension,
    })
    .eq("id", params.sessionId)
  if (error) throw error
}
