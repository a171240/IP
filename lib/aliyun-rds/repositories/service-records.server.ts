import "server-only"

import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError, queryAliyunRds, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"
import {
  accountContextPayload,
  getAliyunRdsAppAccountContext,
  type AppAccountContext,
  type AppAuthUser,
} from "@/lib/aliyun-rds/repositories/account-profile.server"
import { requireAppFeatureAccess, type AppRequestedTenantScope } from "@/lib/aliyun-rds/app-authorization.server"

export const SERVICE_RECORD_RESUME_WINDOW_MS = 5 * 60 * 1000
export const SERVICE_RECORD_MAX_SEGMENT_BYTES = 12 * 1024 * 1024

export type ServiceRecordSessionRow = {
  id: string
  created_at: string | null
  updated_at: string | null
  user_id: string
  company_id: string | null
  store_id: string | null
  membership_id: string | null
  client_session_id: string
  customer_profile_id: string | null
  scene_card_id: string | null
  status: string
  objective: string | null
  participants: unknown
  consent_confirmed: boolean | null
  consent_note: string | null
  started_at: string | null
  ended_at: string | null
  resume_deadline_at: string | null
  processing_started_at: string | null
  completed_at: string | null
  audio_seconds: number | string | null
  segment_count: number | null
  customer_snapshot_json: unknown
  scene_snapshot_json: unknown
  context_snapshot_json: unknown
  result_json: unknown
  note_markdown: string | null
  profile_suggestions_json: unknown
  xhs_draft_id: string | null
  metadata: unknown
}

export type ServiceRecordSegmentRow = {
  id: string
  session_id: string
  client_segment_id: string
  segment_index: number | null
  status: string | null
  storage_bucket: string | null
  storage_path: string | null
  content_type: string | null
  format: string | null
  audio_bytes: number | string | null
  client_audio_seconds: number | string | null
  started_at: string | null
  ended_at: string | null
  uploaded_at: string | null
  asr_status: string | null
  transcript_text: string | null
  asr_json: unknown
  metadata: unknown
}

export type ServiceRecordMarkerRow = {
  id: string
  created_at: string | null
  session_id: string
  marker_type: string
  label: string | null
  offset_seconds: number | string | null
  note: string | null
  metadata: unknown
}

type ServiceRecordSnapshotRow = Record<string, unknown> & {
  id: string
  user_id: string
  name?: string | null
  service_name?: string | null
}

export type AliyunRdsServiceRecordAuth = {
  ctx: AppAccountContext
  user: AppAuthUser
}

export function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export function rdsServiceRecordErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" },
      { status: 503 },
    )
  }
  return jsonError(500, error instanceof Error ? error.message : fallbackCode, fallbackCode)
}

export function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

export function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ""
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function numberValue(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function integerValue(value: unknown, fallback = 0) {
  return Math.max(0, Math.round(numberValue(value, fallback)))
}

export function isoOrNull(value: unknown) {
  const text = cleanText(value, 80)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function pathSafe(value: unknown, fallback = "unknown") {
  const text = cleanText(value, 160).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return text || fallback
}

export function normalizeJsonArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 12)
}

