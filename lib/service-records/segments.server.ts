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

function integerMeta(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function serviceRecordAppendClosed(status: unknown) {
  return ["completed", "failed", "cancelled"].includes(cleanText(status, 40))
}

export function sourceFileMetadataFromPayload(payload: any) {
  const sourceFileKey = cleanText(payload?.source_file_key, 360)
  const meta: Record<string, unknown> = {}
  if (sourceFileKey) meta.source_file_key = sourceFileKey
  const deviceId = cleanText(payload?.device_id, 180)
  const deviceName = cleanText(payload?.device_name, 120)
  const deviceFileName = cleanText(payload?.device_file_name, 220)
  const deviceFileTime = integerMeta(payload?.device_file_time)
  const deviceFileSize = integerMeta(payload?.device_file_size)
  if (deviceId) meta.device_id = deviceId
  if (deviceName) meta.device_name = deviceName
  if (deviceFileName) meta.device_file_name = deviceFileName
  if (deviceFileTime) meta.device_file_time = deviceFileTime
  if (deviceFileSize) meta.device_file_size = deviceFileSize
  return meta
}

function applyReusableSegmentScope(query: any, session: any) {
  let scoped = query
  if (session?.company_id) {
    scoped = scoped.eq("company_id", session.company_id)
  } else {
    scoped = scoped.eq("user_id", session.user_id)
  }
  if (session?.store_id) scoped = scoped.eq("store_id", session.store_id)
  return scoped
}

export async function findReusableServiceRecordSegment(admin: any, session: any, sourceFileKey: string) {
  const key = cleanText(sourceFileKey, 360)
  if (!key) return null
  const query = applyReusableSegmentScope(admin
    .from("service_record_segments")
    .select("*")
    .contains("metadata", { source_file_key: key })
    .not("storage_path", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1), session)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message || "source_file_lookup_failed")
  return data || null
}

export async function findReusableServiceRecordSegmentBySourceMeta(admin: any, session: any, sourceMeta: Record<string, unknown>) {
  const deviceFileName = cleanText(sourceMeta?.device_file_name, 220)
  const deviceFileTime = integerMeta(sourceMeta?.device_file_time)
  const deviceFileSize = integerMeta(sourceMeta?.device_file_size)
  if (!deviceFileName || (!deviceFileTime && !deviceFileSize)) return null

  const contains: Record<string, unknown> = {
    device_file_name: deviceFileName,
  }
  if (deviceFileTime) contains.device_file_time = deviceFileTime
  if (deviceFileSize) contains.device_file_size = deviceFileSize

  const query = applyReusableSegmentScope(admin
    .from("service_record_segments")
    .select("*")
    .contains("metadata", contains)
    .not("storage_path", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1), session)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message || "source_file_meta_lookup_failed")
  return data || null
}

export function reusableSegmentHasAudio(segment: any) {
  return Boolean(segment && cleanText(segment.storage_path, 2000))
}

export function reusableSegmentAsrSnapshot(segment: any) {
  if (!segment) return null
  const status = cleanText(segment.asr_status, 40)
  if (!["done", "running", "skipped"].includes(status)) return null
  return {
    asr_status: status,
    transcript_text: cleanText(segment.transcript_text, 100000) || null,
    asr_json: isRecord(segment.asr_json) ? segment.asr_json : null,
  }
}

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
