import "server-only"

import type { NextRequest } from "next/server"

import type { MpAccountContext } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import commonBeautyTrainingPack from "./training-packs/common-beauty-v2.json"
import baibaituSpeakingTrainingPack from "./training-packs/baibaitu-speaking-v2.json"

export const COMMON_KNOWLEDGE_SPACE_ID = "common_beauty_knowledge_v1"
export const BAIBAITU_KNOWLEDGE_SPACE_ID = "baibaitu_store_knowledge_v1"
export const MANBEILIAN_KNOWLEDGE_SPACE_ID = "manbeilian_store_knowledge_v1"

export const TRAINING_PACK_MODE_COMMON = "common-generic"
export const TRAINING_PACK_MODE_BAIBAITU = "baibaitu-speaking"
export const TRAINING_PACK_MODE_MANBEILIAN = "manbeilian-speaking"

const COMMON_PACK_ID = "beauty_case_training_v1"
const BAIBAITU_PACK_ID = "baibaitu_professional_speaking_v1"
const MANBEILIAN_PACK_ID = "manbeilian_professional_speaking_v1"

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
type QuerySupabaseClient = SupabaseClient | ReturnType<typeof createAdminSupabaseClient>

export type TrainingKnowledgeSpace = {
  id: string
  code: string
  display_name: string
  type: "common_generic" | "brand_template" | "store_custom"
  company_id: string | null
  store_id: string | null
  brand_code: string | null
  default_pack_id: string
  training_pack_mode: string
  version: string
  status: "draft" | "active" | "inactive" | "archived"
  is_default: boolean
  metadata: Record<string, unknown>
}

type TrainingPack = {
  pack_id: string
  title: string
  subtitle: string
  brand_code: string
  knowledge_space_id: string
  training_pack_mode: string
  version: string
  status: "draft" | "active" | "published" | "archived"
  metadata: Record<string, unknown>
  tasks_json?: TrainingTask[]
}

type TrainingTask = {
  task_id: string
  id: string
  title: string
  customer_line: string
  focus: string
  order: number
  estimated_minutes: number
  training_context: Record<string, unknown>
  [key: string]: unknown
}

type TrainingPackSeed = {
  content_version?: string
  asset_version?: string
  pack?: Record<string, unknown>
  tasks?: unknown[]
  validation?: Record<string, unknown>
}

type KnowledgeSpaceAccessRow = {
  knowledge_space_id?: unknown
  expires_at?: string | null
}

const COMMON_TRAINING_PACK_SEED = commonBeautyTrainingPack as TrainingPackSeed
const BAIBAITU_TRAINING_PACK_SEED = baibaituSpeakingTrainingPack as TrainingPackSeed

const DEFAULT_SPACES: TrainingKnowledgeSpace[] = [
  {
    id: COMMON_KNOWLEDGE_SPACE_ID,
    code: "common_beauty",
    display_name: "通用知识库",
    type: "common_generic",
    company_id: null,
    store_id: null,
    brand_code: "meiye_huajing",
    default_pack_id: COMMON_PACK_ID,
    training_pack_mode: TRAINING_PACK_MODE_COMMON,
    version: "v1",
    status: "active",
    is_default: true,
    metadata: {
      description: "价格透明、不强推、基础肤况、售后处理等通用训练。",
      source: "system_seed",
      content_version: COMMON_TRAINING_PACK_SEED.content_version,
      asset_version: COMMON_TRAINING_PACK_SEED.asset_version,
      task_count: 30,
    },
  },
  {
    id: BAIBAITU_KNOWLEDGE_SPACE_ID,
    code: "baibaitu",
    display_name: "白白兔企业资料库",
    type: "store_custom",
    company_id: null,
    store_id: null,
    brand_code: "baibaitu",
    default_pack_id: BAIBAITU_PACK_ID,
    training_pack_mode: TRAINING_PACK_MODE_BAIBAITU,
    version: "v1",
    status: "active",
    is_default: false,
    metadata: {
      description: "白白兔企业文化、产品专业、项目专业和门店开口训练。",
      source: "system_seed",
      local_fallback: true,
      content_version: BAIBAITU_TRAINING_PACK_SEED.content_version,
      asset_version: BAIBAITU_TRAINING_PACK_SEED.asset_version,
      task_count: 30,
    },
  },
  {
    id: MANBEILIAN_KNOWLEDGE_SPACE_ID,
    code: "manbeilian",
    display_name: "曼贝莲项目库",
    type: "store_custom",
    company_id: null,
    store_id: null,
    brand_code: "manbeilian",
    default_pack_id: MANBEILIAN_PACK_ID,
    training_pack_mode: TRAINING_PACK_MODE_MANBEILIAN,
    version: "v1",
    status: "active",
    is_default: false,
    metadata: {
      description: "曼贝莲苗药筋骨养护、春归液项目卡和门店安全表达训练。",
      source: "system_seed",
      local_fallback: true,
      asset_version: "manbeilian-knowledge-v1",
      task_count: 221,
      task_unit: "张",
      static_asset_root: "/voice-coach-assets/manbeilian-knowledge/v1",
    },
  },
]

