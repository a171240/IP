import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { getAppAccessSnapshot } from "@/lib/aliyun-rds/repositories/app-access-control.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const access = await getAppAccessSnapshot(auth.user.id)
    return NextResponse.json({
      ok: true,
      canonical_user_id: access.canonicalUserId,
      identity_state: access.identityState,
      access_mode: access.accessMode,
      authorization_version: access.authorizationVersion,
      trial: {
        kind: access.trial.kind,
        data_domain: access.trial.dataDomain,
        status: access.trial.status,
        ai_coach_session_limit: access.trial.sessionLimit,
        ai_coach_sessions_used: access.trial.sessionsUsed,
        ai_coach_sessions_remaining: access.trial.sessionsRemaining,
      },
    })
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError
    if (error instanceof AliyunRdsConfigurationError) {
      return NextResponse.json(
        { ok: false, error: "rds_not_configured", code: "rds_not_configured" },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { ok: false, error: "access_snapshot_failed", code: "access_snapshot_failed" },
      { status: 500 },
    )
  }
}
