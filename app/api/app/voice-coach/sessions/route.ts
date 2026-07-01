import { NextRequest } from "next/server"

import {
  appVoiceCoachFacadeErrorResponse,
  appVoiceCoachSessionAcceptedResponse,
  appVoiceCoachSessionListResponse,
  readOptionalAppVoiceCoachJsonBody,
  resolveAppVoiceCoachFacadeContext,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    if ("error" in resolved) return resolved.error

    return appVoiceCoachSessionListResponse({
      ctx: resolved.ctx,
      request,
      scope: resolved.scope,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_sessions_list_failed")
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppVoiceCoachJsonBody(request)
    if ("error" in body) return body.error

    return appVoiceCoachSessionAcceptedResponse({
      body: body.body,
      ctx: resolved.ctx,
      scope: resolved.scope,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_session_create_failed")
  }
}
