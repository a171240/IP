import "server-only"

import { randomUUID } from "node:crypto"
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
  APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE,
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
import { getScenario } from "@/lib/voice-coach/scenarios"

export type AppVoiceCoachFacadeScope = {
  companyId: string
  storeId: string
  membershipId: string
}

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

type TextTurn = {
  turn_id: string
  turn_index: number
  role: "customer" | "beautician"
  status: "text_ready"
  text: string
  emotion: string
  audio_url: null
  audio_seconds: null
  audio_source: "none"
  pending: false
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

function rdsSessionNotFoundResponse(sessionId: unknown) {
  return isUuid(sessionId) ? null : jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
}

function rdsScopeArgs(ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
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

export async function readOptionalAppVoiceCoachJsonBody(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? { body } : { error: jsonError(400, "invalid_payload", "invalid_payload") }
}

export async function readOptionalAppVoiceCoachFormBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    if (!form) return { error: jsonError(400, "invalid_payload", "invalid_payload") }
    return { body: formToRecord(form) }
  }
  return readOptionalAppVoiceCoachJsonBody(request)
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

export async function resolveAppVoiceCoachFacadeContext(request: NextRequest) {
  resolveAppVoiceCoachTextRepositorySelection()
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) return { error: appAuthRequiredResponse() }

  const ctx = await getAliyunRdsAppAccountContext(auth.user)
  const access = requireAppFeatureAccess(ctx, ctx.features, "voice_coach")
  if (!access.ok) {
    return { error: NextResponse.json(access.body, { status: access.status }) }
  }
  const scope = resolveAppVoiceCoachScope(ctx, request)
  if ("error" in scope) return { error: scope.error }
  const scopeAccess = requireAppFeatureAccess(ctx, ctx.features, "voice_coach", {
    companyId: scope.companyId,
    storeId: scope.storeId,
  })
  if (!scopeAccess.ok) {
    return { error: NextResponse.json(scopeAccess.body, { status: scopeAccess.status }) }
  }

  return { auth, ctx, scope }
}

export function appVoiceCoachFacadeErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

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
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  return jsonError(500, fallbackCode, fallbackCode)
}

export function appVoiceCoachContextPayload(ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
  return {
    ...accountContextPayload(ctx),
    voice_coach_scope: {
      company_id: scope.companyId,
      store_id: scope.storeId,
      membership_id: scope.membershipId,
    },
  }
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

function selectedTextContractPayload() {
  return shouldUseRdsRepository()
    ? rdsContractPayload(APP_VOICE_COACH_PRODUCTION_RDS_REPOSITORY_MODE)
    : textContractPayload()
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
    if (typeof value === "string") body[key] = value
  }
  return body
}

