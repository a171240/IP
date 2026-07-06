import "server-only"

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

export type AppContentWorkflowKind = "poster" | "xhs" | "private_copy"

export type AppContentWorkflowScope = {
  companyId: string
  storeId: string
}

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

export const APP_CONTENT_FORBIDDEN_SIDE_EFFECTS = [
  "ai_generation",
  "ai_point_charge",
  "wechat_pay",
  "external_publish",
  "external_xhs_or_wechat_call",
  "production_write",
] as const

export const APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS = [
  "ai_generation",
  "ai_point_charge",
  "wechat_pay",
  "external_publish",
  "external_xhs_or_wechat_call",
] as const

export const APP_CONTENT_GENERATION_NOT_CONFIGURED_CODE = "app_content_generation_not_configured"
export const APP_CONTENT_DRAFT_BRIDGE_CODE = "app_content_draft_persisted_bridge"

const MAX_DRAFT_TITLE_LENGTH = 160
const MAX_DRAFT_BODY_LENGTH = 20_000

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
  return Math.min(50, Math.max(1, Math.round(parsed)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export async function readOptionalAppContentJsonBody(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return isRecord(body) ? { body } : { error: jsonError(400, "invalid_payload", "invalid_payload") }
}

export function appContentWorkflowErrorResponse(error: unknown, fallbackCode: string) {
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

export function resolveAppContentWorkflowScope(ctx: AppAccountContext, request: NextRequest) {
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

export async function resolveAppContentWorkflowContext(request: NextRequest) {
  const auth = await resolveAliyunRdsAppAuthUser(request)
  if (!auth) return { error: appAuthRequiredResponse() }

  const ctx = await getAliyunRdsAppAccountContext(auth.user)
  const scope = resolveAppContentWorkflowScope(ctx, request)
  if ("error" in scope) return { error: scope.error }

  return { ctx, scope }
}

export function appContentContextPayload(ctx: AppAccountContext, scope: AppContentWorkflowScope) {
  return {
    ...accountContextPayload(ctx),
    content_scope: {
      company_id: scope.companyId,
      store_id: scope.storeId,
    },
  }
}

function isContentDraftSchemaMissing(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "")
  const message = String((error as { message?: unknown })?.message || "")
  return (code === "42P01" || code === "42703" || /does not exist|column .* does not exist/i.test(message)) &&
    /content_drafts/i.test(message)
}

function toPublicContentDraft(row: ContentDraftRow) {
  return {
    id: row.id,
    company_id: row.company_id,
    store_id: row.store_id,
    kind: row.kind || "",
    title: row.title || "",
    body: row.body || "",
    source_context: isRecord(row.source_context) ? row.source_context : {},
    status: row.status || "draft",
    created_by_membership_id: row.created_by_membership_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

export async function listAppContentDrafts(opts: {
  kind: AppContentWorkflowKind
  request: NextRequest
  scope: AppContentWorkflowScope
}) {
  const params = new URL(opts.request.url).searchParams
  const result = await queryAliyunRds<ContentDraftRow>(
    `
      select id, company_id, store_id, kind, title, body, source_context, status,
             created_by_membership_id, created_at, updated_at
      from public.content_drafts
      where company_id = $1
        and store_id = $2
        and kind = $3
        and status = 'draft'
      order by updated_at desc
      limit $4
    `,
    [opts.scope.companyId, opts.scope.storeId, opts.kind, parseLimit(params.get("limit"))],
  )

  return {
    drafts: result.rows.map(toPublicContentDraft),
    warning: null as string | null,
  }
}

export async function safeListAppContentDrafts(opts: {
  kind: AppContentWorkflowKind
  request: NextRequest
  scope: AppContentWorkflowScope
}) {
  try {
    return await listAppContentDrafts(opts)
  } catch (error) {
    if (isContentDraftSchemaMissing(error)) {
      return {
        drafts: [],
        warning: "content_drafts_schema_not_ready",
      }
    }
    throw error
  }
}

export async function createAppContentWorkflowDraft(opts: {
  action: string
  ctx: AppAccountContext
  kind: AppContentWorkflowKind
  message: string
  payload: Record<string, unknown>
  scope: AppContentWorkflowScope
}) {
  const draft = buildAppContentWorkflowDraft(opts.kind, opts.payload)
  const now = new Date().toISOString()
  const result = await queryAliyunRds<ContentDraftRow>(
    `
      insert into public.content_drafts (
        company_id, store_id, kind, title, body, source_context, status,
        created_by_membership_id, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, 'draft', $7, $8, $8)
      returning id, company_id, store_id, kind, title, body, source_context, status,
                created_by_membership_id, created_at, updated_at
    `,
    [
      opts.scope.companyId,
      opts.scope.storeId,
      opts.kind,
      draft.title || null,
      draft.body || null,
      JSON.stringify(draft.sourceContext),
      opts.ctx.membershipId,
      now,
    ],
  )

  const created = result.rows[0]
  if (!created) throw new Error("content_workflow_draft_create_failed")

  return NextResponse.json({
    ok: true,
    action: opts.action,
    status: "accepted",
    generation_status: "persisted_bridge",
    code: APP_CONTENT_DRAFT_BRIDGE_CODE,
    message: opts.message,
    context: appContentContextPayload(opts.ctx, opts.scope),
    draft: toPublicContentDraft(created),
    forbidden_side_effects: APP_CONTENT_DRAFT_BRIDGE_FORBIDDEN_SIDE_EFFECTS,
  })
}

export function appContentAcceptedResponse(opts: {
  action: string
  ctx: AppAccountContext
  kind: AppContentWorkflowKind
  message: string
  scope: AppContentWorkflowScope
}) {
  return NextResponse.json(
    {
      ok: true,
      action: opts.action,
      status: "accepted",
      generation_status: "not_configured",
      code: APP_CONTENT_GENERATION_NOT_CONFIGURED_CODE,
      message: opts.message,
      context: appContentContextPayload(opts.ctx, opts.scope),
      draft: {
        id: null,
        kind: opts.kind,
        status: "not_persisted",
      },
      forbidden_side_effects: APP_CONTENT_FORBIDDEN_SIDE_EFFECTS,
    },
    { status: 202 },
  )
}

function buildAppContentWorkflowDraft(kind: AppContentWorkflowKind, payload: Record<string, unknown>) {
  const prompt = cleanText(payload.prompt, MAX_DRAFT_BODY_LENGTH)
  const body = firstText(
    [payload.body, payload.content, payload.text],
    MAX_DRAFT_BODY_LENGTH,
  ) || nonAiBridgeBody(kind, prompt)
  const title = firstText(
    [payload.title, payload.topic, prompt],
    MAX_DRAFT_TITLE_LENGTH,
  ) || defaultDraftTitle(kind)
  const sourceContext = isRecord(payload.source_context) ? payload.source_context : {}

  return {
    body,
    sourceContext: {
      ...sourceContext,
      app_content_bridge: {
        ai_generation: false,
        ai_points_charged: false,
        kind,
        storage: "public.content_drafts",
      },
    },
    title,
  }
}

function firstText(values: unknown[], max: number) {
  for (const value of values) {
    const text = cleanText(value, max)
    if (text) return text
  }
  return ""
}

function defaultDraftTitle(kind: AppContentWorkflowKind) {
  if (kind === "private_copy") return "私域文案草稿"
  if (kind === "xhs") return "小红书草稿"
  return "海报草稿"
}

function nonAiBridgeBody(kind: AppContentWorkflowKind, prompt: string) {
  const label = kind === "private_copy" ? "私域文案" : defaultDraftTitle(kind)
  return prompt
    ? `非 AI 持久化桥接${label}：${prompt}`
    : `非 AI 持久化桥接${label}：已保存请求，待接入真实生成服务后补全文案。`
}
