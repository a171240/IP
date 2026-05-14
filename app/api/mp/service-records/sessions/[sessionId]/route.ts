import { NextRequest, NextResponse } from "next/server"

import {
  accountPayload,
  getReadableServiceRecordSession,
  jsonError,
  resolveServiceRecordAuth,
  toPublicMarker,
  toPublicSegment,
  toPublicSession,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

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

  return NextResponse.json({
    ok: true,
    context: accountPayload(ctx),
    session: toPublicSession(loaded.session),
    segments: (segmentsResult.data || []).map(toPublicSegment),
    markers: (markersResult.data || []).map(toPublicMarker),
  })
}
