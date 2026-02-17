import "server-only"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const VOICE_COACH_AUDIO_BUCKET = "voice-coach-audio"

export async function uploadVoiceCoachAudio(opts: {
  path: string
  data: Buffer
  contentType: string
}): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.storage.from(VOICE_COACH_AUDIO_BUCKET).upload(opts.path, opts.data, {
    contentType: opts.contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message || "storage_upload_failed")
}

export async function signVoiceCoachAudio(path: string, expiresInSeconds = 3600): Promise<string> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.from(VOICE_COACH_AUDIO_BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(error?.message || "storage_signed_url_failed")
  return data.signedUrl
}

export async function downloadVoiceCoachAudio(path: string): Promise<Buffer> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.storage.from(VOICE_COACH_AUDIO_BUCKET).download(path)
  if (error || !data) throw new Error(error?.message || "storage_download_failed")
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
