import "server-only"

import { createHash } from "crypto"

import type { AppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const LEARNING_PROGRESS_REPOSITORY_MODE = "facade_in_memory"

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
  firstEventReceivedAt: string
  groupId?: string
  lastPracticedAt: string | null
  lastViewedAt: string | null
  module: LearningProgressModule
  pathId?: string
  practiceCount: number
  practicedAt: string | null
  tenantKey: string
  totalPageCount?: number
  viewCount: number
  viewedAt: string | null
  viewedPageCount?: number
}

type StoredLearningProgressEvent = LearningProgressEvent & {
  entityKey: string
  receivedAt: string
  serverEventId: string
  tenantKey: string
}

type LearningProgressMemoryStore = {
  entitiesByKey: Map<string, LearningProgressEntityAggregate>
  eventsByClientKey: Map<string, StoredLearningProgressEvent>
}

declare global {
  var __meiyeLearningProgressMemoryStore: LearningProgressMemoryStore | undefined
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

export function listLearningProgress(args: {
  includeEntities?: boolean
  modules: LearningProgressModule[]
  scope: LearningProgressTenantScope
}) {
  const tenantKey = tenantMemoryKey(args.scope)
  const allEntities = [...getLearningProgressMemoryStore().entitiesByKey.values()]
    .filter((entity) => entity.tenantKey === tenantKey && args.modules.includes(entity.module))
    .sort(compareEntities)

  return {
    entities: args.includeEntities === false ? [] : allEntities.map(toPublicLearningProgressEntity),
    pending_client_event_ids: [],
    repository_mode: LEARNING_PROGRESS_REPOSITORY_MODE,
    server_time: new Date().toISOString(),
    summaries: args.modules.map((module) => buildLearningProgressSummary(module, allEntities)),
  }
}

export function applyLearningProgressEvent(
  scope: LearningProgressTenantScope,
  payload: unknown,
): | {
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
  | LearningProgressValidationError {
  const validation = validateLearningProgressEventPayload(payload)
  if (!validation.ok) return validation

  const store = getLearningProgressMemoryStore()
  const tenantKey = tenantMemoryKey(scope)
  const clientKey = `${tenantKey}:${validation.event.clientEventId}`
  const existingEvent = store.eventsByClientKey.get(clientKey)
  if (existingEvent) {
    const aggregate = store.entitiesByKey.get(existingEvent.entityKey)
    if (!aggregate) {
      return learningProgressError(500, "learning_progress_facade_inconsistent", "Learning progress facade store is inconsistent")
    }
    const summary = buildLearningProgressSummary(existingEvent.module, entitiesForTenantModule(tenantKey, existingEvent.module))
    return {
      ok: true,
      entity: toPublicLearningProgressEntity(aggregate),
      event: {
        client_event_id: existingEvent.clientEventId,
        deduped: true,
        received_at: existingEvent.receivedAt,
        server_event_id: existingEvent.serverEventId,
      },
      summary_delta: summaryDelta(summary),
    }
  }

  const event = validation.event
  const meta = lookupLearningProgressEntity(event.module, event.entityType, event.entityId)
  if (!meta) {
    return learningProgressError(404, "learning_entity_not_found", "Learning entity is not in the current App catalog")
  }

  const receivedAt = new Date().toISOString()
  const entityKey = `${tenantKey}:${event.module}:${event.entityType}:${event.entityId}`
  const storedEvent: StoredLearningProgressEvent = {
    ...event,
    entityKey,
    receivedAt,
    serverEventId: createLearningProgressServerEventId(tenantKey, event.clientEventId),
    tenantKey,
  }
  store.eventsByClientKey.set(clientKey, storedEvent)

  const aggregate = store.entitiesByKey.get(entityKey) || createEntityAggregate(tenantKey, meta, receivedAt)
  applyEventToAggregate(aggregate, event, meta)
  store.entitiesByKey.set(entityKey, aggregate)

  const summary = buildLearningProgressSummary(event.module, entitiesForTenantModule(tenantKey, event.module))
  return {
    ok: true,
    entity: toPublicLearningProgressEntity(aggregate),
    event: {
      client_event_id: storedEvent.clientEventId,
      deduped: false,
      received_at: storedEvent.receivedAt,
      server_event_id: storedEvent.serverEventId,
    },
    summary_delta: summaryDelta(summary),
  }
}

export function syncLearningProgressEvents(scope: LearningProgressTenantScope, payload: unknown) {
  if (!isLearningProgressRecord(payload)) {
    return learningProgressError(400, "invalid_payload", "Request body must be a JSON object")
  }

  const events = Array.isArray(payload.events) ? payload.events.slice(0, 100) : null
  if (!events) {
    return learningProgressError(422, "invalid_learning_event", "events must be an array")
  }

  const acceptedEventIds: string[] = []
  const rejectedEvents: Array<{ client_event_id: string | null; code: string; message: string }> = []

  for (const item of events) {
    const result = applyLearningProgressEvent(scope, item)
    if (result.ok) {
      acceptedEventIds.push(result.event.client_event_id)
      continue
    }
    rejectedEvents.push({
      client_event_id: isLearningProgressRecord(item) ? cleanLearningProgressText(item.client_event_id, 220) || null : null,
      code: result.code,
      message: result.message,
    })
  }

  const progress = listLearningProgress({
    includeEntities: false,
    modules: ["professional", "speech"],
    scope,
  })

  return {
    ok: true as const,
    accepted_event_ids: acceptedEventIds,
    client_sync_id: cleanLearningProgressText(payload.client_sync_id, 220),
    progress: {
      entities: progress.entities,
      server_time: progress.server_time,
      summaries: progress.summaries,
    },
    rejected_events: rejectedEvents,
    repository_mode: LEARNING_PROGRESS_REPOSITORY_MODE,
  }
}

function validateLearningProgressEventPayload(
  payload: unknown,
): { ok: true; event: LearningProgressEvent } | LearningProgressValidationError {
  if (!isLearningProgressRecord(payload)) {
    return learningProgressError(400, "invalid_payload", "Request body must be a JSON object")
  }

  const clientEventId = cleanLearningProgressText(payload.client_event_id, 220)
  const moduleName = cleanLearningProgressText(payload.module, 40)
  const entityType = cleanLearningProgressText(payload.entity_type, 60)
  const entityId = cleanLearningProgressText(payload.entity_id, 160)
  const action = cleanLearningProgressText(payload.action, 40)
  const occurredAt = parseLearningProgressOccurredAt(payload.occurred_at)

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

function learningProgressError(status: number, code: string, message: string): LearningProgressValidationError {
  return { ok: false, code, message, status }
}

function getLearningProgressMemoryStore() {
  if (!globalThis.__meiyeLearningProgressMemoryStore) {
    globalThis.__meiyeLearningProgressMemoryStore = {
      entitiesByKey: new Map(),
      eventsByClientKey: new Map(),
    }
  }
  return globalThis.__meiyeLearningProgressMemoryStore
}

function tenantMemoryKey(scope: LearningProgressTenantScope) {
  return [
    scope.companyId,
    scope.storeId,
    scope.membershipId,
    scope.userId,
  ].join(":")
}

function entitiesForTenantModule(tenantKey: string, module: LearningProgressModule) {
  return [...getLearningProgressMemoryStore().entitiesByKey.values()]
    .filter((entity) => entity.tenantKey === tenantKey && entity.module === module)
}

function createEntityAggregate(
  tenantKey: string,
  meta: LearningProgressEntityMeta,
  receivedAt: string,
): LearningProgressEntityAggregate {
  return {
    entityId: meta.entityId,
    entityType: meta.entityType,
    firstEventReceivedAt: receivedAt,
    groupId: meta.groupId,
    lastPracticedAt: null,
    lastViewedAt: null,
    module: meta.module,
    pathId: meta.pathId,
    practiceCount: 0,
    practicedAt: null,
    tenantKey,
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
