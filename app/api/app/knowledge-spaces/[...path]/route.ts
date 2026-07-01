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

type KnowledgeGroup = JsonRecord & {
  id: string
  cards?: unknown[]
}

type KnowledgeCard = JsonRecord & {
  id: string
}

type KnowledgeSpaceManifest = JsonRecord & {
  schemaVersion: 1
  id: string
  kind: string
  title: string
  version: string
  stats: JsonRecord
  groups: unknown[]
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

function decodePathSegment(value: unknown) {
  const text = cleanText(value, 220)
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
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

function isKnowledgeGroup(value: unknown): value is KnowledgeGroup {
  return isRecord(value) && Boolean(cleanText(value.id, 180))
}

function isKnowledgeCard(value: unknown): value is KnowledgeCard {
  return isRecord(value) && Boolean(cleanText(value.id, 180))
}

function findGroup(manifest: KnowledgeSpaceManifest, groupId: string) {
  return manifest.groups.find((group): group is KnowledgeGroup =>
    isKnowledgeGroup(group) && cleanText(group.id, 180) === groupId,
  ) || null
}

function findCard(group: KnowledgeGroup, cardId: string) {
  const cards = Array.isArray(group.cards) ? group.cards : []
  return cards.find((card): card is KnowledgeCard =>
    isKnowledgeCard(card) && cleanText(card.id, 180) === cardId,
  ) || null
}

async function getReadableKnowledgeSpaceRow(
  ctx: AppAccountContext,
  request: NextRequest,
  spaceId: string,
): Promise<{ row: KnowledgeSpaceRow | null } | { error: NextResponse }> {
  const scope = resolveKnowledgeSpaceScope(ctx, request)
  if ("error" in scope) return scope

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
          ($6::uuid is not null and space.id = $6::uuid)
          or space.code = $5
          or space.metadata_json->'app_manifest'->>'id' = $5
          or space.metadata_json->'knowledge_manifest'->>'id' = $5
          or space.metadata_json->'knowledge_space_manifest'->>'id' = $5
          or space.metadata_json->'manifest'->>'id' = $5
          or space.metadata_json->>'app_space_id' = $5
          or space.metadata_json->>'knowledge_space_id' = $5
          or ($5 = 'manbeilian_store_knowledge_v1' and (space.code = 'manbeilian' or space.brand_code = 'manbeilian'))
        )
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
      order by
        case
          when ($6::uuid is not null and space.id = $6::uuid) then 0
          when space.code = $5 then 1
          when space.metadata_json->'app_manifest'->>'id' = $5 then 2
          when space.metadata_json->'knowledge_manifest'->>'id' = $5 then 3
          when space.metadata_json->'knowledge_space_manifest'->>'id' = $5 then 4
          when space.metadata_json->'manifest'->>'id' = $5 then 5
          else 9
        end,
        space.sort_order asc nulls last,
        space.created_at asc nulls last
      limit 1
    `,
    [
      ctx.isPlatformAdmin,
      uuidOrNull(scope.companyId),
      uuidOrNull(scope.storeId),
      uuidOrNull(ctx.userId),
      spaceId,
      uuidOrNull(spaceId),
    ],
  )

  return { row: result.rows[0] || null }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const segments = ((await params).path || []).map(decodePathSegment)
  const [spaceId, groupsSegment, groupId, cardsSegment, cardId] = segments
  if (
    !spaceId ||
    ![1, 3, 5].includes(segments.length) ||
    (segments.length >= 3 && groupsSegment !== "groups") ||
    (segments.length === 5 && cardsSegment !== "cards")
  ) {
    return jsonError(404, "knowledge_space_route_not_found", "knowledge_space_route_not_found")
  }

  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const resolved = await getReadableKnowledgeSpaceRow(ctx, request, spaceId)
    if ("error" in resolved) return resolved.error
    if (!resolved.row) return jsonError(404, "knowledge_space_not_found", "knowledge_space_not_found")

    const manifest = findManifest(resolved.row)
    if (!manifest) {
      return jsonError(503, "knowledge_space_manifest_not_ready", "knowledge_space_manifest_not_ready")
    }

    if (segments.length === 1) {
      return NextResponse.json({
        ok: true,
        context: accountContextPayload(ctx),
        space: manifest,
      })
    }

    const group = findGroup(manifest, groupId)
    if (!group) return jsonError(404, "knowledge_group_not_found", "knowledge_group_not_found")
    if (segments.length === 3) {
      return NextResponse.json({
        ok: true,
        context: accountContextPayload(ctx),
        group,
      })
    }

    const card = findCard(group, cardId)
    if (!card) return jsonError(404, "knowledge_card_not_found", "knowledge_card_not_found")
    return NextResponse.json({
      ok: true,
      context: accountContextPayload(ctx),
      card,
    })
  } catch (error) {
    if (isKnowledgeSpacesSchemaMissing(error)) {
      return jsonError(503, "knowledge_spaces_schema_not_ready", "knowledge_spaces_schema_not_ready")
    }
    return knowledgeSpaceErrorResponse(error, "knowledge_space_query_failed")
  }
}