const STATIC_PACKS: Record<string, TrainingPack> = {
  [COMMON_PACK_ID]: {
    pack_id: COMMON_PACK_ID,
    title: "真实顾客问题库 v1",
    subtitle: "价格透明、不强推、基础皮肤、售后处理等 30 个高频问题",
    brand_code: "meiye_huajing",
    knowledge_space_id: COMMON_KNOWLEDGE_SPACE_ID,
    training_pack_mode: TRAINING_PACK_MODE_COMMON,
    version: "v2",
    status: "active",
    metadata: {
      source: "system_seed",
      content_version: COMMON_TRAINING_PACK_SEED.content_version,
      asset_version: COMMON_TRAINING_PACK_SEED.asset_version,
      task_count: 30,
    },
  },
  [BAIBAITU_PACK_ID]: {
    pack_id: BAIBAITU_PACK_ID,
    title: "白白兔开口训练 30 题正式包",
    subtitle: "企业文化、产品专业、项目专业和门店常见顾客问题",
    brand_code: "baibaitu",
    knowledge_space_id: BAIBAITU_KNOWLEDGE_SPACE_ID,
    training_pack_mode: TRAINING_PACK_MODE_BAIBAITU,
    version: "v2",
    status: "active",
    metadata: {
      source: "system_seed",
      local_fallback: true,
      content_version: BAIBAITU_TRAINING_PACK_SEED.content_version,
      asset_version: BAIBAITU_TRAINING_PACK_SEED.asset_version,
      task_count: 30,
    },
  },
  [MANBEILIAN_PACK_ID]: {
    pack_id: MANBEILIAN_PACK_ID,
    title: "曼贝莲项目卡开口训练",
    subtitle: "苗药筋骨养护、春归液和门店项目卡安全表达",
    brand_code: "manbeilian",
    knowledge_space_id: MANBEILIAN_KNOWLEDGE_SPACE_ID,
    training_pack_mode: TRAINING_PACK_MODE_MANBEILIAN,
    version: "v1",
    status: "active",
    metadata: {
      source: "system_seed",
      local_fallback: true,
      asset_version: "manbeilian-knowledge-v1",
      task_count: 221,
      task_unit: "张",
      static_asset_root: "/voice-coach-assets/manbeilian-knowledge/v1",
    },
  },
}

function cleanText(value: unknown, max = 300) {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max) : text
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function createQuerySupabaseClient(fallback: SupabaseClient): QuerySupabaseClient {
  try {
    return createAdminSupabaseClient()
  } catch (_error) {
    return fallback
  }
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  )
}

function isDatabaseFeatureUnavailableError(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return isMissingTableError(error) || error?.code === "42501" || message.includes("permission denied")
}

function boolValue(value: unknown) {
  if (value === true || value === 1) return true
  const text = cleanText(value, 20).toLowerCase()
  return text === "1" || text === "true" || text === "yes"
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value, 300)
    if (text) return text
  }
  return ""
}

function normalizeStatus(value: unknown, fallback = "active") {
  return cleanText(value || fallback, 20) || fallback
}

function normalizeSpaceType(row: any, metadata: Record<string, unknown>): TrainingKnowledgeSpace["type"] {
  const raw = cleanText(row?.type || row?.knowledge_space_type || row?.scope_type || metadata.type, 40)
  if (raw === "common_generic") return "common_generic"
  if (raw === "brand_template" || raw === "brand" || raw === "demo") return "brand_template"
  return "store_custom"
}

function inferTrainingPackMode(row: any, metadata: Record<string, unknown>, featureFlags: Record<string, unknown>) {
  const explicit = firstTextValue(
    row?.training_pack_mode,
    row?.trainingPackMode,
    metadata.training_pack_mode,
    metadata.trainingPackMode,
    featureFlags.training_pack_mode,
    featureFlags.trainingPackMode,
  )
  if (explicit) return normalizeTrainingPackMode(explicit)

  const key = `${row?.code || ""} ${row?.brand_code || ""} ${row?.display_name || row?.name || ""}`.toLowerCase()
  if (key.includes("manbeilian") || key.includes("曼贝莲")) return TRAINING_PACK_MODE_MANBEILIAN
  if (key.includes("baibaitu") || key.includes("白白兔")) return TRAINING_PACK_MODE_BAIBAITU
  return TRAINING_PACK_MODE_COMMON
}

function contextCompanyIds(ctx: MpAccountContext | null) {
  return new Set([ctx?.companyId, ...(ctx?.memberships || []).map((item) => item.companyId)].filter(Boolean) as string[])
}

function contextStoreIds(ctx: MpAccountContext | null) {
  return new Set([ctx?.storeId, ...(ctx?.memberships || []).map((item) => item.storeId)].filter(Boolean) as string[])
}

function userScopeText(ctx: MpAccountContext | null) {
  return [
    ctx?.companyName,
    ctx?.storeName,
    ctx?.scopeLabel,
    ...(ctx?.memberships || []).flatMap((item) => [item.companyName, item.storeName]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value, 80))
}

