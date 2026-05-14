import { NextRequest, NextResponse } from "next/server"

import {
  getOwnedServiceRecordSession,
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

  if (String(session.status || "") !== "ended_pending") {
    return jsonError(409, "service_record_not_resumable", "service_record_not_resumable")
  }

  const deadline = session.resume_deadline_at ? new Date(String(session.resume_deadline_at)).getTime() : 0
  if (!deadline || deadline < Date.now()) {
    return jsonError(409, "resume_window_expired", "resume_window_expired")
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("service_record_sessions")
    .update({
      status: "recording",
      ended_at: null,
      resume_deadline_at: null,
      updated_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "session_resume_failed", "session_resume_failed")

  return NextResponse.json({
    ok: true,
    session: toPublicSession(data),
  })
}