function integerMeta(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function serviceRecordAppendClosed(status: unknown) {
  return ["completed", "failed", "cancelled"].includes(cleanText(status, 40))
}

export function sourceFileMetadataFromPayload(payload: Record<string, unknown>) {
  const sourceFileKey = cleanText(payload?.source_file_key, 360)
  const meta: Record<string, unknown> = {}
  if (sourceFileKey) meta.source_file_key = sourceFileKey
  const deviceId = cleanText(payload?.device_id, 180)
  const deviceName = cleanText(payload?.device_name, 120)
  const deviceFileName = cleanText(payload?.device_file_name, 220)
  const deviceFileTime = integerMeta(payload?.device_file_time)
  const deviceFileSize = integerMeta(payload?.device_file_size)
  if (deviceId) meta.device_id = deviceId
  if (deviceName) meta.device_name = deviceName
  if (deviceFileName) meta.device_file_name = deviceFileName
  if (deviceFileTime) meta.device_file_time = deviceFileTime
  if (deviceFileSize) meta.device_file_size = deviceFileSize
  return meta
}

export function reusableSegmentHasAudio(segment: ServiceRecordSegmentRow | null | undefined) {
  return Boolean(segment && cleanText(segment.storage_path, 2000))
}

export function reusableSegmentAsrSnapshot(segment: ServiceRecordSegmentRow | null | undefined) {
  if (!segment) return null
  const status = cleanText(segment.asr_status, 40)
  if (!["done", "running", "skipped"].includes(status)) return null
  return {
    asr_status: status,
    transcript_text: cleanText(segment.transcript_text, 100000) || null,
    asr_json: isRecord(segment.asr_json) ? segment.asr_json : null,
  }
}

function jsonbParam(value: unknown) {
  return typeof value === "undefined" || value === null ? null : JSON.stringify(value)
}

function participantsOf(row: ServiceRecordSessionRow) {
  return Array.isArray(row.participants) ? row.participants : []
}

export function buildAliyunRdsContextSnapshot(ctx: AppAccountContext) {
  return {
    membership_id: ctx.membershipId,
    role: ctx.role,
    role_label: ctx.roleLabel,
    company_id: ctx.companyId,
    company_name: ctx.companyName,
    store_id: ctx.storeId,
    store_name: ctx.storeName,
    scope_label: ctx.scopeLabel,
  }
}

export function accountPayload(ctx: AppAccountContext) {
  return accountContextPayload(ctx)
}

function requestedServiceRecordScope(ctx: AppAccountContext, request: NextRequest): AppRequestedTenantScope {
  const params = new URL(request.url).searchParams
  const hasRequestedCompanyId = params.has("company_id")
  const hasRequestedStoreId = params.has("store_id")
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)
  if (hasRequestedCompanyId || hasRequestedStoreId) {
    return {
      ...(hasRequestedCompanyId ? { companyId: requestedCompanyId || null } : {}),
      ...(hasRequestedStoreId ? { storeId: requestedStoreId || null } : {}),
    }
  }
  return {
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    ...(ctx.storeId ? { storeId: ctx.storeId } : {}),
  }
}

function serviceRecordAuthorizationError(access: { status: number; body: unknown }) {
  return NextResponse.json(access.body, { status: access.status })
}

export async function resolveAliyunRdsServiceRecordAuth(request: NextRequest): Promise<
  | { ok: true; value: AliyunRdsServiceRecordAuth }
  | { ok: false; error: Response }
> {
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) {
    return {
      ok: false,
      error: appAuthRequiredResponse(),
    }
  }

  try {
    const authUser = auth.user
    const ctx = await getAliyunRdsAppAccountContext(authUser)
    const access = requireAppFeatureAccess(
      ctx,
      ctx.features,
      "service_record",
      requestedServiceRecordScope(ctx, request),
    )
    if (!access.ok) {
      return { ok: false, error: serviceRecordAuthorizationError(access) }
    }
    return { ok: true, value: { ctx, user: authUser } }
  } catch (error) {
    return { ok: false, error: rdsServiceRecordErrorResponse(error, "account_context_failed") }
  }
}

export function canReadServiceRecordSession(ctx: AppAccountContext, session: ServiceRecordSessionRow | null) {
  if (!session) return false
  const isSessionOwner = String(session.user_id || "") === ctx.userId
  if (!ctx.isManager && !isSessionOwner) return false

  const companyScope = session.company_id ? { companyId: String(session.company_id) } : {}
  const resourceScope: AppRequestedTenantScope = ctx.isCompanyManager && !ctx.isPlatformAdmin
    ? companyScope
    : {
        ...companyScope,
        ...(session.store_id ? { storeId: String(session.store_id) } : {}),
      }
  return requireAppFeatureAccess(ctx, ctx.features, "service_record", resourceScope).ok
}