function normalizeTrainingTask(value: unknown, packId?: string | null): TrainingTask | null {
  const source = normalizeMetadata(value)
  const id = cleanText(source.task_id || source.id, 160)
  if (!id) return null

  const trainingContext = normalizeMetadata(source.training_context)
  const customerLine = cleanText(
    source.customer_line ||
      source.customerLine ||
      source.customerConcern ||
      source.customer_concern ||
      trainingContext.customer_line,
    300,
  )
  const order = numberValue(source.order || source.dayIndex || source.day_index || source.pathDay || source.path_day, 0)
  const estimatedMinutes = numberValue(source.estimated_minutes || source.estimatedMinutes, 6) || 6

  return {
    ...source,
    id,
    task_id: id,
    title: cleanText(source.title || trainingContext.title, 120) || "训练任务",
    customer_line: customerLine,
    focus: cleanText(source.focus || trainingContext.focus || source.professionalKernel || source.professional_kernel, 240),
    order,
    estimated_minutes: estimatedMinutes,
    estimatedMinutes,
    training_context: {
      ...trainingContext,
      task_id: id,
      pack_id: cleanText(trainingContext.pack_id || packId, 160),
      title: cleanText(source.title || trainingContext.title, 120) || "训练任务",
      customer_line: customerLine,
      focus: cleanText(source.focus || trainingContext.focus || source.professionalKernel || source.professional_kernel, 240),
    },
  }
}

function normalizeTrainingTasks(value: unknown, packId?: string | null) {
  return (Array.isArray(value) ? value : [])
    .map((task) => normalizeTrainingTask(task, packId))
    .filter((task): task is TrainingTask => Boolean(task))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}

const STATIC_TASKS_BY_PACK: Record<string, TrainingTask[]> = {
  [COMMON_PACK_ID]: normalizeTrainingTasks(COMMON_TRAINING_PACK_SEED.tasks, COMMON_PACK_ID),
  [BAIBAITU_PACK_ID]: normalizeTrainingTasks(BAIBAITU_TRAINING_PACK_SEED.tasks, BAIBAITU_PACK_ID),
  [MANBEILIAN_PACK_ID]: [],
}

function getStaticTrainingPack(packId: string): TrainingPack | null {
  const pack = STATIC_PACKS[packId]
  if (!pack) return null
  return {
    ...pack,
    tasks_json: STATIC_TASKS_BY_PACK[packId] || [],
  }
}

function mergeTrainingPackWithStaticTasks(pack: TrainingPack | null, staticPack: TrainingPack | null) {
  if (!pack) return staticPack
  const packTasks = normalizeTrainingTasks(pack.tasks_json, pack.pack_id)
  const staticTasks = pack.pack_id === staticPack?.pack_id ? normalizeTrainingTasks(staticPack.tasks_json, staticPack.pack_id) : []
  return {
    ...staticPack,
    ...pack,
    metadata: {
      ...(staticPack?.metadata || {}),
      ...pack.metadata,
      task_count: packTasks.length || staticTasks.length || pack.metadata.task_count || staticPack?.metadata.task_count || 0,
    },
    tasks_json: packTasks.length ? packTasks : staticTasks,
  }
}

export function getRequestKnowledgeSpaceId(request: NextRequest) {
  const url = new URL(request.url)
  return (
    cleanText(url.searchParams.get("knowledge_space_id"), 120) ||
    cleanText(url.searchParams.get("knowledgeSpaceId"), 120) ||
    cleanText(request.headers.get("x-mp-active-knowledge-space-id"), 120)
  )
}

export function getRequestTrainingPackMode(request: NextRequest) {
  const url = new URL(request.url)
  return cleanText(url.searchParams.get("training_pack_mode"), 80) || cleanText(url.searchParams.get("trainingPackMode"), 80)
}

export function normalizeTrainingPackMode(mode: unknown) {
  const value = cleanText(mode, 80).toLowerCase()
  if (value === "baibaitu_speaking" || value === "speaking" || value === TRAINING_PACK_MODE_BAIBAITU) {
    return TRAINING_PACK_MODE_BAIBAITU
  }
  if (value === "manbeilian_speaking" || value === "manbeilian" || value === TRAINING_PACK_MODE_MANBEILIAN) {
    return TRAINING_PACK_MODE_MANBEILIAN
  }
  if (value === "generic" || value === "beauty" || value === "common" || value === TRAINING_PACK_MODE_COMMON) {
    return TRAINING_PACK_MODE_COMMON
  }
  return value || TRAINING_PACK_MODE_COMMON
}

function normalizeSpaceRow(row: any): TrainingKnowledgeSpace | null {
  const id = cleanText(row?.id, 120)
  if (!id) return null
  const metadata = {
    ...normalizeMetadata(row?.metadata),
    ...normalizeMetadata(row?.metadata_json),
  }
  const featureFlags = normalizeMetadata(row?.feature_flags)
  const type = normalizeSpaceType(row, metadata)
  const status = normalizeStatus(row?.status, "active") as TrainingKnowledgeSpace["status"]
  const brandCode = cleanText(row?.brand_code || metadata.brand_code || metadata.brandCode, 80)
  const code = cleanText(row?.code, 80) || id
  const staticDefault =
    code === "manbeilian" || brandCode === "manbeilian"
      ? MANBEILIAN_PACK_ID
      : code === "baibaitu" || brandCode === "baibaitu"
        ? BAIBAITU_PACK_ID
        : code === "common_beauty" || brandCode === "meiye_huajing"
          ? COMMON_PACK_ID
          : ""
  return {
    id,
    code,
    display_name: cleanText(row?.display_name || row?.name, 80) || id,
    type: type || "store_custom",
    company_id: cleanText(row?.company_id, 120) || null,
    store_id: cleanText(row?.store_id, 120) || null,
    brand_code: brandCode || null,
    default_pack_id: cleanText(row?.default_pack_id || metadata.default_pack_id || metadata.defaultPackId || staticDefault, 120),
    training_pack_mode: inferTrainingPackMode(row, metadata, featureFlags),
    version: cleanText(row?.version || metadata.version, 40) || "v1",
    status: status || "active",
    is_default: boolValue(row?.is_default),
    metadata: {
      ...metadata,
      feature_flags: featureFlags,
      scope_type: cleanText(row?.scope_type, 40) || metadata.scope_type,
    },
  }
}

