import "server-only"

import { randomUUID } from "node:crypto"
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
  accountContextPayload,
  getAliyunRdsAppAccountContext,
  type AppAccountContext,
} from "@/lib/aliyun-rds/repositories/account-profile.server"
import { getScenario } from "@/lib/voice-coach/scenarios"

export type AppVoiceCoachFacadeScope = {
  companyId: string
  storeId: string
}

export const APP_VOICE_COACH_FORBIDDEN_SIDE_EFFECTS = [
  "voice_coach_session_write",
  "voice_coach_turn_write",
  "voice_coach_job_write",
  "audio_storage_write",
  "tts_generation",
  "asr_transcription",
  "llm_generation",
  "ai_point_charge",
  "production_write",
] as const

const DEFAULT_SCENARIO_ID = "objection_safety"
const FACADE_MODE = "safe_local_app_facade"
const CAPABILITY_STATUS = "capability_pending"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function parseLimit(value: unknown) {
  const parsed = Number(value || 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(50, Math.max(1, Math.round(parsed)))
}

export async function readOptionalAppVoiceCoachJsonBody(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? { body } : { error: jsonError(400, "invalid_payload", "invalid_payload") }
}

export function resolveAppVoiceCoachScope(ctx: AppAccountContext, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  if (!ctx.isPlatformAdmin && requestedCompanyId && requestedCompanyId !== ctx.companyId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  const storeId = requestedStoreId || ctx.storeId

  if (!companyId || !storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!ctx.isPlatformAdmin && ctx.storeId && requestedStoreId && requestedStoreId !== ctx.storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  return { companyId, storeId }
}

export async function resolveAppVoiceCoachFacadeContext(request: NextRequest) {
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) return { error: appAuthRequiredResponse() }

  const ctx = await getAliyunRdsAppAccountContext(auth.user)
  const scope = resolveAppVoiceCoachScope(ctx, request)
  if ("error" in scope) return { error: scope.error }

  return { auth, ctx, scope }
}

export function appVoiceCoachFacadeErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  return jsonError(500, error instanceof Error ? error.message : fallbackCode, fallbackCode)
}

export function appVoiceCoachContextPayload(ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  return {
    ...accountContextPayload(ctx),
    voice_coach_scope: {
      company_id: scope.companyId,
      store_id: scope.storeId,
    },
  }
}

function appVoiceCoachFacadePayload(action: string) {
  return {
    facade: {
      action,
      mode: FACADE_MODE,
      capability_status: CAPABILITY_STATUS,
      repository_mode: "no_voice_coach_persistence",
      external_services: "disabled",
    },
    forbidden_side_effects: APP_VOICE_COACH_FORBIDDEN_SIDE_EFFECTS,
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

function pendingSession(sessionId: string, scenarioId?: unknown) {
  return {
    id: sessionId,
    status: "capability_pending",
    started_at: null,
    ended_at: null,
    total_score: null,
    scenario: scenarioPayload(scenarioId),
    context: {
      facade: true,
      capability_status: CAPABILITY_STATUS,
    },
  }
}

export function appVoiceCoachSessionListResponse(opts: {
  ctx: AppAccountContext
  request: NextRequest
  scope: AppVoiceCoachFacadeScope
}) {
  const params = new URL(opts.request.url).searchParams
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    sessions: [],
    limit: parseLimit(params.get("limit")),
    ...appVoiceCoachFacadePayload("voice_coach.sessions.list"),
  })
}

export function appVoiceCoachSessionAcceptedResponse(opts: {
  body: Record<string, unknown>
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
}) {
  const scenario = scenarioPayload(opts.body.scenario_id)
  const sessionId = `app-vc-${randomUUID()}`
  const turnId = `app-vc-turn-${randomUUID()}`

  return NextResponse.json(
    {
      ok: true,
      status: "accepted",
      capability_status: CAPABILITY_STATUS,
      code: "app_voice_coach_session_not_configured",
      message:
        "App voiceCoach facade accepted the request locally. Real session persistence, TTS, ASR, and LLM generation remain disabled for this route.",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: sessionId,
      scenario,
      session_context: {
        facade: true,
        capability_status: CAPABILITY_STATUS,
      },
      first_customer_turn: {
        turn_id: turnId,
        turn_index: 0,
        role: "customer",
        status: "text_ready",
        text: firstCustomerText(opts.body.scenario_id),
        emotion: "neutral",
        audio_url: null,
        audio_seconds: null,
        tts_failed: false,
        tts_pending: false,
        audio_source: "none",
        pending: true,
      },
      ...appVoiceCoachFacadePayload("voice_coach.sessions.create"),
    },
    { status: 202 },
  )
}

export function appVoiceCoachSessionDetailResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session: pendingSession(opts.sessionId),
    turns: [],
    last_event_cursor: 0,
    ...appVoiceCoachFacadePayload("voice_coach.sessions.detail"),
  })
}

