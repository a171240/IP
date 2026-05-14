import { NextRequest, NextResponse } from "next/server"

import {
  createSignedAudioUrlForBailian,
  isBailianAsrConfigured,
  submitBailianAsrTask,
} from "@/lib/service-records/bailian-asr.server"
import { uploadVoiceCoachAudio, VOICE_COACH_AUDIO_BUCKET } from "@/lib/voice-coach/storage.server"
import {
  SERVICE_RECORD_MAX_SEGMENT_BYTES,
  cleanText,
  detectAudio,
  getOwnedServiceRecordSession,
  integerValue,
  isoOrNull,
  jsonError,
  numberValue,
  pathSafe,
  resolveServiceRecordAuth,
  toPublicSegment,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

async function refreshSessionAggregate(admin: any, sessionId: string) {
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

async function submitSegmentAsr(admin: any, segment: any) {
  if (!isBailianAsrConfigured()) return segment

  try {
    const audioUrl = await createSignedAudioUrlForBailian(segment.storage_path)
    const asr = await submitBailianAsrTask({ audioUrl })
    const nextAsrJson = {
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getOwnedServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error
  const session = loaded.session
  if (["processing", "completed", "failed", "cancelled"].includes(String(session.status || ""))) {
    return jsonError(409, "service_record_closed", "service_record_closed")
  }

  const form = await request.formData().catch(() => null)
  if (!form) return jsonError(400, "invalid_form_data", "invalid_form_data")

  const audioFile = form.get("audio")
  if (!(audioFile instanceof File)) return jsonError(400, "missing_audio", "missing_audio")
  if (audioFile.size <= 0) return jsonError(400, "empty_audio", "empty_audio")
  if (audioFile.size > SERVICE_RECORD_MAX_SEGMENT_BYTES) {
    return jsonError(400, "audio_too_large", "audio_too_large", { max_bytes: SERVICE_RECORD_MAX_SEGMENT_BYTES })
  }

  const clientSegmentId = cleanText(form.get("client_segment_id"), 160)
  const segmentIndex = integerValue(form.get("segment_index"), 0)
  if (!clientSegmentId || !segmentIndex) return jsonError(400, "missing_segment_meta", "missing_segment_meta")

  const detected = detectAudio(audioFile, form.get("format"))
  const audio = Buffer.from(await audioFile.arrayBuffer())
  if (!audio.length) return jsonError(400, "empty_audio", "empty_audio")

  const storagePath = [
    "service-records",
    pathSafe(session.company_id || "no-company"),
    pathSafe(session.store_id || "no-store"),
    pathSafe(session.id),
    `${pathSafe(clientSegmentId)}.${detected.ext}`,
  ].join("/")

  try {
    await uploadVoiceCoachAudio({
      path: storagePath,
      data: audio,
      contentType: detected.contentType,
    })
  } catch (error: any) {
    return jsonError(502, error?.message || "storage_upload_failed", "storage_upload_failed")
  }

  const now = new Date().toISOString()
  const payload = {
    session_id: session.id,
    user_id: ctx.userId,
    company_id: session.company_id || null,
    store_id: session.store_id || null,
    client_segment_id: clientSegmentId,
    segment_index: segmentIndex,
    status: "uploaded",
    storage_bucket: VOICE_COACH_AUDIO_BUCKET,
    storage_path: storagePath,
    content_type: detected.contentType,
    format: detected.format,
    audio_bytes: audioFile.size,
    client_audio_seconds: numberValue(form.get("client_audio_seconds"), 0) || null,
    started_at: isoOrNull(form.get("started_at")),
    ended_at: isoOrNull(form.get("ended_at")),
    uploaded_at: now,
    updated_at: now,
    asr_status: "pending",
    metadata: {
      source: "mp_service_record",
      original_file_name: audioFile.name || "",
    },
  }

  const { data, error } = await admin
    .from("service_record_segments")
    .upsert(payload, { onConflict: "session_id,client_segment_id" })
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "segment_upsert_failed", "segment_upsert_failed")

  try {
    await refreshSessionAggregate(admin, session.id)
  } catch {
    // The segment is safely stored; aggregate refresh can be repaired later.
  }

  const segmentWithAsr = await submitSegmentAsr(admin, data)

  return NextResponse.json({
    ok: true,
    segment: toPublicSegment(segmentWithAsr),
  })
}