function normalizePackRow(row: any, fallbackSpace: TrainingKnowledgeSpace): TrainingPack | null {
  const packId = cleanText(row?.pack_id || row?.id || fallbackSpace.default_pack_id, 120)
  if (!packId) return null
  const metadata = {
    ...normalizeMetadata(row?.metadata),
    ...normalizeMetadata(row?.metadata_json),
  }
  return {
    pack_id: packId,
    title: cleanText(row?.title, 100) || STATIC_PACKS[packId]?.title || fallbackSpace.display_name,
    subtitle: cleanText(row?.subtitle || metadata.subtitle, 180) || STATIC_PACKS[packId]?.subtitle || "",
    brand_code: cleanText(row?.brand_code || fallbackSpace.brand_code, 80),
    knowledge_space_id: cleanText(row?.knowledge_space_id || fallbackSpace.id, 120),
    training_pack_mode: normalizeTrainingPackMode(row?.training_pack_mode || fallbackSpace.training_pack_mode),
    version: cleanText(row?.version || metadata.version, 40) || fallbackSpace.version || "v1",
    status: (cleanText(row?.status || "active", 20) || "active") as TrainingPack["status"],
    metadata,
    tasks_json: normalizeTrainingTasks(row?.tasks_json, packId),
  }
}

function normalizeVoiceTrainingTaskRow(row: any, pack: TrainingPack): TrainingTask | null {
  const id = cleanText(row?.id, 160)
  if (!id) return null
  const customerPersona = normalizeMetadata(row?.customer_persona_json)
  const visibleGoal = Array.isArray(row?.visible_goal_json) ? row.visible_goal_json : []
  const mustCoverPoints = Array.isArray(row?.must_cover_points_json) ? row.must_cover_points_json : []
  const forbiddenPhrases = Array.isArray(row?.forbidden_phrases_json) ? row.forbidden_phrases_json : []
  const reward = normalizeMetadata(row?.reward_json)
  const rubric = normalizeMetadata(row?.rubric_json)
  const title = cleanText(row?.title, 120) || "训练任务"
  const focus = cleanText(row?.focus || customerPersona.focus, 240)
  const customerLine = firstTextValue(
    customerPersona.customer_line,
    customerPersona.customerLine,
    customerPersona.line,
    customerPersona.concern,
    customerPersona.hidden_concern,
    customerPersona.hiddenConcern,
  )
  const dayIndex = numberValue(row?.day_index, 0)
  return {
    id,
    task_id: id,
    title,
    customer_line: customerLine,
    focus,
    order: dayIndex,
    dayIndex,
    pathDay: dayIndex,
    estimated_minutes: numberValue(row?.estimated_minutes, 6) || 6,
    estimatedMinutes: numberValue(row?.estimated_minutes, 6) || 6,
    customer_persona: customerPersona,
    visible_goal: visibleGoal,
    must_cover_points: mustCoverPoints,
    forbidden_phrases: forbiddenPhrases,
    reward,
    rubric,
    training_context: {
      task_id: id,
      pack_id: pack.pack_id,
      pack_title: pack.title,
      brand_code: pack.brand_code,
      training_pack_mode: pack.training_pack_mode,
      title,
      focus,
      customer_line: customerLine,
      customer_persona: customerPersona,
      visible_goal: visibleGoal,
      must_cover_points: mustCoverPoints,
      forbidden_phrases: forbiddenPhrases,
      reward,
      rubric,
    },
  }
}

