import { NextRequest, NextResponse } from "next/server"

import {
  buildAliyunRdsServiceRecordOssObjectKey,
  getAliyunRdsServiceRecordOssBucket,
  isAliyunRdsServiceRecordOssConfigured,
  uploadAliyunRdsServiceRecordOssObject,
} from "@/lib/aliyun-rds/service-record-oss.server"
import {
  createAliyunRdsSignedAudioUrlForBailian,
  isAliyunRdsBailianAsrConfigured,
  submitAliyunRdsBailianAsrTask,
} from "@/lib/aliyun-rds/service-record-asr.server"
import {
  SERVICE_RECORD_MAX_SEGMENT_BYTES,
  cleanText,
  getAliyunRdsOwnedServiceRecordSession,
  integerValue,
  isoOrNull,
  jsonError,
  numberValue,
  pathSafe,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  serviceRecordAppendClosed,
  toPublicSegment,
  updateAliyunRdsServiceRecordSegmentAsr,
  upsertAliyunRdsServiceRecordSegment,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

function detectAudio(file: File, formFormat?: unknown) {
  const requested = cleanText(formFormat, 20).toLowerCase()
  if (requested === "wav") return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (requested === "ogg") return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (requested === "flac") return { format: "flac", ext: "flac", contentType: "audio/flac" }
  if (requested === "mp3") return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (requested === "m4a" || requested === "mp4") return { format: "m4a", ext: "m4a", contentType: "audio/mp4" }

  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  if (type.includes("wav") || name.endsWith(".wav")) return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (type.includes("ogg") || name.endsWith(".ogg")) return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (type.includes("flac") || name.endsWith(".flac")) return { format: "flac", ext: "flac", contentType: "audio/flac" }
  if (type.includes("mpeg") || name.endsWith(".mp3")) return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  return { format: "m4a", ext: "m4a", contentType: "audio/mp4" }
}

async function submitSegmentAsr(segment: Awaited<ReturnType<typeof upsertAliyunRdsServiceRecordSegment>>) {
  if (!isAliyunRdsBailianAsrConfigured()) return segment
  try {
    const audioUrl = createAliyunRdsSignedAudioUrlForBailian(segment)
    const asr = await submitAliyunRdsBailianAsrTask(audioUrl)
    return await updateAliyunRdsServiceRecordSegmentAsr({
      segmentId: segment.id,
      asrStatus: "running",
      asrJson: {
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

    const storagePath = buildAliyunRdsServiceRecordOssObjectKey({
      session,
      clientSegmentId,
      ext: detected.ext,
    })

    await uploadAliyunRdsServiceRecordOssObject({
      objectKey: storagePath,
      data: audio,
      contentType: detected.contentType,
    })

    let segment = await upsertAliyunRdsServiceRecordSegment({
      ctx,
      session,
      clientSegmentId,
      segmentIndex,
      storageBucket: getAliyunRdsServiceRecordOssBucket(),
      storagePath,
      contentType: detected.contentType,
      format: detected.format,
      audioBytes: audioFile.size,
      clientAudioSeconds: numberValue(form.get("client_audio_seconds"), 0) || null,
      startedAt: isoOrNull(form.get("started_at")),
      endedAt: isoOrNull(form.get("ended_at")),
      asrStatus: "pending",
      metadata: {
        source: "app_service_record",
        storage_provider: "aliyun_oss",
        upload_source: cleanText(form.get("source"), 80) || "phone",
        audio_format_guess: cleanText(form.get("audio_format_guess"), 200),
        original_file_name: audioFile.name || "",
        source_file_key: [
          "app",
          pathSafe(session.id),
          pathSafe(clientSegmentId),
        ].join(":"),
      },
    })

    segment = await submitSegmentAsr(segment)

    return NextResponse.json({
      ok: true,
      segment: toPublicSegment(segment),
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "segment_upload_failed")
  }
}
