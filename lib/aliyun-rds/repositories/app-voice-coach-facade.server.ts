import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError,
} from "@/lib/aliyun-rds/postgres.server"
import {
  APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE,
  AppVoiceCoachRepositoryConfigurationError,
  resolveAppVoiceCoachTextRepositorySelection,
} from "@/lib/aliyun-rds/app-voice-coach-runtime-config.server"
import {
  accountContextPayload,
  getAliyunRdsAppAccountContext,
  type AppAccountContext,
} from "@/lib/aliyun-rds/repositories/account-profile.server"
import { requireAppFeatureAccess } from "@/lib/aliyun-rds/app-authorization.server"
import { doubaoAsrFlash, doubaoTts } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { getScenario } from "@/lib/voice-coach/scenarios"

type AppVoiceCoachStoreScope = {
  companyId: string
  storeId: string
  membershipId: string
}

type AppVoiceCoachPersonalTrialScope = {
  dataDomain: "personal_trial"
  canonicalUserId: string
}

export type AppVoiceCoachFacadeScope =
  | AppVoiceCoachStoreScope
  | AppVoiceCoachPersonalTrialScope

type AppVoiceCoachRdsRepository = typeof import("@/lib/aliyun-rds/repositories/app-voice-coach-rds.server")

export type AppVoiceCoachCreateTimingLog = {
  recordStage(stageName: string, startedAtMs: number): void
  setRepositoryMode(repositoryMode: string): void
  setSessionId(sessionId: string): void
  write(status: number, error?: unknown): void
}

const DEFAULT_SCENARIO_ID = "objection_safety"
const LOCAL_DURABLE_STORE_ENV = "APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH"
const TEXT_SESSION_REPOSITORY_MODE = "text_first_local_durable_session_store"
const TEXT_SESSION_PROVIDER_MODE = "text_only_no_audio_provider"
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const MAX_APP_VOICE_COACH_AUDIO_BYTES = 512 * 1024

type VoiceCoachAudioFormat = "mp3" | "wav" | "ogg" | "flac"
export type AppVoiceCoachAudioEndpoint = "asr_preview" | "turn_tts" | "audio_submit"

export const APP_VOICE_COACH_AUDIO_ERROR_MATRIX_V3: Record<
  AppVoiceCoachAudioEndpoint,
  Record<string, number>
> = {
  asr_preview: {
    auth_required: 401,
    voice_coach_feature_forbidden: 403,
    voice_coach_session_not_found: 404,
    missing_session_id: 422,
    invalid_payload: 422,
    voice_coach_audio_required: 422,
    voice_coach_audio_empty: 422,
    voice_coach_audio_too_large: 422,
    voice_coach_audio_format_invalid: 422,
    voice_coach_asr_provider_unavailable: 502,
    voice_coach_asr_provider_failed: 502,
  },
  turn_tts: {
    auth_required: 401,
    voice_coach_feature_forbidden: 403,
    voice_coach_session_not_found: 404,
    voice_coach_turn_not_found: 404,
    missing_params: 422,
    voice_coach_tts_turn_not_customer: 422,
    voice_coach_tts_text_required: 422,
    voice_coach_tts_empty_audio: 502,
    voice_coach_tts_provider_failed: 502,
    voice_coach_tts_persist_failed: 502,
  },
  audio_submit: {
    auth_required: 401,
    voice_coach_feature_forbidden: 403,
    voice_coach_session_not_found: 404,
    voice_coach_session_ended: 409,
    voice_coach_idempotency_conflict: 409,
    voice_coach_reply_target_stale: 409,
    missing_session_id: 422,
    invalid_payload: 422,
    transcript_text_required: 422,
    client_attempt_id_required: 422,
    client_attempt_id_invalid: 422,
    reply_to_turn_id_required: 422,
    voice_coach_audio_required: 422,
    voice_coach_audio_empty: 422,
    voice_coach_audio_too_large: 422,
    voice_coach_audio_format_invalid: 422,
    voice_coach_audio_persist_failed: 502,
    voice_coach_turn_submit_failed: 500,
  },
}

type TextTurn = {
  turn_id: string
  turn_index: number
  role: "customer" | "beautician"
  status: "text_ready"
  text: string
  emotion: string
  audio_url: string | null
  audio_seconds: number | null
  audio_source: "none"
  pending: false
  client_attempt_id?: string
  reply_to_turn_id?: string
}

type TextEvent = {
  cursor: number
  event_id: string
  type: string
  created_at: string
  payload: Record<string, unknown>
}

type TextSession = {
  id: string
  userId: string
  companyId: string
  storeId: string
  membershipId: string
  status: "active" | "ended"
  startedAt: string
  endedAt: string | null
  totalScore: number | null
  scenarioId: string
  scenario: ReturnType<typeof scenarioPayload>
  turns: TextTurn[]
  events: TextEvent[]
  report: TextReport | null
}

type TextReport = {
  status: "ready"
  total_score: number
  dimension: Array<{ key: string; label: string; score: number }>
  summary_blocks: Array<{ title: string; body: string }>
  tabs: Record<string, unknown>
  next_round_focus: string
  meta: {
    session_id: string
    generated_from: string
  }
}

export const APP_VOICE_COACH_TEXT_SIDE_EFFECTS = [
  "local_durable_session_write",
  "local_durable_turn_write",
  "local_durable_report_write",
] as const

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

class AppVoiceCoachAudioContractError extends Error {
  constructor(
    readonly endpoint: AppVoiceCoachAudioEndpoint,
    readonly code: string,
  ) {
    super(code)
    this.name = "AppVoiceCoachAudioContractError"
  }
}

export function appVoiceCoachAudioErrorResponse(endpoint: AppVoiceCoachAudioEndpoint, code: string) {
  const status = APP_VOICE_COACH_AUDIO_ERROR_MATRIX_V3[endpoint][code]
  if (!status) throw new Error(`app_voice_coach_error_code_not_in_v3_matrix:${endpoint}:${code}`)
  return jsonError(status, code, code)
}

async function withAppVoiceCoachAudioBoundary<T>(
  endpoint: AppVoiceCoachAudioEndpoint,
  code: string,
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AppVoiceCoachAudioContractError) throw error
    throw new AppVoiceCoachAudioContractError(endpoint, code)
  }
}

function isVoiceCoachProviderUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const code = String((error as { code?: unknown }).code || "")
  const message = String((error as { message?: unknown }).message || "")
  return ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT"].includes(code) ||
    /timeout|network|fetch failed|temporarily unavailable|(?:http|status)_(?:429|5\d\d)/i.test(message)
}

async function callAppVoiceCoachAsrProvider<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    throw new AppVoiceCoachAudioContractError(
      "asr_preview",
      isVoiceCoachProviderUnavailableError(error)
        ? "voice_coach_asr_provider_unavailable"
        : "voice_coach_asr_provider_failed",
    )
  }
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isUuid(value: unknown) {
  return UUID_PATTERN.test(cleanText(value, 80))
}

