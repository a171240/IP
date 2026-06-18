import { NextRequest, NextResponse } from "next/server"

import { buildServiceRecordAudioEvidence } from "@/lib/service-records/audio-evidence.server"
import {
  accountPayload,
  getReadableServiceRecordSession,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
  toPublicMarker,
  toPublicSegment,
  toPublicSession,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

function sessionWithAudioEvidence(session: any, audioEvidence: any) {
  const publicSession = toPublicSession(session)
  const result = isRecord(publicSession?.result) ? { ...publicSession.result } : {}
  const minutes = isRecord(result.service_minutes_v2) ? { ...result.service_minutes_v2 } : null
  const recording = isRecord(minutes?.recording) ? { ...minutes.recording } : {}

  if (minutes) {
    minutes.audio_evidence = audioEvidence
    minutes.recording = {
      ...recording,
      audio_saved: audioEvidence.saved,
      playback_available: audioEvidence.playback_available,
      signed_url_required: audioEvidence.signed_url_required,
      audio_evidence: audioEvidence,
    }
    result.service_minutes_v2 = minutes
  }
  result.audio_evidence = audioEvidence

  return {
    ...publicSession,
    result,
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getReadableServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error

  const [segmentsResult, markersResult] = await Promise.all([
    admin
      .from("service_record_segments")
      .select("*")
      .eq("session_id", loaded.session.id)
      .order("segment_index", { ascending: true }),
    admin
      .from("service_record_markers")
      .select("*")
      .eq("session_id", loaded.session.id)
      .order("offset_seconds", { ascending: true }),
  ])

  if (segmentsResult.error) return jsonError(500, segmentsResult.error.message || "segments_query_failed", "segments_query_failed")
  if (markersResult.error) return jsonError(500, markersResult.error.message || "markers_query_failed", "markers_query_failed")

  const segments = segmentsResult.data || []
  const audioEvidence = buildServiceRecordAudioEvidence(segments, { sessionId: loaded.session.id })

  return NextResponse.json({
    ok: true,
    context: accountPayload(ctx),
    session: sessionWithAudioEvidence(loaded.session, audioEvidence),
    segments: segments.map(toPublicSegment),
    markers: (markersResult.data || []).map(toPublicMarker),
    audio_evidence: audioEvidence,
  })
}
