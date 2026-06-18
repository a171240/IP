import "server-only"

import { createSignedAudioUrlForBailian } from "@/lib/service-records/bailian-asr.server"
import { cleanText, isRecord, numberValue } from "@/lib/service-records/server"

function audioSegmentMeta(segment: any) {
  return {
    id: cleanText(segment.id, 160),
    segment_index: Number(segment.segment_index || 0) || null,
    client_segment_id: cleanText(segment.client_segment_id, 160),
    content_type: cleanText(segment.content_type, 120) || "audio/ogg",
    audio_bytes: Math.max(0, Math.round(numberValue(segment.audio_bytes, 0))),
    duration_seconds: Math.max(0, Math.round(numberValue(segment.client_audio_seconds, 0))),
  }
}

export function buildServiceRecordAudioEvidence(segments: any[], opts: {
  sessionId?: string
  signFirstUrl?: string
  expiresAt?: string
} = {}) {
  const availableSegments = (segments || [])
    .filter((segment) => cleanText(segment.storage_path, 2000))
    .map(audioSegmentMeta)

  const firstSegment = availableSegments[0] || null
  return {
    saved: availableSegments.length > 0,
    status_label: availableSegments.length ? "原音已保存" : "原音待确认",
    playback_available: availableSegments.length > 0 && Boolean(opts.signFirstUrl || opts.sessionId),
    signed_url_required: true,
    segment_count: availableSegments.length,
    first_segment_id: firstSegment?.id || "",
    playback_url: opts.signFirstUrl || "",
    playback_url_expires_at: opts.expiresAt || "",
    playback_api_url: firstSegment && opts.sessionId
      ? `/api/mp/service-records/sessions/${encodeURIComponent(opts.sessionId)}/audio/${encodeURIComponent(firstSegment.id)}`
      : "",
    segments: availableSegments.slice(0, 12).map((segment) => ({
      ...segment,
      playback_api_url: opts.sessionId
        ? `/api/mp/service-records/sessions/${encodeURIComponent(opts.sessionId)}/audio/${encodeURIComponent(segment.id)}`
        : "",
    })),
  }
}

export async function createServiceRecordSegmentAudioUrl(segment: any) {
  const storagePath = cleanText(segment.storage_path, 2000)
  if (!storagePath) throw new Error("missing_storage_path")
  return createSignedAudioUrlForBailian({
    storagePath,
    storageBucket: segment.storage_bucket,
    metadata: isRecord(segment.metadata) ? segment.metadata : {},
  })
}
