import { createAdminSupabaseClient } from "./supabase.js"

export type VoiceCoachTurnRole = "customer" | "beautician"
export type VoiceCoachTurnStatus =
  | "ready"
  | "accepted"
  | "processing"
  | "asr_ready"
  | "text_ready"
  | "audio_ready"
  | "analysis_ready"
  | "error"

export type VoiceCoachTurnRow = {
  id: string
  created_at?: string
  session_id: string
  turn_index: number
  role: VoiceCoachTurnRole
  text: string
  emotion?: string | null
  audio_path?: string | null
  audio_seconds?: number | null
  asr_confidence?: number | null
  analysis_json?: unknown | null
  features_json?: unknown | null
  status?: VoiceCoachTurnStatus
}

/**
 * Insert a beautician turn row.
 */
export async function insertBeauticianTurn(row: {
  id: string
  session_id: string
  turn_index: number
  text: string
  emotion?: string | null
  audio_path?: string | null
  audio_seconds?: number | null
  asr_confidence?: number | null
  analysis_json?: unknown
  features_json?: unknown
  status?: VoiceCoachTurnStatus
}): Promise<VoiceCoachTurnRow> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from("voice_coach_turns")
    .insert({
      ...row,
      role: "beautician",
      status: row.status || "analysis_ready",
    })
    .select("*")
    .single()
  if (error) throw error
  return data as VoiceCoachTurnRow
}

/**
 * Insert a customer turn row.
 */
export async function insertCustomerTurn(row: {
  id: string
  session_id: string
  turn_index: number
  text: string
  emotion?: string | null
  audio_path?: string | null
  audio_seconds?: number | null
  asr_confidence?: number | null
  analysis_json?: unknown
  features_json?: unknown
  status?: VoiceCoachTurnStatus
}): Promise<VoiceCoachTurnRow> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from("voice_coach_turns")
    .insert({
      ...row,
      role: "customer",
      status: row.status || "analysis_ready",
    })
    .select("*")
    .single()
  if (error) throw error
  return data as VoiceCoachTurnRow
}

/**
 * Update analysis fields on an existing turn row.
 */
export async function updateTurnAnalysis(params: {
  turnId: string
  analysisJson: unknown
  featuresJson?: unknown
  status?: VoiceCoachTurnStatus
}): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from("voice_coach_turns")
    .update({
      analysis_json: params.analysisJson,
      ...(params.featuresJson !== undefined ? { features_json: params.featuresJson } : {}),
      status: params.status || "analysis_ready",
    })
    .eq("id", params.turnId)
  if (error) throw error
}

/**
 * Attach replay audio to an existing turn row.
 */
export async function updateTurnAudio(params: {
  turnId: string
  audioPath: string
  audioSeconds?: number | null
  status?: VoiceCoachTurnStatus
}): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from("voice_coach_turns")
    .update({
      audio_path: params.audioPath,
      ...(params.audioSeconds !== undefined ? { audio_seconds: params.audioSeconds } : {}),
      status: params.status || "audio_ready",
    })
    .eq("id", params.turnId)
  if (error) throw error
}