export function toPublicSession(row: ServiceRecordSessionRow | null) {
  if (!row) return null
  return {
    id: row.id,
    client_session_id: row.client_session_id,
    status: row.status,
    customer_profile_id: row.customer_profile_id || null,
    scene_card_id: row.scene_card_id || null,
    company_id: row.company_id || null,
    store_id: row.store_id || null,
    membership_id: row.membership_id || null,
    objective: row.objective || "",
    participants: participantsOf(row),
    consent_confirmed: Boolean(row.consent_confirmed),
    started_at: row.started_at || null,
    ended_at: row.ended_at || null,
    resume_deadline_at: row.resume_deadline_at || null,
    processing_started_at: row.processing_started_at || null,
    completed_at: row.completed_at || null,
    audio_seconds: Number(row.audio_seconds || 0),
    segment_count: Number(row.segment_count || 0),
    customer_snapshot: row.customer_snapshot_json || null,
    scene_snapshot: row.scene_snapshot_json || null,
    context_snapshot: row.context_snapshot_json || null,
    result: row.result_json || null,
    note_markdown: row.note_markdown || "",
    profile_suggestions: row.profile_suggestions_json || null,
    xhs_draft_id: row.xhs_draft_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

export function toPublicSegment(row: ServiceRecordSegmentRow) {
  const metadata = isRecord(row?.metadata) ? row.metadata : {}
  return {
    id: row.id,
    client_segment_id: row.client_segment_id,
    segment_index: row.segment_index,
    status: row.status,
    format: row.format || "",
    content_type: cleanText(row.content_type, 120),
    audio_bytes: Number(row.audio_bytes || 0),
    client_audio_seconds: row.client_audio_seconds == null ? null : Number(row.client_audio_seconds),
    started_at: row.started_at || null,
    ended_at: row.ended_at || null,
    uploaded_at: row.uploaded_at || null,
    asr_status: row.asr_status || "pending",
    transcript_text: row.transcript_text || "",
    audio_available: Boolean(row.storage_path),
    storage_provider: cleanText(metadata.storage_provider, 80),
    upload_source: cleanText(metadata.upload_source, 80),
    audio_format_guess: cleanText(metadata.audio_format_guess, 200),
    original_file_name: cleanText(metadata.original_file_name, 200),
    source_file_key: cleanText(metadata.source_file_key, 360),
    device_id: cleanText(metadata.device_id, 180),
    device_name: cleanText(metadata.device_name, 120),
    device_file_name: cleanText(metadata.device_file_name, 220),
    device_file_time: metadata.device_file_time || null,
    device_file_size: metadata.device_file_size || null,
    reused_upload: Boolean(metadata.reused_upload),
    reused_from_segment_id: cleanText(metadata.reused_from_segment_id, 160),
    playback_api_url: row.session_id && row.id
      ? `/api/app/service-records/sessions/${encodeURIComponent(String(row.session_id))}/audio/${encodeURIComponent(String(row.id))}`
      : "",
  }
}

export function toPublicMarker(row: ServiceRecordMarkerRow) {
  return {
    id: row.id,
    marker_type: row.marker_type,
    label: row.label || "",
    offset_seconds: Number(row.offset_seconds || 0),
    note: row.note || "",
    created_at: row.created_at || null,
  }
}

export function buildServiceRecordAudioEvidence(segments: ServiceRecordSegmentRow[], opts: { sessionId: string }) {
  const availableSegments = (segments || []).filter((segment) => cleanText(segment.storage_path, 2000))
  const firstSegment = availableSegments[0]
  return {
    saved: availableSegments.length > 0,
    playback_available: availableSegments.length > 0,
    signed_url_required: availableSegments.length > 0,
    segment_count: availableSegments.length,
    first_segment_id: firstSegment?.id || "",
    segments: availableSegments.slice(0, 12).map((segment) => ({
      segment_id: segment.id,
      segment_index: segment.segment_index,
      content_type: cleanText(segment.content_type, 120) || "audio/ogg",
      audio_bytes: Number(segment.audio_bytes || 0),
      duration_seconds: Number(segment.client_audio_seconds || 0),
      playback_api_url: `/api/app/service-records/sessions/${encodeURIComponent(opts.sessionId)}/audio/${encodeURIComponent(segment.id)}`,
    })),
  }
}

export function sessionWithAudioEvidence(session: ServiceRecordSessionRow, audioEvidence: unknown) {
  const publicSession = toPublicSession(session)
  const result = isRecord(publicSession?.result) ? { ...publicSession.result } : {}
  const minutes = isRecord(result.service_minutes_v2) ? { ...result.service_minutes_v2 } : null
  const recording = isRecord(minutes?.recording) ? { ...minutes.recording } : {}

  if (minutes) {
    minutes.audio_evidence = audioEvidence
    minutes.recording = {
      ...recording,
      audio_saved: isRecord(audioEvidence) ? Boolean(audioEvidence.saved) : false,
      playback_available: isRecord(audioEvidence) ? Boolean(audioEvidence.playback_available) : false,
      signed_url_required: isRecord(audioEvidence) ? Boolean(audioEvidence.signed_url_required) : false,
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

export async function listAliyunRdsServiceRecordSessions(args: {
  ctx: AppAccountContext
  limit: number
  customerProfileId?: string
  requestedCompanyId?: string
  requestedStoreId?: string
}) {
  const clauses: string[] = []
  const values: unknown[] = []

  function addClause(sql: string, value: unknown) {
    values.push(value)
    clauses.push(sql.replace("?", `$${values.length}`))
  }

  if (args.customerProfileId) addClause("customer_profile_id = ?", args.customerProfileId)
  if (args.ctx.isPlatformAdmin) {
    if (args.requestedCompanyId) addClause("company_id = ?", args.requestedCompanyId)
    if (args.requestedStoreId) addClause("store_id = ?", args.requestedStoreId)
  } else if (args.ctx.isStoreManager && args.ctx.storeId) {
    addClause("store_id = ?", args.ctx.storeId)
  } else if (args.ctx.isCompanyManager && args.ctx.companyId) {
    addClause("company_id = ?", args.ctx.companyId)
  } else {
    addClause("user_id = ?", args.ctx.userId)
  }

  values.push(args.limit)
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      select *
      from public.service_record_sessions
      ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
      order by started_at desc
      limit $${values.length}
    `,
    values,
  )
  return result.rows
}

async function loadSnapshot(table: "voice_coach_customer_profiles" | "voice_coach_scene_cards", id: string, userId: string) {
  if (!id) return null
  const result = await queryAliyunRds<ServiceRecordSnapshotRow>(
    `select * from public.${table} where id = $1 and user_id = $2 limit 1`,
    [id, userId],
  )
  return result.rows[0] || null
}

export async function createAliyunRdsServiceRecordSession(ctx: AppAccountContext, body: Record<string, unknown>) {
  const clientSessionId = cleanText(body.client_session_id, 120)
  const customerProfileId = cleanText(body.customer_profile_id, 80)
  const sceneCardId = cleanText(body.scene_card_id, 80)

  const existing = await queryAliyunRds<ServiceRecordSessionRow>(
    "select * from public.service_record_sessions where user_id = $1 and client_session_id = $2 limit 1",
    [ctx.userId, clientSessionId],
  )
  if (existing.rows[0]) return { session: existing.rows[0], created: false }

  const [customer, scene] = await Promise.all([
    customerProfileId ? loadSnapshot("voice_coach_customer_profiles", customerProfileId, ctx.userId) : Promise.resolve(null),
    sceneCardId ? loadSnapshot("voice_coach_scene_cards", sceneCardId, ctx.userId) : Promise.resolve(null),
  ])

  if (customerProfileId && !customer) return { errorCode: "customer_profile_not_found" as const }
  if (sceneCardId && !scene) return { errorCode: "scene_card_not_found" as const }

  const now = new Date().toISOString()
  const contextSnapshot = buildAliyunRdsContextSnapshot(ctx)
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      insert into public.service_record_sessions (
        user_id,
        company_id,
        store_id,
        membership_id,
        client_session_id,
        customer_profile_id,
        scene_card_id,
        status,
        objective,
        participants,
        consent_confirmed,
        consent_note,
        customer_snapshot_json,
        scene_snapshot_json,
        context_snapshot_json,
        metadata,
        started_at,
        updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, 'recording', $8, $9::jsonb, true, $10,
        $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $15
      )
      returning *
    `,
    [
      ctx.userId,
      ctx.companyId,
      ctx.storeId,
      ctx.membershipId,
      clientSessionId,
      customerProfileId || null,
      sceneCardId || null,
      cleanText(body.objective, 200) || "到店服务沟通记录",
      jsonbParam(normalizeJsonArray(body.participants)),
      cleanText(body.consent_note, 300),
      jsonbParam(customer),
      jsonbParam(scene),
      jsonbParam(contextSnapshot),
      jsonbParam({
        source: "mp_service_record",
        created_from: "service_record_page",
        customer_name: firstText(customer?.name),
        scene_name: firstText(scene?.name, scene?.service_name),
        account_context: contextSnapshot,
      }),
      now,
    ],
  )
  if (!result.rows[0]) throw new Error("insert_failed")
  return { session: result.rows[0], created: true }
}

export async function getAliyunRdsReadableServiceRecordSession(ctx: AppAccountContext, sessionId: string) {
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    "select * from public.service_record_sessions where id = $1 limit 1",
    [sessionId],
  )
  const session = result.rows[0] || null
  return canReadServiceRecordSession(ctx, session) ? session : null
}

export async function getAliyunRdsOwnedServiceRecordSession(ctx: AppAccountContext, sessionId: string) {
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    "select * from public.service_record_sessions where id = $1 and user_id = $2 limit 1",
    [sessionId, ctx.userId],
  )
  return result.rows[0] || null
}

export async function listAliyunRdsServiceRecordSegments(sessionId: string) {
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      select *
      from public.service_record_segments
      where session_id = $1
      order by segment_index asc
    `,
    [sessionId],
  )
  return result.rows
}

export async function listAliyunRdsServiceRecordMarkers(sessionId: string) {
  const result = await queryAliyunRds<ServiceRecordMarkerRow>(
    `
      select *
      from public.service_record_markers
      where session_id = $1
      order by offset_seconds asc
    `,
    [sessionId],
  )
  return result.rows
}

export async function endAliyunRdsServiceRecordSession(args: {
  session: ServiceRecordSessionRow
  endedReason?: unknown
  mode?: unknown
}) {
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const resumeDeadlineAt = new Date(nowMs + SERVICE_RECORD_RESUME_WINDOW_MS).toISOString()
  const metadata = {
    ...(isRecord(args.session.metadata) ? args.session.metadata : {}),
    ended_reason: cleanText(args.endedReason, 120) || "service_completed",
    end_mode: cleanText(args.mode, 80) || "end_pending",
    end_client_confirmed_at: now,
  }
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      update public.service_record_sessions
      set status = 'ended_pending',
          ended_at = $2,
          resume_deadline_at = $3,
          metadata = $4::jsonb,
          updated_at = $2
      where id = $1
      returning *
    `,
    [args.session.id, now, resumeDeadlineAt, jsonbParam(metadata)],
  )
  if (!result.rows[0]) throw new Error("session_end_failed")
  return result.rows[0]
}

export async function resumeAliyunRdsServiceRecordSession(sessionId: string) {
  const now = new Date().toISOString()
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      update public.service_record_sessions
      set status = 'recording',
          ended_at = null,
          resume_deadline_at = null,
          updated_at = $2
      where id = $1
      returning *
    `,
    [sessionId, now],
  )
  if (!result.rows[0]) throw new Error("session_resume_failed")
  return result.rows[0]
}

export async function createAliyunRdsServiceRecordMarker(args: {
  ctx: AppAccountContext
  session: ServiceRecordSessionRow
  markerType: string
  label?: unknown
  offsetSeconds?: unknown
  note?: unknown
}) {
  const result = await queryAliyunRds<ServiceRecordMarkerRow>(
    `
      insert into public.service_record_markers (
        session_id,
        user_id,
        company_id,
        store_id,
        marker_type,
        label,
        offset_seconds,
        note,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      returning *
    `,
    [
      args.session.id,
      args.ctx.userId,
      args.session.company_id || null,
      args.session.store_id || null,
      args.markerType,
      cleanText(args.label, 120),
      Math.max(0, numberValue(args.offsetSeconds, 0)),
      cleanText(args.note, 500) || null,
      jsonbParam({ source: "mp_service_record" }),
    ],
  )
  if (!result.rows[0]) throw new Error("marker_insert_failed")
  return result.rows[0]
}

function reusableSegmentScopeClauses(scope: {
  user_id?: unknown
  userId?: unknown
  company_id?: unknown
  companyId?: unknown
  store_id?: unknown
  storeId?: unknown
}) {
  const clauses: string[] = ["storage_path is not null", "storage_path <> ''"]
  const values: unknown[] = []
  const companyId = cleanText(scope.company_id ?? scope.companyId, 80)
  const storeId = cleanText(scope.store_id ?? scope.storeId, 80)
  const userId = cleanText(scope.user_id ?? scope.userId, 80)

  if (companyId) {
    values.push(companyId)
    clauses.push(`company_id = $${values.length}`)
  } else if (userId) {
    values.push(userId)
    clauses.push(`user_id = $${values.length}`)
  }
  if (storeId) {
    values.push(storeId)
    clauses.push(`store_id = $${values.length}`)
  }

  return { clauses, values }
}

export async function findReusableAliyunRdsServiceRecordSegment(
  scope: { user_id?: unknown; userId?: unknown; company_id?: unknown; companyId?: unknown; store_id?: unknown; storeId?: unknown },
  sourceFileKey: string,
) {
  const key = cleanText(sourceFileKey, 360)
  if (!key) return null
  const scoped = reusableSegmentScopeClauses(scope)
  const values = [...scoped.values, jsonbParam({ source_file_key: key })]
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      select *
      from public.service_record_segments
      where ${scoped.clauses.join(" and ")}
        and metadata @> $${values.length}::jsonb
      order by uploaded_at desc
      limit 1
    `,
    values,
  )
  return result.rows[0] || null
}

export async function findReusableAliyunRdsServiceRecordSegmentBySourceMeta(
  scope: { user_id?: unknown; userId?: unknown; company_id?: unknown; companyId?: unknown; store_id?: unknown; storeId?: unknown },
  sourceMeta: Record<string, unknown>,
) {
  const deviceFileName = cleanText(sourceMeta?.device_file_name, 220)
  const deviceFileTime = integerMeta(sourceMeta?.device_file_time)
  const deviceFileSize = integerMeta(sourceMeta?.device_file_size)
  if (!deviceFileName || (!deviceFileTime && !deviceFileSize)) return null

  const contains: Record<string, unknown> = {
    device_file_name: deviceFileName,
  }
  if (deviceFileTime) contains.device_file_time = deviceFileTime
  if (deviceFileSize) contains.device_file_size = deviceFileSize

  const scoped = reusableSegmentScopeClauses(scope)
  const values = [...scoped.values, jsonbParam(contains)]
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      select *
      from public.service_record_segments
      where ${scoped.clauses.join(" and ")}
        and metadata @> $${values.length}::jsonb
      order by uploaded_at desc
      limit 1
    `,
    values,
  )
  return result.rows[0] || null
}

export async function refreshAliyunRdsServiceRecordSessionAggregate(sessionId: string) {
  const now = new Date().toISOString()
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      with aggregate as (
        select
          count(*)::int as segment_count,
          coalesce(sum(client_audio_seconds), 0)::numeric as audio_seconds
        from public.service_record_segments
        where session_id = $1
      )
      update public.service_record_sessions s
      set segment_count = aggregate.segment_count,
          audio_seconds = round(aggregate.audio_seconds),
          updated_at = $2
      from aggregate
      where s.id = $1
      returning s.*
    `,
    [sessionId, now],
  )
  return result.rows[0] || null
}

