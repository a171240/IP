import "server-only"

import { createHash } from "node:crypto"

import {
  queryAliyunRds,
  withAliyunRdsTransaction,
} from "@/lib/aliyun-rds/postgres.server"

export type AppAccessQueryClient = {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
}

export type AppAccessAuthUser = {
  id: string
  app_metadata?: unknown
  user_metadata?: unknown
}

export type AppPersonalTrialSnapshot = {
  kind: "personal_trial"
  dataDomain: "personal_trial"
  status: "active" | "exhausted" | "suspended" | "revoked"
  sessionLimit: 2
  aiCoachPublicEnabled: boolean
  sessionsReserved: number
  sessionsUsed: number
  sessionsRemaining: number
}

export type AppAccessSnapshot = {
  canonicalUserId: string
  identityState: "resolved"
  accessMode: "formal" | "personal_trial"
  authorizationVersion: number
  trial: AppPersonalTrialSnapshot
}

export type AppCanonicalAuthorization = {
  canonicalUserId: string
  identityState: "resolved" | "review_required"
  authorizationVersion: number
  trial: AppPersonalTrialSnapshot
}

export type AppAccessGrantResult = {
  authorizationVersion: number
  canonicalUserId: string
  membershipId: string
  deduped: boolean
}

type AppPersonalTrialFirstRoundEvidence = {
  openingTtsAudioId: string
  recordingReceiptId: string
  asrResultId: string
  nextTurnTtsAudioId: string
}

export type AppPersonalTrialVoiceEvidenceStage =
  | "opening_tts_ready"
  | "recording_received"
  | "asr_succeeded"
  | "next_turn_tts_ready"

export type AppPersonalTrialTechnicalFailureReason =
  | "opening_tts_failed"
  | "recording_receive_failed"
  | "asr_failed"
  | "next_turn_tts_failed"

type IdentityDescriptor = {
  provider: string
  providerAppId: string
  subject: string
  unionIssuer: string | null
  unionSubject: string | null
}

type IdentityRow = {
  canonical_user_id: string
  app_user_id: string
  provider: string
  provider_app_id: string
  subject: string
}

type LinkRow = {
  canonical_user_id: string
}

type IdentityReviewRow = {
  status: "pending" | "resolved" | "dismissed"
}

type TrialRow = {
  status: AppPersonalTrialSnapshot["status"]
  session_limit: number
  sessions_reserved: number | string
  sessions_used: number
}

type IdentityConflictDetails = {
  appUserId: string
  candidateCanonicalUserId: string
  existingCanonicalUserId: string
  identityFingerprint: string
}

class AppIdentityConflictError extends Error {
  readonly details: IdentityConflictDetails

  constructor(details: IdentityConflictDetails) {
    super("app_identity_conflict")
    this.name = "AppIdentityConflictError"
    this.details = details
  }
}

type VoiceSessionRow = {
  id: string
  client_request_hash: string | null
  trial_completion_event_hash: string | null
  trial_completion_event_id: string | null
  trial_round_1_evidence: unknown
  trial_release_reason: AppPersonalTrialTechnicalFailureReason | "reservation_expired" | null
  trial_reservation_active?: boolean
  trial_reservation_expires_at: Date | string | null
  trial_reservation_status: "reserved" | "consumed" | "released" | "expired" | null
}

type PersonalTrialVoiceEvidenceRow = {
  evidence_id: string
  evidence_stage: AppPersonalTrialVoiceEvidenceStage
}

type IdempotencyRow = {
  request_hash: string
  response_json: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AUDIO_SHA256_PATTERN = /^[0-9a-f]{64}$/
const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9_.:-]*$/i
const DEFAULT_PERSONAL_TRIAL_RESERVATION_TTL_SECONDS = 600
const PERSONAL_TRIAL_TECHNICAL_FAILURE_REASONS =
  new Set<AppPersonalTrialTechnicalFailureReason>([
    "opening_tts_failed",
    "recording_receive_failed",
    "asr_failed",
    "next_turn_tts_failed",
  ])
const PERSONAL_TRIAL_VOICE_EVIDENCE_STAGES =
  new Set<AppPersonalTrialVoiceEvidenceStage>([
    "opening_tts_ready",
    "recording_received",
    "asr_succeeded",
    "next_turn_tts_ready",
  ])
const ACCESS_GRANT_ROLES = new Set([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
  "staff",
  "employee",
])
const ACCESS_GRANT_PLANS = new Set(["free", "basic", "pro", "vip"])
const COMPANY_SCOPED_ROLES = new Set([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
])
const STORE_SCOPED_ROLES = new Set([
  "store_owner",
  "store_admin",
  "staff",
  "employee",
])
const TENANT_BASE_FEATURES = new Set([
  "home",
  "entitlements",
  "orders",
  "service_record",
  "professional_learning",
  "speech_library",
  "knowledge_context",
  "store_profiles",
  "customer_knowledge_base",
  "content_library",
])
const AI_FEATURES = new Set([
  "voice_coach",
  "content",
  "poster",
  "xiaohongshu",
  "private_copy",
  "content_studio",
])
const MANAGER_FEATURES = new Set([
  "service_record_review",
  "store_admin",
  "member_invite",
])

export function deriveAppAuthIdentity(user: AppAccessAuthUser): IdentityDescriptor {
  const userId = requiredUuid(user.id, "app_user_id_invalid")
  const metadata = recordValue(user.app_metadata)
  const source = optionalText(metadata.auth_source, 80)
  const openId = optionalText(metadata.wechat_app_openid, 200)
  const appId = optionalText(metadata.wechat_open_app_id, 200)

  if (source === "wechat_open_app" && openId && appId) {
    const unionSubject = optionalText(metadata.wechat_unionid, 200)
    const unionIssuer = optionalText(metadata.wechat_union_issuer, 200)
    return {
      provider: "wechat_open_app",
      providerAppId: appId,
      subject: openId,
      unionIssuer: unionSubject && unionIssuer ? unionIssuer : null,
      unionSubject: unionSubject && unionIssuer ? unionSubject : null,
    }
  }

  return {
    provider: "app_auth",
    providerAppId: "supabase",
    subject: userId,
    unionIssuer: null,
    unionSubject: null,
  }
}

export async function ensureAppCanonicalIdentityAndTrial(user: AppAccessAuthUser) {
  try {
    return await withAliyunRdsTransaction((client) =>
      ensureAppCanonicalIdentityAndTrialWithClient(client, user),
    )
  } catch (error) {
    if (!(error instanceof AppIdentityConflictError)) throw error
    await persistAppIdentityReview(error.details)
    throw new Error("app_identity_review_required")
  }
}

