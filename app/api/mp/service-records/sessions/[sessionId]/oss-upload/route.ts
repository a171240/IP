import { NextRequest, NextResponse } from "next/server"

import {
  buildServiceRecordOssObjectKey,
  createAliyunOssPostPolicy,
  getAliyunOssMaxDirectUploadBytes,
  isAliyunOssConfigured,
} from "@/lib/service-records/aliyun-oss.server"
import {
  cleanText,
  getOwnedServiceRecordSession,
  integerValue,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
} from "@/lib/service-records/server"

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
  const audioBytes = integerValue(payload.audio_bytes, 0)
  const maxDirectBytes = getAliyunOssMaxDirectUploadBytes()
  if (audioBytes > maxDirectBytes) {
    return jsonError(400, "audio_too_large", "audio_too_large", { max_bytes: maxDirectBytes })
  }

  const objectKey = buildServiceRecordOssObjectKey({
    session,
    clientSegmentId,
    ext: detected.ext,
  })
  const policy = createAliyunOssPostPolicy({
    objectKey,
    contentType: detected.contentType,
    maxBytes: audioBytes ? Math.min(maxDirectBytes, Math.ceil(audioBytes * 1.02) + 1024) : maxDirectBytes,
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
}