function rdsSessionNotFoundResponse(sessionId: unknown, endpoint?: AppVoiceCoachAudioEndpoint) {
  if (isUuid(sessionId)) return null
  return endpoint
    ? appVoiceCoachAudioErrorResponse(endpoint, "voice_coach_session_not_found")
    : jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
}

function rdsScopeArgs(ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  if ("dataDomain" in scope) {
    return {
      userId: ctx.userId,
      dataDomain: scope.dataDomain,
      canonicalUserId: scope.canonicalUserId,
    }
  }
  return {
    userId: ctx.userId,
    companyId: scope.companyId,
    storeId: scope.storeId,
    membershipId: scope.membershipId,
  }
}

function safeRdsSessionContext(value: unknown) {
  const context = isRecord(value) ? value : {}
  return {
    customer_profile_id: cleanText(context.customer_profile_id, 80) || null,
    customer_name: cleanText(context.customer_name, 160) || null,
    scene_card_id: cleanText(context.scene_card_id, 80) || null,
    scene_name: cleanText(context.scene_name, 160) || null,
    service_name: cleanText(context.service_name, 160) || null,
    company_id: cleanText(context.company_id, 80) || null,
    store_id: cleanText(context.store_id, 80) || null,
    membership_id: cleanText(context.membership_id, 80) || null,
  }
}

function parseLimit(value: unknown) {
  const parsed = Number(value || 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(50, Math.max(1, Math.round(parsed)))
}

export async function readOptionalAppVoiceCoachJsonBody(
  request: NextRequest,
  endpoint?: AppVoiceCoachAudioEndpoint,
) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    if (endpoint) return { error: appVoiceCoachAudioErrorResponse(endpoint, "invalid_payload") }
    body = {}
  }
  return isRecord(body)
    ? { body }
    : { error: endpoint ? appVoiceCoachAudioErrorResponse(endpoint, "invalid_payload") : jsonError(400, "invalid_payload") }
}

export async function readOptionalAppVoiceCoachFormBody(
  request: NextRequest,
  endpoint?: AppVoiceCoachAudioEndpoint,
) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    if (!form) {
      return { error: endpoint ? appVoiceCoachAudioErrorResponse(endpoint, "invalid_payload") : jsonError(400, "invalid_payload") }
    }
    return { body: formToRecord(form) }
  }
  if (endpoint === "audio_submit") {
    return { error: appVoiceCoachAudioErrorResponse(endpoint, "invalid_payload") }
  }
  return readOptionalAppVoiceCoachJsonBody(request, endpoint)
}

export function resolveAppVoiceCoachScope(ctx: AppAccountContext, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  if (requestedCompanyId && requestedCompanyId !== ctx.companyId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (requestedStoreId && requestedStoreId !== ctx.storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  const companyId = ctx.companyId
  const storeId = ctx.storeId
  if (!companyId || !storeId || !ctx.membershipId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  return { companyId, storeId, membershipId: ctx.membershipId }
}

export async function resolveAppVoiceCoachFacadeContext(
  request: NextRequest,
  endpoint?: AppVoiceCoachAudioEndpoint,
) {
  resolveAppVoiceCoachTextRepositorySelection()
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) {
    return { error: endpoint ? appVoiceCoachAudioErrorResponse(endpoint, "auth_required") : appAuthRequiredResponse() }
  }

  const ctx = await getAliyunRdsAppAccountContext(auth.user)
  const access = requireAppFeatureAccess(ctx, ctx.features, "voice_coach")
  if (access.ok) {
    const scope = resolveAppVoiceCoachScope(ctx, request)
    if ("error" in scope) return { error: scope.error }
    const scopeAccess = requireAppFeatureAccess(ctx, ctx.features, "voice_coach", {
      companyId: scope.companyId,
      storeId: scope.storeId,
    })
    if (!scopeAccess.ok) {
      return {
        error: endpoint
          ? appVoiceCoachAudioErrorResponse(endpoint, "voice_coach_feature_forbidden")
          : NextResponse.json(scopeAccess.body, { status: scopeAccess.status }),
      }
    }
    return { auth, ctx, scope }
  }

  const accessRepository = await import(
    "@/lib/aliyun-rds/repositories/app-access-control.server"
  )
  const personalAccess = await accessRepository.getAppAccessSnapshot(auth.user)
  if (
    personalAccess.accessMode !== "personal_trial" ||
    !["active", "exhausted"].includes(personalAccess.trial.status)
  ) {
    return {
      error: endpoint
        ? appVoiceCoachAudioErrorResponse(endpoint, "voice_coach_feature_forbidden")
        : NextResponse.json(access.body, { status: access.status }),
    }
  }

  return {
    auth,
    ctx,
    scope: {
      dataDomain: "personal_trial" as const,
      canonicalUserId: personalAccess.canonicalUserId,
    },
  }
}

export function appVoiceCoachFacadeErrorResponse(
  error: unknown,
  fallbackCode: string,
  endpoint?: AppVoiceCoachAudioEndpoint,
) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AppVoiceCoachAudioContractError) {
    return appVoiceCoachAudioErrorResponse(error.endpoint, error.code)
  }

  if (error instanceof AppVoiceCoachRepositoryConfigurationError) {
    return jsonError(
      503,
      APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE,
      APP_VOICE_COACH_REPOSITORY_NOT_CONFIGURED_CODE,
    )
  }
  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (error instanceof Error && error.message === "app_identity_review_required") {
    return jsonError(409, "identity_review_required", "identity_review_required")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  if (endpoint && APP_VOICE_COACH_AUDIO_ERROR_MATRIX_V3[endpoint][fallbackCode]) {
    return appVoiceCoachAudioErrorResponse(endpoint, fallbackCode)
  }
  return jsonError(500, fallbackCode, fallbackCode)
}

export function appVoiceCoachContextPayload(ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  if ("dataDomain" in scope) {
    return {
      ...accountContextPayload(ctx),
      voice_coach_scope: {
        data_domain: scope.dataDomain,
        canonical_user_id: scope.canonicalUserId,
        company_id: null,
        store_id: null,
        membership_id: null,
      },
    }
  }
  return {
    ...accountContextPayload(ctx),
    voice_coach_scope: {
      company_id: scope.companyId,
      store_id: scope.storeId,
      membership_id: scope.membershipId,
    },
  }
}

function shouldUseRdsForScope(scope: AppVoiceCoachFacadeScope) {
  return "dataDomain" in scope || shouldUseRdsRepository()
}

function textContractPayload() {
  return {
    repository_mode: TEXT_SESSION_REPOSITORY_MODE,
    provider_mode: TEXT_SESSION_PROVIDER_MODE,
    local_side_effects: APP_VOICE_COACH_TEXT_SIDE_EFFECTS,
  }
}

export function createAppVoiceCoachCreateTimingLog(): AppVoiceCoachCreateTimingLog {
  const requestId = randomUUID().replace(/-/g, "").slice(0, 12)
  const requestStartedAt = Date.now()
  const stages: Array<{ name: string; duration_ms: number }> = []
  let repositoryMode = "unknown"
  let sessionIdFragment = ""
  let didWrite = false

  return {
    recordStage(stageName: string, startedAtMs: number) {
      stages.push({
        duration_ms: elapsedMs(startedAtMs),
        name: cleanTimingStageName(stageName),
      })
    },
    setRepositoryMode(nextRepositoryMode: string) {
      repositoryMode = cleanText(nextRepositoryMode, 100) || "unknown"
    },
    setSessionId(sessionId: string) {
      sessionIdFragment = safeIdFragment(sessionId)
    },
    write(status: number, error?: unknown) {
      if (didWrite) return
      didWrite = true
      const payload: Record<string, unknown> = {
        event: "app_voice_coach_create_timing",
        repository_mode: repositoryMode,
        request_id: requestId,
        stages,
        status,
        total_ms: elapsedMs(requestStartedAt),
      }
      if (sessionIdFragment) payload.session_id_fragment = sessionIdFragment
      if (error) payload.error_class = timingErrorClass(error)
      console.info(JSON.stringify(payload))
    },
  }
}

function elapsedMs(startedAtMs: number) {
  const elapsed = Date.now() - startedAtMs
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed) : 0
}

