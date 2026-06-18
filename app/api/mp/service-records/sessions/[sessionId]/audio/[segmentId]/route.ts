import { NextRequest, NextResponse } from "next/server"

import { createServiceRecordSegmentAudioUrl } from "@/lib/service-records/audio-evidence.server"
import {
  cleanText,
  getReadableServiceRecordSession,
  jsonError,
  resolveServiceRecordAuth,
} from "@/lib/service-records/server"

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

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getReadableServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error

  const { data: segment, error } = await admin
    .from("service_record_segments")
    .select("id, session_id, segment_index, client_segment_id, storage_bucket, storage_path, content_type, audio_bytes, client_audio_seconds, metadata")
    .eq("session_id", loaded.session.id)
    .eq("id", audioSegmentId)
    .maybeSingle()

  if (error) return jsonError(500, error.message || "segment_query_failed", "segment_query_failed")
  if (!segment?.storage_path) return jsonError(404, "audio_not_found", "audio_not_found")

  try {
    const audioUrl = await createServiceRecordSegmentAudioUrl(segment)
    return NextResponse.json({
      ok: true,
      audio: {
        segment_id: segment.id,
        segment_index: segment.segment_index,
        content_type: segment.content_type || "audio/ogg",
        audio_bytes: Number(segment.audio_bytes || 0),
        duration_seconds: Number(segment.client_audio_seconds || 0),
        playback_url: audioUrl,
      },
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "audio_sign_failed", "audio_sign_failed")
  }
}
