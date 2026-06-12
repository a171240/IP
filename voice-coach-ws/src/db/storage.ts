import { createAdminSupabaseClient } from "./supabase.js"

export const VOICE_COACH_AUDIO_BUCKET = "voice-coach-audio"

/**
 * Upload one replayable voice-coach audio file.
 */
export async function uploadVoiceCoachAudio(opts: {
  path: string
  data: Buffer
  contentType: string
}): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.storage.from(VOICE_COACH_AUDIO_BUCKET).upload(opts.path, opts.data, {
    contentType: opts.contentType,
    upsert: true,
  })
  if (error) throw error
}