function cleanTimingStageName(stageName: string) {
  return cleanText(stageName, 80).replace(/[^a-z0-9_]/gi, "_") || "unknown"
}

function safeIdFragment(value: unknown) {
  const text = cleanText(value, 120)
  if (!text) return ""
  if (text.length <= 12) return text
  return `${text.slice(0, 8)}...${text.slice(-5)}`
}

function timingErrorClass(error: unknown) {
  if (error instanceof AppVoiceCoachRepositoryConfigurationError) {
    return "AppVoiceCoachRepositoryConfigurationError"
  }
  if (error instanceof AliyunRdsConfigurationError) return "AliyunRdsConfigurationError"
  if (isAliyunRdsRuntimeUnavailableError(error)) return "AliyunRdsRuntimeUnavailable"
  if (error instanceof Error) return cleanTimingStageName(error.name || "Error")
  return "NonErrorThrow"
}

function shouldUseRdsRepository() {
  return resolveAppVoiceCoachTextRepositorySelection() === "rds"
}

async function loadRdsRepository(): Promise<AppVoiceCoachRdsRepository> {
  return import("@/lib/aliyun-rds/repositories/app-voice-coach-rds.server")
}

function rdsContractPayload(repositoryMode: string) {
  return {
    repository_mode: repositoryMode,
    provider_mode: TEXT_SESSION_PROVIDER_MODE,
  }
}

function scenarioPayload(scenarioId: unknown) {
  const scenario = getScenario(cleanText(scenarioId, 60) || DEFAULT_SCENARIO_ID)
  return {
    id: scenario.id,
    name: scenario.name,
    goal: scenario.goal,
    seedTopics: scenario.seedTopics,
  }
}

function firstCustomerText(scenarioId: unknown) {
  const scenario = getScenario(cleanText(scenarioId, 60) || DEFAULT_SCENARIO_ID)
  const first = Array.isArray(scenario.firstTurnPool) ? scenario.firstTurnPool[0] : null
  return cleanText(first?.text, 260) || "我想先了解一下，这个护理适不适合我现在的情况？"
}

function formToRecord(form: FormData) {
  const body: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) {
    body[key] = value
  }
  return body
}

function parseVoiceCoachAudioFormat(raw: unknown): VoiceCoachAudioFormat | null {
  const value = String(raw || "mp3").trim().toLowerCase()
  if (value === "mp3" || value === "wav" || value === "ogg" || value === "flac") return value
  return null
}

function audioFormatFromUpload(file: { name?: unknown; type?: unknown }): VoiceCoachAudioFormat | null {
  const name = String(file.name || "").toLowerCase()
  const type = String(file.type || "").toLowerCase()
  if (type.includes("mpeg") || name.endsWith(".mp3")) return "mp3"
  if (type.includes("wav") || name.endsWith(".wav")) return "wav"
  if (type.includes("ogg") || name.endsWith(".ogg")) return "ogg"
  if (type.includes("flac") || name.endsWith(".flac")) return "flac"
  return null
}

function safeAudioSeconds(raw: unknown): number | null {
  const seconds = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) / 1000 : null
}

async function appVoiceCoachSubmitAudio(body: Record<string, unknown>) {
  const file = body.audio
  if (!file || typeof file !== "object" || typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
    throw new Error("voice_coach_audio_required")
  }
  const upload = file as { arrayBuffer(): Promise<ArrayBuffer>; name?: unknown; type?: unknown }
  const format = audioFormatFromUpload(upload)
  if (!format) throw new Error("voice_coach_audio_format_invalid")
  const audio = Buffer.from(await upload.arrayBuffer())
  if (!audio.length) throw new Error("voice_coach_audio_empty")
  if (audio.length > MAX_APP_VOICE_COACH_AUDIO_BYTES) throw new Error("voice_coach_audio_too_large")
  return { audio, format }
}

function appVoiceCoachAttemptAudioPath(args: {
  clientAttemptId: string
  sessionId: string
  userId: string
  format: VoiceCoachAudioFormat
}) {
  const attemptHash = createHash("sha256").update(args.clientAttemptId).digest("hex").slice(0, 24)
  return `app/${args.userId}/${args.sessionId}/attempt-${attemptHash}.${args.format}`
}

function appVoiceCoachTtsAudioPath(args: { sessionId: string; turnId: string; userId: string }) {
  return `app/${args.userId}/${args.sessionId}/turn-${args.turnId}.mp3`
}

function sessionBelongsToScope(session: TextSession, ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  if ("dataDomain" in scope) return false
  return (
    session.userId === ctx.userId &&
    session.companyId === scope.companyId &&
    session.storeId === scope.storeId &&
    session.membershipId === scope.membershipId
  )
}

function textSessionStorePath() {
  const configuredPath = cleanText(process.env[LOCAL_DURABLE_STORE_ENV], 1200)
  return configuredPath || join(tmpdir(), "meiye-app-voice-coach", "text-first-sessions.json")
}

function readTextSessions() {
  const storePath = textSessionStorePath()
  if (!existsSync(storePath)) return new Map<string, TextSession>()

  const rawStore = readFileSync(storePath, "utf8")
  if (!rawStore.trim()) return new Map<string, TextSession>()

  const parsed = JSON.parse(rawStore)
  if (!isRecord(parsed) || !Array.isArray(parsed.sessions)) {
    throw new Error(`voice_coach_durable_store_invalid:${storePath}`)
  }

  const sessions = new Map<string, TextSession>()
  for (const session of parsed.sessions) {
    if (!isRecord(session) || typeof session.id !== "string" || !session.id.trim()) {
      throw new Error(`voice_coach_durable_session_invalid:${storePath}`)
    }
    sessions.set(session.id, session as TextSession)
  }
  return sessions
}

