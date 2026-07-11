import "server-only"

import { createHash } from "crypto"
import type { PoolClient } from "pg"

import { queryAliyunRds, withAliyunRdsTransaction } from "@/lib/aliyun-rds/postgres.server"
import type { AppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const LEARNING_PROGRESS_REPOSITORY_MODE = "aliyun_rds_event_store"

export type LearningProgressModule = "professional" | "speech"
export type LearningProgressEntityType = "professional_lesson" | "professional_path" | "speech_card" | "speech_group"
export type LearningProgressAction = "viewed" | "practiced"

export type LearningProgressTenantScope = {
  companyId: string
  storeId: string
  membershipId: string
  role: string
  userId: string
}

export type LearningProgressPublicEntity = {
  module: LearningProgressModule
  entity_type: LearningProgressEntityType
  entity_id: string
  path_id?: string
  group_id?: string
  viewed_at: string | null
  practiced_at: string | null
  view_count: number
  practice_count: number
  sync_state: "server"
  viewed_page_count?: number
  total_page_count?: number
}

export type LearningProgressSummary = {
  module: LearningProgressModule
  total_count: number
  viewed_count: number
  practiced_count: number
  completion_percent: number
  next: {
    entity_type: LearningProgressEntityType
    entity_id: string
    route_id: "professional.lesson" | "speech.detail"
    reason: "start_first" | "continue_current" | "practice_after_view"
  }
}

type LearningProgressEntityMeta = {
  module: LearningProgressModule
  entityType: LearningProgressEntityType
  entityId: string
  routeId: "professional.lesson" | "speech.detail"
  pathId?: string
  groupId?: string
  totalPageCount?: number
}

type LearningProgressEvent = {
  action: LearningProgressAction
  clientEventId: string
  entityId: string
  entityType: LearningProgressEntityType
  metadata: Record<string, unknown>
  module: LearningProgressModule
  occurredAt: string
}

type LearningProgressValidationError = {
  ok: false
  code: string
  message: string
  status: number
}

type LearningProgressEntityAggregate = {
  entityId: string
  entityType: LearningProgressEntityType
  groupId?: string
  lastPracticedAt: string | null
  lastViewedAt: string | null
  module: LearningProgressModule
  pathId?: string
  practiceCount: number
  practicedAt: string | null
  totalPageCount?: number
  viewCount: number
  viewedAt: string | null
  viewedPageCount?: number
}

type LearningProgressEventRow = {
  id: string
  company_id: string
  store_id: string
  membership_id: string
  user_id: string
  client_event_id: string
  module: LearningProgressModule
  entity_type: LearningProgressEntityType
  entity_id: string
  action: LearningProgressAction
  occurred_at: string | Date
  metadata: unknown
  received_at: string | Date
}

type LearningProgressApplySuccess = {
  ok: true
  entity: LearningProgressPublicEntity
  event: {
    client_event_id: string
    deduped: boolean
    received_at: string
    server_event_id: string
  }
  summary_delta: Omit<LearningProgressSummary, "next" | "total_count">
}

type PersistedLearningProgressEvent = {
  ok: true
  deduped: boolean
  event: LearningProgressEventRow
}

const LEARNING_PROGRESS_TOTALS: Record<LearningProgressModule, number> = {
  professional: 89,
  speech: 30,
}

const DEFAULT_PROFESSIONAL_LESSON_ID = "skin-system-s00-01"
const DEFAULT_SPEECH_CARD_ID = "A01"

const PROFESSIONAL_PATH_IDS = [
  "skin-physiology",
  "skin-types",
  "project-principles",
  "tcm-foundation-expression",
  "meridian-expression",
  "organ-expression",
  "compliance-translation",
]

const PROFESSIONAL_LESSONS = [
  { entityId: "skin-system-s00-01", pathId: "skin-physiology" },
  { entityId: "skin-system-s00-02", pathId: "skin-physiology" },
  { entityId: "skin-system-s01-01", pathId: "skin-physiology" },
  { entityId: "skin-system-s01-02", pathId: "skin-physiology" },
  { entityId: "skin-system-s03-02", pathId: "skin-types" },
  { entityId: "skin-system-s04-01", pathId: "skin-types" },
]

const SPEECH_GROUPS = [
  { groupId: "trust-price-basic-project", ids: numberedIds("A", 1, 10) },
  { groupId: "problem-skin-safety-risk", ids: numberedIds("B", 11, 10) },
  { groupId: "tcm-body-service-recovery", ids: numberedIds("C", 17, 10) },
]

const ENTITY_META = buildEntityMeta()

const ALLOWED_ENTITY_TYPES_BY_MODULE: Record<LearningProgressModule, Set<LearningProgressEntityType>> = {
  professional: new Set(["professional_lesson", "professional_path"]),
  speech: new Set(["speech_card", "speech_group"]),
}

const ALLOWED_LEARNING_PROGRESS_ROLES = new Set([
  "staff",
  "employee",
  "store_admin",
  "store_manager",
  "store_owner",
  "company_admin",
  "company_owner",
  "merchant_admin",
  "merchant_owner",
  "service_operator",
])

export function cleanLearningProgressText(value: unknown, max = 180) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

export function isLearningProgressRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function resolveLearningProgressTenantScope(
  ctx: AppAccountContext,
  contextStoreIdValue?: unknown,
): { ok: true; scope: LearningProgressTenantScope } | LearningProgressValidationError {
  const role = cleanLearningProgressText(ctx.role, 80)
  if (role === "customer" || !ALLOWED_LEARNING_PROGRESS_ROLES.has(role)) {
    return learningProgressError(403, "role_denied", "Role is not allowed to access learning progress")
  }

  const contextStoreId = cleanLearningProgressText(contextStoreIdValue, 80)
  if (contextStoreId) {
    if (!ctx.isPlatformAdmin && !ctx.isCompanyManager && !ctx.isStoreManager && contextStoreId !== ctx.storeId) {
      return learningProgressError(403, "tenant_forbidden", "Store is outside the current account scope")
    }

    const matchedMembership = ctx.memberships.find((membership) => {
      if (membership.storeId !== contextStoreId) return false
      if (ctx.isPlatformAdmin) return true
      return !ctx.companyId || membership.companyId === ctx.companyId
    })

    if (!matchedMembership && contextStoreId !== ctx.storeId) {
      return learningProgressError(403, "tenant_forbidden", "Store is outside the current account scope")
    }

    const companyId = matchedMembership?.companyId || ctx.companyId
    const storeId = matchedMembership?.storeId || ctx.storeId
    const membershipId = matchedMembership?.id || ctx.membershipId
    if (!companyId || !storeId || !membershipId) {
      return learningProgressError(403, "not_bound", "Account is not bound to an active tenant membership")
    }

    return {
      ok: true,
      scope: {
        companyId,
        storeId,
        membershipId,
        role,
        userId: ctx.userId,
      },
    }
  }

  if (!ctx.companyId || !ctx.storeId || !ctx.membershipId) {
    return learningProgressError(403, "not_bound", "Account is not bound to an active tenant membership")
  }

  return {
    ok: true,
    scope: {
      companyId: ctx.companyId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      role,
      userId: ctx.userId,
    },
  }
}

export function parseLearningProgressModules(
  value: unknown,
): { ok: true; modules: LearningProgressModule[] } | LearningProgressValidationError {
  const raw = cleanLearningProgressText(value, 120)
  const requested = raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : ["professional", "speech"]
  const modules = requested.filter((item): item is LearningProgressModule => item === "professional" || item === "speech")
  if (!requested.length || modules.length !== requested.length) {
    return learningProgressError(422, "invalid_learning_event", "Unsupported learning module")
  }
  return { ok: true, modules: [...new Set(modules)] }
}

export async function listLearningProgress(args: {
  includeEntities?: boolean
  modules: LearningProgressModule[]
  scope: LearningProgressTenantScope
}) {
  const rows = await queryLearningProgressEvents(args.scope, args.modules)
  const allEntities = aggregateLearningProgressRows(rows).sort(compareEntities)

  return {
    entities: args.includeEntities === false ? [] : allEntities.map(toPublicLearningProgressEntity),
    pending_client_event_ids: [],
    repository_mode: LEARNING_PROGRESS_REPOSITORY_MODE,
    server_time: new Date().toISOString(),
    summaries: args.modules.map((module) => buildLearningProgressSummary(module, allEntities)),
  }
}

export async function applyLearningProgressEvent(
  scope: LearningProgressTenantScope,
  payload: unknown,
): Promise<LearningProgressApplySuccess | LearningProgressValidationError> {
  const validation = validateLearningProgressEventPayload(payload)
  if (!validation.ok) return validation

  return withAliyunRdsTransaction(async (client) => {
    const persisted = await persistLearningProgressEvent(client, scope, validation.event)
    if (!persisted.ok) return persisted

    const rows = await queryLearningProgressEvents(scope, [persisted.event.module], client)
    const entities = aggregateLearningProgressRows(rows)
    const aggregate = entities.find((entity) =>
      entity.module === persisted.event.module &&
      entity.entityType === persisted.event.entity_type &&
      entity.entityId === persisted.event.entity_id)
    if (!aggregate) {
      throw new Error("learning_progress_event_aggregate_failed")
    }

    const summary = buildLearningProgressSummary(persisted.event.module, entities)
    return {
      ok: true,
      entity: toPublicLearningProgressEntity(aggregate),
      event: {
        client_event_id: persisted.event.client_event_id,
        deduped: persisted.deduped,
        received_at: toIsoString(persisted.event.received_at, "received_at"),
        server_event_id: persisted.event.id,
      },
      summary_delta: summaryDelta(summary),
    }
  })
}

export async function syncLearningProgressEvents(scope: LearningProgressTenantScope, payload: unknown) {
  if (!isLearningProgressRecord(payload)) {
    return learningProgressError(400, "invalid_payload", "Request body must be a JSON object")
  }

  const events = Array.isArray(payload.events) ? payload.events.slice(0, 100) : null
  if (!events) {
    return learningProgressError(422, "invalid_learning_event", "events must be an array")
  }

  return withAliyunRdsTransaction(async (client) => {
    const acceptedEventIds: string[] = []
    const rejectedEvents: Array<{ client_event_id: string | null; code: string; message: string }> = []

    for (const item of events) {
      const validation = validateLearningProgressEventPayload(item)
      const result = validation.ok
        ? await persistLearningProgressEvent(client, scope, validation.event)
        : validation
      if (result.ok) {
        acceptedEventIds.push(result.event.client_event_id)
        continue
      }
      rejectedEvents.push({
        client_event_id: rejectedLearningProgressClientEventId(item),
        code: result.code,
        message: result.message,
      })
    }

    const rows = await queryLearningProgressEvents(scope, ["professional", "speech"], client)
    const entities = aggregateLearningProgressRows(rows)
    const serverTime = new Date().toISOString()
    return {
      ok: true as const,
      accepted_event_ids: acceptedEventIds,
      client_sync_id: cleanLearningProgressText(payload.client_sync_id, 220),
      progress: {
        entities: [],
        server_time: serverTime,
        summaries: (["professional", "speech"] as const).map((module) =>
          buildLearningProgressSummary(module, entities)),
      },
      rejected_events: rejectedEvents,
      repository_mode: LEARNING_PROGRESS_REPOSITORY_MODE,
    }
  })
}

function validateLearningProgressEventPayload(
  payload: unknown,
): { ok: true; event: LearningProgressEvent } | LearningProgressValidationError {
  if (!isLearningProgressRecord(payload)) {
    return learningProgressError(400, "invalid_payload", "Request body must be a JSON object")
  }

  const clientEventId = rawLearningProgressClientEventId(payload.client_event_id)
  const moduleName = cleanLearningProgressText(payload.module, 40)
  const entityType = cleanLearningProgressText(payload.entity_type, 60)
  const entityId = cleanLearningProgressText(payload.entity_id, 160)
  const action = cleanLearningProgressText(payload.action, 40)
  const occurredAt = parseLearningProgressOccurredAt(payload.occurred_at)

  if (clientEventId.length > 220) {
    return learningProgressError(422, "invalid_learning_event", "client_event_id must be between 1 and 220 characters")
  }
  if (!clientEventId || !entityId || !occurredAt) {
    return learningProgressError(422, "invalid_learning_event", "client_event_id, entity_id, and valid occurred_at are required")
  }
  if (moduleName !== "professional" && moduleName !== "speech") {
    return learningProgressError(422, "invalid_learning_event", "Unsupported learning module")
  }
  if (!["professional_lesson", "professional_path", "speech_card", "speech_group"].includes(entityType)) {
    return learningProgressError(422, "invalid_learning_event", "Unsupported learning entity_type")
  }
  if (action !== "viewed" && action !== "practiced") {
    return learningProgressError(422, "invalid_learning_event", "Unsupported learning action")
  }

  const typedEntityType = entityType as LearningProgressEntityType
  const typedModule = moduleName as LearningProgressModule
  if (!ALLOWED_ENTITY_TYPES_BY_MODULE[typedModule].has(typedEntityType)) {
    return learningProgressError(422, "invalid_learning_event", "entity_type is not valid for module")
  }

  if (!lookupLearningProgressEntity(typedModule, typedEntityType, entityId)) {
    return learningProgressError(404, "learning_entity_not_found", "Learning entity is not in the current App catalog")
  }

  return {
    ok: true,
    event: {
      action,
      clientEventId,
      entityId,
      entityType: typedEntityType,
      metadata: isLearningProgressRecord(payload.metadata) ? payload.metadata : {},
      module: typedModule,
      occurredAt,
    },
  }
}

function rawLearningProgressClientEventId(value: unknown) {
  return String(value || "").trim()
}

function rejectedLearningProgressClientEventId(value: unknown) {
  if (!isLearningProgressRecord(value)) return null
  const clientEventId = rawLearningProgressClientEventId(value.client_event_id)
  return clientEventId && clientEventId.length <= 220 ? clientEventId : null
}

function learningProgressError(status: number, code: string, message: string): LearningProgressValidationError {
  return { ok: false, code, message, status }
}

function tenantScopeKey(scope: LearningProgressTenantScope) {
  return [
    scope.companyId,
    scope.storeId,
    scope.membershipId,
    scope.userId,
  ].join(":")
}

async function persistLearningProgressEvent(
  client: PoolClient,
  scope: LearningProgressTenantScope,
  event: LearningProgressEvent,
): Promise<PersistedLearningProgressEvent | LearningProgressValidationError> {
  const tenantKey = tenantScopeKey(scope)
  const serverEventId = createLearningProgressServerEventId(tenantKey, event.clientEventId)
  const inserted = await client.query<LearningProgressEventRow>(
    `
      insert into public.app_learning_progress_events (
        id, company_id, store_id, membership_id, user_id, client_event_id,
        module, entity_type, entity_id, action, occurred_at, metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      on conflict (company_id, store_id, membership_id, user_id, client_event_id) do nothing
      returning id, company_id, store_id, membership_id, user_id, client_event_id,
        module, entity_type, entity_id, action, occurred_at, metadata, received_at
    `,
    [
      serverEventId,
      scope.companyId,
      scope.storeId,
      scope.membershipId,
      scope.userId,
      event.clientEventId,
      event.module,
      event.entityType,
      event.entityId,
      event.action,
      event.occurredAt,
      canonicalLearningProgressJson(event.metadata),
    ],
  )
  const deduped = inserted.rows.length === 0
  const storedEvent = inserted.rows[0] || await findLearningProgressEventByClientId(client, scope, event.clientEventId)
  if (!storedEvent) throw new Error("learning_progress_idempotency_read_failed")
  if (deduped && !sameLearningProgressEvent(storedEvent, event)) {
    return learningProgressError(
      409,
      "learning_event_id_conflict",
      "client_event_id is already bound to a different learning event",
    )
  }
  return { ok: true, deduped, event: storedEvent }
}

function sameLearningProgressEvent(stored: LearningProgressEventRow, incoming: LearningProgressEvent) {
  return stored.module === incoming.module &&
    stored.entity_type === incoming.entityType &&
    stored.entity_id === incoming.entityId &&
    stored.action === incoming.action &&
    toIsoString(stored.occurred_at, "occurred_at") === incoming.occurredAt &&
    canonicalLearningProgressJson(stored.metadata) === canonicalLearningProgressJson(incoming.metadata)
}

function canonicalLearningProgressJson(value: unknown): string {
  const json = JSON.stringify(value)
  if (typeof json !== "string") return "null"
  return stableLearningProgressJson(JSON.parse(json))
}

function stableLearningProgressJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableLearningProgressJson).join(",")}]`
  }
  if (isLearningProgressRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableLearningProgressJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

async function queryLearningProgressEvents(
  scope: LearningProgressTenantScope,
  modules: LearningProgressModule[],
  client?: PoolClient,
) {
  const sql = `
    select id, company_id, store_id, membership_id, user_id, client_event_id,
      module, entity_type, entity_id, action, occurred_at, metadata, received_at
    from public.app_learning_progress_events
    where company_id = $1
      and store_id = $2
      and membership_id = $3
      and user_id = $4
      and module = any($5::text[])
    order by occurred_at asc, received_at asc, id asc
  `
  const values = [scope.companyId, scope.storeId, scope.membershipId, scope.userId, modules]
  const result = client
    ? await client.query<LearningProgressEventRow>(sql, values)
    : await queryAliyunRds<LearningProgressEventRow>(sql, values)
  return result.rows
}

async function findLearningProgressEventByClientId(
  client: PoolClient,
  scope: LearningProgressTenantScope,
  clientEventId: string,
) {
  const result = await client.query<LearningProgressEventRow>(
    `
      select id, company_id, store_id, membership_id, user_id, client_event_id,
        module, entity_type, entity_id, action, occurred_at, metadata, received_at
      from public.app_learning_progress_events
      where company_id = $1
        and store_id = $2
        and membership_id = $3
        and user_id = $4
        and client_event_id = $5
      limit 1
    `,
    [scope.companyId, scope.storeId, scope.membershipId, scope.userId, clientEventId],
  )
  return result.rows[0] || null
}

function aggregateLearningProgressRows(rows: LearningProgressEventRow[]) {
  const entities = new Map<string, LearningProgressEntityAggregate>()

  for (const row of rows) {
    const meta = lookupLearningProgressEntity(row.module, row.entity_type, row.entity_id)
    if (!meta) throw new Error("learning_progress_catalog_row_invalid")

    const event: LearningProgressEvent = {
      action: row.action,
      clientEventId: row.client_event_id,
      entityId: row.entity_id,
      entityType: row.entity_type,
      metadata: isLearningProgressRecord(row.metadata) ? row.metadata : {},
      module: row.module,
      occurredAt: toIsoString(row.occurred_at, "occurred_at"),
    }
    const entityKey = `${row.module}:${row.entity_type}:${row.entity_id}`
    const aggregate = entities.get(entityKey) || createEntityAggregate(meta)
    applyEventToAggregate(aggregate, event, meta)
    entities.set(entityKey, aggregate)
  }

  return [...entities.values()]
}

function toIsoString(value: string | Date, field: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`learning_progress_invalid_${field}`)
  return date.toISOString()
}

export function learningProgressSchemaMissing(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "")
  const message = String((error as { message?: unknown })?.message || "")
  return (
    (code === "42P01" || code === "42703" || /does not exist|column .* does not exist/i.test(message)) &&
    /app_learning_progress_events/i.test(message)
  )
}

function createEntityAggregate(
  meta: LearningProgressEntityMeta,
): LearningProgressEntityAggregate {
  return {
    entityId: meta.entityId,
    entityType: meta.entityType,
    groupId: meta.groupId,
    lastPracticedAt: null,
    lastViewedAt: null,
    module: meta.module,
    pathId: meta.pathId,
    practiceCount: 0,
    practicedAt: null,
    totalPageCount: meta.totalPageCount,
    viewCount: 0,
    viewedAt: null,
    viewedPageCount: meta.totalPageCount ? 0 : undefined,
  }
}

function applyEventToAggregate(
  aggregate: LearningProgressEntityAggregate,
  event: LearningProgressEvent,
  meta: LearningProgressEntityMeta,
) {
  if (event.action === "viewed") {
    aggregate.viewCount += 1
    aggregate.viewedAt = earliestIso(aggregate.viewedAt, event.occurredAt)
    aggregate.lastViewedAt = latestIso(aggregate.lastViewedAt, event.occurredAt)
    if (event.module === "speech" && event.entityType === "speech_card") {
      const pageIndex = positiveInteger(event.metadata.page_index)
      const totalPageCount = positiveInteger(event.metadata.total_page_count) || meta.totalPageCount || 3
      aggregate.totalPageCount = Math.max(aggregate.totalPageCount || 0, totalPageCount)
      aggregate.viewedPageCount = Math.max(aggregate.viewedPageCount || 0, pageIndex || totalPageCount)
    }
    return
  }

  aggregate.practiceCount += 1
  aggregate.practicedAt = earliestIso(aggregate.practicedAt, event.occurredAt)
  aggregate.lastPracticedAt = latestIso(aggregate.lastPracticedAt, event.occurredAt)
}

function buildLearningProgressSummary(
  module: LearningProgressModule,
  allEntities: LearningProgressEntityAggregate[],
): LearningProgressSummary {
  const entities = allEntities.filter((entity) => entity.module === module)
  const viewedCount = entities.filter((entity) => entity.viewedAt).length
  const practicedCount = entities.filter((entity) => entity.practicedAt).length
  const totalCount = LEARNING_PROGRESS_TOTALS[module]

  return {
    completion_percent: Math.min(100, Math.round((viewedCount / totalCount) * 100)),
    module,
    next: nextLearningProgressEntity(module, entities),
    practiced_count: practicedCount,
    total_count: totalCount,
    viewed_count: viewedCount,
  }
}

function nextLearningProgressEntity(
  module: LearningProgressModule,
  entities: LearningProgressEntityAggregate[],
): LearningProgressSummary["next"] {
  const viewedNotPracticed = entities
    .filter((entity) => entity.viewedAt && !entity.practicedAt)
    .sort(compareEntities)[0]

  if (viewedNotPracticed) {
    return {
      entity_id: viewedNotPracticed.entityId,
      entity_type: viewedNotPracticed.entityType,
      reason: "practice_after_view",
      route_id: module === "professional" ? "professional.lesson" : "speech.detail",
    }
  }

  if (module === "professional") {
    return {
      entity_id: DEFAULT_PROFESSIONAL_LESSON_ID,
      entity_type: "professional_lesson",
      reason: entities.length ? "continue_current" : "start_first",
      route_id: "professional.lesson",
    }
  }

  return {
    entity_id: DEFAULT_SPEECH_CARD_ID,
    entity_type: "speech_card",
    reason: entities.length ? "continue_current" : "start_first",
    route_id: "speech.detail",
  }
}

function toPublicLearningProgressEntity(entity: LearningProgressEntityAggregate): LearningProgressPublicEntity {
  return {
    entity_id: entity.entityId,
    entity_type: entity.entityType,
    group_id: entity.groupId,
    module: entity.module,
    path_id: entity.pathId,
    practice_count: entity.practiceCount,
    practiced_at: entity.practicedAt,
    sync_state: "server",
    total_page_count: entity.totalPageCount,
    view_count: entity.viewCount,
    viewed_at: entity.viewedAt,
    viewed_page_count: entity.viewedPageCount,
  }
}

function summaryDelta(summary: LearningProgressSummary) {
  return {
    completion_percent: summary.completion_percent,
    module: summary.module,
    practiced_count: summary.practiced_count,
    viewed_count: summary.viewed_count,
  }
}

function compareEntities(left: LearningProgressEntityAggregate, right: LearningProgressEntityAggregate) {
  return `${left.module}:${left.entityType}:${left.entityId}`.localeCompare(`${right.module}:${right.entityType}:${right.entityId}`)
}

function lookupLearningProgressEntity(
  module: LearningProgressModule,
  entityType: LearningProgressEntityType,
  entityId: string,
) {
  return ENTITY_META.get(`${module}:${entityType}:${entityId}`)
}

function buildEntityMeta() {
  const meta = new Map<string, LearningProgressEntityMeta>()

  for (const pathId of PROFESSIONAL_PATH_IDS) {
    addEntityMeta(meta, {
      entityId: pathId,
      entityType: "professional_path",
      module: "professional",
      pathId,
      routeId: "professional.lesson",
    })
  }

  for (const lesson of PROFESSIONAL_LESSONS) {
    addEntityMeta(meta, {
      entityId: lesson.entityId,
      entityType: "professional_lesson",
      module: "professional",
      pathId: lesson.pathId,
      routeId: "professional.lesson",
    })
  }

  for (const group of SPEECH_GROUPS) {
    addEntityMeta(meta, {
      entityId: group.groupId,
      entityType: "speech_group",
      groupId: group.groupId,
      module: "speech",
      routeId: "speech.detail",
    })
    for (const entityId of group.ids) {
      addEntityMeta(meta, {
        entityId,
        entityType: "speech_card",
        groupId: group.groupId,
        module: "speech",
        routeId: "speech.detail",
        totalPageCount: 3,
      })
    }
  }

  return meta
}

function addEntityMeta(store: Map<string, LearningProgressEntityMeta>, meta: LearningProgressEntityMeta) {
  store.set(`${meta.module}:${meta.entityType}:${meta.entityId}`, meta)
}

function numberedIds(prefix: string, start: number, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(2, "0")}`)
}

function parseLearningProgressOccurredAt(value: unknown) {
  const text = cleanLearningProgressText(value, 80)
  const raw = text || new Date().toISOString()
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function createLearningProgressServerEventId(tenantKey: string, clientEventId: string) {
  const hash = createHash("sha256").update(`${tenantKey}:${clientEventId}`).digest("hex").slice(0, 24)
  return `learn_evt_${hash}`
}

function earliestIso(current: string | null, next: string) {
  if (!current) return next
  return new Date(next).getTime() < new Date(current).getTime() ? next : current
}

function latestIso(current: string | null, next: string) {
  if (!current) return next
  return new Date(next).getTime() > new Date(current).getTime() ? next : current
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}
