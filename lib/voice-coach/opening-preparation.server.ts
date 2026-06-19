import "server-only"

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"

type OpeningPreparationSupabaseClient = SupabaseClient

export type VoiceCoachOpeningPreparationStatus =
  | "preparing"
  | "audio_ready"
  | "fallback_ready"
  | "blocked"
  | "consumed"
  | "expired"

export type VoiceCoachOpeningPreparationRow = {
  id: string
  created_at?: string | null
  updated_at?: string | null
  expires_at?: string | null
  user_id: string
  account_id?: string | null
  idempotency_key: string
  session_id?: string | null
  scenario_id: string
  source_type?: string | null
  knowledge_space_id?: string | null
  training_pack_id?: string | null
  training_task_id?: string | null
  source_snapshot_hash?: string | null
  context_hash?: string | null
  text_hash?: string | null
  audio_hash?: string | null
  opening_context_json?: unknown
  opening_line_json?: unknown
  audio_path?: string | null
  audio_seconds?: number | null
  voice_profile_id?: string | null
  voice_config_hash?: string | null
  policy_status?: string | null
  policy_issues_json?: unknown
  status: VoiceCoachOpeningPreparationStatus
  attempt_count?: number | null
  locked_at?: string | null
  consumed_at?: string | null
  error_code?: string | null
  error_message?: string | null
}

export type VoiceCoachPreparedOpening = {
  preparation_id: string
  status: VoiceCoachOpeningPreparationStatus
  text: string
  emotion: string
  tag: string
  audio_path: string
  audio_url: string | null
  audio_seconds: number | null
  audio_source: "prepared" | "prepared_fallback"
}

function cleanText(value: unknown, max = 300): string {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max) : text
}

function stableJson(value: unknown): string {
  if (value == null) return "null"
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function hashVoiceCoachOpeningValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

export function getGeneratedOpeningAudioPath(scenarioId: string, text: string): string {
  const normalizedScenarioId = cleanText(scenarioId, 80) || "voice-coach"
  const normalizedText = cleanText(text, 500)
  if (!normalizedText) return ""
  const key = createHash("sha1").update(`${normalizedScenarioId}:${normalizedText}`).digest("hex").slice(0, 16)
  return `seed/opening/generated/${normalizedScenarioId}_${key}.mp3`
}

export function isOpeningPreparationUnavailableError(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("voice_coach_opening_preparations") ||
    message.includes("does not exist")
  )
}

function isExpired(row: VoiceCoachOpeningPreparationRow | null | undefined) {
  if (!row?.expires_at) return false
  const expiresAt = new Date(row.expires_at).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

function normalizeLine(row: VoiceCoachOpeningPreparationRow) {
  const line = row.opening_line_json && typeof row.opening_line_json === "object"
    ? (row.opening_line_json as Record<string, unknown>)
    : {}
  return {
    text: cleanText(line.text, 500),
    emotion: cleanText(line.emotion, 40) || "neutral",
    tag: cleanText(line.tag, 80),
  }
}

export async function signPreparedOpening(row: VoiceCoachOpeningPreparationRow): Promise<VoiceCoachPreparedOpening | null> {
  if (isExpired(row)) return null
  if (row.status !== "audio_ready" && row.status !== "fallback_ready") return null
  const line = normalizeLine(row)
  if (!line.text) return null
  const audioPath = cleanText(row.audio_path, 500)
  let audioUrl: string | null = null
  if (audioPath) {
    try {
      audioUrl = await signVoiceCoachAudio(audioPath)
    } catch {
      audioUrl = null
    }
  }
  if (row.status === "audio_ready" && !audioUrl) return null
  const audioSeconds = Number(row.audio_seconds)
  return {
    preparation_id: row.id,
    status: row.status,
    text: line.text,
    emotion: line.emotion,
    tag: line.tag,
    audio_path: audioPath,
    audio_url: audioUrl,
    audio_seconds: Number.isFinite(audioSeconds) && audioSeconds > 0 ? audioSeconds : null,
    audio_source: audioUrl ? "prepared" : "prepared_fallback",
  }
}

export async function findOpeningPreparationByIdempotency(args: {
  supabase: OpeningPreparationSupabaseClient
  userId: string
  idempotencyKey: string
}): Promise<VoiceCoachOpeningPreparationRow | null> {
  const { data, error } = await args.supabase
    .from("voice_coach_opening_preparations")
    .select("*")
    .eq("user_id", args.userId)
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle()
  if (error) throw error
  return (data || null) as VoiceCoachOpeningPreparationRow | null
}

export async function upsertOpeningPreparation(args: {
  supabase: OpeningPreparationSupabaseClient
  payload: Record<string, unknown>
}): Promise<VoiceCoachOpeningPreparationRow> {
  const { data, error } = await args.supabase
    .from("voice_coach_opening_preparations")
    .upsert(args.payload, { onConflict: "user_id,idempotency_key" })
    .select("*")
    .single()
  if (error) throw error
  return data as VoiceCoachOpeningPreparationRow
}

export async function lockOpeningPreparationForSession(args: {
  supabase: OpeningPreparationSupabaseClient
  userId: string
  preparationId: string
  sessionId: string
}): Promise<VoiceCoachOpeningPreparationRow | null> {
  const { data: existing, error: existingError } = await args.supabase
    .from("voice_coach_opening_preparations")
    .select("*")
    .eq("id", args.preparationId)
    .eq("user_id", args.userId)
    .maybeSingle()

  if (existingError) {
    if (isOpeningPreparationUnavailableError(existingError)) return null
    throw existingError
  }

  const row = (existing || null) as VoiceCoachOpeningPreparationRow | null
  if (!row || isExpired(row)) return null
  if (row.consumed_at && row.session_id !== args.sessionId) return null
  if (row.session_id && row.session_id !== args.sessionId) return null

  const prepared = await signPreparedOpening(row)
  if (!prepared) return null

  const { data: locked, error: lockError } = await args.supabase
    .from("voice_coach_opening_preparations")
    .update({
      session_id: args.sessionId,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", args.userId)
    .select("*")
    .single()

  if (lockError) {
    if (isOpeningPreparationUnavailableError(lockError)) return null
    throw lockError
  }

  return locked as VoiceCoachOpeningPreparationRow
}

export async function markOpeningPreparationConsumed(args: {
  supabase: OpeningPreparationSupabaseClient
  userId: string
  preparationId: string
  sessionId: string
}) {
  const { error } = await args.supabase
    .from("voice_coach_opening_preparations")
    .update({
      session_id: args.sessionId,
      consumed_at: new Date().toISOString(),
      status: "consumed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.preparationId)
    .eq("user_id", args.userId)
    .eq("session_id", args.sessionId)
  if (error && !isOpeningPreparationUnavailableError(error)) throw error
}