function sessionBelongsToScope(session: TextSession, ctx: AppAccountContext, scope: AppVoiceCoachFacadeScope) {
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
  role: "customer" | "beautician"
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
    audio_url: null,
    audio_seconds: null,
    audio_source: "none" as const,
    pending: false,
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
  if (shouldUseRdsRepository()) {
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
  if (shouldUseRdsRepository()) {
    const customerProfileId = cleanText(opts.body.customer_profile_id, 80) || null
    const sceneCardId = cleanText(opts.body.scene_card_id, 80) || null
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

    let created
    try {
      created = await rdsRepository.createAliyunRdsVoiceCoachTextSession({
        customerProfileId,
        firstCustomerText: firstCustomerTurnText,
        scenario,
        sceneCardId,
        timing: opts.timing,
        ...rdsScopeArgs(opts.ctx, opts.scope),
      })
    } catch (error) {
      const selectionErrorCode = rdsRepository.getAliyunRdsVoiceCoachSelectionErrorCode(error)
      if (selectionErrorCode) return jsonError(400, selectionErrorCode, selectionErrorCode)
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
          repository_mode: rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE,
          provider_mode: TEXT_SESSION_PROVIDER_MODE,
        },
        first_customer_turn: rdsTurnPayload(created.firstCustomerTurn),
        ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
      },
      { status: 201 },
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
  if (shouldUseRdsRepository()) {
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
  if (shouldUseRdsRepository()) {
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
  if (shouldUseRdsRepository()) {
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

export function appVoiceCoachTtsProviderRequiredResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
  turnId: string
}) {
  return NextResponse.json(
    {
      ok: false,
      code: "voice_coach_tts_provider_required",
      error: "voice_coach_tts_provider_required",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      turn_id: opts.turnId,
      audio_url: null,
      audio_seconds: null,
      ...selectedTextContractPayload(),
    },
    { status: 501 },
  )
}

export function appVoiceCoachAsrProviderRequiredResponse(opts: {
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  return NextResponse.json(
    {
      ok: false,
      code: "voice_coach_asr_provider_required",
      error: "voice_coach_asr_provider_required",
      context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
      session_id: opts.sessionId,
      text: "",
      confidence: null,
      audio_seconds: null,
      request_id: null,
      ...selectedTextContractPayload(),
    },
    { status: 501 },
  )
}

export async function submitAppVoiceCoachTextBeauticianTurnResponse(opts: {
  body: Record<string, unknown>
  ctx: AppAccountContext
  scope: AppVoiceCoachFacadeScope
  sessionId: string
}) {
  if (shouldUseRdsRepository()) {
    const invalidSessionResponse = rdsSessionNotFoundResponse(opts.sessionId)
    if (invalidSessionResponse) return invalidSessionResponse

    const rawClientAttemptId = opts.body.client_attempt_id
    const clientAttemptId = typeof rawClientAttemptId === "string" ? rawClientAttemptId.trim() : ""
    if (!clientAttemptId) return jsonError(400, "client_attempt_id_required", "client_attempt_id_required")
    if (clientAttemptId.length < 8 || clientAttemptId.length > 120) {
      return jsonError(400, "client_attempt_id_invalid", "client_attempt_id_invalid")
    }
    const replyToTurnId = cleanText(opts.body.reply_to_turn_id, 160)
    if (!replyToTurnId) return jsonError(400, "reply_to_turn_id_required", "reply_to_turn_id_required")

    const replyText = cleanText(
      opts.body.transcript_text || opts.body.text || opts.body.asr_text || opts.body.reply_text,
      1000,
    )
    if (!replyText) return jsonError(400, "beautician_turn_text_required", "beautician_turn_text_required")

    const rdsRepository = await loadRdsRepository()
    let submitted
    try {
      submitted = await rdsRepository.appendAliyunRdsVoiceCoachTextReply({
        clientAttemptId,
        nextCustomerText: nextCustomerText(replyText, false) || null,
        replyText,
        replyToTurnId,
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
      turn_id: submitted.beauticianTurn.id,
      job_id: null,
      client_attempt_id: clientAttemptId,
      next_cursor: rdsRepository.deriveAliyunRdsVoiceCoachTextEvents(submitted.session, submitted.turns).length,
      reached_max_turns: submitted.reachedMaxTurns,
      deduped: submitted.deduped,
      server_advanced: Boolean(submitted.nextCustomerTurn),
      server_advanced_stage: submitted.nextCustomerTurn ? "next_customer_turn_ready" : "ready_to_end",
      beautician_turn: rdsTurnPayload(submitted.beauticianTurn),
      next_customer_turn: submitted.nextCustomerTurn ? rdsTurnPayload(submitted.nextCustomerTurn) : null,
      ...rdsContractPayload(rdsRepository.APP_VOICE_COACH_RDS_REPOSITORY_MODE),
    })
  }

  const writableSession = readWritableTextSession(opts.sessionId, opts.ctx, opts.scope)
  if (!writableSession) return jsonError(404, "voice_coach_session_not_found", "voice_coach_session_not_found")
  const { session, sessions } = writableSession
  if (session.status === "ended") return jsonError(409, "voice_coach_session_ended", "voice_coach_session_ended")

  const replyText = cleanText(
    opts.body.transcript_text || opts.body.text || opts.body.asr_text || opts.body.reply_text,
    1000,
  )
  if (!replyText) return jsonError(400, "beautician_turn_text_required", "beautician_turn_text_required")

  const beauticianTurn = textTurn({
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
  writeTextSessions(sessions)

  return NextResponse.json({
    ok: true,
    context: appVoiceCoachContextPayload(opts.ctx, opts.scope),
    session_id: opts.sessionId,
    turn_id: beauticianTurn.turn_id,
    job_id: null,
    client_attempt_id: cleanText(opts.body.client_attempt_id, 120) || null,
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
  if (shouldUseRdsRepository()) {
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