function uniqueSpaces(spaces: TrainingKnowledgeSpace[]) {
  const seen = new Set<string>()
  const result: TrainingKnowledgeSpace[] = []
  for (const space of spaces) {
    const keys = [space.id ? `id:${space.id}` : "", space.code ? `code:${space.code}` : ""].filter(Boolean)
    if (!space.id || space.status !== "active" || keys.some((key) => seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
    result.push(space)
  }
  return result
}

function isBaibaituRequested(activeId: string, ctx: MpAccountContext | null) {
  if (activeId === BAIBAITU_KNOWLEDGE_SPACE_ID) return true
  const scopeText = userScopeText(ctx)
  return scopeText.includes("白白兔") || scopeText.includes("baibaitu")
}

function includeBaibaituSeed(activeId: string, ctx: MpAccountContext | null) {
  const env = cleanText(process.env.VOICE_COACH_ENABLE_BAIBAITU_SEED, 20).toLowerCase()
  if (env === "0" || env === "false") return isBaibaituRequested(activeId, ctx)
  return true
}

function isManbeilianRequested(activeId: string, ctx: MpAccountContext | null) {
  if (activeId === MANBEILIAN_KNOWLEDGE_SPACE_ID) return true
  const scopeText = userScopeText(ctx)
  return scopeText.includes("曼贝莲") || scopeText.includes("manbeilian")
}

function includeManbeilianSeed(activeId: string, ctx: MpAccountContext | null) {
  const env = cleanText(process.env.VOICE_COACH_ENABLE_MANBEILIAN_SEED, 20).toLowerCase()
  if (env === "1" || env === "true") return true
  return Boolean(ctx?.isPlatformAdmin) || isManbeilianRequested(activeId, ctx)
}

function canAccessKnowledgeSpace(
  space: TrainingKnowledgeSpace,
  ctx: MpAccountContext | null,
  explicitAccessIds: Set<string>,
) {
  if (space.type === "common_generic") return true
  if (ctx?.isPlatformAdmin) return true
  if (explicitAccessIds.has(space.id)) return true

  const companyIds = contextCompanyIds(ctx)
  const storeIds = contextStoreIds(ctx)
  if (space.store_id && storeIds.has(space.store_id)) return true
  if (space.company_id && companyIds.has(space.company_id)) return true
  return false
}

async function getExplicitKnowledgeSpaceAccessIds(supabase: QuerySupabaseClient, ctx: MpAccountContext | null) {
  if (!ctx?.userId) return new Set<string>()
  const { data, error } = await supabase
    .from("mp_knowledge_space_access")
    .select("knowledge_space_id, status, expires_at")
    .eq("user_id", ctx.userId)
    .eq("status", "active")

  if (error && isDatabaseFeatureUnavailableError(error)) return new Set<string>()
  if (error) throw error

  const now = Date.now()
  return new Set<string>(
    ((data || []) as KnowledgeSpaceAccessRow[])
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
      .map((row) => cleanText(row.knowledge_space_id, 120))
      .filter((id): id is string => Boolean(id)),
  )
}

async function listMpKnowledgeSpaces(args: {
  supabase: QuerySupabaseClient
  ctx: MpAccountContext | null
}) {
  const { data, error } = await args.supabase
    .from("mp_knowledge_spaces")
    .select("*")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error && isDatabaseFeatureUnavailableError(error)) return []
  if (error) throw error

  const explicitAccessIds = await getExplicitKnowledgeSpaceAccessIds(args.supabase, args.ctx)
  return ((data || []) as unknown[])
    .map((row) => normalizeSpaceRow(row))
    .filter((space: TrainingKnowledgeSpace | null): space is TrainingKnowledgeSpace =>
      Boolean(space && canAccessKnowledgeSpace(space, args.ctx, explicitAccessIds)),
    )
}

async function listLegacyKnowledgeSpaces(args: {
  supabase: QuerySupabaseClient
  ctx: MpAccountContext | null
}) {
  const { data, error } = await args.supabase
    .from("voice_coach_knowledge_spaces")
    .select("*")
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })

  if (error && isDatabaseFeatureUnavailableError(error)) return []
  if (error) throw error

  return ((data || []) as unknown[])
    .map((row) => normalizeSpaceRow(row))
    .filter((space: TrainingKnowledgeSpace | null): space is TrainingKnowledgeSpace =>
      Boolean(space && canAccessKnowledgeSpace(space, args.ctx, new Set<string>())),
    )
}

export async function listKnowledgeSpaces(args: {
  supabase: SupabaseClient
  ctx: MpAccountContext | null
  activeKnowledgeSpaceId?: string
}) {
  const activeId = cleanText(args.activeKnowledgeSpaceId, 120)
  const seedSpaces = DEFAULT_SPACES.filter((space) => {
    if (space.id === BAIBAITU_KNOWLEDGE_SPACE_ID) return includeBaibaituSeed(activeId, args.ctx)
    if (space.id === MANBEILIAN_KNOWLEDGE_SPACE_ID) return includeManbeilianSeed(activeId, args.ctx)
    return true
  })
  const supabase = createQuerySupabaseClient(args.supabase)
  const mpSpaces = await listMpKnowledgeSpaces({ supabase, ctx: args.ctx })
  const legacySpaces = await listLegacyKnowledgeSpaces({ supabase, ctx: args.ctx })

  return uniqueSpaces([...mpSpaces, ...legacySpaces, ...seedSpaces])
}

export function resolveActiveKnowledgeSpace(spaces: TrainingKnowledgeSpace[], requestedId?: string | null, requestedMode?: string | null) {
  const id = cleanText(requestedId, 120)
  const mode = cleanText(requestedMode, 80)
  const normalizedMode = mode ? normalizeTrainingPackMode(mode) : ""
  return (
    spaces.find((space) => space.id === id) ||
    spaces.find((space) => normalizedMode && normalizeTrainingPackMode(space.training_pack_mode) === normalizedMode) ||
    spaces.find((space) => space.is_default) ||
    spaces[0] ||
    null
  )
}

