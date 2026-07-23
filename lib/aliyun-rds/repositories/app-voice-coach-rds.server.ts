import "server-only"

import { getAliyunRdsPool, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"
import {
  reservePersonalTrialVoiceSessionWithClient,
} from "@/lib/aliyun-rds/repositories/app-access-control.server"

export const APP_VOICE_COACH_RDS_REPOSITORY_MODE = "rds_voice_coach_text_session_contract"

export type AppVoiceCoachRdsQueryClient = {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
}

export type AppVoiceCoachCreateTimingRecorder = {
  recordStage(stageName: string, startedAtMs: number): void
}

export type AppVoiceCoachRdsScope = {
  userId: string
  dataDomain?: "store" | "personal_trial"
  canonicalUserId?: string | null
  companyId?: string | null
  storeId?: string | null
  membershipId?: string | null
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
  canonical_user_id?: string | null
  data_domain?: "store" | "personal_trial" | string
  client_session_id?: string | null
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

export type AppVoiceCoachRdsEndState = {
  dimensionScores: unknown
  report: Record<string, unknown>
  totalScore: number
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
const SESSION_NOT_FOUND = "voice_coach_rds_session_not_found"
const SESSION_ENDED = "voice_coach_rds_session_ended"
const IDEMPOTENCY_CONFLICT = "voice_coach_rds_idempotency_conflict"
const REPLY_TARGET_STALE = "voice_coach_rds_reply_target_stale"

export function getAliyunRdsVoiceCoachSelectionErrorCode(error: unknown) {
  if (!(error instanceof Error)) return null
  if (error.message === CUSTOMER_PROFILE_NOT_FOUND) return "customer_profile_not_found"
  if (error.message === SCENE_CARD_NOT_FOUND) return "scene_card_not_found"
  return null
}

export function getAliyunRdsVoiceCoachMutationError(error: unknown) {
  if (!(error instanceof Error)) return null
  if (error.message === SESSION_NOT_FOUND || error.message === "voice_coach_rds_session_end_failed") {
    return { status: 404, code: "voice_coach_session_not_found" }
  }
  if (error.message === IDEMPOTENCY_CONFLICT) {
    return { status: 409, code: "voice_coach_idempotency_conflict" }
  }
  if (error.message === SESSION_ENDED) return { status: 409, code: "voice_coach_session_ended" }
  if (error.message === REPLY_TARGET_STALE) {
    return { status: 409, code: "voice_coach_reply_target_stale" }
  }
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

export async function createAliyunRdsPersonalTrialVoiceCoachTextSession(args: {
  canonicalUserId: string
  clientSessionId: string
  firstCustomerText: string
  scenario: AppVoiceCoachRdsScenarioSnapshot
  userId: string
  timing?: AppVoiceCoachCreateTimingRecorder
}) {
  if (args.timing) {
    return withAliyunRdsCreateTimingTransaction(args.timing, (client) =>
      createAliyunRdsPersonalTrialVoiceCoachTextSessionWithClient(client, args),
    )
  }
  return withAliyunRdsTransaction((client) =>
    createAliyunRdsPersonalTrialVoiceCoachTextSessionWithClient(client, args),
  )
}

export async function createAliyunRdsPersonalTrialVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    canonicalUserId: string
    clientSessionId: string
    firstCustomerText: string
    scenario: AppVoiceCoachRdsScenarioSnapshot
    userId: string
    timing?: AppVoiceCoachCreateTimingRecorder
  },
) {
  const firstText = requiredText(
    args.firstCustomerText,
    "voice_coach_rds_first_customer_text_required",
  )
  const reservation = await reservePersonalTrialVoiceSessionWithClient(client, {
    canonicalUserId: args.canonicalUserId,
    clientSessionId: args.clientSessionId,
    requestPayload: { scenario_id: args.scenario.id },
    userId: args.userId,
  })
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where id = $1
        and user_id = $2
        and canonical_user_id = $3
        and data_domain = 'personal_trial'
      limit 1
    `,
    [reservation.sessionId, args.userId, args.canonicalUserId],
  )
  const session = sessionResult.rows[0]
  if (!session) throw new Error("voice_coach_rds_session_insert_failed")

  const existingTurns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, session.id)
  if (existingTurns[0]) {
    return {
      deduped: true,
      firstCustomerTurn: existingTurns[0],
      session,
      trial: reservation.trial,
    }
  }

  const firstCustomerTurn = await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
    analysis: { source: "personal_trial_text_first_rds_contract" },
    features: {
      data_domain: "personal_trial",
      provider_mode: "text_only_no_audio_provider",
    },
    role: "customer",
    sessionId: session.id,
    text: firstText,
    turnIndex: 0,
  })
  return {
    deduped: reservation.deduped,
    firstCustomerTurn,
    session,
    trial: reservation.trial,
  }
}

export async function getAliyunRdsVoiceCoachTextSession(args: AppVoiceCoachRdsScope & {
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) => getAliyunRdsVoiceCoachTextSessionWithClient(client, args))
}

export async function appendAliyunRdsVoiceCoachTextReply(args: AppVoiceCoachRdsScope & {
  audioPath: string
  audioSeconds: number | null
  clientAttemptId: string
  nextCustomerText?: string | null
  persistAudio?: () => Promise<void>
  replyText: string
  replyToTurnId: string
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) => appendAliyunRdsVoiceCoachTextReplyWithClient(client, args))
}

export async function saveAliyunRdsVoiceCoachTurnAudio(args: AppVoiceCoachRdsScope & {
  audioPath: string
  audioSeconds: number | null
  expectedRole: "customer" | "beautician"
  sessionId: string
  turnId: string
}) {
  return withAliyunRdsTransaction((client) => saveAliyunRdsVoiceCoachTurnAudioWithClient(client, args))
}

export async function endAliyunRdsVoiceCoachTextSession(args: AppVoiceCoachRdsScope & {
  buildEndState(args: {
    session: AppVoiceCoachRdsSessionRow
    turns: AppVoiceCoachRdsTurnRow[]
  }): AppVoiceCoachRdsEndState
  sessionId: string
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
  const scope = normalizedRdsScope(args)
  if (scope.dataDomain !== "store") {
    throw new Error("voice_coach_rds_store_scope_required")
  }
  const companyId = scope.companyId
  const storeId = scope.storeId
  const membershipId = scope.membershipId
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
        data_domain,
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
      values ($1, 'store', $2, $3, $4, $5, 'active', $6, $7, $8::jsonb, $9::jsonb)
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
  const scope = normalizedRdsScope(args)
  const sessionResult = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where id = $1
        and user_id = $2
        and (
          (
            $3 = 'personal_trial'
            and data_domain = 'personal_trial'
            and canonical_user_id = $4
            and (
              trial_reservation_status = 'consumed'
              or (
                trial_reservation_status = 'reserved'
                and trial_reservation_expires_at > clock_timestamp()
              )
            )
          )
          or (
            $3 = 'store'
            and data_domain = 'store'
            and company_id = $5
            and store_id = $6
            and membership_id = $7
          )
        )
      limit 1
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      scope.dataDomain,
      scope.canonicalUserId,
      scope.companyId,
      scope.storeId,
      scope.membershipId,
    ],
  )
  const session = sessionResult.rows[0] || null
  if (!session) return null

  const turns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, session.id)
  return { session, turns }
}

async function lockAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & { sessionId: string },
) {
  const scope = normalizedRdsScope(args)
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where id = $1
        and user_id = $2
        and (
          (
            $3 = 'personal_trial'
            and data_domain = 'personal_trial'
            and canonical_user_id = $4
            and (
              trial_reservation_status = 'consumed'
              or (
                trial_reservation_status = 'reserved'
                and trial_reservation_expires_at > clock_timestamp()
              )
            )
          )
          or (
            $3 = 'store'
            and data_domain = 'store'
            and company_id = $5
            and store_id = $6
            and membership_id = $7
          )
        )
      limit 1
      for update
    `,
    [
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      scope.dataDomain,
      scope.canonicalUserId,
      scope.companyId,
      scope.storeId,
      scope.membershipId,
    ],
  )
  return result.rows[0] || null
}

async function findAliyunRdsVoiceCoachAttemptWithClient(
  client: AppVoiceCoachRdsQueryClient,
  sessionId: string,
  clientAttemptId: string,
) {
  const result = await client.query<AppVoiceCoachRdsTurnRow>(
    `
      select *
      from public.voice_coach_turns
      where session_id = $1
        and role = 'beautician'
        and features_json ->> 'client_attempt_id' = $2
      order by turn_index asc
      limit 1
    `,
    [sessionId, clientAttemptId],
  )
  return result.rows[0] || null
}

export async function appendAliyunRdsVoiceCoachTextReplyWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    audioPath: string
    audioSeconds: number | null
    clientAttemptId: string
    nextCustomerText?: string | null
    persistAudio?: () => Promise<void>
    replyText: string
    replyToTurnId: string
    sessionId: string
  },
) {
  const sessionId = requiredText(args.sessionId, "voice_coach_rds_session_id_required")
  const clientAttemptId = requiredText(args.clientAttemptId, "voice_coach_rds_client_attempt_id_required")
  const replyToTurnId = requiredText(args.replyToTurnId, "voice_coach_rds_reply_to_turn_id_required")
  const replyText = requiredText(args.replyText, "voice_coach_rds_reply_text_required")
  const session = await lockAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId,
    userId: args.userId,
    dataDomain: args.dataDomain,
    canonicalUserId: args.canonicalUserId,
    companyId: args.companyId,
    storeId: args.storeId,
    membershipId: args.membershipId,
  })
  if (!session) throw new Error(SESSION_NOT_FOUND)

  const existingBeauticianTurn = await findAliyunRdsVoiceCoachAttemptWithClient(
    client,
    sessionId,
    clientAttemptId,
  )
  if (existingBeauticianTurn) {
    const existingFeatures = recordValue(existingBeauticianTurn.features_json)
    if (
      normalizedComparableText(existingBeauticianTurn.text) !== normalizedComparableText(replyText) ||
      existingFeatures.reply_to_turn_id !== replyToTurnId
    ) {
      throw new Error(IDEMPOTENCY_CONFLICT)
    }

    const turns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, sessionId)
    const nextCustomerTurn = turns.find(
      (turn) => turn.role === "customer" && Number(turn.turn_index) === Number(existingBeauticianTurn.turn_index) + 1,
    ) || null
    const beauticianCountAtAttempt = turns.filter(
      (turn) => turn.role === "beautician" && Number(turn.turn_index) <= Number(existingBeauticianTurn.turn_index),
    ).length
    return {
      beauticianTurn: existingBeauticianTurn,
      deduped: true,
      nextCustomerTurn,
      reachedMaxTurns: beauticianCountAtAttempt >= 2,
      session,
      turns,
    }
  }

  if (session.status === "ended") throw new Error(SESSION_ENDED)

  const turnsBeforeSubmit = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, sessionId)
  const latestTurn = turnsBeforeSubmit[turnsBeforeSubmit.length - 1]
  if (!latestTurn || latestTurn.role !== "customer" || latestTurn.id !== replyToTurnId) {
    throw new Error(REPLY_TARGET_STALE)
  }

  await args.persistAudio?.()

  const maxTurnIndex = turnsBeforeSubmit.reduce(
    (currentMax, turn) => Math.max(currentMax, Number(turn.turn_index)),
    -1,
  )
  const reachedMaxTurns = turnsBeforeSubmit.filter((turn) => turn.role === "beautician").length + 1 >= 2
  let beauticianTurn = await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
    analysis: { source: "text_first_rds_contract" },
    features: {
      provider_mode: "text_only_no_audio_provider",
      client_attempt_id: clientAttemptId,
      reply_to_turn_id: replyToTurnId,
    },
    role: "beautician",
    sessionId,
    text: replyText,
    turnIndex: maxTurnIndex + 1,
  })
  const audioPath = optionalText(args.audioPath)
  if (audioPath) {
    beauticianTurn = await updateAliyunRdsVoiceCoachTurnAudioWithClient(client, {
      audioPath,
      audioSeconds: args.audioSeconds,
      expectedRole: "beautician",
      sessionId,
      turnId: beauticianTurn.id,
    })
  }
  const nextText = optionalText(args.nextCustomerText)
  const nextCustomerTurn = !reachedMaxTurns && nextText
    ? await insertAliyunRdsVoiceCoachTextTurnWithClient(client, {
        analysis: { source: "text_first_rds_contract" },
        features: { provider_mode: "text_only_no_audio_provider" },
        role: "customer",
        sessionId,
        text: nextText,
        turnIndex: maxTurnIndex + 2,
      })
    : null
  const turns = nextCustomerTurn
    ? [...turnsBeforeSubmit, beauticianTurn, nextCustomerTurn]
    : [...turnsBeforeSubmit, beauticianTurn]

  return { beauticianTurn, deduped: false, nextCustomerTurn, reachedMaxTurns, session, turns }
}