export async function ensureAppCanonicalIdentityAndTrialWithClient(
  client: AppAccessQueryClient,
  user: AppAccessAuthUser,
) {
  const userId = requiredUuid(user.id, "app_user_id_invalid")
  const identity = deriveAppAuthIdentity(user)
  const identityLockKey = identity.unionIssuer && identity.unionSubject
    ? `union:${identity.unionIssuer}:${identity.unionSubject}`
    : `identity:${identity.provider}:${identity.providerAppId}:${identity.subject}`
  await acquireTransactionLock(client, identityLockKey)
  await acquireTransactionLock(client, `app-user:${userId}`)

  const byUserResult = await client.query<IdentityRow>(
    "select canonical_user_id, app_user_id, provider, provider_app_id, subject from public.app_auth_identities where app_user_id = $1 limit 1 for update",
    [userId],
  )
  const bySubjectResult = await client.query<IdentityRow>(
    "select canonical_user_id, app_user_id, provider, provider_app_id, subject from public.app_auth_identities where provider = $1 and provider_app_id = $2 and subject = $3 limit 1 for update",
    [identity.provider, identity.providerAppId, identity.subject],
  )
  const unionLinkResult = identity.unionIssuer && identity.unionSubject
    ? await client.query<LinkRow>(
        "select canonical_user_id from public.app_identity_links where link_type = 'wechat_unionid' and issuer = $1 and subject = $2 limit 1 for update",
        [identity.unionIssuer, identity.unionSubject],
      )
    : { rows: [] }

  const canonicalCandidates = new Set(
    [
      byUserResult.rows[0]?.canonical_user_id,
      bySubjectResult.rows[0]?.canonical_user_id,
      unionLinkResult.rows[0]?.canonical_user_id,
    ].filter(Boolean),
  )
  if (canonicalCandidates.size > 1) {
    throw identityConflictError({
      candidates: canonicalCandidates,
      identity,
      userId,
      existingCanonicalUserId: byUserResult.rows[0]?.canonical_user_id,
    })
  }

  let canonicalUserId = Array.from(canonicalCandidates)[0] || null
  if (!canonicalUserId) {
    const created = await client.query<{ id: string }>(
      "insert into public.app_canonical_users (status) values ('active') returning id",
    )
    canonicalUserId = created.rows[0]?.id || null
  }
  if (!canonicalUserId) throw new Error("app_canonical_user_create_failed")

  await client.query(
    `
      insert into public.app_auth_identities (
        canonical_user_id,
        app_user_id,
        provider,
        provider_app_id,
        subject,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
      on conflict (app_user_id) do nothing
    `,
    [
      canonicalUserId,
      userId,
      identity.provider,
      identity.providerAppId,
      identity.subject,
      jsonbParam({
        union_issuer: identity.unionIssuer,
        union_subject_present: Boolean(identity.unionSubject),
      }),
    ],
  )

  const storedIdentity = await client.query<IdentityRow>(
    "select canonical_user_id, app_user_id, provider, provider_app_id, subject from public.app_auth_identities where app_user_id = $1 limit 1",
    [userId],
  )
  const stored = storedIdentity.rows[0]
  if (
    !stored ||
    stored.canonical_user_id !== canonicalUserId ||
    stored.provider !== identity.provider ||
    stored.provider_app_id !== identity.providerAppId ||
    stored.subject !== identity.subject
  ) {
    throw identityConflictError({
      candidates: new Set([
        stored?.canonical_user_id,
        canonicalUserId,
      ].filter(Boolean)),
      identity,
      userId,
      existingCanonicalUserId: stored?.canonical_user_id || canonicalUserId,
    })
  }

  if (identity.unionIssuer && identity.unionSubject) {
    await client.query(
      `
        insert into public.app_identity_links (
          canonical_user_id,
          link_type,
          issuer,
          subject
        )
        values ($1, 'wechat_unionid', $2, $3)
        on conflict (link_type, issuer, subject) do nothing
      `,
      [canonicalUserId, identity.unionIssuer, identity.unionSubject],
    )
    const storedLink = await client.query<LinkRow>(
      "select canonical_user_id from public.app_identity_links where link_type = 'wechat_unionid' and issuer = $1 and subject = $2 limit 1",
      [identity.unionIssuer, identity.unionSubject],
    )
    if (storedLink.rows[0]?.canonical_user_id !== canonicalUserId) {
      throw identityConflictError({
        candidates: new Set([
          canonicalUserId,
          storedLink.rows[0]?.canonical_user_id,
        ].filter(Boolean)),
        identity,
        userId,
        existingCanonicalUserId: canonicalUserId,
      })
    }
  }

  await client.query(
    `
      insert into public.app_personal_trials (
        canonical_user_id,
        trial_kind,
        data_domain,
        session_limit,
        sessions_used,
        status
      )
      values ($1, 'personal_trial', 'personal_trial', 2, 0, 'active')
      on conflict (canonical_user_id) do nothing
    `,
    [canonicalUserId],
  )
  await client.query(
    `
      insert into public.app_authorization_versions (
        canonical_user_id,
        authorization_version
      )
      values ($1, 0)
      on conflict (canonical_user_id) do nothing
    `,
    [canonicalUserId],
  )

  return getAppAccessSnapshotWithClient(client, user)
}

export async function resolveAppCanonicalAuthorization(
  user: AppAccessAuthUser,
): Promise<AppCanonicalAuthorization> {
  return resolveAppCanonicalAuthorizationWithClient(
    {
      query: async <T>(text: string, values?: readonly unknown[]) => {
        const result = await queryAliyunRds(text, values)
        return { rows: result.rows as T[] }
      },
    },
    user,
  )
}

export async function resolveAppCanonicalAuthorizationWithClient(
  client: AppAccessQueryClient,
  user: AppAccessAuthUser,
): Promise<AppCanonicalAuthorization> {
  const userId = requiredUuid(user.id, "app_user_id_invalid")
  const identity = deriveAppAuthIdentity(user)
  const byUserResult = await client.query<IdentityRow>(
    `
      select canonical_user_id, app_user_id, provider, provider_app_id, subject
      from public.app_auth_identities
      where app_user_id = $1
      limit 1
    `,
    [userId],
  )
  const bySubjectResult = await client.query<IdentityRow>(
    `
      select canonical_user_id, app_user_id, provider, provider_app_id, subject
      from public.app_auth_identities
      where provider = $1 and provider_app_id = $2 and subject = $3
      limit 1
    `,
    [identity.provider, identity.providerAppId, identity.subject],
  )
  const unionLinkResult =
    identity.unionIssuer && identity.unionSubject
      ? await client.query<LinkRow>(
          `
            select canonical_user_id
            from public.app_identity_links
            where link_type = 'wechat_unionid' and issuer = $1 and subject = $2
            limit 1
          `,
          [identity.unionIssuer, identity.unionSubject],
        )
      : { rows: [] as LinkRow[] }
  const reviewResult = await client.query<IdentityReviewRow>(
    `
      select status
      from public.app_identity_reviews
      where app_user_id = $1 and status = 'pending'
      limit 1
    `,
    [userId],
  )

  const stored = byUserResult.rows[0]
  if (!stored) throw new Error("app_canonical_identity_not_found")
  const canonicalCandidates = new Set(
    [
      stored.canonical_user_id,
      bySubjectResult.rows[0]?.canonical_user_id,
      unionLinkResult.rows[0]?.canonical_user_id,
    ].filter((value): value is string => Boolean(value)),
  )
  const storedIdentityMatches =
    stored.provider === identity.provider &&
    stored.provider_app_id === identity.providerAppId &&
    stored.subject === identity.subject
  const identityState =
    reviewResult.rows[0]?.status === "pending" ||
    canonicalCandidates.size > 1 ||
    !storedIdentityMatches
      ? "review_required"
      : "resolved"
  const accessResult = await client.query<
    TrialRow & {
      authorization_version: number | string
      canonical_user_id: string
    }
  >(
    `
      select
        canonical.id as canonical_user_id,
        trial.status,
        trial.session_limit,
        trial.sessions_used,
        (
          select count(*)::integer
          from public.voice_coach_sessions session
          where session.canonical_user_id = canonical.id
            and session.data_domain = 'personal_trial'
            and session.trial_reservation_status = 'reserved'
            and session.trial_reservation_expires_at > now()
        ) as sessions_reserved,
        coalesce(version.authorization_version, 0) as authorization_version
      from public.app_canonical_users canonical
      join public.app_personal_trials trial
        on trial.canonical_user_id = canonical.id
      left join public.app_authorization_versions version
        on version.canonical_user_id = canonical.id
      where canonical.id = $1 and canonical.status = 'active'
      limit 1
    `,
    [stored.canonical_user_id],
  )
  const access = accessResult.rows[0]
  if (!access) throw new Error("app_canonical_identity_not_found")

  return {
    canonicalUserId: access.canonical_user_id,
    identityState,
    authorizationVersion: Number(access.authorization_version || 0),
    trial: trialSnapshot(access),
  }
}

export async function getAppAccessSnapshot(user: AppAccessAuthUser) {
  return getAppAccessSnapshotWithClient(
    {
      query: async <T>(text: string, values?: readonly unknown[]) => {
        const result = await queryAliyunRds(text, values)
        return { rows: result.rows as T[] }
      },
    },
    user,
  )
}