export async function resolveTrainingPack(args: {
  supabase: SupabaseClient
  space: TrainingKnowledgeSpace
}) {
  const staticPack = getStaticTrainingPack(args.space.default_pack_id)
  const supabase = createQuerySupabaseClient(args.supabase)
  const { data: packData, error: packError } = await supabase
    .from("voice_training_packs")
    .select("*")
    .eq("brand_code", args.space.brand_code || "")
    .eq("pack_id", args.space.default_pack_id)
    .in("status", ["active", "published"])
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!packError && packData) {
    const normalizedPack = mergeTrainingPackWithStaticTasks(normalizePackRow(packData, args.space), staticPack)
    if (!normalizedPack) return staticPack || normalizePackRow(null, args.space)

    const { data: taskData, error: taskError } = await supabase
      .from("voice_training_tasks")
      .select("*")
      .eq("brand_code", normalizedPack.brand_code)
      .eq("pack_id", normalizedPack.pack_id)
      .in("status", ["active", "published"])
      .order("day_index", { ascending: true })

    if (!taskError && taskData) {
      const tasks = ((taskData || []) as unknown[])
        .map((task) => normalizeVoiceTrainingTaskRow(task, normalizedPack))
        .filter((task: TrainingTask | null): task is TrainingTask => Boolean(task))
      return {
        ...normalizedPack,
        metadata: {
          ...normalizedPack.metadata,
          task_count: tasks.length || normalizedPack.metadata.task_count || 0,
        },
        tasks_json: tasks.length ? tasks : normalizedPack.tasks_json,
      }
    }
    if (taskError && !isDatabaseFeatureUnavailableError(taskError)) throw taskError
    return normalizedPack
  }
  if (packError && !isDatabaseFeatureUnavailableError(packError)) throw packError

  const { data, error } = await supabase
    .from("voice_coach_training_packs")
    .select("*")
    .eq("status", "active")
    .eq("knowledge_space_id", args.space.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!error && data) return mergeTrainingPackWithStaticTasks(normalizePackRow(data, args.space), staticPack)
  if (error && !isDatabaseFeatureUnavailableError(error)) throw error
  return staticPack || normalizePackRow(null, args.space)
}

function normalizeProgressRow(row: any) {
  if (!row) return null
  const progressJson = normalizeMetadata(row.progress_json)
  return {
    ...row,
    user_id: row.staff_user_id || row.user_id,
    completed_task_ids: normalizeMetadata(row.completed_task_ids || progressJson.completed_task_ids),
    progress_json: progressJson,
  }
}

export async function getTrainingProgress(args: {
  supabase: SupabaseClient
  userId: string
  knowledgeSpaceId: string
  packId: string
}) {
  if (isUuid(args.knowledgeSpaceId)) {
    const { data, error } = await args.supabase
      .from("voice_training_progress")
      .select("*")
      .eq("staff_user_id", args.userId)
      .eq("knowledge_space_id", args.knowledgeSpaceId)
      .eq("pack_id", args.packId)
      .maybeSingle()

    if (!error && data) return normalizeProgressRow(data)
    if (error && !isDatabaseFeatureUnavailableError(error)) throw error
  }

  const { data, error } = await args.supabase
    .from("voice_coach_training_progress")
    .select("*")
    .eq("user_id", args.userId)
    .eq("knowledge_space_id", args.knowledgeSpaceId)
    .eq("pack_id", args.packId)
    .maybeSingle()

  if (!error && data) return data
  if (error && !isDatabaseFeatureUnavailableError(error)) throw error
  return null
}

export function buildProgressPayload(progress: any, task: TrainingTask | null) {
  const progressJson = normalizeMetadata(progress?.progress_json)
  const completedTaskIds = getProgressCompletedTaskIds(progress)
  return {
    id: progress?.id || null,
    knowledge_space_id: progress?.knowledge_space_id || null,
    pack_id: progress?.pack_id || null,
    current_task_id: cleanText(progress?.current_task_id, 120) || task?.task_id || "",
    completed_task_ids: completedTaskIds,
    progress_json: progressJson,
    completed_count: Object.keys(completedTaskIds).length,
    updated_at: progress?.updated_at || null,
    last_completed_at: progress?.last_completed_at || null,
  }
}

export function getStaticTask(packId: string, taskId?: string | null) {
  const tasks = STATIC_TASKS_BY_PACK[packId] || []
  const id = cleanText(taskId, 120)
  return (id ? tasks.find((task) => task.task_id === id || task.id === id) : null) || tasks[0] || null
}

export function getTrainingTasks(pack: TrainingPack | null) {
  if (!pack) return []
  const packTasks = normalizeTrainingTasks(pack.tasks_json, pack.pack_id)
  if (packTasks.length) return packTasks
  return STATIC_TASKS_BY_PACK[pack.pack_id] || []
}

export function getTrainingTask(pack: TrainingPack, taskId?: string | null) {
  const id = cleanText(taskId, 120)
  const tasks = getTrainingTasks(pack)
  const task = id ? tasks.find((item) => item.task_id === id || item.id === id) : tasks[0] || null
  if (!id || task) return task
  if (!id) return null

  return {
    task_id: id,
    id,
    title: "训练任务",
    customer_line: "",
    focus: "按当前训练卡片要求完成 AI 对练。",
    order: 0,
    estimated_minutes: 6,
    training_context: {
      task_id: id,
      pack_id: pack.pack_id,
      pack_title: pack.title,
      training_pack_mode: pack.training_pack_mode,
      title: "训练任务",
      focus: "按当前训练卡片要求完成 AI 对练。",
    },
  }
}

