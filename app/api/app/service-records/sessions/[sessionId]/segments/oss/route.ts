import { NextRequest, NextResponse } from "next/server"

import {
  buildAliyunRdsServiceRecordOssObjectKey,
  getAliyunRdsServiceRecordOssBucket,
  isAliyunRdsServiceRecordOssConfigured,
} from "@/lib/aliyun-rds/service-record-oss.server"
import {
  createAliyunRdsSignedAudioUrlForBailian,
  isAliyunRdsBailianAsrConfigured,
  submitAliyunRdsBailianAsrTask,
} from "@/lib/aliyun-rds/service-record-asr.server"
import {
  cleanText,
  findReusableAliyunRdsServiceRecordSegment,
  findReusableAliyunRdsServiceRecordSegmentBySourceMeta,
  getAliyunRdsOwnedServiceRecordSession,
  integerValue,
  isRecord,
  jsonError,
  numberValue,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  reusableSegmentAsrSnapshot,
  reusableSegmentHasAudio,
  serviceRecordAppendClosed,
  sourceFileMetadataFromPayload,
  toPublicSegment,
  updateAliyunRdsServiceRecordSegmentAsr,
  upsertAliyunRdsServiceRecordSegment,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

function audioFormat(format: unknown) {
  const normalized = cleanText(format, 20).toLowerCase()
  if (normalized === "wav") return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (normalized === "flac") return { format: "flac", ext: "flac", contentType: "audio/flac" }
  if (normalized === "mp3") return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (normalized === "m4a" || normalized === "mp4") return { format: "m4a", ext: "m4a", contentType: "audio/mp4" }
  return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
}

async function submitSegmentAsr(segment: Awaited<ReturnType<typeof upsertAliyunRdsServiceRecordSegment>>) {
  if (!isAliyunRdsBailianAsrConfigured()) return segment
  try {
    const audioUrl = await createAliyunRdsSignedAudioUrlForBailian(segment)
    const asr = await submitAliyunRdsBailianAsrTask(audioUrl)
    return await updateAliyunRdsServiceRecordSegmentAsr({
      segmentId: segment.id,
      asrStatus: "running",
      asrJson: {
        ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
        provider: asr.provider,
        model: asr.model,
        task_id: asr.taskId,
        task_status: asr.taskStatus,
        request_id: asr.requestId,
        submitted_at: asr.submittedAt,
      },
    }) || segment
  } catch {
    return segment
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")
  if (!isAliyunRdsServiceRecordOssConfigured()) return jsonError(503, "aliyun_oss_not_configured", "aliyun_oss_not_configured")

  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  try {
    const session = await getAliyunRdsOwnedServiceRecordSession(ctx, id)
    if (!session) return jsonError(404, "service_record_not_found", "service_record_not_found")
    if (serviceRecordAppendClosed(session.status)) {
      return jsonError(409, "service_record_closed", "service_record_closed")
    }

    const body = await request.json().catch(() => null)
    const payload = isRecord(body) ? body : {}
    const clientSegmentId = cleanText(payload.client_segment_id, 160)
    const segmentIndex = integerValue(payload.segment_index, 0)
    if (!clientSegmentId || !segmentIndex) return jsonError(400, "missing_segment_meta", "missing_segment_meta")

    const detected = audioFormat(payload.format)
    const sourceMeta = sourceFileMetadataFromPayload(payload)
    let reusable = sourceMeta.source_file_key
      ? await findReusableAliyunRdsServiceRecordSegment(session, String(sourceMeta.source_file_key))
      : null
    if (!reusableSegmentHasAudio(reusable)) {
      reusable = await findReusableAliyunRdsServiceRecordSegmentBySourceMeta(session, sourceMeta)
    }
    const reuseAudio = Boolean(payload.reused_upload) && reusableSegmentHasAudio(reusable)
    const objectKey = cleanText(payload.object_key, 2000)
    const expectedObjectKey = buildAliyunRdsServiceRecordOssObjectKey({
      session,
      clientSegmentId,
      ext: detected.ext,
    })
    const reusableObjectKey = reusableSegmentHasAudio(reusable) ? cleanText(reusable?.storage_path, 2000) : ""
    if (!objectKey || (!reuseAudio && objectKey !== expectedObjectKey) || (reuseAudio && objectKey !== reusableObjectKey)) {
      return jsonError(400, "invalid_oss_object_key", "invalid_oss_object_key")
    }

    const reusableAsr = reuseAudio ? reusableSegmentAsrSnapshot(reusable) : null
    let segment = await upsertAliyunRdsServiceRecordSegment({
      ctx,
      session,
      clientSegmentId,
      segmentIndex,
      storageBucket: reuseAudio ? reusable?.storage_bucket || getAliyunRdsServiceRecordOssBucket() : getAliyunRdsServiceRecordOssBucket(),
      storagePath: objectKey,
      contentType: reuseAudio ? reusable?.content_type || detected.contentType : cleanText(payload.content_type, 120) || detected.contentType,
      format: reuseAudio ? reusable?.format || detected.format : detected.format,
      audioBytes: reuseAudio ? integerValue(reusable?.audio_bytes, integerValue(payload.audio_bytes, 0)) : integerValue(payload.audio_bytes, 0),
      clientAudioSeconds: numberValue(payload.client_audio_seconds, 0) || null,
      startedAt: payload.started_at,
      endedAt: payload.ended_at,
      asrStatus: reusableAsr?.asr_status || "pending",
      transcriptText: reusableAsr?.transcript_text || null,
      asrJson: reusableAsr?.asr_json || null,
      metadata: {
        source: "app_service_record",
        storage_provider: "aliyun_oss",
        upload_source: cleanText(payload.source, 80) || "app",
        audio_format_guess: cleanText(payload.audio_format_guess, 200),
        original_file_name: cleanText(payload.original_file_name, 200),
        reused_upload: reuseAudio,
        reused_from_segment_id: reuseAudio ? reusable?.id : cleanText(payload.reused_from_segment_id, 160),
        reused_from_session_id: reuseAudio ? reusable?.session_id : "",
        ...sourceMeta,
      },
    })

    if (!reuseAudio && segment.asr_status === "pending") {
      segment = await submitSegmentAsr(segment)
    }

    return NextResponse.json({
      ok: true,
      reused: reuseAudio,
      segment: toPublicSegment(segment),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "segment_oss_register_failed")
  }
}
