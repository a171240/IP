import { NextRequest } from "next/server"

import {
  appVoiceCoachFacadeErrorResponse,
  createAppVoiceCoachCreateTimingLog,
  createAppVoiceCoachTextSessionResponse,
  listAppVoiceCoachTextSessionsResponse,
  readOptionalAppVoiceCoachJsonBody,
  resolveAppVoiceCoachFacadeContext,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    if ("error" in resolved) return resolved.error

    return await listAppVoiceCoachTextSessionsResponse({
      ctx: resolved.ctx,
      request,
      scope: resolved.scope,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_sessions_list_failed")
  }
}

export async function POST(request: NextRequest) {
  const timing = createAppVoiceCoachCreateTimingLog()
  try {
    const authStartedAt = Date.now()
    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    timing.recordStage("auth_context", authStartedAt)
    if ("error" in resolved) {
      const errorResponse = resolved.error
      if (!errorResponse) throw new Error("app_voice_coach_context_error_missing_response")
      timing.write(errorResponse.status)
      return errorResponse
    }

    const bodyStartedAt = Date.now()
    const body = await readOptionalAppVoiceCoachJsonBody(request)
    timing.recordStage("body_read", bodyStartedAt)
    if ("error" in body) {
      const errorResponse = body.error
      if (!errorResponse) throw new Error("app_voice_coach_body_error_missing_response")
      timing.write(errorResponse.status)
      return errorResponse
    }

    const response = await createAppVoiceCoachTextSessionResponse({
      body: body.body,
      ctx: resolved.ctx,
      scope: resolved.scope,
      timing,
    })
    timing.write(response.status)
    return response
  } catch (error) {
    timing.write(500, error)
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_session_create_failed")
  }
}
