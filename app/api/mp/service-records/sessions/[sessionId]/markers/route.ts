import { NextRequest, NextResponse } from "next/server"

import {
  cleanText,
  getOwnedServiceRecordSession,
  isRecord,
  jsonError,
  numberValue,
  resolveServiceRecordAuth,
  toPublicMarker,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

const ALLOWED_MARKER_TYPES = new Set([
  "customer_objection",
  "deal_signal",
  "professional_question",
  "manager_joined",
  "custom",
])

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

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) return jsonError(400, "invalid_payload", "invalid_payload")

  const markerType = cleanText(body.marker_type, 60) || "custom"
  const normalizedType = ALLOWED_MARKER_TYPES.has(markerType) ? markerType : "custom"
  const { data, error } = await admin
    .from("service_record_markers")
    .insert({
      session_id: session.id,
      user_id: ctx.userId,
      company_id: session.company_id || null,
      store_id: session.store_id || null,
      marker_type: normalizedType,
      label: cleanText(body.label, 120),
      offset_seconds: Math.max(0, numberValue(body.offset_seconds, 0)),
      note: cleanText(body.note, 500) || null,
      metadata: { source: "mp_service_record" },
    })
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "marker_insert_failed", "marker_insert_failed")

  return NextResponse.json({
    ok: true,
    marker: toPublicMarker(data),
  })
}
