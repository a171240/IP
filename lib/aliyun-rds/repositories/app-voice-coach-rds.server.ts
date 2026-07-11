import "server-only"

import { getAliyunRdsPool, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"

export const APP_VOICE_COACH_RDS_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"

export type AppVoiceCoachRdsQueryClient = {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
}

export type AppVoiceCoachCreateTimingRecorder = {
  recordStage(stageName: string, startedAtMs: number): void
}

export type AppVoiceCoachRdsScope = {
  userId: string
  companyId: string
  storeId: string
  membershipId: string
}

export type AppVoiceCoachRdsScenarioSnapshot = {
  id: string
  name?: string
  goal?: string
  seedTopics?: string[]
}

export type AppVoiceCoachRdsSessionRow = {
  id: string
  created_at: string
  user_id: string
  company_id: string | null
  store_id: string | null
  membership_id: string | null
  scenario_id: string
  status: "active" | "ended" | string
  started_at: string
  ended_at: string | null
  report_json: unknown
  total_score: number | string | null
  dimension_scores: unknown
  customer_profile_id?: string | null
  scene_card_id?: string | null
  session_context_json?: unknown
  scenario_snapshot_json?: unknown
}

export type AppVoiceCoachRdsTurnRow = {
  id: string
  created_at: string
  session_id: string
  turn_index: number
  role: "customer" | "beautician" | string
  text: string
  emotion: string | null
  audio_path: string | null
  audio_seconds: number | string | null
  asr_confidence: number | string | null
  analysis_json: unknown
  features_json: unknown
}

export type AppVoiceCoachRdsEvent = {
  cursor: number
  event_id: string
  type: string
  created_at: string
  payload: Record<string, unknown>
}

type AppVoiceCoachCustomerSelectionRow = {
  id: string
  user_id: string
  name: string
}

type AppVoiceCoachSceneSelectionRow = {
  id: string
  user_id: string
  name: string
  service_name: string | null
}

const CUSTOMER_PROFILE_NOT_FOUND = "voice_coach_rds_customer_profile_not_found"
const SCENE_CARD_NOT_FOUND = "voice_coach_rds_scene_card_not_found"

export function getAliyunRdsVoiceCoachSelectionErrorCode(error: unknown) {
  if (!(error instanceof Error)) return null
  if (error.message === CUSTOMER_PROFILE_NOT_FOUND) return "customer_profile_not_found"
  if (error.message === SCENE_CARD_NOT_FOUND) return "scene_card_not_found"
  return null
}

export async function createAliyunRdsVoiceCoachTextSession(args: AppVoiceCoachRdsScope & {
  customerProfileId?: string | null
  firstCustomerText: string
  scenario: AppVoiceCoachRdsScenarioSnapshot
  sceneCardId?: string | null
  timing?: AppVoiceCoachCreateTimingRecorder
}) {
  if (args.timing) {
    return withAliyunRdsCreateTimingTransaction(args.timing, (client) =>
      createAliyunRdsVoiceCoachTextSessionWithClient(client, args),
    )
  }
  return withAliyunRdsTransaction((client) => createAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function getAliyunRdsVoiceCoachTextSession(args: AppVoiceCoachRdsScope & {
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) => getAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function appendAliyunRdsVoiceCoachTextReply(args: AppVoiceCoachRdsScope & {
  nextCustomerText?: string | null
  replyText: string
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) => appendAliyunRdsVoiceCoachTextReplyWithClient(client, args))
}

export async function endAliyunRdsVoiceCoachTextSession(args: AppVoiceCoachRdsScope & {
  dimensionScores: unknown
  report: Record<string, unknown>
  sessionId: string
  totalScore: number
}) {
  return withAliyunRdsTransaction((client) => endAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function listAliyunRdsVoiceCoachTextSessionHistory(args: AppVoiceCoachRdsScope & {
  limit: number
}) {
  return withAliyunRdsTransaction((client) => listAliyunRdsVoiceCoachTextSessionHistoryWithClient(client, args))
}

export async function createAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    customerProfileId?: string | null
    firstCustomerText: string
    scenario: AppVoiceCoachRdsScenarioSnapshot
    sceneCardId?: string | null
    timing?: AppVoiceCoachCreateTimingRecorder
  },
) {
  const userId = requiredText(args.userId, "voice_coach_rds_user_id_required")
  const companyId = requiredText(args.companyId, "voice_coach_rds_company_id_required")
  const storeId = requiredText(args.storeId, "voice_coach_rds_store_id_required")
  const membershipId = requiredText(args.membershipId, "voice_coach_rds_membership_id_required")
  const scenarioId = requiredText(args.scenario?.id, "voice_coach_rds_scenario_id_required")
  const firstText = requiredText(args.firstCustomerText, "voice_coach_rds_first_customer_text_required")
  const customerProfileId = optionalText(args.customerProfileId)
  const sceneCardId = optionalText(args.sceneCardId)
  const customer = customerProfileId
    ? await loadAliyunRdsVoiceCoachCustomerSelection(client, customerProfileId, userId)
    : null
  if (customerProfileId && !customer) throw new Error(CUSTOMER_PROFILE_NOT_FOUND)
  const scene = sceneCardId
    ? await loadAliyunRdsVoiceCoachSceneSelection(client, sceneCardId, userId)
    : null
  if (sceneCardId && !scene) throw new Error(SCENE_CARD_NOT_FOUND)
  const sessionContext = {
    customer_profile_id: customerProfileId,
    customer_name: customer?.name || null,
    scene_card_id: sceneCardId,
    scene_name: scene?.name || null,
    service_name: scene?.service_name || null,
    company_id: companyId,
    store_id: storeId,
    membership_id: membershipId,
  }
  const sessionInsertStartedAt = Date.now()
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      insert into public.voice_coach_sessions (
        user_id,
        company_id,
        store_id,
        membership_id,
        scenario_id,
        status,
        customer_profile_id,
        scene_card_id,
        session_context_json,
        scenario_snapshot_json
      )
      values ($1, $2, $3, $4, $5, 'active', $6, $7, $8::jsonb, $9::jsonb)
      returning *
    `,
    [
      userId,
      companyId,
      storeId,
      membershipId,
      scenarioId,
      customerProfileId,
      sceneCardId,
      jsonbParam(sessionContext),
      jsonbParam(args.scenario),
    ],
  )
  args.timing?.recordStage("rds_insert_session", sessionInsertStartedAt)
  const session = sessionResult.rows[0]
  if (!session) throw new Error("voice_coach_rds_session_insert_failed")

  const firstTurnInsertStartedAt = Date.now()
  const firstCustomerTurn = await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
    analysis: { source: "text_first_rds_contract" },
    features: { provider_mode: "text_only_no_audio_provider" },
    role: "customer",
    sessionId: session.id,
    text: firstText,
    turnIndex: 0,
  })
  args.timing?.recordStage("rds_insert_first_customer_turn", firstTurnInsertStartedAt)

  return { firstCustomerTurn, session }
}

async function loadAliyunRdsVoiceCoachCustomerSelection(
  client: AppVoiceCoachRdsQueryClient,
  customerProfileId: string,
  userId: string,
) {
  const result = await client.query<AppVoiceCoachCustomerSelectionRow>(
    `
      select id, user_id, name
      from public.voice_coach_customer_profiles
      where id = $1 and user_id = $2
      limit 1
    `,
    [customerProfileId, userId],
  )
  return result.rows[0] || null
}

async function loadAliyunRdsVoiceCoachSceneSelection(
  client: AppVoiceCoachRdsQueryClient,
  sceneCardId: string,
  userId: string,
) {
  const result = await client.query<AppVoiceCoachSceneSelectionRow>(
    `
      select id, user_id, name, service_name
      from public.voice_coach_scene_cards
      where id = $1 and user_id = $2
      limit 1
    `,
    [sceneCardId, userId],
  )
  return result.rows[0] || null
}

async function withAliyunRdsCreateTimingTransaction<T>(
  timing: AppVoiceCoachCreateTimingRecorder,
  fn: (client: AppVoiceCoachRdsQueryClient) => Promise<T>,
): Promise<T> {
  const poolStartedAt = Date.now()
  const pool = await getAliyunRdsPool()
  timing.recordStage("rds_pool_ready", poolStartedAt)

  const clientStartedAt = Date.now()
  const client = await pool.connect()
  timing.recordStage("rds_client_acquired", clientStartedAt)

  try {
    const beginStartedAt = Date.now()
    await client.query("BEGIN")
    timing.recordStage("rds_begin", beginStartedAt)

    try {
      const result = await fn(client)
      const commitStartedAt = Date.now()
      await client.query("COMMIT")
      timing.recordStage("rds_commit", commitStartedAt)
      return result
    } catch (error) {
      const rollbackStartedAt = Date.now()
      await client.query("ROLLBACK")
      timing.recordStage("rds_rollback", rollbackStartedAt)
      throw error
    }
  } finally {
    client.release()
  }
}

export async function getAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    sessionId: string
  },
) {
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where id = $1
        and user_id = $2
        and company_id = $3
        and store_id = $4
        and membership_id = $5
      limit 1
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      requiredText(args.companyId, "voice_coach_rds_company_id_required"),
      requiredText(args.storeId, "voice_coach_rds_store_id_required"),
      requiredText(args.membershipId, "voice_coach_rds_membership_id_required"),
    ],
  )
  const session = sessionResult.rows[0] || null
  if (!session) return null

  const turns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, session.id)
  return { session, turns }
}

export async function appendAliyunRdsVoiceCoachTextReplyWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    nextCustomerText?: string | null
    replyText: string
    sessionId: string
  },
) {
  const current = await getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: args.sessionId,
    userId: args.userId,
    companyId: args.companyId,
    storeId: args.storeId,
    membershipId: args.membershipId,
  })
  if (!current) throw new Error("voice_coach_rds_session_not_found")
  if (current.session.status === "ended") throw new Error("voice_coach_rds_session_ended")

  const maxIndexResult = await client.query<{ max_turn_index: number }>(
    `
      select coalesce(max(turn_index), -1)::int as max_turn_index
      from public.voice_coach_turns
      where session_id = $1
    `,
    [requiredText(args.sessionId, "voice_coach_rds_session_id_required")],
  )
  const maxTurnIndex = Number(maxIndexResult.rows[0]?.max_turn_index ?? -1)
  const beauticianTurn = await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
    analysis: { source: "text_first_rds_contract" },
    features: { provider_mode: "text_only_no_audio_provider" },
    role: "beautician",
    sessionId: args.sessionId,
    text: requiredText(args.replyText, "voice_coach_rds_reply_text_required"),
    turnIndex: maxTurnIndex + 1,
  })
  const nextText = optionalText(args.nextCustomerText)
  const nextCustomerTurn = nextText
    ? await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
        analysis: { source: "text_first_rds_contract" },
        features: { provider_mode: "text_only_no_audio_provider" },
        role: "customer",
        sessionId: args.sessionId,
        text: nextText,
        turnIndex: maxTurnIndex + 2,
      })
    : null

  return { beauticianTurn, nextCustomerTurn }
}

export async function endAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    dimensionScores: unknown
    report: Record<string, unknown>
    sessionId: string
    totalScore: number
  },
) {
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      update public.voice_coach_sessions
      set
        status = 'ended',
        ended_at = now(),
        report_json = $6::jsonb,
        total_score = $7,
        dimension_scores = $8::jsonb
      where id = $1
        and user_id = $2
        and company_id = $3
        and store_id = $4
        and membership_id = $5
      returning *
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      requiredText(args.companyId, "voice_coach_rds_company_id_required"),
      requiredText(args.storeId, "voice_coach_rds_store_id_required"),
      requiredText(args.membershipId, "voice_coach_rds_membership_id_required"),
      jsonbParam(args.report),
      args.totalScore,
      jsonbParam(args.dimensionScores),
    ],
  )
  const session = result.rows[0]
  if (!session) throw new Error("voice_coach_rds_session_end_failed")
  return session
}

export async function listAliyunRdsVoiceCoachTextSessionHistoryWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    limit: number
  },
) {
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where user_id = $1
        and company_id = $2
        and store_id = $3
        and membership_id = $4
      order by created_at desc
      limit $5
    `,
    [
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      requiredText(args.companyId, "voice_coach_rds_company_id_required"),
      requiredText(args.storeId, "voice_coach_rds_store_id_required"),
      requiredText(args.membershipId, "voice_coach_rds_membership_id_required"),
      normalizeLimit(args.limit),
    ],
  )
  return result.rows
}

export function deriveAliyunRdsVoiceCoachTextEvents(
  session: AppVoiceCoachRdsSessionRow,
  turns: AppVoiceCoachRdsTurnRow[],
): AppVoiceCoachRdsEvent[] {
  const events: AppVoiceCoachRdsEvent[] = []
  const firstCustomerTurn = turns.find((turn) => turn.role === "customer" && Number(turn.turn_index) === 0)
  events.push({
    cursor: events.length + 1,
    created_at: session.created_at,
    event_id: `${session.id}:session.created`,
    payload: {
      first_turn_id: firstCustomerTurn?.id || null,
      session_id: session.id,
    },
    type: "session.created",
  })

  for (const turn of turns) {
    if (turn.role === "beautician") {
      events.push({
        cursor: events.length + 1,
        created_at: turn.created_at,
        event_id: `${turn.id}:beautician_turn.submitted`,
        payload: { turn_id: turn.id },
        type: "beautician_turn.submitted",
      })
    }
    if (turn.role === "customer" && Number(turn.turn_index) > 0) {
      events.push({
        cursor: events.length + 1,
        created_at: turn.created_at,
        event_id: `${turn.id}:customer_turn.ready`,
        payload: { turn_id: turn.id },
        type: "customer_turn.ready",
      })
    }
  }

  if (session.status === "ended") {
    events.push({
      cursor: events.length + 1,
      created_at: session.ended_at || session.created_at,
      event_id: `${session.id}:session.ended`,
      payload: { report_ready: Boolean(session.report_json) },
      type: "session.ended",
    })
  }

  return events
}

async function listAliyunRdsVoiceCoachTextTurnsWithClient(
  client: AppVoiceCoachRdsQueryClient,
  sessionId: string,
) {
  const result = await client.query<AppVoiceCoachRdsTurnRow>(
    `
      select *
      from public.voice_coach_turns
      where session_id = $1
      order by turn_index asc
    `,
    [requiredText(sessionId, "voice_coach_rds_session_id_required")],
  )
  return result.rows
}

async function insertAliyunRdsVoiceCoachTextTurnWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    analysis?: Record<string, unknown>
    features?: Record<string, unknown>
    role: "customer" | "beautician"
    sessionId: string
    text: string
    turnIndex: number
  },
) {
  const result = await client.query<AppVoiceCoachRdsTurnRow>(
    `
      insert into public.voice_coach_turns (
        session_id,
        turn_index,
        role,
        text,
        emotion,
        analysis_json,
        features_json
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      returning *
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      Math.max(0, Math.round(args.turnIndex)),
      args.role,
      requiredText(args.text, "voice_coach_rds_turn_text_required"),
      "neutral",
      jsonbParam(args.analysis || {}),
      jsonbParam(args.features || {}),
    ],
  )
  const turn = result.rows[0]
  if (!turn) throw new Error("voice_coach_rds_turn_insert_failed")
  return turn
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? null)
}

function optionalText(value: unknown) {
  const text = String(value || "").trim()
  return text || null
}

function requiredText(value: unknown, errorCode: string) {
  const text = optionalText(value)
  if (!text) throw new Error(errorCode)
  return text
}

function normalizeLimit(value: unknown) {
  const numberValue = Number(value || 20)
  if (!Number.isFinite(numberValue)) return 20
  return Math.max(1, Math.min(50, Math.round(numberValue)))
}