export async function getAppAccessSnapshotWithClient(
  client: AppAccessQueryClient,
  user: AppAccessAuthUser,
): Promise<AppAccessSnapshot> {
  const userId = requiredUuid(user.id, "app_user_id_invalid")
  const authorization = await resolveAppCanonicalAuthorizationWithClient(
    client,
    user,
  )
  if (authorization.identityState === "review_required") {
    throw new Error("app_identity_review_required")
  }
  const result = await client.query<{ has_formal_membership: boolean }>(
    `
      select
        exists (
          select 1
          from public.mp_account_memberships membership
          join public.mp_companies company
            on company.id = membership.company_id
           and company.status = 'active'
          left join public.mp_stores store
            on store.id = membership.store_id
           and store.company_id = membership.company_id
           and store.status = 'active'
          join public.app_membership_entitlements entitlement
            on entitlement.membership_id = membership.id
           and entitlement.canonical_user_id = membership.canonical_user_id
           and entitlement.status = 'active'
          where membership.canonical_user_id = $1
            and membership.status = 'active'
            and (
              (
                select profile.company_id
                from public.profiles profile
                where profile.id = $2
                limit 1
              ) is null
              or membership.company_id = (
                select profile.company_id
                from public.profiles profile
                where profile.id = $2
                limit 1
              )
            )
            and (
              (
                select profile.store_id
                from public.profiles profile
                where profile.id = $2
                limit 1
              ) is null
              or membership.store_id = (
                select profile.store_id
                from public.profiles profile
                where profile.id = $2
                limit 1
              )
            )
            and (
              (
                membership.role in (
                  'company_owner',
                  'company_admin',
                  'merchant_owner',
                  'merchant_admin'
                )
                and membership.store_id is null
              )
              or (
                membership.role in (
                  'store_owner',
                  'store_admin',
                  'staff',
                  'employee'
                )
                and membership.store_id is not null
                and store.id is not null
              )
            )
        ) as has_formal_membership
    `,
    [authorization.canonicalUserId, userId],
  )
  const row = result.rows[0]
  if (!row) throw new Error("app_access_snapshot_failed")

  return {
    canonicalUserId: authorization.canonicalUserId,
    identityState: "resolved",
    accessMode: row.has_formal_membership ? "formal" : "personal_trial",
    authorizationVersion: authorization.authorizationVersion,
    trial: authorization.trial,
  }
}

export async function reservePersonalTrialVoiceSession(args: {
  canonicalUserId: string
  clientSessionId: string
  requestPayload: Record<string, unknown>
  userId: string
}) {
  return withAliyunRdsTransaction((client) =>
    reservePersonalTrialVoiceSessionWithClient(client, args),
  )
}

export async function reservePersonalTrialVoiceSessionWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    clientSessionId: string
    requestPayload: Record<string, unknown>
    userId: string
  },
) {
  const canonicalUserId = requiredUuid(args.canonicalUserId, "canonical_user_id_invalid")
  const userId = requiredUuid(args.userId, "app_user_id_invalid")
  const clientSessionId = requiredIdempotencyKey(args.clientSessionId, "client_session_id_invalid")
  const requestHash = sha256(stableJson(args.requestPayload))
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)

  const identity = await client.query<{ present: boolean }>(
    `
      select true as present
      from public.app_auth_identities
      where app_user_id = $1 and canonical_user_id = $2
      limit 1
    `,
    [userId, canonicalUserId],
  )
  if (!identity.rows[0]?.present) throw new Error("app_identity_scope_denied")

  const existing = await client.query<VoiceSessionRow>(
    `
      select
        id,
        client_request_hash,
        trial_reservation_status,
        trial_reservation_expires_at,
        trial_reservation_expires_at > clock_timestamp()
          as trial_reservation_active
      from public.voice_coach_sessions
      where canonical_user_id = $1
        and client_session_id = $2
        and data_domain = 'personal_trial'
      limit 1
      for update
    `,
    [canonicalUserId, clientSessionId],
  )
  if (existing.rows[0]) {
    if (existing.rows[0].client_request_hash !== requestHash) {
      throw new Error("app_idempotency_conflict")
    }
    if (
      existing.rows[0].trial_reservation_status === "released" ||
      existing.rows[0].trial_reservation_status === "expired"
    ) {
      throw new Error("personal_trial_session_terminal")
    }
    if (
      existing.rows[0].trial_reservation_status === "reserved" &&
      !existing.rows[0].trial_reservation_active
    ) {
      throw new Error("personal_trial_reservation_expired")
    }
    return {
      deduped: true,
      sessionId: existing.rows[0].id,
      trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
    }
  }

  const trialResult = await client.query<TrialRow>(
    `
      select
        trial.status,
        trial.session_limit,
        trial.sessions_used,
        (
          select count(*)::integer
          from public.voice_coach_sessions session
          where session.canonical_user_id = trial.canonical_user_id
            and session.data_domain = 'personal_trial'
            and session.trial_reservation_status = 'reserved'
            and session.trial_reservation_expires_at > now()
        ) as sessions_reserved
      from public.app_personal_trials trial
      where trial.canonical_user_id = $1
      limit 1
      for update
    `,
    [canonicalUserId],
  )
  const trial = trialResult.rows[0]
  if (
    !trial ||
    trial.status !== "active" ||
    Number(trial.sessions_used) + Number(trial.sessions_reserved) >=
      Number(trial.session_limit)
  ) {
    throw new Error("personal_trial_exhausted")
  }

  const scenarioId = optionalText(args.requestPayload.scenario_id, 120) || "objection_safety"
  const reservationTtlSeconds = personalTrialReservationTtlSeconds()
  const inserted = await client.query<{ id: string }>(
    `
      insert into public.voice_coach_sessions (
        user_id,
        canonical_user_id,
        data_domain,
        client_session_id,
        client_request_hash,
        trial_reservation_status,
        trial_reserved_at,
        trial_reservation_expires_at,
        company_id,
        store_id,
        membership_id,
        scenario_id,
        status,
        session_context_json,
        scenario_snapshot_json
      )
      values (
        $1,
        $2,
        'personal_trial',
        $3,
        $4,
        'reserved',
        now(),
        now() + make_interval(secs => $8::integer),
        null,
        null,
        null,
        $5,
        'active',
        $6::jsonb,
        $7::jsonb
      )
      returning id
    `,
    [
      userId,
      canonicalUserId,
      clientSessionId,
      requestHash,
      scenarioId,
      jsonbParam({
        data_domain: "personal_trial",
        canonical_user_id: canonicalUserId,
      }),
      jsonbParam(args.requestPayload),
      reservationTtlSeconds,
    ],
  )
  const sessionId = inserted.rows[0]?.id
  if (!sessionId) throw new Error("personal_trial_session_create_failed")

  await client.query(
    `
      insert into public.app_authorization_audit_events (
        canonical_user_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        after_json
      )
      values ($1, $2, 'personal_trial.voice_session_reserved', 'voice_coach_session', $3, $4, $5::jsonb)
    `,
    [
      canonicalUserId,
      userId,
      sessionId,
      clientSessionId,
      jsonbParam({
        reservation_expires_in_seconds: reservationTtlSeconds,
        reservation_status: "reserved",
      }),
    ],
  )

  return {
    deduped: false,
    sessionId,
    trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
  }
}

export async function recordPersonalTrialVoiceEvidence(args: {
  canonicalUserId: string
  evidenceId: string
  evidenceStage: AppPersonalTrialVoiceEvidenceStage
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) =>
    recordPersonalTrialVoiceEvidenceWithClient(client, args),
  )
}

export async function recordPersonalTrialVoiceEvidenceWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    evidenceId: string
    evidenceStage: AppPersonalTrialVoiceEvidenceStage
    sessionId: string
  },
) {
  const canonicalUserId = requiredUuid(
    args.canonicalUserId,
    "canonical_user_id_invalid",
  )
  const sessionId = requiredUuid(args.sessionId, "voice_coach_session_id_invalid")
  const evidenceStage = requiredPersonalTrialVoiceEvidenceStage(
    args.evidenceStage,
  )
  const evidenceId = requiredText(
    args.evidenceId,
    200,
    "personal_trial_voice_evidence_id_invalid",
  )
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)

  const sessionResult = await client.query<VoiceSessionRow>(
    `
      select
        id,
        trial_reservation_status,
        trial_reservation_expires_at
      from public.voice_coach_sessions
      where id = $1
        and canonical_user_id = $2
        and data_domain = 'personal_trial'
      limit 1
      for update
    `,
    [sessionId, canonicalUserId],
  )
  const session = sessionResult.rows[0]
  if (!session) throw new Error("personal_trial_session_not_found")

  const existingEvidence = await client.query<PersonalTrialVoiceEvidenceRow>(
    `
      select evidence_stage, evidence_id
      from public.app_personal_trial_voice_evidence
      where session_id = $1
        and evidence_stage = $2
      limit 1
      for update
    `,
    [sessionId, evidenceStage],
  )
  if (existingEvidence.rows[0]) {
    if (existingEvidence.rows[0].evidence_id !== evidenceId) {
      throw new Error("personal_trial_voice_evidence_conflict")
    }
    return {
      deduped: true,
      evidenceId,
      evidenceStage,
      sessionId,
    }
  }
  if (session.trial_reservation_status !== "reserved") {
    throw new Error("personal_trial_voice_evidence_conflict")
  }

  const insertedEvidence = await client.query<PersonalTrialVoiceEvidenceRow>(
    `
      insert into public.app_personal_trial_voice_evidence (
        session_id,
        evidence_stage,
        evidence_id
      )
      select
        session.id,
        $3,
        $4
      from public.voice_coach_sessions session
      where session.id = $1
        and session.canonical_user_id = $2
        and session.data_domain = 'personal_trial'
        and session.trial_reservation_status = 'reserved'
        and session.trial_reservation_expires_at > clock_timestamp()
      returning evidence_stage, evidence_id
    `,
    [sessionId, canonicalUserId, evidenceStage, evidenceId],
  )
  if (!insertedEvidence.rows[0]) {
    throw new Error("personal_trial_reservation_expired")
  }

  return {
    deduped: false,
    evidenceId,
    evidenceStage,
    sessionId,
  }
}

