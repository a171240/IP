import { NextRequest, NextResponse } from "next/server"

import {
  cleanText,
  getAliyunRdsReadableServiceRecordSession,
  jsonError,
  numberValue,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import { createAliyunRdsServiceRecordSegmentAudioUrl } from "@/lib/aliyun-rds/repositories/service-record-processing.server"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; segmentId: string }> },
) {
  const { sessionId, segmentId } = await params
  const id = cleanText(sessionId, 160)
  const audioSegmentId = cleanText(segmentId, 160)
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")
  if (!audioSegmentId) return jsonError(400, "missing_segment_id", "missing_segment_id")

  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  try {
    const session = await getAliyunRdsReadableServiceRecordSession(ctx, id)
    if (!session) return jsonError(404, "service_record_not_found", "service_record_not_found")

    const audio = await createAliyunRdsServiceRecordSegmentAudioUrl(session.id, audioSegmentId)
    if (!audio) return jsonError(404, "audio_not_found", "audio_not_found")

    return NextResponse.json({
      ok: true,
      audio: {
        segment_id: audio.segment.id,
        segment_index: audio.segment.segment_index,
        content_type: audio.segment.content_type || "audio/ogg",
        audio_bytes: Number(audio.segment.audio_bytes || 0),
        duration_seconds: Number(numberValue(audio.segment.client_audio_seconds, 0)),
        playback_url: audio.playbackUrl,
      },
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "audio_sign_failed")
  }
}
