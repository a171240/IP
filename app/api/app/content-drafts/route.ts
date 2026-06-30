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

const allowedContentDraftKinds = new Set(["poster", "xhs", "private_copy"])
const MAX_LIMIT = 50

type ContentDraftRow = {
  id: string
  company_id: string | null
  store_id: string | null
  kind: string | null
  title: string | null
  body: string | null
  source_context: unknown
  status: string | null
  created_by_membership_id: string | null
  created_at: string | null
  updated_at: string | null
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function parseLimit(value: unknown) {
  const parsed = Number(value || 20)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(parsed)))
}

function resolveContentDraftScope(ctx: AppAccountContext, request: NextRequest) {
  const params = new URL(request.url).searchParams
  const requestedCompanyId = cleanText(params.get("company_id"), 80)
  const requestedStoreId = cleanText(params.get("store_id"), 80)

  if (!ctx.isPlatformAdmin && requestedCompanyId && requestedCompanyId !== ctx.companyId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  const storeId = requestedStoreId || ctx.storeId

  if (!companyId || !storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!ctx.isPlatformAdmin && ctx.storeId && requestedStoreId && requestedStoreId !== ctx.storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  return { companyId, storeId }
}

function sourceContextWarning(unsafeFields: string[]) {
  return {
    redacted: true,
    redaction_reason: "unsafe_source_context_redacted",
    unsafe_fields: unsafeFields,
    privacy: {
      customer_identity: "redacted",
      raw_transcript: "excluded",
      send_or_publish: "manual_review_only",
    },
  }
}

function safeSourceContext(value: unknown) {
  const unsafeFields = findUnsafeContentSourceContextFields(value)
  if (unsafeFields.length) return sourceContextWarning(unsafeFields)
  return isRecord(value) ? value : {}
}

function findUnsafeContentSourceContextFields(value: unknown) {
  const unsafe: string[] = []
  collectUnsafeContentFields(value, "source_context", unsafe)
  return unsafe
}

function collectUnsafeContentFields(value: unknown, path: string, unsafe: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsafeContentFields(item, `${path}[${index}]`, unsafe))
    return
  }
  if (!isRecord(value)) return

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`
    if (isSafePolicyPath(nextPath)) continue
    if (isUnsafeSourceContextKey(key)) {
      unsafe.push(nextPath)
      continue
    }
    collectUnsafeContentFields(nestedValue, nextPath, unsafe)
  }
}

function isSafePolicyPath(path: string) {
  return [
    "source_context.privacy.customer_identity",
    "source_context.privacy.raw_transcript",
    "source_context.service_record.transcript_policy",
  ].includes(path)
}

function isUnsafeSourceContextKey(key: string) {
  return [
    /(^|_)transcript(_|$)/i,
    /raw_?audio/i,
    /audio_url/i,
    /^customer$/i,
    /^customer_name$/i,
    /phone/i,
    /mobile/i,
    /wechat/i,
    /id_?card/i,
    /identity/i,
    /personal_?id/i,
  ].some((pattern) => pattern.test(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function toPublicContentDraft(row: ContentDraftRow) {
  return {
    id: row.id,
    company_id: row.company_id,
    store_id: row.store_id,
    kind: row.kind || "",
    title: row.title || "",
    body: row.body || "",
    source_context: safeSourceContext(row.source_context),
    status: row.status || "draft",
    created_by_membership_id: row.created_by_membership_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function contentDraftErrorResponse(error: unknown, fallbackCode: string) {
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

function isContentDraftSchemaMissing(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "")
  const message = String((error as { message?: unknown })?.message || "")
  return (code === "42P01" || code === "42703" || /does not exist|column .* does not exist/i.test(message)) &&
    /content_drafts/i.test(message)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const scope = resolveContentDraftScope(ctx, request)
    if ("error" in scope) return scope.error

    const params = new URL(request.url).searchParams
    const kind = cleanText(params.get("kind"), 40)
    if (kind && !allowedContentDraftKinds.has(kind)) {
      return jsonError(400, "invalid_content_draft_kind", "invalid_content_draft_kind")
    }

    const values: unknown[] = [scope.companyId, scope.storeId]
    const clauses = ["company_id = $1", "store_id = $2", "status = 'draft'"]
    if (kind) {
      values.push(kind)
      clauses.push(`kind = $${values.length}`)
    }
    values.push(parseLimit(params.get("limit")))

    const result = await queryAliyunRds<ContentDraftRow>(
      `
        select id, company_id, store_id, kind, title, body, source_context, status,
               created_by_membership_id, created_at, updated_at
        from public.content_drafts
        where ${clauses.join(" and ")}
        order by updated_at desc
        limit $${values.length}
      `,
      values,
    )

    return NextResponse.json({
      ok: true,
      context: accountContextPayload(ctx),
      drafts: result.rows.map(toPublicContentDraft),
    })
  } catch (error) {
    if (isContentDraftSchemaMissing(error)) {
      return NextResponse.json({
        ok: true,
        drafts: [],
        warning: "content_drafts_schema_not_ready",
      })
    }
    return contentDraftErrorResponse(error, "content_drafts_query_failed")
  }
}