export async function completePersonalTrialFirstRound(args: {
  canonicalUserId: string
  completionEventId: string
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) =>
    completePersonalTrialFirstRoundWithClient(client, args),
  )
}

export async function completePersonalTrialFirstRoundWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    completionEventId: string
    sessionId: string
  },
) {
  const canonicalUserId = requiredUuid(
    args.canonicalUserId,
    "canonical_user_id_invalid",
  )
  const sessionId = requiredUuid(args.sessionId, "voice_coach_session_id_invalid")
  const completionEventId = requiredIdempotencyKey(
    args.completionEventId,
    "trial_completion_event_id_invalid",
  )
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)
  await acquireTransactionLock(
    client,
    `personal-trial-completion:${completionEventId}`,
  )

  const sessionResult = await client.query<VoiceSessionRow>(
    `
      select
        id,
        client_request_hash,
        trial_reservation_status,
        trial_reservation_expires_at,
        trial_completion_event_id,
        trial_completion_event_hash,
        trial_round_1_evidence
      from public.voice_coach_sessions
      where id = $1
        and canonical_user_id = $2
        and data_domain = 'personal_trial'
      limit 1
      for update
    `,
    [sessionId, canonicalUserId],
  )
  const session = sessionResult.rows[0]
  if (!session) throw new Error("personal_trial_session_not_found")

  if (session.trial_completion_event_id) {
    if (
      session.trial_reservation_status === "consumed" &&
      session.trial_completion_event_id === completionEventId &&
      session.trial_completion_event_hash &&
      session.trial_round_1_evidence
    ) {
      return {
        deduped: true,
        sessionId,
        trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
      }
    }
    throw new Error("personal_trial_completion_conflict")
  }

  const existingEvent = await client.query<{
    id: string
    trial_completion_event_hash: string | null
  }>(
    `
      select id, trial_completion_event_hash
      from public.voice_coach_sessions
      where trial_completion_event_id = $1
      limit 1
      for update
    `,
    [completionEventId],
  )
  if (existingEvent.rows[0]) {
    throw new Error("personal_trial_completion_conflict")
  }
  if (session.trial_reservation_status !== "reserved") {
    throw new Error("personal_trial_completion_conflict")
  }

  const evidenceResult = await client.query<PersonalTrialVoiceEvidenceRow>(
    `
      select evidence_stage, evidence_id
      from public.app_personal_trial_voice_evidence
      where session_id = $1
      order by evidence_stage
    `,
    [sessionId],
  )
  const evidence = requiredPersistedFirstRoundEvidence(evidenceResult.rows)
  const verifiedEvidence = await client.query<{ verified: boolean }>(
    `
      select true as verified
      from public.voice_coach_turns as opening_turn
      join public.voice_coach_turns as recording_turn
        on recording_turn.session_id = opening_turn.session_id
      join public.app_personal_trial_asr_receipts as asr_receipt
        on asr_receipt.session_id = recording_turn.session_id
      join public.voice_coach_turns as next_turn
        on next_turn.session_id = recording_turn.session_id
      where opening_turn.session_id = $1
        and opening_turn.id::text = $3
        and opening_turn.role = 'customer'
        and opening_turn.turn_index = 0
        and nullif(btrim(opening_turn.audio_path), '') is not null
        and recording_turn.id::text = $4
        and recording_turn.role = 'beautician'
        and recording_turn.turn_index = 1
        and nullif(btrim(recording_turn.audio_path), '') is not null
        and asr_receipt.id::text = $5
        and asr_receipt.canonical_user_id = $2
        and asr_receipt.claimed_turn_id = recording_turn.id
        and asr_receipt.claimed_at is not null
        and recording_turn.features_json ->> 'asr_receipt_id' =
          asr_receipt.id::text
        and recording_turn.features_json ->> 'submitted_audio_sha256' =
          asr_receipt.audio_sha256
        and btrim(recording_turn.text) = btrim(asr_receipt.transcript_text)
        and next_turn.id::text = $6
        and next_turn.role = 'customer'
        and next_turn.turn_index = 2
        and nullif(btrim(next_turn.audio_path), '') is not null
      limit 1
    `,
    [
      sessionId,
      canonicalUserId,
      evidence.openingTtsAudioId,
      evidence.recordingReceiptId,
      evidence.asrResultId,
      evidence.nextTurnTtsAudioId,
    ],
  )
  if (!verifiedEvidence.rows[0]) {
    throw new Error("personal_trial_first_round_evidence_invalid")
  }
  const completionEventHash = sha256(stableJson(evidence))

  const consumedSession = await client.query<{ id: string }>(
    `
      update public.voice_coach_sessions
      set
        trial_reservation_status = 'consumed',
        trial_consumed_at = now(),
        trial_completion_event_id = $2,
        trial_completion_event_hash = $3,
        trial_round_1_evidence = $4::jsonb
      where id = $1
        and canonical_user_id = $5
        and data_domain = 'personal_trial'
        and trial_reservation_status = 'reserved'
        and trial_reservation_expires_at > clock_timestamp()
      returning id
    `,
    [
      sessionId,
      completionEventId,
      completionEventHash,
      jsonbParam(firstRoundEvidenceJson(evidence)),
      canonicalUserId,
    ],
  )
  if (!consumedSession.rows[0]) {
    throw new Error("personal_trial_reservation_expired")
  }
  await deletePersonalTrialAsrProcessingLeasesWithClient(client, [sessionId])

  const updatedTrial = await client.query<TrialRow>(
    `
      update public.app_personal_trials
      set
        sessions_used = sessions_used + 1,
        status = case
          when sessions_used + 1 >= session_limit then 'exhausted'
          else 'active'
        end,
        updated_at = now()
      where canonical_user_id = $1
        and status = 'active'
        and sessions_used < session_limit
      returning
        status,
        session_limit,
        sessions_used,
        0::integer as sessions_reserved
    `,
    [canonicalUserId],
  )
  if (!updatedTrial.rows[0]) throw new Error("personal_trial_completion_conflict")

  await client.query(
    `
      insert into public.app_authorization_audit_events (
        canonical_user_id,
        action,
        target_type,
        target_id,
        request_id,
        after_json
      )
      values (
        $1,
        'personal_trial.round_1_completed',
        'voice_coach_session',
        $2,
        $3,
        $4::jsonb
      )
    `,
    [
      canonicalUserId,
      sessionId,
      completionEventId,
      jsonbParam({
        completion_event_hash: completionEventHash,
        evidence: firstRoundEvidenceJson(evidence),
      }),
    ],
  )

  return {
    deduped: false,
    sessionId,
    trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
  }
}

export async function settlePersonalTrialAsrProcessingFailure(args: {
  audioSha256: string
  canonicalUserId: string
  processingOwnerToken: string
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) =>
    settlePersonalTrialAsrProcessingFailureWithClient(client, args),
  )
}