export async function saveAliyunRdsVoiceCoachTurnAudioWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    audioPath: string
    audioSeconds: number | null
    expectedRole: "customer" | "beautician"
    sessionId: string
    turnId: string
  },
) {
  const sessionId = requiredText(args.sessionId, "voice_coach_rds_session_id_required")
  const turnId = requiredText(args.turnId, "voice_coach_rds_turn_id_required")
  const session = await lockAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId,
    userId: args.userId,
    dataDomain: args.dataDomain,
    canonicalUserId: args.canonicalUserId,
    companyId: args.companyId,
    storeId: args.storeId,
    membershipId: args.membershipId,
  })
  if (!session) return null

  return updateAliyunRdsVoiceCoachTurnAudioWithClient(client, {
    audioPath: args.audioPath,
    audioSeconds: args.audioSeconds,
    expectedRole: args.expectedRole,
    sessionId,
    turnId,
  })
}

async function updateAliyunRdsVoiceCoachTurnAudioWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: {
    audioPath: string
    audioSeconds: number | null
    expectedRole: "customer" | "beautician"
    sessionId: string
    turnId: string
  },
) {
  const result = await client.query<AppVoiceCoachRdsTurnRow>(
    `
      update public.voice_coach_turns
      set audio_path = $3, audio_seconds = $4
      where id = $1 and session_id = $2 and role = $5
      returning *
    `,
    [
      requiredText(args.turnId, "voice_coach_rds_turn_id_required"),
      requiredText(args.sessionId, "voice_coach_rds_session_id_required"),
      requiredText(args.audioPath, "voice_coach_rds_audio_path_required"),
      args.audioSeconds,
      args.expectedRole,
    ],
  )
  return result.rows[0] || null
}

