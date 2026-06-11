import "server-only"

import {
  createSignedAudioUrlForBailian,
  isBailianAsrConfigured,
  submitBailianAsrTask,
} from "@/lib/service-records/bailian-asr.server"
import {
  cleanText,
  isRecord,
  numberValue,
} from "@/lib/service-records/server"

export async function refreshServiceRecordSessionAggregate(admin: any, sessionId: string) {
  const { data, error } = await admin
    .from("service_record_segments")
    .select("client_audio_seconds")
    .eq("session_id", sessionId)

  if (error) throw new Error(error.message)
  const rows = data || []
  const audioSeconds = rows.reduce((sum: number, row: any) => sum + numberValue(row.client_audio_seconds, 0), 0)
  await admin
    .from("service_record_sessions")
    .update({
      segment_count: rows.length,
      audio_seconds: Math.round(audioSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
}

export async function submitServiceRecordSegmentAsr(admin: any, segment: any) {
  if (!isBailianAsrConfigured()) {
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "failed",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          error: "bailian_api_key_missing",
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  }

  try {
    const audioUrl = await createSignedAudioUrlForBailian({
      storagePath: segment.storage_path,
      storageBucket: segment.storage_bucket,
      metadata: isRecord(segment.metadata) ? segment.metadata : {},
    })
    const asr = await submitBailianAsrTask({ audioUrl })
    const nextAsrJson = {
      ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
      provider: asr.provider,
      model: asr.model,
      task_id: asr.taskId,
      task_status: asr.taskStatus,
      request_id: asr.requestId,
      submitted_at: asr.submittedAt,
    }
    const { data, error } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "running",
        asr_json: nextAsrJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .single()
    if (error || !data) return segment
    return data
  } catch (error: any) {
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "failed",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          error: cleanText(error?.message || "bailian_submit_failed", 300),
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  }
}
