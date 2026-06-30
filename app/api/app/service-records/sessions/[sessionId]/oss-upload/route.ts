import { NextRequest, NextResponse } from "next/server"

import {
  buildAliyunRdsServiceRecordOssObjectKey,
  createAliyunRdsServiceRecordOssPostPolicy,
  getAliyunRdsServiceRecordOssMaxDirectUploadBytes,
  isAliyunRdsServiceRecordOssConfigured,
} from "@/lib/aliyun-rds/service-record-oss.server"
import {
  cleanText,
  findReusableAliyunRdsServiceRecordSegment,
  findReusableAliyunRdsServiceRecordSegmentBySourceMeta,
  getAliyunRdsOwnedServiceRecordSession,
  integerValue,
  isRecord,
  jsonError,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  reusableSegmentHasAudio,
  serviceRecordAppendClosed,
  sourceFileMetadataFromPayload,
  toPublicSegment,
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

function uploadPolicyMaxBytes(payload: Record<string, unknown>, detected: ReturnType<typeof audioFormat>, audioBytes: number, maxDirectBytes: number) {
  if (!audioBytes) return maxDirectBytes
  const base = Math.min(audioBytes, maxDirectBytes)
  const genericSlack = Math.ceil(base * 1.02) + 1024
  if (detected.format !== "ogg") return Math.min(maxDirectBytes, genericSlack)

  const source = cleanText(payload.source, 80)
  const guess = cleanText(payload.audio_format_guess, 200)
  const likelyRawL12Opus = source === "ble_card" || /裸\s*Opus|raw\s*opus/i.test(guess)
  if (!likelyRawL12Opus) return Math.min(maxDirectBytes, Math.max(genericSlack, Math.ceil(base * 1.05) + 8192))

  const frameBytes = 40
  const frames = Math.ceil(base / frameBytes)
  const oggPageCount = Math.ceil(frames / 255) + 2
  const oggContainerSlack = frames + oggPageCount * 32 + 8192
  return Math.min(maxDirectBytes, Math.max(genericSlack, base + oggContainerSlack, Math.ceil(base * 1.08) + 64 * 1024))
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
    const audioBytes = integerValue(payload.audio_bytes, 0)
    const maxDirectBytes = getAliyunRdsServiceRecordOssMaxDirectUploadBytes()
    if (audioBytes > maxDirectBytes) {
      return jsonError(400, "audio_too_large", "audio_too_large", { max_bytes: maxDirectBytes })
    }

    const sourceMeta = sourceFileMetadataFromPayload(payload)
    let reusable = sourceMeta.source_file_key
      ? await findReusableAliyunRdsServiceRecordSegment(session, String(sourceMeta.source_file_key))
      : null
    if (!reusableSegmentHasAudio(reusable)) {
      reusable = await findReusableAliyunRdsServiceRecordSegmentBySourceMeta(session, sourceMeta)
    }
    if (reusableSegmentHasAudio(reusable)) {
      return NextResponse.json({
        ok: true,
        reused: true,
        upload: {
          provider: "aliyun_oss",
          bucket: reusable?.storage_bucket || "",
          url: "",
          method: "REUSE",
          object_key: reusable?.storage_path,
          fields: {},
          expires_at: null,
          max_bytes: Number(reusable?.audio_bytes || audioBytes || 0),
          content_type: reusable?.content_type || detected.contentType,
          reused: true,
        },
        reusable_segment: toPublicSegment(reusable!),
        segment: {
          client_segment_id: clientSegmentId,
          segment_index: segmentIndex,
          format: reusable?.format || detected.format,
          content_type: reusable?.content_type || detected.contentType,
          reused_from_segment_id: reusable?.id,
        },
      })
    }

    const objectKey = buildAliyunRdsServiceRecordOssObjectKey({
      session,
      clientSegmentId,
      ext: detected.ext,
    })
    const policy = await createAliyunRdsServiceRecordOssPostPolicy({
      objectKey,
      contentType: detected.contentType,
      maxBytes: uploadPolicyMaxBytes(payload, detected, audioBytes, maxDirectBytes),
    })

    return NextResponse.json({
      ok: true,
      upload: {
        provider: policy.provider,
        bucket: policy.bucket,
        url: policy.url,
        method: "POST",
        object_key: policy.objectKey,
        fields: policy.fields,
        expires_at: policy.expiresAt,
        max_bytes: policy.maxBytes,
        content_type: policy.contentType,
      },
      segment: {
        client_segment_id: clientSegmentId,
        segment_index: segmentIndex,
        format: detected.format,
        content_type: detected.contentType,
      },
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "oss_upload_failed")
  }
}
