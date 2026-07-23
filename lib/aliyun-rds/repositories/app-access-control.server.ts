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
}

type IdempotencyRow = {
  request_hash: string
  response_json: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9_.:-]*$/i
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

export async function consumePersonalTrialVoiceSession(args: {
  canonicalUserId: string
  clientSessionId: string
  requestPayload: Record<string, unknown>
  userId: string
}) {
  return withAliyunRdsTransaction((client) =>
    consumePersonalTrialVoiceSessionWithClient(client, args),
  )
}

export async function consumePersonalTrialVoiceSessionWithClient(
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
  await acquireTransactionLock(
    client,
    `personal-trial:${canonicalUserId}:${clientSessionId}`,
  )

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
      select id, client_request_hash
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
    return {
      deduped: true,
      sessionId: existing.rows[0].id,
      trial: await getPersonalTrialSnapshotWithClient(client, canonicalUserId),
    }
  }

  const trialResult = await client.query<TrialRow>(
    `
      select status, session_limit, sessions_used
      from public.app_personal_trials
      where canonical_user_id = $1
      limit 1
      for update
    `,
    [canonicalUserId],
  )
  const trial = trialResult.rows[0]
  if (!trial || trial.status !== "active" || trial.sessions_used >= trial.session_limit) {
    throw new Error("personal_trial_exhausted")
  }

  const scenarioId = optionalText(args.requestPayload.scenario_id, 120) || "objection_safety"
  const inserted = await client.query<{ id: string }>(
    `
      insert into public.voice_coach_sessions (
        user_id,
        canonical_user_id,
        data_domain,
        client_session_id,
        client_request_hash,
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
    ],
  )
  const sessionId = inserted.rows[0]?.id
  if (!sessionId) throw new Error("personal_trial_session_create_failed")

  const updatedTrial = await client.query<TrialRow>(
    `
      update public.app_personal_trials
      set
        sessions_used = sessions_used + 1,
        status = case when sessions_used + 1 >= session_limit then 'exhausted' else 'active' end,
        updated_at = now()
      where canonical_user_id = $1
      returning status, session_limit, sessions_used
    `,
    [canonicalUserId],
  )
  const afterTrial = updatedTrial.rows[0]
  if (!afterTrial) throw new Error("personal_trial_update_failed")

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
      values ($1, $2, 'personal_trial.voice_session_consumed', 'voice_coach_session', $3, $4, $5::jsonb)
    `,
    [
      canonicalUserId,
      userId,
      sessionId,
      clientSessionId,
      jsonbParam({ trial: trialSnapshot(afterTrial) }),
    ],
  )

  return {
    deduped: false,
    sessionId,
    trial: trialSnapshot(afterTrial),
  }
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
      limit 1
      for update of canonical
    `,
    [canonicalUserId],
  )
  const targetUserId = target.rows[0]?.app_user_id
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
          or (
            canonical_user_id is null
            and user_id = $4
          )
        )
        and company_id = $2
        and store_id is not distinct from $3::uuid
      order by canonical_user_id nulls last, id
      for update
    `,
    [canonicalUserId, companyId, storeId, targetUserId],
  )
  if (existingMembership.rows.length > 1) {
    throw new Error("membership_conflict")
  }
  let membershipId = existingMembership.rows[0]?.id || null
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
        targetUserId,
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
    "select status, session_limit, sessions_used from public.app_personal_trials where canonical_user_id = $1 limit 1",
    [canonicalUserId],
  )
  if (!result.rows[0]) throw new Error("personal_trial_not_found")
  return trialSnapshot(result.rows[0])
}

function trialSnapshot(row: TrialRow): AppPersonalTrialSnapshot {
  const sessionLimit = Number(row.session_limit)
  const sessionsUsed = Number(row.sessions_used)
  if (sessionLimit !== 2) throw new Error("personal_trial_limit_invalid")
  return {
    kind: "personal_trial",
    dataDomain: "personal_trial",
    status: row.status,
    sessionLimit: 2,
    sessionsUsed,
    sessionsRemaining: Math.max(0, sessionLimit - sessionsUsed),
  }
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

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? null)
}
