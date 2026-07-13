import { NextRequest } from "next/server"

import {
  appVoiceCoachAudioErrorResponse,
  appVoiceCoachFacadeErrorResponse,
  readOptionalAppVoiceCoachFormBody,
  resolveAppVoiceCoachFacadeContext,
  submitAppVoiceCoachTextBeauticianTurnResponse,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const id = String(sessionId || "").trim()
    if (!id) {
      return appVoiceCoachAudioErrorResponse("audio_submit", "missing_session_id")
    }

    const resolved = await resolveAppVoiceCoachFacadeContext(request, "audio_submit")
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppVoiceCoachFormBody(request, "audio_submit")
    if ("error" in body) return body.error

    return await submitAppVoiceCoachTextBeauticianTurnResponse({
      body: body.body,
      ctx: resolved.ctx,
      scope: resolved.scope,
      sessionId: id,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "voice_coach_turn_submit_failed", "audio_submit")
  }
}