export async function settlePersonalTrialAsrProcessingFailureWithClient(
  client: AppAccessQueryClient,
  args: {
    audioSha256: string
    canonicalUserId: string
    processingOwnerToken: string
    sessionId: string
  },
) {
  const canonicalUserId = requiredUuid(
    args.canonicalUserId,
    "canonical_user_id_invalid",
  )
  const sessionId = requiredUuid(args.sessionId, "voice_coach_session_id_invalid")
  const processingOwnerToken = requiredUuid(
    args.processingOwnerToken,
    "personal_trial_asr_processing_owner_invalid",
  )
  const audioSha256 = requiredText(
    args.audioSha256,
    64,
    "personal_trial_asr_audio_sha256_invalid",
  )
  if (!AUDIO_SHA256_PATTERN.test(audioSha256)) {
    throw new Error("personal_trial_asr_audio_sha256_invalid")
  }
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)
  const session = await client.query<{ id: string }>(
    `
      select id
      from public.voice_coach_sessions
      where id = $1
        and canonical_user_id = $2
        and data_domain = 'personal_trial'
      limit 1
      for update
    `,
    [sessionId, canonicalUserId],
  )
  if (!session.rows[0]) throw new Error("personal_trial_session_not_found")

  const receipt = await client.query<{ id: string }>(
    `
      select id
      from public.app_personal_trial_asr_receipts
      where session_id = $1
        and canonical_user_id = $2
        and audio_sha256 = $3
      limit 1
    `,
    [sessionId, canonicalUserId, audioSha256],
  )
  if (receipt.rows[0]) {
    await client.query(
      `
        delete from public.app_personal_trial_asr_processing_leases
        where session_id = $1
          and canonical_user_id = $2
          and audio_sha256 = $3
          and owner_token = $4
      `,
      [sessionId, canonicalUserId, audioSha256, processingOwnerToken],
    )
    return {
      inProgress: false,
      receiptAvailable: true,
      released: false,
      reservationStatus: null,
      sessionId,
    }
  }

  const lease = await client.query<{
    active: boolean
    owner_token: string
  }>(
    `
      select
        owner_token,
        expires_at > clock_timestamp() as active
      from public.app_personal_trial_asr_processing_leases
      where session_id = $1
        and canonical_user_id = $2
        and audio_sha256 = $3
      limit 1
      for update
    `,
    [sessionId, canonicalUserId, audioSha256],
  )
  const currentLease = lease.rows[0]
  if (!currentLease || currentLease.owner_token !== processingOwnerToken) {
    return {
      inProgress: Boolean(currentLease?.active),
      receiptAvailable: false,
      released: false,
      reservationStatus: null,
      sessionId,
    }
  }

  const deletedLease = await client.query<{ session_id: string }>(
    `
      delete from public.app_personal_trial_asr_processing_leases
      where session_id = $1
        and canonical_user_id = $2
        and audio_sha256 = $3
        and owner_token = $4
      returning session_id
    `,
    [sessionId, canonicalUserId, audioSha256, processingOwnerToken],
  )
  if (!deletedLease.rows[0]) {
    return {
      inProgress: false,
      receiptAvailable: false,
      released: false,
      reservationStatus: null,
      sessionId,
    }
  }
  const released = await releasePersonalTrialVoiceSessionWithClient(client, {
    canonicalUserId,
    reason: "asr_failed",
    sessionId,
  })
  return {
    inProgress: false,
    receiptAvailable: false,
    released: released.released,
    reservationStatus: released.reservationStatus,
    sessionId,
  }
}

export async function releasePersonalTrialVoiceSession(args: {
  canonicalUserId: string
  reason: AppPersonalTrialTechnicalFailureReason
  sessionId: string
}) {
  return withAliyunRdsTransaction((client) =>
    releasePersonalTrialVoiceSessionWithClient(client, args),
  )
}

export async function releasePersonalTrialVoiceSessionWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    reason: AppPersonalTrialTechnicalFailureReason
    sessionId: string
  },
) {
  const canonicalUserId = requiredUuid(
    args.canonicalUserId,
    "canonical_user_id_invalid",
  )
  const sessionId = requiredUuid(args.sessionId, "voice_coach_session_id_invalid")
  const reason = requiredTechnicalFailureReason(args.reason)
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)

  const sessionResult = await client.query<VoiceSessionRow>(
    `
      select
        id,
        client_request_hash,
        trial_reservation_status,
        trial_reservation_expires_at,
        trial_completion_event_id,
        trial_completion_event_hash,
        trial_release_reason
      from public.voice_coach_sessions
      where id = $1
        and canonical_user_id = $2
        and data_domain = 'personal_trial'
      limit 1
      for update
    `,
    [sessionId, canonicalUserId],
  )
  const session = sessionResult.rows[0]
  if (!session) throw new Error("personal_trial_session_not_found")
  if (session.trial_reservation_status === "consumed") {
    await deletePersonalTrialAsrProcessingLeasesWithClient(client, [sessionId])
    await client.query(
      `
        insert into public.app_authorization_audit_events (
          canonical_user_id,
          action,
          target_type,
          target_id,
          metadata
        )
        values (
          $1,
          'personal_trial.post_consumption_failure_recorded',
          'voice_coach_session',
          $2,
          $3::jsonb
        )
      `,
      [canonicalUserId, sessionId, jsonbParam({ reason })],
    )
    return {
      deduped: false,
      released: false,
      reservationStatus: "consumed" as const,
      sessionId,
      trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
    }
  }
  if (session.trial_reservation_status === "released") {
    await deletePersonalTrialAsrProcessingLeasesWithClient(client, [sessionId])
    if (session.trial_release_reason !== reason) {
      throw new Error("personal_trial_release_conflict")
    }
    return {
      deduped: true,
      released: true,
      reservationStatus: "released" as const,
      sessionId,
      trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
    }
  }
  if (session.trial_reservation_status === "expired") {
    await deletePersonalTrialAsrProcessingLeasesWithClient(client, [sessionId])
    return {
      deduped: true,
      released: false,
      reservationStatus: "expired" as const,
      sessionId,
      trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
    }
  }
  if (session.trial_reservation_status !== "reserved") {
    throw new Error("personal_trial_release_conflict")
  }

  const releasedSession = await client.query<{
    id: string
    trial_reservation_status: "released" | "expired"
  }>(
    `
      with release_clock as (
        select clock_timestamp() as observed_at
      )
      update public.voice_coach_sessions as session
      set
        trial_reservation_status = case
          when session.trial_reservation_expires_at > release_clock.observed_at
            then 'released'
          else 'expired'
        end,
        trial_released_at = release_clock.observed_at,
        trial_release_reason = case
          when session.trial_reservation_expires_at > release_clock.observed_at
            then $2
          else 'reservation_expired'
        end
      from release_clock
      where session.id = $1
        and session.trial_reservation_status = 'reserved'
      returning session.id, session.trial_reservation_status
    `,
    [sessionId, reason],
  )
  if (!releasedSession.rows[0]) throw new Error("personal_trial_release_conflict")
  await deletePersonalTrialAsrProcessingLeasesWithClient(client, [sessionId])
  const reservationStatus =
    releasedSession.rows[0].trial_reservation_status
  const expired = reservationStatus === "expired"

  await client.query(
    `
      insert into public.app_authorization_audit_events (
        canonical_user_id,
        action,
        target_type,
        target_id,
        metadata
      )
      values (
        $1,
        $2,
        'voice_coach_session',
        $3,
        $4::jsonb
      )
    `,
    [
      canonicalUserId,
      expired
        ? "personal_trial.voice_session_expired"
        : "personal_trial.voice_session_released",
      sessionId,
      jsonbParam(
        expired
          ? {
              late_technical_failure_reason: reason,
              reason: "reservation_expired",
            }
          : { reason },
      ),
    ],
  )

  return {
    deduped: false,
    released: !expired,
    reservationStatus,
    sessionId,
    trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
  }
}

export async function expirePersonalTrialVoiceReservations(args: {
  canonicalUserId: string
}) {
  return withAliyunRdsTransaction((client) =>
    expirePersonalTrialVoiceReservationsWithClient(client, args),
  )
}

export async function expirePersonalTrialVoiceReservationsWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
  },
) {
  const canonicalUserId = requiredUuid(
    args.canonicalUserId,
    "canonical_user_id_invalid",
  )
  await acquireTransactionLock(client, `personal-trial:${canonicalUserId}`)

  const expiredSessions = await client.query<{ id: string }>(
    `
      update public.voice_coach_sessions
      set
        trial_reservation_status = 'expired',
        trial_released_at = now(),
        trial_release_reason = 'reservation_expired'
      where canonical_user_id = $1
        and data_domain = 'personal_trial'
        and trial_reservation_status = 'reserved'
        and trial_reservation_expires_at <= now()
      returning id
    `,
    [canonicalUserId],
  )
  await deletePersonalTrialAsrProcessingLeasesWithClient(
    client,
    expiredSessions.rows.map((session) => session.id),
  )
  for (const session of expiredSessions.rows) {
    await client.query(
      `
        insert into public.app_authorization_audit_events (
          canonical_user_id,
          action,
          target_type,
          target_id,
          metadata
        )
        values (
          $1,
          'personal_trial.voice_session_expired',
          'voice_coach_session',
          $2,
          $3::jsonb
        )
      `,
      [
        canonicalUserId,
        session.id,
        jsonbParam({ reason: "reservation_expired" }),
      ],
    )
  }

  return {
    expiredCount: expiredSessions.rows.length,
    sessionIds: expiredSessions.rows.map((session) => session.id),
    trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
  }
}