export function appVoiceCoachEventsResponse(opts: {
  ctx: AppAccountContext
  request: NextRequest
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  const params = new URL(opts.request.url).searchParams
  const cursor = Math.max(0, Number(params.get("cursor") || 0) || 0)
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    events: [],
    next_cursor: cursor,
    has_more: false,
    session_status: "capability_pending",
    session_id: opts.sessionId,
    ...appVoiceCoachFacadePayload("voice_coach.events.list"),
  })
}

export function appVoiceCoachReportResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    report: {
      status: "not_configured",
      total_score: null,
      dimension: [],
      summary_blocks: [],
      tabs: {},
      next_round_focus: null,
      meta: {
        session_id: opts.sessionId,
        facade: true,
        capability_status: CAPABILITY_STATUS,
      },
    },
    ...appVoiceCoachFacadePayload("voice_coach.report.read"),
  })
}

export function appVoiceCoachTtsAcceptedResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
  turnId: string
}) {
  return NextResponse.json(
    {
      ok: true,
      status: "accepted",
      capability_status: CAPABILITY_STATUS,
      code: "app_voice_coach_tts_not_configured",
      message: "App voiceCoach TTS facade is auth-gated but real TTS generation is disabled.",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: opts.turnId,
      turn_index: null,
      audio_url: null,
      audio_seconds: null,
      tts_failed: true,
      tts_pending: false,
      cached: false,
      ...appVoiceCoachFacadePayload("voice_coach.turns.tts"),
    },
    { status: 202 },
  )
}

export function appVoiceCoachAsrPreviewAcceptedResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  return NextResponse.json(
    {
      ok: true,
      status: "accepted",
      capability_status: CAPABILITY_STATUS,
      code: "app_voice_coach_asr_not_configured",
      message: "App voiceCoach ASR preview facade is auth-gated but real ASR transcription is disabled.",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      text: "",
      confidence: null,
      audio_seconds: null,
      request_id: null,
      degraded: true,
      error: "app_voice_coach_asr_not_configured",
      ...appVoiceCoachFacadePayload("voice_coach.asr_preview"),
    },
    { status: 202 },
  )
}

export function appVoiceCoachSubmitAcceptedResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  const turnId = `app-vc-turn-${randomUUID()}`
  return NextResponse.json(
    {
      ok: true,
      status: "accepted",
      capability_status: CAPABILITY_STATUS,
      code: "app_voice_coach_submit_not_configured",
      message:
        "App voiceCoach submit facade accepted the boundary request. Audio upload, ASR, LLM analysis, next customer turn, and job persistence are disabled.",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: turnId,
      job_id: null,
      client_attempt_id: null,
      next_cursor: 0,
      reached_max_turns: false,
      server_advanced: false,
      server_advanced_stage: "capability_pending",
      beautician_turn: {
        turn_id: turnId,
        turn_index: null,
        role: "beautician",
        text: "",
        audio_url: null,
        audio_seconds: null,
        pending: true,
      },
      next_customer_turn: null,
      ...appVoiceCoachFacadePayload("voice_coach.beautician_turn.submit"),
    },
    { status: 202 },
  )
}

export function appVoiceCoachEndAcceptedResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  return NextResponse.json(
    {
      ok: true,
      status: "accepted",
      capability_status: CAPABILITY_STATUS,
      code: "app_voice_coach_end_not_configured",
      message: "App voiceCoach end facade is auth-gated but does not persist session status or generate reports.",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      report: null,
      ...appVoiceCoachFacadePayload("voice_coach.sessions.end"),
    },
    { status: 202 },
  )
}
