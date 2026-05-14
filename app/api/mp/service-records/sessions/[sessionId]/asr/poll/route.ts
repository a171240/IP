import { NextRequest, NextResponse } from "next/server"

import { isBailianAsrConfigured, queryBailianAsrTask } from "@/lib/service-records/bailian-asr.server"
import {
  cleanText,
  getOwnedServiceRecordSession,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
  toPublicSegment,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

function taskIdOf(segment: any) {
  const asrJson = isRecord(segment?.asr_json) ? segment.asr_json : {}
  return cleanText(asrJson.task_id, 160)
}

function toDbStatus(taskStatus: string) {
  if (taskStatus === "SUCCEEDED") return "done"
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") return "failed"
  return "running"
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")
  if (!isBailianAsrConfigured()) return jsonError(400, "bailian_api_key_missing", "bailian_api_key_missing")

  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const loaded = await getOwnedServiceRecordSession(admin, ctx, id)
  if ("error" in loaded) return loaded.error

  const { data: segments, error } = await admin
    .from("service_record_segments")
    .select("*")
    .eq("session_id", loaded.session.id)
    .in("asr_status", ["pending", "running", "failed"])
    .order("segment_index", { ascending: true })
    .limit(20)

  if (error) return jsonError(500, error.message || "segments_query_failed", "segments_query_failed")

  const updated = []
  for (const segment of segments || []) {
    const taskId = taskIdOf(segment)
    if (!taskId) continue

    try {
      const result = await queryBailianAsrTask(taskId)
      const asrJson = {
        ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
        provider: "bailian",
        task_id: result.taskId,
        task_status: result.taskStatus,
        request_id: result.requestId,
        last_polled_at: new Date().toISOString(),
        raw: result.raw,
        transcription: result.transcription,
      }
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: toDbStatus(result.taskStatus),
          transcript_text: result.text || segment.transcript_text || null,
          asr_json: asrJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
    } catch (err: any) {
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: "failed",
          asr_json: {
            ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
            provider: "bailian",
            error: cleanText(err?.message || "bailian_query_failed", 300),
            failed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
    }
  }

  return NextResponse.json({
    ok: true,
    segments: updated.map(toPublicSegment),
  })
}