function getProgressCompletedTaskIds(progress: any) {
  const progressJson = normalizeMetadata(progress?.progress_json)
  return normalizeMetadata(progress?.completed_task_ids || progressJson.completed_task_ids)
}

function getProgressTaskResults(progress: any) {
  const progressJson = normalizeMetadata(progress?.progress_json)
  return normalizeMetadata(progress?.task_results || progressJson.task_results)
}

export function getCurrentTrainingTask(pack: TrainingPack, progress: any) {
  const tasks = getTrainingTasks(pack)
  if (!tasks.length) return null
  const completedTaskIds = getProgressCompletedTaskIds(progress)
  const currentTaskId = cleanText(progress?.current_task_id || normalizeMetadata(progress?.progress_json).current_task_id, 160)
  return (
    tasks.find((task) => currentTaskId && (task.task_id === currentTaskId || task.id === currentTaskId)) ||
    tasks.find((task) => !completedTaskIds[task.task_id] && !completedTaskIds[task.id]) ||
    tasks[0] ||
    null
  )
}

function buildTrainingTaskViews(tasks: TrainingTask[], progress: any, currentTask: TrainingTask | null) {
  const completedTaskIds = getProgressCompletedTaskIds(progress)
  const taskResults = getProgressTaskResults(progress)
  const currentTaskId = cleanText(currentTask?.task_id || currentTask?.id, 160)

  return tasks.map((task) => {
    const taskId = cleanText(task.task_id || task.id, 160)
    const result = normalizeMetadata(taskResults[taskId])
    const completed = Boolean(completedTaskIds[taskId])
    const active = Boolean(currentTaskId && taskId === currentTaskId)
    const bestScore = numberValue(result.best_score || result.score || result.last_score, 0)
    const bestStars = Math.max(0, Math.min(3, numberValue(result.best_stars || result.stars, 0)))

    return {
      ...task,
      completed,
      locked: false,
      active,
      best_score: bestScore,
      bestScore,
      best_stars: bestStars,
      bestStars,
      best_session_id: cleanText(result.best_session_id || result.session_id, 160),
      bestSessionId: cleanText(result.best_session_id || result.session_id, 160),
      status_label: completed ? "已通关" : active ? "今日训练" : "可选择",
      statusLabel: completed ? "已通关" : active ? "今日训练" : "可选择",
      status_class: completed ? "is-done" : active ? "is-current" : "is-open",
      statusClass: completed ? "is-done" : active ? "is-current" : "is-open",
      action_text: completed ? "复练这一关" : active ? "开始今日训练" : "选择训练",
      actionText: completed ? "复练这一关" : active ? "开始今日训练" : "选择训练",
    }
  })
}

export function serializeTrainingPack(pack: TrainingPack, taskCount?: number) {
  const { tasks_json: _tasksJson, ...publicPack } = pack
  return {
    ...publicPack,
    task_count: typeof taskCount === "number" ? taskCount : getTrainingTasks(pack).length,
  }
}

export function shouldAllowLocalFallback(space: TrainingKnowledgeSpace, pack: TrainingPack | null) {
  const metadata = {
    ...normalizeMetadata(space.metadata),
    ...normalizeMetadata(pack?.metadata),
  }
  const mode = normalizeTrainingPackMode(space.training_pack_mode || pack?.training_pack_mode)
  return Boolean(
    metadata.local_fallback ||
      space.id === BAIBAITU_KNOWLEDGE_SPACE_ID ||
      space.id === MANBEILIAN_KNOWLEDGE_SPACE_ID ||
      mode === TRAINING_PACK_MODE_BAIBAITU ||
      mode === TRAINING_PACK_MODE_MANBEILIAN,
  )
}

export function buildTrainingHomeResponse(args: {
  space: TrainingKnowledgeSpace
  pack: TrainingPack
  progress: any
  task: TrainingTask | null
}) {
  const tasks = getTrainingTasks(args.pack)
  const currentTask = args.task || getCurrentTrainingTask(args.pack, args.progress)
  const taskViews = buildTrainingTaskViews(tasks, args.progress, currentTask)
  const currentTaskView = taskViews.find((task) => currentTask && task.task_id === currentTask.task_id) || taskViews[0] || null
  const visible = taskViews.length > 0
  const allowLocalFallback = shouldAllowLocalFallback(args.space, args.pack)
  return {
    ok: true,
    visible,
    allow_local_fallback: allowLocalFallback,
    content_version: cleanText(args.pack.metadata.content_version, 80),
    asset_version: cleanText(args.pack.metadata.asset_version, 80),
    task_count: taskViews.length,
    total_count: taskViews.length,
    active_knowledge_space_id: args.space.id,
    active_knowledge_space: args.space,
    knowledge_spaces: undefined,
    pack: serializeTrainingPack(args.pack, taskViews.length),
    progress: buildProgressPayload(args.progress, currentTaskView),
    current_task: currentTaskView,
    currentTask: currentTaskView,
    tasks: taskViews,
  }
}