export async function upsertAliyunRdsServiceRecordSegment(args: {
  ctx: AppAccountContext
  session: ServiceRecordSessionRow
  clientSegmentId: string
  segmentIndex: number
  storageBucket: string
  storagePath: string
  contentType: string
  format: string
  audioBytes: number
  clientAudioSeconds?: unknown
  startedAt?: unknown
  endedAt?: unknown
  asrStatus?: string
  transcriptText?: string | null
  asrJson?: unknown
  metadata?: Record<string, unknown>
}) {
  return withAliyunRdsTransaction(async (client) => {
    const now = new Date().toISOString()
    const result = await client.query<ServiceRecordSegmentRow>(
      `
        insert into public.service_record_segments (
          session_id,
          user_id,
          company_id,
          store_id,
          client_segment_id,
          segment_index,
          status,
          storage_bucket,
          storage_path,
          content_type,
          format,
          audio_bytes,
          client_audio_seconds,
          started_at,
          ended_at,
          uploaded_at,
          updated_at,
          asr_status,
          transcript_text,
          asr_json,
          metadata
        )
        values (
          $1, $2, $3, $4, $5, $6, 'uploaded', $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $15, $16, $17, $18::jsonb, $19::jsonb
        )
        on conflict (session_id, client_segment_id)
        do update set
          segment_index = excluded.segment_index,
          status = excluded.status,
          storage_bucket = excluded.storage_bucket,
          storage_path = excluded.storage_path,
          content_type = excluded.content_type,
          format = excluded.format,
          audio_bytes = excluded.audio_bytes,
          client_audio_seconds = excluded.client_audio_seconds,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          uploaded_at = excluded.uploaded_at,
          updated_at = excluded.updated_at,
          asr_status = excluded.asr_status,
          transcript_text = excluded.transcript_text,
          asr_json = excluded.asr_json,
          metadata = excluded.metadata
        returning *
      `,
      [
        args.session.id,
        args.ctx.userId,
        args.session.company_id || null,
        args.session.store_id || null,
        args.clientSegmentId,
        args.segmentIndex,
        args.storageBucket,
        args.storagePath,
        args.contentType,
        args.format,
        Math.max(0, Math.round(numberValue(args.audioBytes, 0))),
        numberValue(args.clientAudioSeconds, 0) || null,
        isoOrNull(args.startedAt),
        isoOrNull(args.endedAt),
        now,
        cleanText(args.asrStatus, 40) || "pending",
        args.transcriptText || null,
        jsonbParam(args.asrJson || null),
        jsonbParam(args.metadata || {}),
      ],
    )
    const segment = result.rows[0]
    if (!segment) throw new Error("segment_upsert_failed")

    await client.query(
      `
        with aggregate as (
          select
            count(*)::int as segment_count,
            coalesce(sum(client_audio_seconds), 0)::numeric as audio_seconds
          from public.service_record_segments
          where session_id = $1
        )
        update public.service_record_sessions s
        set segment_count = aggregate.segment_count,
            audio_seconds = round(aggregate.audio_seconds),
            updated_at = $2
        from aggregate
        where s.id = $1
      `,
      [args.session.id, now],
    )
    return segment
  })
}