export async function expireAllPersonalTrialVoiceReservations(args: {
  limit?: number
} = {}) {
  const limit = Math.max(1, Math.min(500, Math.round(Number(args.limit || 100))))
  return withAliyunRdsTransaction(async (client) => {
    const expiredSessions = await client.query<{
      canonical_user_id: string
      id: string
    }>(
      `
        with candidates as (
          select id
          from public.voice_coach_sessions
          where data_domain = 'personal_trial'
            and trial_reservation_status = 'reserved'
            and trial_reservation_expires_at <= clock_timestamp()
          order by trial_reservation_expires_at asc, id asc
          limit $1
          for update skip locked
        ),
        expired_sessions as (
          update public.voice_coach_sessions as session
          set
            trial_reservation_status = 'expired',
            trial_released_at = clock_timestamp(),
            trial_release_reason = 'reservation_expired'
          from candidates
          where session.id = candidates.id
          returning session.id, session.canonical_user_id
        ),
        audit_events as (
          insert into public.app_authorization_audit_events (
            canonical_user_id,
            action,
            target_type,
            target_id,
            metadata
          )
          select
            canonical_user_id,
            'personal_trial.voice_session_expired',
            'voice_coach_session',
            id,
            jsonb_build_object('reason', 'reservation_expired')
          from expired_sessions
          returning target_id
        )
        select expired_sessions.id, expired_sessions.canonical_user_id
        from expired_sessions
        join audit_events on audit_events.target_id = expired_sessions.id::text
        order by expired_sessions.id
      `,
      [limit],
    )
    await deletePersonalTrialAsrProcessingLeasesWithClient(
      client,
      expiredSessions.rows.map((session) => session.id),
    )
    return {
      expiredCount: expiredSessions.rows.length,
      sessionIds: expiredSessions.rows.map((session) => session.id),
    }
  })
}

export async function grantAppAccess(args: {
  canonicalUserId: string
  companyId: string
  featureKeys: string[]
  idempotencyKey: string
  operatorUserId: string
  operatorRole: string
  plan: string
  reason: string
  role: string
  storeId?: string | null
}) {
  try {
    return await withAliyunRdsTransaction((client) =>
      grantAppAccessWithClient(client, args),
    )
  } catch (error) {
    await recordRejectedAccessGrant(args, error)
    throw error
  }
}

export async function grantAppAccessWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    companyId: string
    featureKeys: string[]
    idempotencyKey: string
    operatorUserId: string
    operatorRole: string
    plan: string
    reason: string
    role: string
    storeId?: string | null
  },
): Promise<AppAccessGrantResult> {
  const canonicalUserId = requiredUuid(args.canonicalUserId, "canonical_user_id_invalid")
  const companyId = requiredUuid(args.companyId, "company_id_invalid")
  const storeId = args.storeId ? requiredUuid(args.storeId, "store_id_invalid") : null
  const operatorUserId = requiredUuid(args.operatorUserId, "operator_user_id_invalid")
  const idempotencyKey = requiredIdempotencyKey(args.idempotencyKey, "idempotency_key_invalid")
  const operatorRole = String(args.operatorRole || "").trim()
  if (operatorRole !== "platform_admin") {
    throw new Error("access_grant_operator_role_denied")
  }
  const reason = requiredText(args.reason, 500, "access_grant_reason_invalid")
  const role = String(args.role || "").trim()
  const plan = String(args.plan || "").trim()
  if (!ACCESS_GRANT_ROLES.has(role)) throw new Error("access_grant_role_invalid")
  if (!ACCESS_GRANT_PLANS.has(plan)) throw new Error("access_grant_plan_invalid")
  if (STORE_SCOPED_ROLES.has(role) && !storeId) {
    throw new Error("access_grant_store_required")
  }
  if (COMPANY_SCOPED_ROLES.has(role) && storeId) {
    throw new Error("access_grant_company_scope_required")
  }
  const featureKeys = Array.from(
    new Set((args.featureKeys || []).map((item) => String(item || "").trim()).filter(Boolean)),
  ).sort()
  if (featureKeys.some((key) => key.length > 80 || !SAFE_KEY_PATTERN.test(key))) {
    throw new Error("access_grant_feature_key_invalid")
  }
  if (featureKeys.some((key) => !featureAllowedForRole(key, role))) {
    throw new Error("access_grant_feature_role_denied")
  }
  if (featureKeys.some((key) => !featureAllowedForPlan(key, plan))) {
    throw new Error("access_grant_feature_plan_denied")
  }

  const requestHash = sha256(
    stableJson({
      canonicalUserId,
      companyId,
      featureKeys,
      operatorRole,
      plan,
      reason,
      role,
      storeId,
    }),
  )
  await acquireTransactionLock(client, `access-grant:${operatorUserId}:${idempotencyKey}`)
  const existingIdempotency = await client.query<IdempotencyRow>(
    `
      select request_hash, response_json
      from public.app_idempotency_records
      where operation_scope = 'access_grant'
        and actor_key = $1
        and idempotency_key = $2
      limit 1
      for update
    `,
    [operatorUserId, idempotencyKey],
  )
  if (existingIdempotency.rows[0]) {
    if (existingIdempotency.rows[0].request_hash !== requestHash) {
      throw new Error("app_idempotency_conflict")
    }
    const storedResponse = recordValue(existingIdempotency.rows[0].response_json)
    return {
      authorizationVersion: Number(storedResponse.authorizationVersion),
      canonicalUserId: requiredUuid(
        storedResponse.canonicalUserId,
        "stored_access_grant_canonical_user_id_invalid",
      ),
      membershipId: requiredUuid(
        storedResponse.membershipId,
        "stored_access_grant_membership_id_invalid",
      ),
      deduped: true,
    }
  }

  const target = await client.query<{ app_user_id: string }>(
    `
      select identity.app_user_id
      from public.app_canonical_users canonical
      join public.app_auth_identities identity
        on identity.canonical_user_id = canonical.id
      where canonical.id = $1 and canonical.status = 'active'
      order by identity.created_at asc, identity.id asc
      for update of canonical
    `,
    [canonicalUserId],
  )
  const targetUserIds = Array.from(
    new Set(target.rows.map((row) => row.app_user_id).filter(Boolean)),
  )
  const targetUserId = targetUserIds[0]
  if (!targetUserId) throw new Error("canonical_user_not_found")

  const company = await client.query<{ id: string }>(
    "select id from public.mp_companies where id = $1 and status = 'active' limit 1",
    [companyId],
  )
  if (!company.rows[0]) throw new Error("company_not_found")
  if (storeId) {
    const store = await client.query<{ id: string }>(
      "select id from public.mp_stores where id = $1 and company_id = $2 and status = 'active' limit 1",
      [storeId, companyId],
    )
    if (!store.rows[0]) throw new Error("store_not_found")
  }

  const versionResult = await client.query<{ authorization_version: number | string }>(
    `
      insert into public.app_authorization_versions (
        canonical_user_id,
        authorization_version,
        updated_at
      )
      values ($1, 1, now())
      on conflict (canonical_user_id) do update
      set
        authorization_version = public.app_authorization_versions.authorization_version + 1,
        updated_at = now()
      returning authorization_version
    `,
    [canonicalUserId],
  )
  const authorizationVersion = Number(versionResult.rows[0]?.authorization_version || 0)

  const existingMembership = await client.query<{
    access_source: string | null
    authorization_version: number | string
    canonical_user_id: string | null
    id: string
    role: string
    status: string
    user_id: string
  }>(
    `
      select
        id,
        user_id,
        canonical_user_id,
        role,
        status,
        access_source,
        authorization_version
      from public.mp_account_memberships
      where (
          canonical_user_id = $1
          or user_id = any($4::uuid[])
        )
        and company_id = $2
        and store_id is not distinct from $3::uuid
      order by canonical_user_id nulls last, id
      for update
    `,
    [canonicalUserId, companyId, storeId, targetUserIds],
  )
  if (existingMembership.rows.length > 1) {
    throw new Error("membership_conflict")
  }
  const existingMembershipRow = existingMembership.rows[0] || null
  if (
    existingMembershipRow?.canonical_user_id &&
    existingMembershipRow.canonical_user_id !== canonicalUserId
  ) {
    throw new Error("membership_conflict")
  }
  let membershipId = existingMembershipRow?.id || null
  const membershipUserId =
    existingMembershipRow && targetUserIds.includes(existingMembershipRow.user_id)
      ? existingMembershipRow.user_id
      : targetUserId
  const existingEntitlement = membershipId
    ? await client.query<{
        authorization_version: number | string
        feature_keys: string[]
        plan: string
        status: string
      }>(
        `
          select plan, status, feature_keys, authorization_version
          from public.app_membership_entitlements
          where membership_id = $1
          limit 1
          for update
        `,
        [membershipId],
      )
    : { rows: [] }
  const beforeState = {
    entitlement: existingEntitlement.rows[0] || null,
    membership: existingMembership.rows[0] || null,
  }
  if (membershipId) {
    await client.query(
      `
        update public.mp_account_memberships
        set
          canonical_user_id = $2,
          user_id = $3,
          role = $4,
          status = 'active',
          access_source = 'admin_access_grant',
          authorization_version = $5,
          accepted_at = coalesce(accepted_at, now()),
          updated_at = now()
        where id = $1
      `,
      [
        membershipId,
        canonicalUserId,
        membershipUserId,
        role,
        authorizationVersion,
      ],
    )
  } else {
    const membership = await client.query<{ id: string }>(
      `
        insert into public.mp_account_memberships (
          user_id,
          canonical_user_id,
          company_id,
          store_id,
          role,
          status,
          access_source,
          authorization_version,
          accepted_at,
          metadata
        )
        values ($1, $2, $3, $4, $5, 'active', 'admin_access_grant', $6, now(), $7::jsonb)
        returning id
      `,
      [
        targetUserId,
        canonicalUserId,
        companyId,
        storeId,
        role,
        authorizationVersion,
        jsonbParam({ granted_by_user_id: operatorUserId }),
      ],
    )
    membershipId = membership.rows[0]?.id || null
  }
  if (!membershipId) throw new Error("access_grant_membership_failed")

  await client.query(
    `
      insert into public.app_membership_entitlements (
        membership_id,
        canonical_user_id,
        plan,
        status,
        feature_keys,
        authorization_version,
        granted_by_user_id,
        grant_source,
        updated_at
      )
      values ($1, $2, $3, 'active', $4::text[], $5, $6, 'admin_access_grant', now())
      on conflict (membership_id) do update
      set
        canonical_user_id = excluded.canonical_user_id,
        plan = excluded.plan,
        status = 'active',
        feature_keys = excluded.feature_keys,
        authorization_version = excluded.authorization_version,
        granted_by_user_id = excluded.granted_by_user_id,
        grant_source = excluded.grant_source,
        updated_at = now()
    `,
    [
      membershipId,
      canonicalUserId,
      plan,
      featureKeys,
      authorizationVersion,
      operatorUserId,
    ],
  )

  const response = {
    authorizationVersion,
    canonicalUserId,
    membershipId,
  }
  await client.query(
    `
      insert into public.app_authorization_audit_events (
        canonical_user_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        before_json,
        after_json,
        metadata
      )
      values (
        $1,
        $2,
        'access_grant.upserted',
        'membership',
        $3,
        $4,
        $5::jsonb,
        $6::jsonb,
        $7::jsonb
      )
    `,
    [
      canonicalUserId,
      operatorUserId,
      membershipId,
      idempotencyKey,
      jsonbParam(beforeState),
      jsonbParam({
        ...response,
        entitlement: {
          feature_keys: featureKeys,
          plan,
          status: "active",
        },
        membership: {
          company_id: companyId,
          role,
          status: "active",
          store_id: storeId,
        },
      }),
      jsonbParam({
        operator_role: operatorRole,
        reason,
        request_hash: requestHash,
      }),
    ],
  )
  await client.query(
    `
      insert into public.app_idempotency_records (
        operation_scope,
        actor_key,
        idempotency_key,
        request_hash,
        response_json
      )
      values ('access_grant', $1, $2, $3, $4::jsonb)
    `,
    [operatorUserId, idempotencyKey, requestHash, jsonbParam(response)],
  )

  return { ...response, deduped: false }
}

