import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError,
} from "@/lib/aliyun-rds/postgres.server"
import { getAliyunRdsAppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"
import {
  accountComplianceRequestSchemaMissing,
  createAliyunRdsAppComplianceRequest,
} from "@/lib/aliyun-rds/repositories/app-compliance-requests.server"

export const runtime = "nodejs"

const ROUTE_PATH = "/api/app/account/data-deletion-requests"

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const payload = await readJsonPayload(request)
    if (!isRecord(payload)) return jsonError(400, "invalid_payload", "invalid_payload")

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const receipt = await createAliyunRdsAppComplianceRequest({
      ctx,
      kind: "personal_data_deletion",
      payload: {
        confirmText: payload.confirm_text ?? payload.confirmText,
        reason: payload.reason,
      },
    })

    return NextResponse.json({ ok: true, request: receipt })
  } catch (error) {
    return accountComplianceRouteErrorResponse(error)
  }
}

async function readJsonPayload(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function accountComplianceRouteErrorResponse(error: unknown) {
  const authError = appAuthConfigurationErrorResponse(error)
  if (authError) return authError
  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  if (accountComplianceRequestSchemaMissing(error)) {
    return jsonError(
      503,
      `${ROUTE_PATH} schema is not ready`,
      "account_compliance_requests_schema_not_ready",
    )
  }
  return jsonError(500, error instanceof Error ? error.message : "account_compliance_request_failed", "account_compliance_request_failed")
}

function jsonError(status: number, error: string, code = error) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
