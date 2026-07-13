import { NextRequest } from "next/server"

import {
  appVoiceCoachAudioErrorResponse,
  appVoiceCoachFacadeErrorResponse,
  resolveAppVoiceCoachFacadeContext,
  synthesizeAppVoiceCoachTurnResponse,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  try {
    const { sessionId, turnId } = await context.params
    const id = String(sessionId || "").trim()
    const voiceTurnId = String(turnId || "").trim()
    if (!id || !voiceTurnId) {
      return appVoiceCoachAudioErrorResponse("turn_tts", "missing_params")
    }

    const resolved = await resolveAppVoiceCoachFacadeContext(request, "turn_tts")
    if ("error" in resolved) return resolved.error

    return await synthesizeAppVoiceCoachTurnResponse({
      ctx: resolved.ctx,
      scope: resolved.scope,
      sessionId: id,
      turnId: voiceTurnId,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "voice_coach_tts_provider_failed", "turn_tts")
  }
}
