import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError, isAliyunRdsRuntimeUnavailableError } from "@/lib/aliyun-rds/postgres.server"
import { getAliyunRdsAppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"
import {
  cleanLearningProgressText,
  isLearningProgressRecord,
  learningProgressSchemaMissing,
  resolveLearningProgressTenantScope,
  syncLearningProgressEvents,
} from "@/lib/aliyun-rds/repositories/learning-progress.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function learningProgressErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  if (learningProgressSchemaMissing(error)) {
    return jsonError(503, "learning_progress_schema_not_ready", "learning_progress_schema_not_ready")
  }
  return jsonError(500, fallbackCode, fallbackCode)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const payload = await request.json().catch(() => null)
    if (!isLearningProgressRecord(payload)) {
      return jsonError(400, "invalid_payload", "invalid_payload")
    }

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const contextStoreId = cleanLearningProgressText(payload.context_store_id, 80)
    const scope = resolveLearningProgressTenantScope(ctx, contextStoreId)
    if (!scope.ok) {
      return jsonError(scope.status, scope.code, scope.code, { message: scope.message })
    }

    const result = await syncLearningProgressEvents(scope.scope, payload)
    if (!result.ok) {
      return jsonError(result.status, result.code, result.code, { message: result.message })
    }

    return NextResponse.json({
      ok: true,
      client_sync_id: result.client_sync_id,
      accepted_event_ids: result.accepted_event_ids,
      rejected_events: result.rejected_events,
      progress: result.progress,
      repository_mode: result.repository_mode,
    })
  } catch (error) {
    return learningProgressErrorResponse(error, "learning_progress_sync_failed")
  }
}
