import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { grantAppAccess } from "@/lib/aliyun-rds/repositories/app-access-control.server"
import { getAliyunRdsAppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

function jsonError(status: number, code: string) {
  return NextResponse.json({ ok: false, error: code, code }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function featureKeys(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function accessGrantErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (
    [
      "canonical_user_id_invalid",
      "company_id_invalid",
      "store_id_invalid",
      "operator_user_id_invalid",
      "idempotency_key_invalid",
      "access_grant_role_invalid",
      "access_grant_plan_invalid",
      "access_grant_feature_key_invalid",
      "access_grant_feature_plan_denied",
      "access_grant_feature_role_denied",
      "access_grant_operator_role_denied",
      "access_grant_reason_invalid",
      "access_grant_store_required",
      "access_grant_company_scope_required",
    ].includes(code)
  ) {
    return jsonError(422, code)
  }
  if (code === "canonical_user_not_found" || code === "company_not_found" || code === "store_not_found") {
    return jsonError(404, code)
  }
  if (code === "app_idempotency_conflict") {
    return jsonError(409, "idempotency_key_reused")
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const account = await getAliyunRdsAppAccountContext(auth.user)
    if (!account.isPlatformAdmin) return jsonError(403, "platform_admin_required")

    const idempotencyKey = text(request.headers.get("idempotency-key"))
    if (!idempotencyKey) return jsonError(422, "idempotency_key_required")

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonError(400, "invalid_payload")
    }
    if (!isRecord(body)) return jsonError(400, "invalid_payload")

    const granted = await grantAppAccess({
      canonicalUserId: text(body.canonical_user_id),
      companyId: text(body.company_id),
      featureKeys: featureKeys(body.feature_keys),
      idempotencyKey,
      operatorUserId: auth.user.id,
      operatorRole: String(account.role || ""),
      plan: text(body.plan),
      reason: text(body.reason),
      role: text(body.role),
      storeId: text(body.store_id) || null,
    })
    return NextResponse.json(
      {
        ok: true,
        canonical_user_id: granted.canonicalUserId,
        membership_id: granted.membershipId,
        authorization_version: granted.authorizationVersion,
        deduped: granted.deduped,
      },
      { status: granted.deduped ? 200 : 201 },
    )
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError
    if (error instanceof AliyunRdsConfigurationError) {
      return jsonError(503, "rds_not_configured")
    }
    return accessGrantErrorResponse(error) || jsonError(500, "access_grant_failed")
  }
}
