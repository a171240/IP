import { NextRequest, NextResponse } from "next/server"

import {
  SERVICE_RECORD_RESUME_WINDOW_MS,
  cleanText,
  getOwnedServiceRecordSession,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
  toPublicSession,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = String(sessionId || "").trim()
  if (!id) return jsonError(400, "missing_session_id", "missing_session_id")

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
  if (payload.client_confirmed !== true) return jsonError(400, "end_confirmation_required", "end_confirmation_required")

  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const resumeDeadlineAt = new Date(nowMs + SERVICE_RECORD_RESUME_WINDOW_MS).toISOString()
  const metadata = {
    ...(isRecord(session.metadata) ? session.metadata : {}),
    ended_reason: cleanText(payload.ended_reason, 120) || "service_completed",
    end_mode: cleanText(payload.mode, 80) || "end_pending",
    end_client_confirmed_at: now,
  }

  const { data, error } = await admin
    .from("service_record_sessions")
    .update({
      status: "ended_pending",
      ended_at: now,
      resume_deadline_at: resumeDeadlineAt,
      metadata,
      updated_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "session_end_failed", "session_end_failed")

  return NextResponse.json({
    ok: true,
    session: toPublicSession(data),
  })
}