function writeTextSessions(sessions: Map<string, TextSession>) {
  const storePath = textSessionStorePath()
  mkdirSync(dirname(storePath), { recursive: true })
  const tempPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(
    tempPath,
    JSON.stringify(
      {
        repository_mode: TEXT_SESSION_REPOSITORY_MODE,
        sessions: Array.from(sessions.values()),
        version: 1,
      },
      null,
      2,
    ),
    "utf8",
  )
  renameSync(tempPath, storePath)
}

function readTextSession(sessionId: string, ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  const session = readTextSessions().get(sessionId)
  if (!session || !sessionBelongsToScope(session, ctx, scope)) return null
  return session
}

function readWritableTextSession(sessionId: string, ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  const sessions = readTextSessions()
  const session = sessions.get(sessionId)
  if (!session || !sessionBelongsToScope(session, ctx, scope)) return null
  return { session, sessions }
}

function appendEvent(session: TextSession, type: string, payload: Record<string, unknown>) {
  const event = {
    cursor: session.events.length + 1,
    event_id: `app-vc-event-${randomUUID()}`,
    type,
    created_at: new Date().toISOString(),
    payload,
  }
  session.events.push(event)
  return event
}

function textTurn(args: {
  audioSeconds?: number | null
  audioUrl?: string | null
  clientAttemptId?: string
  role: "customer" | "beautician"
  replyToTurnId?: string
  turnIndex: number
  text: string
  emotion?: string
}): TextTurn {
  return {
    turn_id: `app-vc-turn-${randomUUID()}`,
    turn_index: args.turnIndex,
    role: args.role,
    status: "text_ready" as const,
    text: args.text,
    emotion: args.emotion || "neutral",
    audio_url: args.audioUrl || null,
    audio_seconds: args.audioSeconds ?? null,
    audio_source: "none" as const,
    pending: false,
    ...(args.clientAttemptId ? { client_attempt_id: args.clientAttemptId } : {}),
    ...(args.replyToTurnId ? { reply_to_turn_id: args.replyToTurnId } : {}),
  }
}

function sessionPayload(session: TextSession) {
  return {
    id: session.id,
    status: session.status,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    total_score: session.totalScore,
    scenario: session.scenario,
    context: {
      repository_mode: TEXT_SESSION_REPOSITORY_MODE,
      provider_mode: TEXT_SESSION_PROVIDER_MODE,
      membership_id: session.membershipId,
    },
  }
}

function historyPayload(session: TextSession) {
  return {
    id: session.id,
    status: session.status,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    title: session.scenario.name || "文字对练",
    subtitle: session.status === "ended" ? "已生成文字版报告" : "进行中文字对练",
    customer_name: null,
    scene_name: session.scenario.name || null,
    service_name: null,
    score: session.totalScore,
    score_label: session.totalScore === null ? null : `${session.totalScore} 分`,
    can_view_report: Boolean(session.report),
  }
}

function nextCustomerText(replyText: string, reachedMaxTurns: boolean) {
  if (reachedMaxTurns) return ""
  if (/过敏|敏感|风险/.test(replyText)) return "那如果我中途觉得刺痛，你们会怎么处理？"
  if (/效果|改善|坚持/.test(replyText)) return "那我做一次就能看到变化吗？"
  return "如果我今天时间不多，你会建议先做哪一步？"
}

function reportForSession(session: TextSession): TextReport {
  const beauticianTurns = session.turns.filter((turn) => turn.role === "beautician")
  const totalScore = Math.min(95, 70 + beauticianTurns.length * 8)
  return {
    status: "ready",
    total_score: totalScore,
    dimension: [
      { key: "empathy", label: "共情回应", score: Math.min(95, 72 + beauticianTurns.length * 6) },
      { key: "professional", label: "专业解释", score: Math.min(95, 70 + beauticianTurns.length * 8) },
      { key: "next_step", label: "下一步引导", score: Math.min(95, 68 + beauticianTurns.length * 7) },
    ],
    summary_blocks: [
      {
        title: "本轮亮点",
        body: beauticianTurns.length ? "已完成文字版顾客顾虑回应，并形成可复盘报告。" : "本轮尚未提交员工回应。",
      },
      {
        title: "下一轮建议",
        body: "继续围绕顾客风险顾虑、效果预期和下一步服务建议进行练习。",
      },
    ],
    tabs: {
      transcript: session.turns.map((turn) => ({
        role: turn.role,
        text: turn.text,
        turn_index: turn.turn_index,
      })),
    },
    next_round_focus: "把顾客顾虑复述清楚，再给出低风险下一步。",
    meta: {
      session_id: session.id,
      generated_from: TEXT_SESSION_REPOSITORY_MODE,
    },
  }
}

function rdsTurnPayload(turn: {
  id: string
  turn_index: number
  role: string
  text: string
  emotion?: string | null
  audio_path?: string | null
  audio_seconds?: number | string | null
}) {
  return {
    turn_id: turn.id,
    turn_index: Number(turn.turn_index),
    role: turn.role,
    status: "text_ready",
    text: turn.text || "",
    emotion: turn.emotion || "neutral",
    audio_url: turn.audio_path || null,
    audio_seconds: turn.audio_seconds === null || turn.audio_seconds === undefined ? null : Number(turn.audio_seconds),
    audio_source: "none",
    pending: false,
  }
}

function rdsSessionPayload(
  session: {
    id: string
    status: string
    started_at: string
    ended_at: string | null
    total_score: number | string | null
    scenario_id: string
    session_context_json?: unknown
    scenario_snapshot_json?: unknown
  },
  repositoryMode: string,
) {
  const snapshot = isRecord(session.scenario_snapshot_json) ? session.scenario_snapshot_json : null
  const sessionContext = safeRdsSessionContext(session.session_context_json)
  return {
    id: session.id,
    status: session.status,
    started_at: session.started_at,
    ended_at: session.ended_at,
    total_score: session.total_score === null || session.total_score === undefined ? null : Number(session.total_score),
    scenario: snapshot || scenarioPayload(session.scenario_id),
    context: {
      ...sessionContext,
      repository_mode: repositoryMode,
      provider_mode: TEXT_SESSION_PROVIDER_MODE,
    },
  }
}

