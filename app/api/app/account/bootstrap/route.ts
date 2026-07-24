import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { ensureAppCanonicalIdentityAndTrial } from "@/lib/aliyun-rds/repositories/app-access-control.server"
import { bootstrapAliyunRdsAppProfile } from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    await bootstrapAliyunRdsAppProfile(auth.user)
    const access = await ensureAppCanonicalIdentityAndTrial(auth.user)
    return NextResponse.json(
      {
        ok: true,
        profile_initialized: true,
        canonical_user_id: access.canonicalUserId,
        access_mode: access.accessMode,
        identity_state: access.identityState,
        authorization_version: access.authorizationVersion,
        trial: {
          kind: access.trial.kind,
          data_domain: access.trial.dataDomain,
          status: access.trial.status,
          ai_coach_session_limit: access.trial.sessionLimit,
          ai_coach_sessions_reserved: access.trial.sessionsReserved,
          ai_coach_sessions_used: access.trial.sessionsUsed,
          ai_coach_sessions_remaining: access.trial.sessionsRemaining,
          ai_coach_public_enabled: access.trial.aiCoachPublicEnabled,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError

    if (error instanceof AliyunRdsConfigurationError) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" },
        { status: 503 },
      )
    }
    if (
      error instanceof Error &&
      (
        error.message === "app_identity_conflict" ||
        error.message === "app_identity_review_required"
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "identity_review_required",
          code: "identity_review_required",
        },
        {
          headers: { "Cache-Control": "private, no-store" },
          status: 409,
        },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: "account_bootstrap_failed",
        code: "account_bootstrap_failed",
      },
      { status: 500 },
    )
  }
}
