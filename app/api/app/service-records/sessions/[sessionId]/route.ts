import { NextRequest, NextResponse } from "next/server"

import {
  accountPayload,
  buildServiceRecordAudioEvidence,
  getAliyunRdsReadableServiceRecordSession,
  isRecord,
  jsonError,
  listAliyunRdsServiceRecordMarkers,
  listAliyunRdsServiceRecordSegments,
  rdsServiceRecordErrorResponse,
  resolveAliyunRdsServiceRecordAuth,
  sessionWithAudioEvidence,
  toPublicMarker,
  toPublicSegment,
} from "@/lib/aliyun-rds/repositories/service-records.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

  const auth = await resolveAliyunRdsServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { ctx } = auth.value

  try {
    const session = await getAliyunRdsReadableServiceRecordSession(ctx, id)
    if (!session) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })

    const [segments, markers] = await Promise.all([
      listAliyunRdsServiceRecordSegments(session.id),
      listAliyunRdsServiceRecordMarkers(session.id),
    ])
    const audioEvidence = buildServiceRecordAudioEvidence(segments, { sessionId: session.id })

    return NextResponse.json({
      ok: true,
      context: accountPayload(ctx),
      session: sessionWithAudioEvidence(session, audioEvidence),
      segments: segments.map(toPublicSegment),
      markers: markers.map(toPublicMarker),
      audio_evidence: isRecord(audioEvidence) ? audioEvidence : {},
    })
  } catch (error) {
    return rdsServiceRecordErrorResponse(error, "query_failed")
  }
}