function rdsHistoryPayload(
  session: {
    id: string
    status: string
    started_at: string
    ended_at: string | null
    total_score: number | string | null
    scenario_id: string
    report_json: unknown
    session_context_json?: unknown
    scenario_snapshot_json?: unknown
  },
  repositoryMode: string,
) {
  const snapshot = isRecord(session.scenario_snapshot_json) ? session.scenario_snapshot_json : null
  const scenarioName = cleanText(snapshot?.name, 120) || scenarioPayload(session.scenario_id).name
  const score = session.total_score === null || session.total_score === undefined ? null : Number(session.total_score)
  const sessionContext = safeRdsSessionContext(session.session_context_json)
  return {
    id: session.id,
    status: session.status,
    started_at: session.started_at,
    ended_at: session.ended_at,
    title: scenarioName || "文字对练",
    subtitle: session.status === "ended" ? "已生成文字版报告" : "进行中文字对练",
    customer_name: sessionContext.customer_name,
    scene_name: sessionContext.scene_name,
    service_name: sessionContext.service_name,
    score,
    score_label: score === null ? null : `${score} 分`,
    can_view_report: Boolean(session.report_json),
    repository_mode: repositoryMode,
  }
}

function rdsSessionAsTextSession(args: {
  repositoryMode: string
  session: {
    id: string
    user_id: string
    status: string
    started_at: string
    ended_at: string | null
    total_score: number | string | null
    scenario_id: string
    report_json: unknown
    company_id?: string | null
    store_id?: string | null
    membership_id?: string | null
    scenario_snapshot_json?: unknown
  }
  turns: Array<{ id: string; turn_index: number; role: string; text: string; emotion?: string | null }>
}): TextSession {
  const snapshot = isRecord(args.session.scenario_snapshot_json) ? args.session.scenario_snapshot_json : null
  const scenario = (snapshot || scenarioPayload(args.session.scenario_id)) as ReturnType<typeof scenarioPayload>
  return {
    id: args.session.id,
    userId: args.session.user_id,
    companyId: cleanText(args.session.company_id, 80),
    storeId: cleanText(args.session.store_id, 80),
    membershipId: cleanText(args.session.membership_id, 80),
    status: args.session.status === "ended" ? "ended" : "active",
    startedAt: args.session.started_at,
    endedAt: args.session.ended_at,
    totalScore: args.session.total_score === null || args.session.total_score === undefined ? null : Number(args.session.total_score),
    scenarioId: args.session.scenario_id,
    scenario,
    turns: args.turns.map((turn) => ({
      turn_id: turn.id,
      turn_index: Number(turn.turn_index),
      role: turn.role === "beautician" ? "beautician" : "customer",
      status: "text_ready",
      text: turn.text || "",
      emotion: turn.emotion || "neutral",
      audio_url: null,
      audio_seconds: null,
      audio_source: "none",
      pending: false,
    })),
    events: [],
    report: isRecord(args.session.report_json) ? (args.session.report_json as TextReport) : null,
  }
}

export async function listAppVoiceCoachTextSessionsResponse(opts: {
  ctx: AppAccountContext
  request: NextRequest
  scope: AppVoiceCoachFacadeScope
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const rdsRepository = await loadRdsRepository()
    const params = new URL(opts.request.url).searchParams
    const limit = parseLimit(params.get("limit"))
    const sessions = await rdsRepository.listAliyunRdsVoiceCoachTextSessionHistory({
      limit,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      sessions: sessions.map((session) => rdsHistoryPayload(session, rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE)),
      limit,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const params = new URL(opts.request.url).searchParams
  const limit = parseLimit(params.get("limit"))
  const sessions = Array.from(readTextSessions().values())
    .filter((session) => sessionBelongsToScope(session, opts.ctx, opts.scope))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, limit)
    .map(historyPayload)

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    sessions,
    limit,
    ...textContractPayload(),
  })
}

export async function createAppVoiceCoachTextSessionResponse(opts: {
  body: Record<string, unknown>
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  timing?: AppVoiceCoachCreateTimingLog
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const customerProfileId = cleanText(opts.body.customer_profile_id, 80) || null
    const sceneCardId = cleanText(opts.body.scene_card_id, 80) || null
    const personalTrialScope = "dataDomain" in opts.scope ? opts.scope : null
    if (personalTrialScope && (customerProfileId || sceneCardId)) {
      return jsonError(
        422,
        "personal_trial_demo_selection_forbidden",
        "personal_trial_demo_selection_forbidden",
      )
    }
    if (customerProfileId && !isUuid(customerProfileId)) {
      return jsonError(400, "customer_profile_not_found", "customer_profile_not_found")
    }
    if (sceneCardId && !isUuid(sceneCardId)) {
      return jsonError(400, "scene_card_not_found", "scene_card_not_found")
    }

    const importStartedAt = Date.now()
    const rdsRepository = await loadRdsRepository()
    opts.timing?.recordStage("rds_repository_import", importStartedAt)
    opts.timing?.setRepositoryMode(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE)

    const payloadStartedAt = Date.now()
    const scenario = scenarioPayload(opts.body.scenario_id)
    const firstCustomerTurnText = firstCustomerText(opts.body.scenario_id)
    opts.timing?.recordStage("rds_prepare_payload", payloadStartedAt)

    let created:
      | Awaited<ReturnType<AppVoiceCoachRdsRepository["createAliyunRdsVoiceCoachTextSession"]>>
      | Awaited<
          ReturnType<
            AppVoiceCoachRdsRepository["createAliyunRdsPersonalTrialVoiceCoachTextSession"]
          >
        >
    try {
      if (personalTrialScope) {
        const clientSessionId = cleanText(opts.body.client_session_id, 120)
        if (clientSessionId.length < 8) {
          return jsonError(
            422,
            "client_session_id_required",
            "client_session_id_required",
          )
        }
        created =
          await rdsRepository.createAliyunRdsPersonalTrialVoiceCoachTextSession({
            canonicalUserId: personalTrialScope.canonicalUserId,
            clientSessionId,
            firstCustomerText: firstCustomerTurnText,
            scenario,
            timing: opts.timing,
            userId: opts.ctx.userId,
          })
      } else {
        created = await rdsRepository.createAliyunRdsVoiceCoachTextSession({
          customerProfileId,
          firstCustomerText: firstCustomerTurnText,
          scenario,
          sceneCardId,
          timing: opts.timing,
          ...rdsScopeArgs(opts.ctx, opts.scope),
        })
      }
    } catch (error) {
      const selectionErrorCode = rdsRepository.getAliyunRdsVoiceCoachSelectionErrorCode(error)
      if (selectionErrorCode) return jsonError(400, selectionErrorCode, selectionErrorCode)
      const code = error instanceof Error ? error.message : ""
      if (code === "personal_trial_exhausted") {
        return jsonError(403, code, code)
      }
      if (code === "app_idempotency_conflict") {
        return jsonError(409, code, code)
      }
      if (code === "client_session_id_invalid") {
        return jsonError(422, code, code)
      }
      throw error
    }
    opts.timing?.setSessionId(created.session.id)
    const sessionContext = safeRdsSessionContext(created.session.session_context_json)
    return NextResponse.json(
      {
        ok: true,
        status: created.session.status,
        context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
        session_id: created.session.id,
        scenario,
        session_context: {
          ...sessionContext,
          ...("dataDomain" in opts.scope
            ? {
                canonical_user_id: opts.scope.canonicalUserId,
                data_domain: opts.scope.dataDomain,
              }
            : {}),
          repository_mode: rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE,
          provider_mode: TEXT_SESSION_PROVIDER_MODE,
        },
        first_customer_turn: rdsTurnPayload(created.firstCustomerTurn),
        ...("trial" in created
          ? {
              deduped: created.deduped,
              trial: {
                kind: created.trial.kind,
                data_domain: created.trial.dataDomain,
                status: created.trial.status,
                ai_coach_session_limit: created.trial.sessionLimit,
                ai_coach_sessions_used: created.trial.sessionsUsed,
                ai_coach_sessions_remaining:
                  created.trial.sessionsRemaining,
              },
            }
          : {}),
        ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      },
      { status: "deduped" in created && created.deduped ? 200 : 201 },
    )
  }

  if ("dataDomain" in opts.scope) {
    return jsonError(
      503,
      "personal_trial_rds_required",
      "personal_trial_rds_required",
    )
  }
  opts.timing?.setRepositoryMode(TEXT_SESSION_REPOSITORY_MODE)
  const sessions = readTextSessions()
  const scenario = scenarioPayload(opts.body.scenario_id)
  const sessionId = `app-vc-${randomUUID()}`
  const firstTurn = textTurn({
    role: "customer",
    turnIndex: 0,
    text: firstCustomerText(opts.body.scenario_id),
  })
  const now = new Date().toISOString()
  const session: TextSession = {
    id: sessionId,
    userId: opts.ctx.userId,
    companyId: opts.scope.companyId,
    storeId: opts.scope.storeId,
    membershipId: opts.scope.membershipId,
    status: "active",
    startedAt: now,
    endedAt: null,
    totalScore: null,
    scenarioId: scenario.id,
    scenario,
    turns: [firstTurn],
    events: [],
    report: null,
  }
  appendEvent(session, "session.created", { session_id: sessionId, first_turn_id: firstTurn.turn_id })
  sessions.set(sessionId, session)
  writeTextSessions(sessions)
  opts.timing?.setSessionId(sessionId)

  return NextResponse.json(
    {
      ok: true,
      status: "active",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: sessionId,
      scenario,
      session_context: {
        repository_mode: TEXT_SESSION_REPOSITORY_MODE,
        provider_mode: TEXT_SESSION_PROVIDER_MODE,
      },
      first_customer_turn: firstTurn,
      ...textContractPayload(),
    },
    { status: 201 },
  )
}

export async function getAppVoiceCoachTextSessionResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId)
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    const detail = await rdsRepository.getAliyunRdsVoiceCoachTextSession({
      sessionId: opts.sessionId,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    if (!detail) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session: rdsSessionPayload(detail.session, rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      turns: detail.turns.map(rdsTurnPayload),
      last_event_cursor: rdsRepository.deriveAliyunRdsVoiceCoachTextEvents(detail.session, detail.turns).length,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const session = readTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!session) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session: sessionPayload(session),
    turns: session.turns,
    last_event_cursor: session.events.length,
    ...textContractPayload(),
  })
}

export async function listAppVoiceCoachTextEventsResponse(opts: {
  ctx: AppAccountContext
  request: NextRequest
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId)
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    const detail = await rdsRepository.getAliyunRdsVoiceCoachTextSession({
      sessionId: opts.sessionId,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    if (!detail) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
    const params = new URL(opts.request.url).searchParams
    const cursor = Math.max(0, Number(params.get("cursor") || 0) || 0)
    const allEvents = rdsRepository.deriveAliyunRdsVoiceCoachTextEvents(detail.session, detail.turns)
    const events = allEvents.filter((event) => event.cursor > cursor)
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      events,
      next_cursor: allEvents.length,
      has_more: false,
      session_status: detail.session.status,
      session_id: opts.sessionId,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const session = readTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!session) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")

  const params = new URL(opts.request.url).searchParams
  const cursor = Math.max(0, Number(params.get("cursor") || 0) || 0)
  const events = session.events.filter((event) => event.cursor > cursor)
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    events,
    next_cursor: session.events.length,
    has_more: false,
    session_status: session.status,
    session_id: opts.sessionId,
    ...textContractPayload(),
  })
}

export async function getAppVoiceCoachTextReportResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId)
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    const detail = await rdsRepository.getAliyunRdsVoiceCoachTextSession({
      sessionId: opts.sessionId,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    if (!detail) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
    if (!isRecord(detail.session.report_json)) {
      return jsonError(409, "voice_coach_report_not_ready", "voice_coach_report_not_ready")
    }
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      report: detail.session.report_json,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const session = readTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!session) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
  if (!session.report) return jsonError(409, "voice_coach_report_not_ready", "voice_coach_report_not_ready")

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    report: session.report,
    ...textContractPayload(),
  })
}

export async function synthesizeAppVoiceCoachTurnResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
  turnId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId, "turn_tts")
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    const detail = await rdsRepository.getAliyunRdsVoiceCoachTextSession({
      sessionId: opts.sessionId,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    if (!detail) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_session_not_found")
    const turn = detail.turns.find((candidate) => candidate.id === opts.turnId)
    if (!turn) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_turn_not_found")
    if (turn.role !== "customer") {
      return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_turn_not_customer")
    }
    if (!turn.text.trim()) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_text_required")

    const existingPath = cleanText(turn.audio_path, 1200)
    if (existingPath) {
      const audioUrl = await withAppVoiceCoachAudioBoundary(
        "turn_tts",
        "voice_coach_tts_persist_failed",
        () => signVoiceCoachAudio(existingPath),
      )
      return NextResponse.json({
        ok: true,
        context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
        session_id: opts.sessionId,
        turn_id: turn.id,
        audio_url: audioUrl,
        audio_seconds: turn.audio_seconds === null ? null : Number(turn.audio_seconds),
        cached: true,
        ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
        provider_mode: "volc_speech_tts",
      })
    }

    const tts = await withAppVoiceCoachAudioBoundary(
      "turn_tts",
      "voice_coach_tts_provider_failed",
      () => doubaoTts({ text: turn.text, uid: opts.ctx.userId }),
    )
    if (!tts.audio?.length) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_empty_audio")
    const ttsAudio = tts.audio
    const audioPath = appVoiceCoachTtsAudioPath({ sessionId: opts.sessionId, turnId: turn.id, userId: opts.ctx.userId })
    const saved = await withAppVoiceCoachAudioBoundary(
      "turn_tts",
      "voice_coach_tts_persist_failed",
      async () => {
        await uploadVoiceCoachAudio({ path: audioPath, data: ttsAudio, contentType: "audio/mpeg" })
        return rdsRepository.saveAliyunRdsVoiceCoachTurnAudio({
          sessionId: opts.sessionId,
          turnId: turn.id,
          expectedRole: "customer",
          audioPath,
          audioSeconds: tts.durationSeconds,
          ...rdsScopeArgs(opts.ctx, opts.scope),
        })
      },
    )
    if (!saved) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_turn_not_found")
    const audioUrl = await withAppVoiceCoachAudioBoundary(
      "turn_tts",
      "voice_coach_tts_persist_failed",
      () => signVoiceCoachAudio(audioPath),
    )
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: saved.id,
      audio_url: audioUrl,
      audio_seconds: tts.durationSeconds,
      cached: false,
      request_id: tts.requestId,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      provider_mode: "volc_speech_tts",
    })
  }

  const writable = readWritableTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!writable) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_session_not_found")
  const turn = writable.session.turns.find((candidate) => candidate.turn_id === opts.turnId)
  if (!turn) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_turn_not_found")
  if (turn.role !== "customer") {
    return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_turn_not_customer")
  }
  if (!turn.text.trim()) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_text_required")
  if (turn.audio_url) {
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: turn.turn_id,
      audio_url: turn.audio_url,
      audio_seconds: turn.audio_seconds,
      cached: true,
      ...textContractPayload(),
      provider_mode: "volc_speech_tts",
    })
  }
  const tts = await withAppVoiceCoachAudioBoundary(
    "turn_tts",
    "voice_coach_tts_provider_failed",
    () => doubaoTts({ text: turn.text, uid: opts.ctx.userId }),
  )
  if (!tts.audio?.length) return appVoiceCoachAudioErrorResponse("turn_tts", "voice_coach_tts_empty_audio")
  const ttsAudio = tts.audio
  const audioPath = appVoiceCoachTtsAudioPath({ sessionId: opts.sessionId, turnId: turn.turn_id, userId: opts.ctx.userId })
  turn.audio_url = await withAppVoiceCoachAudioBoundary(
    "turn_tts",
    "voice_coach_tts_persist_failed",
    async () => {
      await uploadVoiceCoachAudio({ path: audioPath, data: ttsAudio, contentType: "audio/mpeg" })
      const signedAudioUrl = await signVoiceCoachAudio(audioPath)
      turn.audio_seconds = tts.durationSeconds
      writeTextSessions(writable.sessions)
      return signedAudioUrl
    },
  )
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session_id: opts.sessionId,
    turn_id: turn.turn_id,
    audio_url: turn.audio_url,
    audio_seconds: turn.audio_seconds,
    cached: false,
    request_id: tts.requestId,
    ...textContractPayload(),
    provider_mode: "volc_speech_tts",
  })
}

export async function transcribeAppVoiceCoachAudioResponse(opts: {
  body: Record<string, unknown>
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  const format = parseVoiceCoachAudioFormat(opts.body.format)
  if (!format) return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_audio_format_invalid")
  const base64 = cleanText(opts.body.audio_b64, MAX_APP_VOICE_COACH_AUDIO_BYTES * 2)
  if (!base64) return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_audio_required")
  const audio = Buffer.from(base64, "base64")
  if (!audio.length) return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_audio_empty")
  if (audio.length > MAX_APP_VOICE_COACH_AUDIO_BYTES) {
    return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_audio_too_large")
  }

  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId, "asr_preview")
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    const detail = await rdsRepository.getAliyunRdsVoiceCoachTextSession({
      sessionId: opts.sessionId,
      ...rdsScopeArgs(opts.ctx, opts.scope),
    })
    if (!detail) return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_session_not_found")
    const asr = await callAppVoiceCoachAsrProvider(() => doubaoAsrFlash({ audio, format, uid: opts.ctx.userId }))
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      text: asr.text,
      confidence: asr.confidence,
      audio_seconds: asr.durationSeconds,
      request_id: asr.requestId,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      provider_mode: "volc_speech_asr_flash",
    })
  }

  if (!readTextSession(opts.sessionId, opts.ctx, opts.scope)) {
    return appVoiceCoachAudioErrorResponse("asr_preview", "voice_coach_session_not_found")
  }
  const asr = await callAppVoiceCoachAsrProvider(() => doubaoAsrFlash({ audio, format, uid: opts.ctx.userId }))
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session_id: opts.sessionId,
    text: asr.text,
    confidence: asr.confidence,
    audio_seconds: asr.durationSeconds,
    request_id: asr.requestId,
    ...textContractPayload(),
    provider_mode: "volc_speech_asr_flash",
  })
}

