import { createAdminSupabaseClient } from "./supabase.js"

export type VoiceCoachEventRow = {
  id?: number
  created_at?: string
  session_id?: string | null
  user_id?: string | null
  turn_id?: string | null
  job_id?: string | null
  type: string
  data_json?: unknown
}

/**
 * Emit an event row for downstream report systems.
 */
export async function emitEvent(row: VoiceCoachEventRow): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from("voice_coach_events").insert({
    ...row,
    data_json: row.data_json ?? {},
  })
  if (error) throw error
}
