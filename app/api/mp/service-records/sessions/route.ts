import { NextRequest, NextResponse } from "next/server"

import {
  accountPayload,
  buildContextSnapshot,
  cleanText,
  firstText,
  isRecord,
  jsonError,
  normalizeJsonArray,
  resolveServiceRecordAuth,
  toPublicSession,
} from "@/lib/service-records/server"

export const runtime = "nodejs"

async function loadSnapshot(admin: any, table: string, id: string, userId: string) {
  if (!id) return null
  const { data, error } = await admin.from(table).select("*").eq("id", id).eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

export async function GET(request: NextRequest) {
  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const params = new URL(request.url).searchParams
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") || 20) || 20))
  const customerProfileId = cleanText(params.get("customer_profile_id"), 80)
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  let query = admin
    .from("service_record_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (customerProfileId) query = query.eq("customer_profile_id", customerProfileId)
  if (ctx.isPlatformAdmin) {
    if (requestedCompanyId) query = query.eq("company_id", requestedCompanyId)
    if (requestedStoreId) query = query.eq("store_id", requestedStoreId)
  } else if (ctx.isStoreManager && ctx.storeId) {
    query = query.eq("store_id", ctx.storeId)
  } else if (ctx.isCompanyManager && ctx.companyId) {
    query = query.eq("company_id", ctx.companyId)
  } else {
    query = query.eq("user_id", ctx.userId)
  }

  const { data, error } = await query
  if (error) return jsonError(500, error.message || "query_failed", "query_failed")

  return NextResponse.json({
    ok: true,
    context: accountPayload(ctx),
    sessions: (data || []).map(toPublicSession),
  })
}

export async function POST(request: NextRequest) {
  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) return jsonError(400, "invalid_payload", "invalid_payload")

  const clientSessionId = cleanText(body.client_session_id, 120)
  const customerProfileId = cleanText(body.customer_profile_id, 80)
  const sceneCardId = cleanText(body.scene_card_id, 80)
  const consentConfirmed = body.consent_confirmed === true
  if (!clientSessionId) return jsonError(400, "missing_client_session_id", "missing_client_session_id")
  if (!consentConfirmed) return jsonError(400, "请先确认录音知情", "consent_required")

  const { data: existing, error: existingError } = await admin
    .from("service_record_sessions")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("client_session_id", clientSessionId)
    .maybeSingle()
  if (existingError) return jsonError(500, existingError.message || "session_query_failed", "session_query_failed")
  if (existing) {
    return NextResponse.json({ ok: true, context: accountPayload(ctx), session: toPublicSession(existing) })
  }

  let customer: any = null
  let scene: any = null
  try {
    if (customerProfileId) customer = await loadSnapshot(admin, "voice_coach_customer_profiles", customerProfileId, ctx.userId)
    if (sceneCardId) scene = await loadSnapshot(admin, "voice_coach_scene_cards", sceneCardId, ctx.userId)
  } catch (error: any) {
    return jsonError(500, error?.message || "snapshot_query_failed", "snapshot_query_failed")
  }

  if (customerProfileId && !customer) return jsonError(404, "customer_profile_not_found", "customer_profile_not_found")
  if (sceneCardId && !scene) return jsonError(404, "scene_card_not_found", "scene_card_not_found")

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("service_record_sessions")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      membership_id: ctx.membershipId,
      client_session_id: clientSessionId,
      customer_profile_id: customerProfileId || null,
      scene_card_id: sceneCardId || null,
      status: "recording",
      objective: cleanText(body.objective, 200) || "到店服务沟通记录",
      participants: normalizeJsonArray(body.participants),
      consent_confirmed: true,
      consent_note: cleanText(body.consent_note, 300),
      customer_snapshot_json: customer,
      scene_snapshot_json: scene,
      context_snapshot_json: buildContextSnapshot(ctx),
      metadata: {
        source: "mp_service_record",
        created_from: "service_record_page",
        customer_name: firstText(customer?.name),
        scene_name: firstText(scene?.name, scene?.service_name),
        account_context: buildContextSnapshot(ctx),
      },
      started_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) return jsonError(500, error?.message || "insert_failed", "insert_failed")

  return NextResponse.json({
    ok: true,
    context: accountPayload(ctx),
    session: toPublicSession(data),
  })
}