function identityConflictError(args: {
  candidates: Set<string>
  existingCanonicalUserId?: string
  identity: IdentityDescriptor
  userId: string
}) {
  const candidates = Array.from(args.candidates)
  const existingCanonicalUserId =
    args.existingCanonicalUserId || candidates[0]
  const candidateCanonicalUserId =
    candidates.find((candidate) => candidate !== existingCanonicalUserId) ||
    candidates[0]
  if (!existingCanonicalUserId || !candidateCanonicalUserId) {
    throw new Error("app_identity_conflict_details_missing")
  }
  return new AppIdentityConflictError({
    appUserId: args.userId,
    candidateCanonicalUserId,
    existingCanonicalUserId,
    identityFingerprint: sha256(stableJson({
      provider: args.identity.provider,
      providerAppId: args.identity.providerAppId,
      subjectHash: sha256(args.identity.subject),
      unionIssuer: args.identity.unionIssuer,
      unionSubjectHash: args.identity.unionSubject
        ? sha256(args.identity.unionSubject)
        : null,
    })),
  })
}

async function persistAppIdentityReview(details: IdentityConflictDetails) {
  await withAliyunRdsTransaction(async (client) => {
    await acquireTransactionLock(client, `identity-review:${details.appUserId}`)
    await client.query(
      `
        insert into public.app_identity_reviews (
          app_user_id,
          existing_canonical_user_id,
          candidate_canonical_user_id,
          reason,
          status,
          trusted_identity_fingerprint,
          updated_at
        )
        values ($1, $2, $3, 'trusted_identity_conflict', 'pending', $4, now())
        on conflict (app_user_id) do update
        set
          existing_canonical_user_id = excluded.existing_canonical_user_id,
          candidate_canonical_user_id = excluded.candidate_canonical_user_id,
          reason = excluded.reason,
          status = 'pending',
          trusted_identity_fingerprint = excluded.trusted_identity_fingerprint,
          resolution_metadata = '{}'::jsonb,
          resolved_at = null,
          updated_at = now()
      `,
      [
        details.appUserId,
        details.existingCanonicalUserId,
        details.candidateCanonicalUserId,
        details.identityFingerprint,
      ],
    )
    await client.query(
      `
        insert into public.app_authorization_audit_events (
          canonical_user_id,
          actor_user_id,
          action,
          target_type,
          target_id,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'identity.review_required',
          'app_auth_identity',
          $2::uuid::text,
          $3::jsonb
        )
      `,
      [
        details.existingCanonicalUserId,
        details.appUserId,
        jsonbParam({
          candidate_canonical_user_id: details.candidateCanonicalUserId,
          reason: "trusted_identity_conflict",
          trusted_identity_fingerprint: details.identityFingerprint,
        }),
      ],
    )
  })
}

async function getPersonalTrialSnapshotWithClient(
  client: AppAccessQueryClient,
  canonicalUserId: string,
) {
  const result = await client.query<TrialRow>(
    `
      select
        trial.status,
        trial.session_limit,
        trial.sessions_used,
        (
          select count(*)::integer
          from public.voice_coach_sessions session
          where session.canonical_user_id = trial.canonical_user_id
            and session.data_domain = 'personal_trial'
            and session.trial_reservation_status = 'reserved'
            and session.trial_reservation_expires_at > now()
        ) as sessions_reserved
      from public.app_personal_trials trial
      where trial.canonical_user_id = $1
      limit 1
    `,
    [canonicalUserId],
  )
  if (!result.rows[0]) throw new Error("personal_trial_not_found")
  return trialSnapshot(result.rows[0])
}

