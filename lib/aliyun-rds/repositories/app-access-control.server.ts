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

type TrialRow = {
  status: AppPersonalTrialSnapshot["status"]
  session_limit: number
  sessions_used: number
}

type AccessSnapshotRow = TrialRow & {
  canonical_user_id: string
  authorization_version: number | string
  has_formal_membership: boolean
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
  const metadata = recordValue(user.user_metadata)
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
  return withAliyunRdsTransaction((client) =>
    ensureAppCanonicalIdentityAndTrialWithClient(client, user),
  )
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
  if (canonicalCandidates.size > 1) throw new Error("app_identity_conflict")

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
    throw new Error("app_identity_conflict")
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
      throw new Error("app_identity_conflict")
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

  return getAppAccessSnapshotWithClient(client, userId)
}

export async function getAppAccessSnapshot(userId: string) {
  return getAppAccessSnapshotWithClient(
    {
      query: async <T>(text: string, values?: readonly unknown[]) => {
        const result = await queryAliyunRds(text, values)
        return { rows: result.rows as T[] }
      },
    },
    userId,
  )
}

export async function getAppAccessSnapshotWithClient(
  client: AppAccessQueryClient,
  userId: string,
): Promise<AppAccessSnapshot> {
  const result = await client.query<AccessSnapshotRow>(
    `
      select
        identity.canonical_user_id,
        trial.status,
        trial.session_limit,
        trial.sessions_used,
        coalesce(version.authorization_version, 0) as authorization_version,
        exists (
          select 1
          from public.mp_account_memberships membership
          where membership.canonical_user_id = identity.canonical_user_id
            and membership.status = 'active'
        ) as has_formal_membership
      from public.app_auth_identities identity
      join public.app_canonical_users canonical
        on canonical.id = identity.canonical_user_id
       and canonical.status = 'active'
      join public.app_personal_trials trial
        on trial.canonical_user_id = identity.canonical_user_id
      left join public.app_authorization_versions version
        on version.canonical_user_id = identity.canonical_user_id
      where identity.app_user_id = $1
      limit 1
    `,
    [requiredUuid(userId, "app_user_id_invalid")],
  )
  const row = result.rows[0]
  if (!row) throw new Error("app_canonical_identity_not_found")

  return {
    canonicalUserId: row.canonical_user_id,
    identityState: "resolved",
    accessMode: row.has_formal_membership ? "formal" : "personal_trial",
    authorizationVersion: Number(row.authorization_version || 0),
    trial: trialSnapshot(row),
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
  plan: string
  role: string
  storeId?: string | null
}) {
  return withAliyunRdsTransaction((client) => grantAppAccessWithClient(client, args))
}

export async function grantAppAccessWithClient(
  client: AppAccessQueryClient,
  args: {
    canonicalUserId: string
    companyId: string
    featureKeys: string[]
    idempotencyKey: string
    operatorUserId: string
    plan: string
    role: string
    storeId?: string | null
  },
): Promise<AppAccessGrantResult> {
  const canonicalUserId = requiredUuid(args.canonicalUserId, "canonical_user_id_invalid")
  const companyId = requiredUuid(args.companyId, "company_id_invalid")
  const storeId = args.storeId ? requiredUuid(args.storeId, "store_id_invalid") : null
  const operatorUserId = requiredUuid(args.operatorUserId, "operator_user_id_invalid")
  const idempotencyKey = requiredIdempotencyKey(args.idempotencyKey, "idempotency_key_invalid")
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

  const requestHash = sha256(
    stableJson({ canonicalUserId, companyId, featureKeys, plan, role, storeId }),
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

  const existingMembership = await client.query<{ id: string }>(
    `
      select id
      from public.mp_account_memberships
      where canonical_user_id = $1
        and company_id = $2
        and store_id is not distinct from $3::uuid
      limit 1
      for update
    `,
    [canonicalUserId, companyId, storeId],
  )
  let membershipId = existingMembership.rows[0]?.id || null
  if (membershipId) {
    await client.query(
      `
        update public.mp_account_memberships
        set
          user_id = $2,
          role = $3,
          status = 'active',
          access_source = 'admin_access_grant',
          authorization_version = $4,
          accepted_at = coalesce(accepted_at, now()),
          updated_at = now()
        where id = $1
      `,
      [membershipId, targetUserId, role, authorizationVersion],
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

  const existingEntitlement = await client.query<{ user_id: string }>(
    "select user_id from public.entitlements where canonical_user_id = $1 limit 1 for update",
    [canonicalUserId],
  )
  if (existingEntitlement.rows[0]) {
    await client.query(
      `
        update public.entitlements
        set
          plan = $2,
          status = 'active',
          feature_keys = $3::text[],
          authorization_version = $4,
          granted_by_user_id = $5,
          grant_source = 'admin_access_grant',
          updated_at = now()
        where canonical_user_id = $1
      `,
      [canonicalUserId, plan, featureKeys, authorizationVersion, operatorUserId],
    )
  } else {
    await client.query(
      `
        insert into public.entitlements (
          user_id,
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
      `,
      [
        targetUserId,
        canonicalUserId,
        plan,
        featureKeys,
        authorizationVersion,
        operatorUserId,
      ],
    )
  }

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
        after_json
      )
      values ($1, $2, 'access_grant.upserted', 'membership', $3, $4, $5::jsonb)
    `,
    [canonicalUserId, operatorUserId, membershipId, idempotencyKey, jsonbParam(response)],
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
  const key = optionalText(value, 120)
  if (!key || key.length < 8 || !SAFE_KEY_PATTERN.test(key)) throw new Error(errorCode)
  return key
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
