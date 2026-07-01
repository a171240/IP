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
  listLearningProgress,
  parseLearningProgressModules,
  resolveLearningProgressTenantScope,
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
  return jsonError(500, error instanceof Error ? error.message : fallbackCode, fallbackCode)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const params = new URL(request.url).searchParams
    const scope = resolveLearningProgressTenantScope(ctx, params.get("context_store_id"))
    if (!scope.ok) {
      return jsonError(scope.status, scope.code, scope.code, { message: scope.message })
    }

    const modules = parseLearningProgressModules(params.get("modules"))
    if (!modules.ok) {
      return jsonError(modules.status, modules.code, modules.code, { message: modules.message })
    }

    const includeEntities = cleanLearningProgressText(params.get("include_entities"), 20).toLowerCase() !== "false"
    const progress = listLearningProgress({
      includeEntities,
      modules: modules.modules,
      scope: scope.scope,
    })

    return NextResponse.json({
      ok: true,
      server_time: progress.server_time,
      tenant: {
        company_id: scope.scope.companyId,
        membership_id: scope.scope.membershipId,
        role: scope.scope.role,
        store_id: scope.scope.storeId,
      },
      summaries: progress.summaries,
      entities: progress.entities,
      pending_client_event_ids: progress.pending_client_event_ids,
      repository_mode: progress.repository_mode,
    })
  } catch (error) {
    return learningProgressErrorResponse(error, "learning_progress_query_failed")
  }
}