export async function submitAppVoiceCoachTextBeauticianTurnResponse(opts: {
  body: Record<string, unknown>
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId, "audio_submit")
    if (invalidSessionResponse) return invalidSessionResponse
  }
  const clientAttemptId = typeof opts.body.client_attempt_id === "string" ? opts.body.client_attempt_id.trim() : ""
  if (!clientAttemptId) return appVoiceCoachAudioErrorResponse("audio_submit", "client_attempt_id_required")
  if (clientAttemptId.length < 8 || clientAttemptId.length > 120) {
    return appVoiceCoachAudioErrorResponse("audio_submit", "client_attempt_id_invalid")
  }
  const replyToTurnId = cleanText(opts.body.reply_to_turn_id, 160)
  if (!replyToTurnId) return appVoiceCoachAudioErrorResponse("audio_submit", "reply_to_turn_id_required")
  const replyText = cleanText(opts.body.transcript_text, 1000)
  if (!replyText) return appVoiceCoachAudioErrorResponse("audio_submit", "transcript_text_required")
  let submittedAudio: Awaited<ReturnType<typeof appVoiceCoachSubmitAudio>>
  try {
    submittedAudio = await appVoiceCoachSubmitAudio(opts.body)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : ""
    const code = APP_VOICE_COACH_AUDIO_ERROR_MATRIX_V3.audio_submit[errorMessage] === 422
      ? errorMessage
      : "invalid_payload"
    return appVoiceCoachAudioErrorResponse("audio_submit", code)
  }
  const audioSeconds = safeAudioSeconds(opts.body.client_audio_seconds)
  const audioPath = appVoiceCoachAttemptAudioPath({
    clientAttemptId,
    format: submittedAudio.format,
    sessionId: opts.sessionId,
    userId: opts.ctx.userId,
  })

  if (shouldUseRdsForScope(opts.scope)) {
    const rdsRepository = await loadRdsRepository()
    let submitted
    try {
      submitted = await rdsRepository.appendAliyunRdsVoiceCoachTextReply({
        audioPath,
        audioSeconds,
        clientAttemptId,
        nextCustomerText: nextCustomerText(replyText, false) || null,
        replyText,
        replyToTurnId,
        sessionId: opts.sessionId,
        persistAudio: () =>
          withAppVoiceCoachAudioBoundary(
            "audio_submit",
            "voice_coach_audio_persist_failed",
            () =>
              uploadVoiceCoachAudio({
                path: audioPath,
                data: submittedAudio.audio,
                contentType: `audio/${submittedAudio.format === "mp3" ? "mpeg" : submittedAudio.format}`,
              }),
          ),
        ...rdsScopeArgs(opts.ctx, opts.scope),
      })
    } catch (error) {
      const mutationError = rdsRepository.getAliyunRdsVoiceCoachMutationError(error)
      if (mutationError) return appVoiceCoachAudioErrorResponse("audio_submit", mutationError.code)
      throw error
    }
    const beauticianAudioUrl = submitted.beauticianTurn.audio_path
      ? await withAppVoiceCoachAudioBoundary(
          "audio_submit",
          "voice_coach_audio_persist_failed",
          () => signVoiceCoachAudio(submitted.beauticianTurn.audio_path || ""),
        )
      : null
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: submitted.beauticianTurn.id,
      job_id: null,
      client_attempt_id: clientAttemptId,
      next_cursor: rdsRepository.deriveAliyunRdsVoiceCoachTextEvents(submitted.session, submitted.turns).length,
      reached_max_turns: submitted.reachedMaxTurns,
      deduped: submitted.deduped,
      server_advanced: Boolean(submitted.nextCustomerTurn),
      server_advanced_stage: submitted.nextCustomerTurn ? "next_customer_turn_ready" : "ready_to_end",
      beautician_turn: {
        ...rdsTurnPayload(submitted.beauticianTurn),
        audio_url: beauticianAudioUrl,
      },
      next_customer_turn: submitted.nextCustomerTurn ? rdsTurnPayload(submitted.nextCustomerTurn) : null,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const writableSession = readWritableTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!writableSession) return appVoiceCoachAudioErrorResponse("audio_submit", "voice_coach_session_not_found")
  const { session, sessions } = writableSession
  if (session.status === "ended") return appVoiceCoachAudioErrorResponse("audio_submit", "voice_coach_session_ended")

  const existingTurn = session.turns.find(
    (turn) => turn.role === "beautician" && turn.client_attempt_id === clientAttemptId,
  )
  if (existingTurn) {
    if (existingTurn.text !== replyText || existingTurn.reply_to_turn_id !== replyToTurnId) {
      return appVoiceCoachAudioErrorResponse("audio_submit", "voice_coach_idempotency_conflict")
    }
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: existingTurn.turn_id,
      job_id: null,
      client_attempt_id: clientAttemptId,
      next_cursor: session.events.length,
      reached_max_turns: session.turns.filter((turn) => turn.role === "beautician").length >= 2,
      deduped: true,
      server_advanced: false,
      server_advanced_stage: null,
      beautician_turn: existingTurn,
      next_customer_turn: null,
      ...textContractPayload(),
    })
  }

  const latestTurn = session.turns[session.turns.length - 1]
  if (!latestTurn || latestTurn.role !== "customer" || latestTurn.turn_id !== replyToTurnId) {
    return appVoiceCoachAudioErrorResponse("audio_submit", "voice_coach_reply_target_stale")
  }

  const audioUrl = await withAppVoiceCoachAudioBoundary(
    "audio_submit",
    "voice_coach_audio_persist_failed",
    async () => {
      await uploadVoiceCoachAudio({
        path: audioPath,
        data: submittedAudio.audio,
        contentType: `audio/${submittedAudio.format === "mp3" ? "mpeg" : submittedAudio.format}`,
      })
      return signVoiceCoachAudio(audioPath)
    },
  )

  const beauticianTurn = textTurn({
    audioSeconds,
    audioUrl,
    clientAttemptId,
    replyToTurnId,
    role: "beautician",
    turnIndex: session.turns.length,
    text: replyText,
  })
  session.turns.push(beauticianTurn)
  appendEvent(session, "beautician_turn.submitted", { turn_id: beauticianTurn.turn_id })

  const reachedMaxTurns = session.turns.filter((turn) => turn.role === "beautician").length >= 2
  const nextText = nextCustomerText(replyText, reachedMaxTurns)
  const nextCustomerTurn = nextText
    ? textTurn({
        role: "customer",
        turnIndex: session.turns.length,
        text: nextText,
      })
    : null
  if (nextCustomerTurn) {
    session.turns.push(nextCustomerTurn)
    appendEvent(session, "customer_turn.ready", { turn_id: nextCustomerTurn.turn_id })
  }
  sessions.set(opts.sessionId, session)
  await withAppVoiceCoachAudioBoundary(
    "audio_submit",
    "voice_coach_audio_persist_failed",
    () => writeTextSessions(sessions),
  )

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session_id: opts.sessionId,
    turn_id: beauticianTurn.turn_id,
    job_id: null,
    client_attempt_id: clientAttemptId,
    next_cursor: session.events.length,
    reached_max_turns: reachedMaxTurns,
    deduped: false,
    server_advanced: Boolean(nextCustomerTurn),
    server_advanced_stage: nextCustomerTurn ? "next_customer_turn_ready" : "ready_to_end",
    beautician_turn: beauticianTurn,
    next_customer_turn: nextCustomerTurn,
    ...textContractPayload(),
  })
}

export async function endAppVoiceCoachTextSessionResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsForScope(opts.scope)) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId)
    if (invalidSessionResponse) return invalidSessionResponse
    const rdsRepository = await loadRdsRepository()
    let ended
    try {
      ended = await rdsRepository.endAliyunRdsVoiceCoachTextSession({
        buildEndState: ({ session, turns }) => {
          const textSession = rdsSessionAsTextSession({
            repositoryMode: rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE,
            session,
            turns,
          })
          const report = reportForSession(textSession)
          report.meta.generated_from = rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE
          return {
            dimensionScores: report.dimension,
            report,
            totalScore: report.total_score,
          }
        },
        sessionId: opts.sessionId,
        ...rdsScopeArgs(opts.ctx, opts.scope),
      })
    } catch (error) {
      const mutationError = rdsRepository.getAliyunRdsVoiceCoachMutationError(error)
      if (mutationError) return jsonError(mutationError.status, mutationError.code, mutationError.code)
      throw error
    }
    return NextResponse.json({
      ok: true,
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      session: rdsSessionPayload(ended.session, rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      report: ended.report,
      deduped: ended.deduped,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const writableSession = readWritableTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!writableSession) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
  const { session, sessions } = writableSession

  session.status = "ended"
  session.endedAt = new Date().toISOString()
  session.report = reportForSession(session)
  session.totalScore = session.report.total_score
  appendEvent(session, "session.ended", { report_status: session.report.status })
  sessions.set(opts.sessionId, session)
  writeTextSessions(sessions)

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session_id: opts.sessionId,
    session: sessionPayload(session),
    report: session.report,
    ...textContractPayload(),
  })
}
