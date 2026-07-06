import "server-only"

import { withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"

export const APP_VOICE_COACH_RDS_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"

export type AppVoiceCoachRdsQueryClient = {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
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

export async function createAliyunRdsVoiceCoachTextSession(args: {
  customerProfileId?: string | null
  firstCustomerText: string
  scenario: AppVoiceCoachRdsScenarioSnapshot
  sceneCardId?: string | null
  sessionContext?: Record<string, unknown>
  userId: string
}) {
  return withAliyunRdsTransaction((client) => createAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function getAliyunRdsVoiceCoachTextSession(args: {
  sessionId: string
  userId: string
}) {
  return withAliyunRdsTransaction((client) => getAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function appendAliyunRdsVoiceCoachTextReply(args: {
  nextCustomerText?: string | null
  replyText: string
  sessionId: string
  userId: string
}) {
  return withAliyunRdsTransaction((client) => appendAliyunRdsVoiceCoachTextReplyWithClient(client, args))
}

export async function endAliyunRdsVoiceCoachTextSession(args: {
  dimensionScores: unknown
  report: Record<string, unknown>
  sessionId: string
  totalScore: number
  userId: string
}) {
  return withAliyunRdsTransaction((client) => endAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function listAliyunRdsVoiceCoachTextSessionHistory(args: {
  limit: number
  userId: string
}) {
  return withAliyunRdsTransaction((client) => listAliyunRdsVoiceCoachTextSessionHistoryWithClient(client, args))
}

export async function createAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    customerProfileId?: string | null
    firstCustomerText: string
    scenario: AppVoiceCoachRdsScenarioSnapshot
    sceneCardId?: string | null
    sessionContext?: Record<string, unknown>
    userId: string
  },
) {
  const userId = requiredText(args.userId, "voice_coach_rds_user_id_required")
  const scenarioId = requiredText(args.scenario?.id, "voice_coach_rds_scenario_id_required")
  const firstText = requiredText(args.firstCustomerText, "voice_coach_rds_first_customer_text_required")
  const sessionContext = {
    ...(args.sessionContext || {}),
    repository_mode: APP_VOICE_COACH_RDS_REPOSITORY_MODE,
  }
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      insert into public.voice_coach_sessions (
        user_id,
        scenario_id,
        status,
        customer_profile_id,
        scene_card_id,
        session_context_json,
        scenario_snapshot_json
      )
      values ($1, $2, 'active', $3, $4, $5::jsonb, $6::jsonb)
      returning *
    `,
    [
      userId,
      scenarioId,
      optionalText(args.customerProfileId),
      optionalText(args.sceneCardId),
      jsonbParam(sessionContext),
      jsonbParam(args.scenario),
    ],
  )
  const session = sessionResult.rows[0]
  if (!session) throw new Error("voice_coach_rds_session_insert_failed")

  const firstCustomerTurn = await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
    analysis: { source: "text_first_rds_contract" },
    features: { provider_mode: "text_only_no_audio_provider" },
    role: "customer",
    sessionId: session.id,
    text: firstText,
    turnIndex: 0,
  })

  return { firstCustomerTurn, session }
}

export async function getAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    sessionId: string
    userId: string
  },
) {
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where id = $1 and user_id = $2
      limit 1
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
    ],
  )
  const session = sessionResult.rows[0] || null
  if (!session) return null

  const turns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, session.id)
  return { session, turns }
}

export async function appendAliyunRdsVoiceCoachTextReplyWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    nextCustomerText?: string | null
    replyText: string
    sessionId: string
    userId: string
  },
) {
  const current = await getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: args.sessionId,
    userId: args.userId,
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
  args: {
    dimensionScores: unknown
    report: Record<string, unknown>
    sessionId: string
    totalScore: number
    userId: string
  },
) {
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      update public.voice_coach_sessions
      set
        status = 'ended',
        ended_at = now(),
        report_json = $3::jsonb,
        total_score = $4,
        dimension_scores = $5::jsonb
      where id = $1 and user_id = $2
      returning *
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
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
  args: {
    limit: number
    userId: string
  },
) {
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where user_id = $1
      order by created_at desc
      limit $2
    `,
    [requiredText(args.userId, "voice_coach_rds_user_id_required"), normalizeLimit(args.limit)],
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