function trialSnapshot(row: TrialRow): AppPersonalTrialSnapshot {
  const sessionLimit = Number(row.session_limit)
  const sessionsReserved = Number(row.sessions_reserved)
  const sessionsUsed = Number(row.sessions_used)
  if (
    sessionLimit !== 2 ||
    !Number.isInteger(sessionsReserved) ||
    sessionsReserved < 0 ||
    !Number.isInteger(sessionsUsed) ||
    sessionsUsed < 0 ||
    sessionsUsed + sessionsReserved > sessionLimit
  ) {
    throw new Error("personal_trial_limit_invalid")
  }
  return {
    kind: "personal_trial",
    dataDomain: "personal_trial",
    status: row.status,
    sessionLimit: 2,
    aiCoachPublicEnabled: personalTrialAiCoachPublicEnabled(),
    sessionsReserved,
    sessionsUsed,
    sessionsRemaining: Math.max(
      0,
      sessionLimit - sessionsUsed - sessionsReserved,
    ),
  }
}

export function personalTrialReservationTtlSeconds() {
  const configured = String(
    process.env.PERSONAL_TRIAL_VOICE_RESERVATION_TTL_SECONDS || "",
  ).trim()
  if (!configured) return DEFAULT_PERSONAL_TRIAL_RESERVATION_TTL_SECONDS
  const seconds = Number(configured)
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) {
    throw new Error("personal_trial_reservation_ttl_invalid")
  }
  return seconds
}

export function personalTrialAiCoachPublicEnabled() {
  const configured = String(
    process.env.PERSONAL_TRIAL_AI_COACH_PUBLIC_ENABLED || "",
  ).trim().toLowerCase()
  const publicEnabled = configured === "1" || configured === "true"
  return publicEnabled && personalTrialVoiceEventsReady()
}

export function personalTrialVoiceEventsReady() {
  const configured = String(
    process.env.PERSONAL_TRIAL_VOICE_EVENTS_READY || "",
  ).trim().toLowerCase()
  return configured === "1" || configured === "true"
}

function requiredPersistedFirstRoundEvidence(
  rows: PersonalTrialVoiceEvidenceRow[],
): AppPersonalTrialFirstRoundEvidence {
  const evidenceByStage = new Map(
    rows.map((row) => [row.evidence_stage, row.evidence_id]),
  )
  if (
    rows.length !== PERSONAL_TRIAL_VOICE_EVIDENCE_STAGES.size ||
    evidenceByStage.size !== PERSONAL_TRIAL_VOICE_EVIDENCE_STAGES.size
  ) {
    throw new Error("personal_trial_first_round_evidence_incomplete")
  }
  return {
    openingTtsAudioId: requiredText(
      evidenceByStage.get("opening_tts_ready"),
      200,
      "personal_trial_first_round_evidence_incomplete",
    ),
    recordingReceiptId: requiredText(
      evidenceByStage.get("recording_received"),
      200,
      "personal_trial_first_round_evidence_incomplete",
    ),
    asrResultId: requiredText(
      evidenceByStage.get("asr_succeeded"),
      200,
      "personal_trial_first_round_evidence_incomplete",
    ),
    nextTurnTtsAudioId: requiredText(
      evidenceByStage.get("next_turn_tts_ready"),
      200,
      "personal_trial_first_round_evidence_incomplete",
    ),
  }
}

function requiredPersonalTrialVoiceEvidenceStage(
  value: unknown,
): AppPersonalTrialVoiceEvidenceStage {
  const evidenceStage = String(value || "") as AppPersonalTrialVoiceEvidenceStage
  if (!PERSONAL_TRIAL_VOICE_EVIDENCE_STAGES.has(evidenceStage)) {
    throw new Error("personal_trial_voice_evidence_stage_invalid")
  }
  return evidenceStage
}

function firstRoundEvidenceJson(evidence: AppPersonalTrialFirstRoundEvidence) {
  return {
    opening_tts_audio_id: evidence.openingTtsAudioId,
    recording_receipt_id: evidence.recordingReceiptId,
    asr_result_id: evidence.asrResultId,
    next_turn_tts_audio_id: evidence.nextTurnTtsAudioId,
  }
}

function requiredTechnicalFailureReason(
  value: unknown,
): AppPersonalTrialTechnicalFailureReason {
  const reason = String(value || "") as AppPersonalTrialTechnicalFailureReason
  if (!PERSONAL_TRIAL_TECHNICAL_FAILURE_REASONS.has(reason)) {
    throw new Error("personal_trial_release_reason_invalid")
  }
  return reason
}

function requiredIdempotencyKey(value: unknown, errorCode: string) {
  if (typeof value !== "string") throw new Error(errorCode)
  const key = value.trim()
  if (
    key.length < 8 ||
    key.length > 120 ||
    !SAFE_KEY_PATTERN.test(key)
  ) {
    throw new Error(errorCode)
  }
  return key
}

function requiredText(value: unknown, maxLength: number, errorCode: string) {
  if (typeof value !== "string") throw new Error(errorCode)
  const text = value.trim()
  if (!text || text.length > maxLength) throw new Error(errorCode)
  return text
}

function featureAllowedForRole(featureKey: string, role: string) {
  if (TENANT_BASE_FEATURES.has(featureKey) || AI_FEATURES.has(featureKey)) {
    return ACCESS_GRANT_ROLES.has(role)
  }
  if (MANAGER_FEATURES.has(featureKey)) {
    return role === "store_owner" ||
      role === "store_admin" ||
      COMPANY_SCOPED_ROLES.has(role)
  }
  if (featureKey === "company_admin") return COMPANY_SCOPED_ROLES.has(role)
  return false
}

function featureAllowedForPlan(featureKey: string, plan: string) {
  if (plan === "pro" || plan === "vip") return true
  if (plan === "basic") {
    return TENANT_BASE_FEATURES.has(featureKey) || featureKey === "voice_coach"
  }
  return plan === "free" && TENANT_BASE_FEATURES.has(featureKey)
}

async function recordRejectedAccessGrant(
  args: {
    canonicalUserId: string
    featureKeys: string[]
    idempotencyKey: string
    operatorRole: string
    operatorUserId: string
    plan: string
    reason: string
    role: string
  },
  error: unknown,
) {
  const errorCode = error instanceof Error ? error.message : ""
  if (
    ![
      "access_grant_feature_plan_denied",
      "access_grant_feature_role_denied",
      "access_grant_operator_role_denied",
      "app_idempotency_conflict",
      "membership_conflict",
    ].includes(errorCode)
  ) {
    return
  }
  const canonicalUserId = String(args.canonicalUserId || "").trim()
  const operatorUserId = String(args.operatorUserId || "").trim()
  if (!UUID_PATTERN.test(canonicalUserId) || !UUID_PATTERN.test(operatorUserId)) {
    return
  }
  const requestHash = sha256(stableJson({
    canonicalUserId,
    featureKeys: Array.isArray(args.featureKeys)
      ? args.featureKeys.map((value) => String(value || "").trim()).sort()
      : [],
    operatorRole: String(args.operatorRole || "").trim(),
    plan: String(args.plan || "").trim(),
    reason: String(args.reason || "").trim().slice(0, 500),
    role: String(args.role || "").trim(),
  }))
  await withAliyunRdsTransaction(async (client) => {
    await client.query(
      `
        insert into public.app_authorization_audit_events (
          canonical_user_id,
          actor_user_id,
          action,
          target_type,
          target_id,
          request_id,
          metadata
        )
        values (
          (
            select id
            from public.app_canonical_users
            where id = $1
            limit 1
          ),
          $2,
          'access_grant.rejected',
          'canonical_user',
          $1::text,
          $3,
          $4::jsonb
        )
      `,
      [
        canonicalUserId,
        operatorUserId,
        String(args.idempotencyKey || "").trim().slice(0, 120) || null,
        jsonbParam({
          code: errorCode,
          operator_role: String(args.operatorRole || "").trim(),
          reason: String(args.reason || "").trim().slice(0, 500),
          request_hash: requestHash,
        }),
      ],
    )
  })
}

function requiredUuid(value: unknown, errorCode: string) {
  const text = String(value || "").trim()
  if (!UUID_PATTERN.test(text)) throw new Error(errorCode)
  return text
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function acquireTransactionLock(client: AppAccessQueryClient, value: string) {
  await client.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [value],
  )
}

async function deletePersonalTrialAsrProcessingLeasesWithClient(
  client: AppAccessQueryClient,
  sessionIds: string[],
) {
  if (!sessionIds.length) return
  await client.query(
    `
      delete from public.app_personal_trial_asr_processing_leases
      where session_id = any($1::uuid[])
    `,
    [sessionIds],
  )
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? null)
}
