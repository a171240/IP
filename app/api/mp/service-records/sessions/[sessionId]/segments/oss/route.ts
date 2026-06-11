import { NextRequest, NextResponse } from "next/server"

import {
  buildServiceRecordOssObjectKey,
  getAliyunOssBucket,
  isAliyunOssConfigured,
} from "@/lib/service-records/aliyun-oss.server"
import {
  cleanText,
  getOwnedServiceRecordSession,
  integerValue,
  isoOrNull,
  isRecord,
  jsonError,
  numberValue,
  resolveServiceRecordAuth,
  toPublicSegment,
} from "@/lib/service-records/server"
import {
  refreshServiceRecordSessionAggregate,
  submitServiceRecordSegmentAsr,
} from "@/lib/service-records/segments.server"

export const runtime = "nodejs"

function audioFormat(format: unknown) {
  const normalized = cleanText(format, 20).toLowerCase()
  if (normalized === "wav") return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (normalized === "flac") return { format: "flac", ext: "flac", contentType: "audio/flac" }
  if (normalized === "mp3") return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")
  if (!isAliyunOssConfigured()) return jsonError(503, "aliyun_oss_not_configured", "aliyun_oss_not_configured")

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getOwnedServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error
  const session = loaded.session
  if (["processing", "completed", "failed", "cancelled"].includes(String(session.status || ""))) {
    return jsonError(409, "service_record_closed", "service_record_closed")
  }

  const body = await request.json().catch(() => null)
  const payload = isRecord(body) ? body : {}
  const clientSegmentId = cleanText(payload.client_segment_id, 160)
  const segmentIndex = integerValue(payload.segment_index, 0)
  if (!clientSegmentId || !segmentIndex) return jsonError(400, "missing_segment_meta", "missing_segment_meta")

  const detected = audioFormat(payload.format)
  const objectKey = cleanText(payload.object_key, 2000)
  const expectedObjectKey = buildServiceRecordOssObjectKey({
    session,
    clientSegmentId,
    ext: detected.ext,
  })
  if (!objectKey || objectKey !== expectedObjectKey) {
    return jsonError(400, "invalid_oss_object_key", "invalid_oss_object_key")
  }

  const now = new Date().toISOString()
  const payloadRow = {
    session_id: session.id,
    user_id: ctx.userId,
    company_id: session.company_id || null,
    store_id: session.store_id || null,
    client_segment_id: clientSegmentId,
    segment_index: segmentIndex,
    status: "uploaded",
    storage_bucket: getAliyunOssBucket(),
    storage_path: objectKey,
    content_type: cleanText(payload.content_type, 120) || detected.contentType,
    format: detected.format,
    audio_bytes: integerValue(payload.audio_bytes, 0),
    client_audio_seconds: numberValue(payload.client_audio_seconds, 0) || null,
    started_at: isoOrNull(payload.started_at),
    ended_at: isoOrNull(payload.ended_at),
    uploaded_at: now,
    updated_at: now,
    asr_status: "pending",
    metadata: {
      source: "mp_service_record",
      storage_provider: "aliyun_oss",
      upload_source: cleanText(payload.source, 80) || "ble_card",
      audio_format_guess: cleanText(payload.audio_format_guess, 200),
      original_file_name: cleanText(payload.original_file_name, 200),
    },
  }

  const { data, error } = await admin
    .from("service_record_segments")
    .upsert(payloadRow, { onConflict: "session_id,client_segment_id" })
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "segment_upsert_failed", "segment_upsert_failed")

  try {
    await refreshServiceRecordSessionAggregate(admin, session.id)
  } catch {
    // The segment is registered; aggregate refresh can be repaired later.
  }

  const segmentWithAsr = await submitServiceRecordSegmentAsr(admin, data)

  return NextResponse.json({
    ok: true,
    segment: toPublicSegment(segmentWithAsr),
  })
}