export async function listAliyunRdsServiceRecordAsrCandidates(sessionId: string, limit = 20) {
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      select *
      from public.service_record_segments
      where session_id = $1
        and asr_status = any($2::text[])
      order by segment_index asc
      limit $3
    `,
    [sessionId, ["pending", "running", "failed"], Math.max(1, Math.min(100, Math.round(limit)))],
  )
  return result.rows
}

export async function updateAliyunRdsServiceRecordSegmentAsr(args: {
  segmentId: string
  asrStatus: string
  transcriptText?: string | null
  asrJson?: unknown
}) {
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      update public.service_record_segments
      set asr_status = $2,
          transcript_text = $3,
          asr_json = $4::jsonb,
          updated_at = $5
      where id = $1
      returning *
    `,
    [
      args.segmentId,
      cleanText(args.asrStatus, 40),
      args.transcriptText || null,
      jsonbParam(args.asrJson || null),
      new Date().toISOString(),
    ],
  )
  return result.rows[0] || null
}

export async function getAliyunRdsServiceRecordSegment(sessionId: string, segmentId: string) {
  const result = await queryAliyunRds<ServiceRecordSegmentRow>(
    `
      select *
      from public.service_record_segments
      where session_id = $1 and id = $2
      limit 1
    `,
    [sessionId, segmentId],
  )
  return result.rows[0] || null
}

export async function updateAliyunRdsServiceRecordSessionProcessing(args: {
  session: ServiceRecordSessionRow
  status: "processing" | "completed"
  noteMarkdown: string
  resultJson: Record<string, unknown>
}) {
  const now = new Date().toISOString()
  const result = await queryAliyunRds<ServiceRecordSessionRow>(
    `
      update public.service_record_sessions
      set status = $2,
          processing_started_at = coalesce(processing_started_at, $3),
          completed_at = case when $2 = 'completed' then $3 else null end,
          note_markdown = $4,
          result_json = $5::jsonb,
          updated_at = $3
      where id = $1
      returning *
    `,
    [args.session.id, args.status, now, args.noteMarkdown, jsonbParam(args.resultJson)],
  )
  if (!result.rows[0]) throw new Error("session_process_failed")
  return result.rows[0]
}
