import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError,
  queryAliyunRds,
} from "@/lib/aliyun-rds/postgres.server"
import {
  accountContextPayload,
  getAliyunRdsAppAccountContext,
  type AppAccountContext,
} from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

const KNOWLEDGE_SPACE_KINDS = new Set([
  "customer_template",
  "professional_learning",
  "speech_library",
  "customer_private",
])

type JsonRecord = Record<string, unknown>

type KnowledgeSpaceRow = {
  id: string
  code: string | null
  display_name: string | null
  brand_code: string | null
  default_pack_id: string | null
  scope_type: string | null
  company_id: string | null
  store_id: string | null
  status: string | null
  feature_flags: unknown
  metadata_json: unknown
  sort_order: number | null
  created_at: string | null
  updated_at: string | null
}

type KnowledgeSpaceStats = {
  groupCount: number
  cardCount: number
  imageCount: number
  hiddenGroupCount?: number
  hiddenImageCount?: number
}

type KnowledgeSpaceManifest = {
  schemaVersion: 1
  id: string
  kind: string
  title: string
  subtitle?: string | null
  version: string
  stats: KnowledgeSpaceStats
  groups: unknown[]
}

type KnowledgeSpaceSummary = {
  id: string
  kind: string
  title: string
  subtitle: string | null
  version: string
  stats: KnowledgeSpaceStats
}

type KnowledgeSpaceScope = {
  companyId: string | null
  storeId: string | null
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function cleanText(value: unknown, max = 180) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function uuidOrNull(value: unknown) {
  const text = cleanText(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function resolveKnowledgeSpaceScope(
  ctx: AppAccountContext,
  request: NextRequest,
): KnowledgeSpaceScope | { error: NextResponse } {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  if (!ctx.isPlatformAdmin && requestedCompanyId && requestedCompanyId !== ctx.companyId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!ctx.isPlatformAdmin && ctx.storeId && requestedStoreId && requestedStoreId !== ctx.storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  return {
    companyId: ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId,
    storeId: ctx.isPlatformAdmin && requestedStoreId ? requestedStoreId : ctx.storeId,
  }
}

function knowledgeSpaceErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  return jsonError(500, error instanceof Error ? error.message : fallbackCode, fallbackCode)
}

function isKnowledgeSpacesSchemaMissing(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "")
  const message = String((error as { message?: unknown })?.message || "")
  return (code === "42P01" || code === "42703" || /does not exist|column .* does not exist/i.test(message)) &&
    /mp_knowledge_spaces|mp_knowledge_space_access/i.test(message)
}

function isKnowledgeSpaceManifest(value: unknown): value is KnowledgeSpaceManifest {
  if (!isRecord(value)) return false
  const stats = recordValue(value.stats)
  return value.schemaVersion === 1 &&
    Boolean(cleanText(value.id, 180)) &&
    Boolean(cleanText(value.kind, 80)) &&
    Boolean(cleanText(value.title, 200)) &&
    Boolean(cleanText(value.version, 80)) &&
    Array.isArray(value.groups) &&
    Number.isFinite(Number(stats.groupCount)) &&
    Number.isFinite(Number(stats.cardCount)) &&
    Number.isFinite(Number(stats.imageCount))
}

function findManifest(row: KnowledgeSpaceRow) {
  const metadata = recordValue(row.metadata_json)
  for (const key of ["app_manifest", "knowledge_manifest", "knowledge_space_manifest", "manifest"]) {
    const candidate = metadata[key]
    if (isKnowledgeSpaceManifest(candidate)) return candidate
  }
  return isKnowledgeSpaceManifest(metadata) ? metadata : null
}

function normalizeKind(value: unknown) {
  const kind = cleanText(value, 80)
  return KNOWLEDGE_SPACE_KINDS.has(kind) ? kind : "customer_template"
}

function summaryFromManifest(manifest: KnowledgeSpaceManifest): KnowledgeSpaceSummary {
  return {
    id: manifest.id,
    kind: normalizeKind(manifest.kind),
    title: manifest.title,
    subtitle: manifest.subtitle ?? null,
    version: manifest.version,
    stats: manifest.stats,
  }
}

function summaryFromRow(row: KnowledgeSpaceRow): KnowledgeSpaceSummary | null {
  const manifest = findManifest(row)
  if (manifest) return summaryFromManifest(manifest)
  return null
}

function isKnowledgeSpaceSummary(value: KnowledgeSpaceSummary | null): value is KnowledgeSpaceSummary {
  return Boolean(value)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const scope = resolveKnowledgeSpaceScope(ctx, request)
    if ("error" in scope) return scope.error

    const result = await queryAliyunRds<KnowledgeSpaceRow>(
      `
        select
          space.id,
          space.code,
          space.display_name,
          space.brand_code,
          space.default_pack_id,
          space.scope_type,
          space.company_id,
          space.store_id,
          space.status,
          space.feature_flags,
          space.metadata_json,
          space.sort_order,
          space.created_at,
          space.updated_at
        from public.mp_knowledge_spaces space
        where space.status = 'active'
          and (
            $1::boolean
            or coalesce(space.scope_type, '') in ('global', 'public', 'common', 'common_generic')
            or (space.company_id is null and space.store_id is null and coalesce(space.scope_type, '') = '')
            or ($2::uuid is not null and space.company_id = $2::uuid)
            or ($3::uuid is not null and space.store_id = $3::uuid)
            or exists (
              select 1
              from public.mp_knowledge_space_access access
              where access.knowledge_space_id = space.id
                and access.user_id = $4::uuid
                and access.status = 'active'
                and (access.expires_at is null or access.expires_at > now())
            )
          )
        order by space.sort_order asc nulls last, space.created_at asc nulls last, space.updated_at desc nulls last
        limit 100
      `,
      [
        ctx.isPlatformAdmin,
        uuidOrNull(scope.companyId),
        uuidOrNull(scope.storeId),
        uuidOrNull(ctx.userId),
      ],
    )

    const spaces = result.rows.map(summaryFromRow).filter(isKnowledgeSpaceSummary)
    if (result.rows.length && !spaces.length) {
      return jsonError(503, "knowledge_space_manifest_not_ready", "knowledge_space_manifest_not_ready")
    }

    return NextResponse.json({
      ok: true,
      context: accountContextPayload(ctx),
      spaces,
    })
  } catch (error) {
    if (isKnowledgeSpacesSchemaMissing(error)) {
      return jsonError(503, "knowledge_spaces_schema_not_ready", "knowledge_spaces_schema_not_ready")
    }
    return knowledgeSpaceErrorResponse(error, "knowledge_spaces_query_failed")
  }
}