export function buildTrainingSetup(args: {
  space: TrainingKnowledgeSpace
  pack: TrainingPack
  task: TrainingTask
}) {
  return {
    training_task_id: args.task.task_id,
    training_pack_id: args.pack.pack_id,
    training_brand_code: args.pack.brand_code,
    training_knowledge_space_id: args.space.id,
    training_context: {
      ...args.task.training_context,
      knowledge_space_id: args.space.id,
      knowledge_space_name: args.space.display_name,
      pack_id: args.pack.pack_id,
      pack_title: args.pack.title,
      training_pack_mode: args.pack.training_pack_mode,
    },
    training_task_preview: {
      title: args.task.title,
      customer_line: args.task.customer_line,
      focus: args.task.focus,
    },
  }
}

export function extractTrainingContextFromSession(session: any) {
  const sessionContext = normalizeMetadata(session?.session_context_json)
  const snapshot = normalizeMetadata(session?.scenario_snapshot_json)
  const context = normalizeMetadata(sessionContext.training_context || snapshot.training_context)
  const taskId = cleanText(context.task_id || context.training_task_id || sessionContext.training_task_id, 120)
  const packId = cleanText(context.pack_id || context.training_pack_id || sessionContext.training_pack_id, 120)
  const knowledgeSpaceId = cleanText(
    context.knowledge_space_id || context.training_knowledge_space_id || sessionContext.training_knowledge_space_id,
    120,
  )
  return {
    context,
    taskId,
    packId,
    knowledgeSpaceId,
  }
}

function brandCodeFromPackId(packId: string) {
  if (packId === MANBEILIAN_PACK_ID || packId.includes("manbeilian")) return "manbeilian"
  if (packId === BAIBAITU_PACK_ID || packId.includes("baibaitu")) return "baibaitu"
  return "meiye_huajing"
}

export async function markTrainingTaskComplete(args: {
  supabase: SupabaseClient
  userId: string
  companyId?: string | null
  storeId?: string | null
  membershipId?: string | null
  knowledgeSpaceId: string
  packId: string
  taskId: string
  sessionId: string
  score?: number | null
}) {
  const existing = await getTrainingProgress({
    supabase: args.supabase,
    userId: args.userId,
    knowledgeSpaceId: args.knowledgeSpaceId,
    packId: args.packId,
  })
  const now = new Date().toISOString()
  const completedTaskIds = {
    ...normalizeMetadata(existing?.completed_task_ids),
    [args.taskId]: true,
  }
  const existingProgressJson = normalizeMetadata(existing?.progress_json)
  const existingTaskResults = normalizeMetadata(existingProgressJson.task_results)
  const existingTaskResult = normalizeMetadata(existingTaskResults[args.taskId])
  const score = typeof args.score === "number" ? args.score : null
  const bestScore = score === null ? numberValue(existingTaskResult.best_score, 0) : Math.max(score, numberValue(existingTaskResult.best_score, 0))
  const taskResults = {
    ...existingTaskResults,
    [args.taskId]: {
      completed: true,
      session_id: args.sessionId,
      last_completed_at: now,
      score,
      best_score: bestScore,
    },
  }
  const progressJson = {
    ...existingProgressJson,
    completed_task_ids: completedTaskIds,
    task_results: taskResults,
    last_session_id: args.sessionId,
    last_task_id: args.taskId,
    last_score: score,
  }
  const payload = {
    user_id: args.userId,
    company_id: args.companyId || null,
    store_id: args.storeId || null,
    membership_id: args.membershipId || null,
    knowledge_space_id: args.knowledgeSpaceId,
    pack_id: args.packId,
    current_task_id: args.taskId,
    completed_task_ids: completedTaskIds,
    progress_json: progressJson,
    last_completed_at: now,
    updated_at: now,
  }
  const writeSupabase = createQuerySupabaseClient(args.supabase)

  if (isUuid(args.knowledgeSpaceId)) {
    const newProgressPayload = {
      brand_code: brandCodeFromPackId(args.packId),
      pack_id: args.packId,
      staff_user_id: args.userId,
      company_id: args.companyId || null,
      store_id: args.storeId || null,
      membership_id: args.membershipId || null,
      knowledge_space_id: args.knowledgeSpaceId,
      current_task_id: args.taskId,
      completed_task_count: Object.keys(completedTaskIds).length,
      stars_total: numberValue(existing?.stars_total, 0),
      reward_count: numberValue(existing?.reward_count, 0),
      progress_json: progressJson,
      last_completed_at: now,
      updated_at: now,
    }

    const { data: newProgress, error: newProgressError } = await writeSupabase
      .from("voice_training_progress")
      .upsert(newProgressPayload, { onConflict: "knowledge_space_id,pack_id,staff_user_id" })
      .select("*")
      .single()

    if (!newProgressError) {
      return { ok: true, progress: buildProgressPayload(normalizeProgressRow(newProgress), null), persisted: true }
    }
    if (!isDatabaseFeatureUnavailableError(newProgressError)) throw newProgressError
  }

  const { data, error } = await writeSupabase
    .from("voice_coach_training_progress")
    .upsert(payload, { onConflict: "user_id,knowledge_space_id,pack_id" })
    .select("*")
    .single()

  if (error && isDatabaseFeatureUnavailableError(error)) {
    return { ok: true, progress: buildProgressPayload(null, null), persisted: false }
  }
  if (error) throw error
  return { ok: true, progress: buildProgressPayload(data, null), persisted: true }
}