export async function endAliyunRdsVoiceCoachTextSessionWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    buildEndState(args: {
      session: AppVoiceCoachRdsSessionRow
      turns: AppVoiceCoachRdsTurnRow[]
    }): AppVoiceCoachRdsEndState
    sessionId: string
  },
) {
  const sessionId = requiredText(args.sessionId, "voice_coach_rds_session_id_required")
  const scope = normalizedRdsScope(args)
  const session = await lockAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId,
    userId: args.userId,
    dataDomain: args.dataDomain,
    canonicalUserId: args.canonicalUserId,
    companyId: args.companyId,
    storeId: args.storeId,
    membershipId: args.membershipId,
  })
  if (!session) throw new Error("voice_coach_rds_session_end_failed")
  if (session.status === "ended") {
    return { deduped: true, report: session.report_json, session }
  }

  const turns = await listAliyunRdsVoiceCoachTextTurnsWithClient(client, sessionId)
  const endState = args.buildEndState({ session, turns })
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      update public.voice_coach_sessions
      set
        status = 'ended',
        ended_at = now(),
        report_json = $8::jsonb,
        total_score = $9,
        dimension_scores = $10::jsonb
      where id = $1
        and user_id = $2
        and (
          (
            $3 = 'personal_trial'
            and data_domain = 'personal_trial'
            and canonical_user_id = $4
          )
          or (
            $3 = 'store'
            and data_domain = 'store'
            and company_id = $5
            and store_id = $6
            and membership_id = $7
          )
        )
      returning *
    `,
    [
      sessionId,
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      scope.dataDomain,
      scope.canonicalUserId,
      scope.companyId,
      scope.storeId,
      scope.membershipId,
      jsonbParam(endState.report),
      endState.totalScore,
      jsonbParam(endState.dimensionScores),
    ],
  )
  const endedSession = result.rows[0]
  if (!endedSession) throw new Error("voice_coach_rds_session_end_failed")
  return { deduped: false, report: endedSession.report_json, session: endedSession }
}

export async function listAliyunRdsVoiceCoachTextSessionHistoryWithClient(
  client: AppVoiceCoachRdsQueryClient,
  args: AppVoiceCoachRdsScope & {
    limit: number
  },
) {
  const scope = normalizedRdsScope(args)
  const result = await client.query<AppVoiceCoachRdsSessionRow>(
    `
      select *
      from public.voice_coach_sessions
      where user_id = $1
        and (
          (
            $2 = 'personal_trial'
            and data_domain = 'personal_trial'
            and canonical_user_id = $3
          )
          or (
            $2 = 'store'
            and data_domain = 'store'
            and company_id = $4
            and store_id = $5
            and membership_id = $6
          )
        )
      order by created_at desc
      limit $7
    `,
    [
      requiredText(args.userId, "voice_coach_rds_user_id_required"),
      scope.dataDomain,
      scope.canonicalUserId,
      scope.companyId,
      scope.storeId,
      scope.membershipId,
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizedComparableText(value: unknown) {
  return String(value || "").trim()
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

function normalizedRdsScope(args: AppVoiceCoachRdsScope) {
  if (args.dataDomain === "personal_trial") {
    return {
      dataDomain: "personal_trial" as const,
      canonicalUserId: requiredText(
        args.canonicalUserId,
        "voice_coach_rds_canonical_user_id_required",
      ),
      companyId: null,
      storeId: null,
      membershipId: null,
    }
  }
  return {
    dataDomain: "store" as const,
    canonicalUserId: null,
    companyId: requiredText(args.companyId, "voice_coach_rds_company_id_required"),
    storeId: requiredText(args.storeId, "voice_coach_rds_store_id_required"),
    membershipId: requiredText(
      args.membershipId,
      "voice_coach_rds_membership_id_required",
    ),
  }
}
