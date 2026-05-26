import "server-only"

import { NextRequest, NextResponse } from "next/server"

import type { MpAccountContext } from "@/lib/mp/account-context.server"
import { resolveBaibaituTrainingAccess } from "@/lib/voice-training/baibaitu.server"

type SupabaseAdmin = any

type AuthUserLike = {
  id: string
  email?: string | null
}

export type MpKnowledgeSpaceOption = {
  id: string
  code: string
  displayName: string
  brandCode: string
  defaultPackId: string
  scopeType: string
  companyId: string | null
  storeId: string | null
  status: string
  features: Record<string, any>
  metadata: Record<string, any>
  sortOrder: number
  accessRole: string
  source: string
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max) : text
}

function recordFromJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function isMissingColumnOrTable(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  )
}

function optionFromRow(row: any, accessRole = "viewer", source = "access"): MpKnowledgeSpaceOption | null {
  const id = cleanText(row?.id, 80)
  const code = cleanText(row?.code, 80)
  const displayName = cleanText(row?.display_name || row?.displayName, 80)
  const brandCode = cleanText(row?.brand_code || row?.brandCode, 40)
  const defaultPackId = cleanText(row?.default_pack_id || row?.defaultPackId, 80)
  if (!id || !code || !displayName || !brandCode) return null
  return {
    id,
    code,
    displayName,
    brandCode,
    defaultPackId,
    scopeType: cleanText(row?.scope_type || row?.scopeType, 40) || "brand",
    companyId: row?.company_id || row?.companyId || null,
    storeId: row?.store_id || row?.storeId || null,
    status: cleanText(row?.status, 40) || "active",
    features: recordFromJson(row?.feature_flags || row?.features),
    metadata: recordFromJson(row?.metadata_json || row?.metadata),
    sortOrder: Number(row?.sort_order || row?.sortOrder || 100) || 100,
    accessRole,
    source,
  }
}

function sortOptions(options: MpKnowledgeSpaceOption[]) {
  return options
    .slice()
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.displayName.localeCompare(right.displayName, "zh-CN")
    })
}

function isAccessActive(row: any) {
  if (cleanText(row?.status, 40) !== "active") return false
  const expiresAt = row?.expires_at ? Date.parse(String(row.expires_at)) : 0
  return !expiresAt || expiresAt > Date.now()
}

async function listExplicitKnowledgeSpaces(args: {
  admin: SupabaseAdmin
  userId: string
}) {
  const access = await args.admin
    .from("mp_knowledge_space_access")
    .select("knowledge_space_id, role, status, expires_at")
    .eq("user_id", args.userId)
    .eq("status", "active")

  if (access.error) {
    if (isMissingColumnOrTable(access.error)) return { missing: true, options: [] as MpKnowledgeSpaceOption[] }
    throw access.error
  }

  const activeAccessRows = ((access.data || []) as any[]).filter(isAccessActive)
  const ids = Array.from(new Set(activeAccessRows.map((row) => cleanText(row.knowledge_space_id, 80)).filter(Boolean)))
  if (!ids.length) return { missing: false, options: [] as MpKnowledgeSpaceOption[] }

  const spaces = await args.admin
    .from("mp_knowledge_spaces")
    .select("id, code, display_name, brand_code, default_pack_id, scope_type, company_id, store_id, status, feature_flags, metadata_json, sort_order")
    .in("id", ids)
    .eq("status", "active")

  if (spaces.error) {
    if (isMissingColumnOrTable(spaces.error)) return { missing: true, options: [] as MpKnowledgeSpaceOption[] }
    throw spaces.error
  }

  const accessBySpaceId = new Map(activeAccessRows.map((row) => [cleanText(row.knowledge_space_id, 80), cleanText(row.role, 40) || "viewer"]))
  const options = ((spaces.data || []) as any[])
    .map((row) => optionFromRow(row, accessBySpaceId.get(cleanText(row.id, 80)) || "viewer", "access"))
    .filter(Boolean) as MpKnowledgeSpaceOption[]

  return { missing: false, options: sortOptions(options) }
}

