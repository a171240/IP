import "server-only"

import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  resolveMpAccountContext,
  type MpAccountContext,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const SERVICE_RECORD_RESUME_WINDOW_MS = 5 * 60 * 1000
export const SERVICE_RECORD_MAX_SEGMENT_BYTES = 12 * 1024 * 1024

export type ServiceRecordAuth = {
  admin: ReturnType<typeof createAdminSupabaseClient>
  ctx: MpAccountContext
  user: { id: string; email?: string | null; user_metadata?: unknown }
}

export type AudioDetection = {
  format: "mp3" | "wav" | "ogg" | "flac"
  ext: string
  contentType: string
}

export function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
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

export function detectAudio(file: File, formFormat?: unknown): AudioDetection {
  const requested = cleanText(formFormat, 20).toLowerCase()
  if (requested === "wav") return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (requested === "ogg") return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (requested === "flac") return { format: "flac", ext: "flac", contentType: "audio/flac" }
  if (requested === "mp3") return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }

  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  if (type.includes("wav") || name.endsWith(".wav")) return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (type.includes("ogg") || name.endsWith(".ogg")) return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (type.includes("flac") || name.endsWith(".flac")) return { format: "flac", ext: "flac", contentType: "audio/flac" }
  return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
}

export async function resolveServiceRecordAuth(request: NextRequest): Promise<
  | { ok: true; value: ServiceRecordAuth }
  | { ok: false; error: Response }
> {
  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth

  return {
    ok: true,
    value: {
      admin: createAdminSupabaseClient(),
      ctx: auth.ctx,
      user: auth.user,
    },
  }
}

export function buildContextSnapshot(ctx: MpAccountContext) {
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

export function canReadServiceRecordSession(ctx: MpAccountContext, session: any) {
  if (!session) return false
  if (String(session.user_id || "") === ctx.userId) return true
  if (ctx.isPlatformAdmin) return true
  if (ctx.isStoreManager && ctx.storeId && String(session.store_id || "") === ctx.storeId) return true
  if (ctx.isCompanyManager && ctx.companyId && String(session.company_id || "") === ctx.companyId) return true
  return false
}

export async function getOwnedServiceRecordSession(admin: any, ctx: MpAccountContext, sessionId: string) {
  const { data, error } = await admin
    .from("service_record_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", ctx.userId)
    .maybeSingle()

  if (error) return { error: jsonError(500, error.message || "session_query_failed", "session_query_failed") }
  if (!data) return { error: jsonError(404, "service_record_not_found", "service_record_not_found") }
  return { session: data }
}

export async function getReadableServiceRecordSession(admin: any, ctx: MpAccountContext, sessionId: string) {
  const { data, error } = await admin.from("service_record_sessions").select("*").eq("id", sessionId).maybeSingle()
  if (error) return { error: jsonError(500, error.message || "session_query_failed", "session_query_failed") }
  if (!data || !canReadServiceRecordSession(ctx, data)) {
    return { error: jsonError(404, "service_record_not_found", "service_record_not_found") }
  }
  return { session: data }
}

export function toPublicSession(row: any) {
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
    participants: Array.isArray(row.participants) ? row.participants : [],
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

export function toPublicSegment(row: any) {
  return {
    id: row.id,
    client_segment_id: row.client_segment_id,
    segment_index: row.segment_index,
    status: row.status,
    format: row.format || "",
    audio_bytes: Number(row.audio_bytes || 0),
    client_audio_seconds: row.client_audio_seconds == null ? null : Number(row.client_audio_seconds),
    started_at: row.started_at || null,
    ended_at: row.ended_at || null,
    uploaded_at: row.uploaded_at || null,
    asr_status: row.asr_status || "pending",
    transcript_text: row.transcript_text || "",
  }
}

export function toPublicMarker(row: any) {
  return {
    id: row.id,
    marker_type: row.marker_type,
    label: row.label || "",
    offset_seconds: Number(row.offset_seconds || 0),
    note: row.note || "",
    created_at: row.created_at || null,
  }
}

export function accountPayload(ctx: MpAccountContext) {
  return accountContextPayload(ctx)
}