async function listPlatformKnowledgeSpaces(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
}) {
  if (!args.ctx.isPlatformAdmin) return [] as MpKnowledgeSpaceOption[]

  const spaces = await args.admin
    .from("mp_knowledge_spaces")
    .select("id, code, display_name, brand_code, default_pack_id, scope_type, company_id, store_id, status, feature_flags, metadata_json, sort_order")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true })

  if (spaces.error) {
    if (isMissingColumnOrTable(spaces.error)) return [] as MpKnowledgeSpaceOption[]
    throw spaces.error
  }

  return sortOptions(
    ((spaces.data || []) as any[])
      .map((row) => optionFromRow(row, "admin", "platform_admin"))
      .filter(Boolean) as MpKnowledgeSpaceOption[],
  )
}

async function listLegacyBaibaituOption(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
}) {
  const access = await resolveBaibaituTrainingAccess(args)
  if (!access.enabled) return []

  const existing = await args.admin
    .from("mp_knowledge_spaces")
    .select("id, code, display_name, brand_code, default_pack_id, scope_type, company_id, store_id, status, feature_flags, metadata_json, sort_order")
    .eq("code", "baibaitu")
    .eq("status", "active")
    .maybeSingle()

  if (!existing.error && existing.data) {
    const option = optionFromRow(existing.data, "viewer", `legacy_${access.source}`)
    return option ? [option] : []
  }

  if (existing.error && !isMissingColumnOrTable(existing.error)) throw existing.error

  return [
    {
      id: "",
      code: "baibaitu",
      displayName: "白白兔",
      brandCode: "baibaitu",
      defaultPackId: "baibaitu_onboarding_v1",
      scopeType: "brand",
      companyId: args.ctx.companyId,
      storeId: args.ctx.storeId,
      status: "active",
      features: { voice_training: true },
      metadata: { subtitle: "白白兔新人训练营" },
      sortOrder: 10,
      accessRole: "viewer",
      source: `legacy_${access.source}`,
    },
  ]
}

export async function listMpKnowledgeSpaceOptions(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
}) {
  const explicit = await listExplicitKnowledgeSpaces({ admin: args.admin, userId: args.user.id })
  if (explicit.options.length) return explicit.options

  const platformOptions = await listPlatformKnowledgeSpaces({ admin: args.admin, ctx: args.ctx })
  if (platformOptions.length) return platformOptions

  const legacy = await listLegacyBaibaituOption(args)
  if (legacy.length) return legacy

  if (explicit.missing) return []
  return []
}

export function getKnowledgeSpaceRequestId(request: NextRequest, fallback?: unknown) {
  const headerValue = request.headers.get("x-mp-active-knowledge-space-id")
  const url = new URL(request.url)
  return cleanText(
    fallback ||
      headerValue ||
      url.searchParams.get("active_knowledge_space_id") ||
      url.searchParams.get("knowledge_space_id"),
    80,
  )
}

export function knowledgeSpacePayload(space: MpKnowledgeSpaceOption | null) {
  if (!space) return null
  return {
    id: space.id,
    code: space.code,
    display_name: space.displayName,
    brand_code: space.brandCode,
    default_pack_id: space.defaultPackId,
    scope_type: space.scopeType,
    company_id: space.companyId,
    store_id: space.storeId,
    features: space.features,
    metadata: space.metadata,
    access_role: space.accessRole,
    source: space.source,
  }
}

export async function resolveActiveKnowledgeSpace(args: {
  admin: SupabaseAdmin
  request: NextRequest
  ctx: MpAccountContext
  user: AuthUserLike
  fallbackKnowledgeSpaceId?: unknown
  required?: boolean
}): Promise<
  | { ok: true; active: MpKnowledgeSpaceOption | null; options: MpKnowledgeSpaceOption[]; requestedId: string }
  | { ok: false; error: Response }
> {
  const options = await listMpKnowledgeSpaceOptions({
    admin: args.admin,
    ctx: args.ctx,
    user: args.user,
  })
  const requestedId = getKnowledgeSpaceRequestId(args.request, args.fallbackKnowledgeSpaceId)

  if (requestedId) {
    const active = options.find((option) => option.id === requestedId || option.code === requestedId) || null
    if (!active) {
      return {
        ok: false,
        error: NextResponse.json(
          { ok: false, error: "当前账号无权访问该知识库", code: "knowledge_space_forbidden" },
          { status: 403 },
        ),
      }
    }
    return { ok: true, active, options, requestedId }
  }

  const active = options[0] || null
  if (args.required && !active) {
    return {
      ok: false,
      error: NextResponse.json(
        { ok: false, error: "当前账号暂未开通知识库", code: "knowledge_space_required" },
        { status: 403 },
      ),
    }
  }

  return { ok: true, active, options, requestedId }
}
