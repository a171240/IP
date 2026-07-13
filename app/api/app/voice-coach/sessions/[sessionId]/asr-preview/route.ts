import { NextRequest } from "next/server"

import {
  appVoiceCoachAudioErrorResponse,
  appVoiceCoachFacadeErrorResponse,
  readOptionalAppVoiceCoachJsonBody,
  resolveAppVoiceCoachFacadeContext,
  transcribeAppVoiceCoachAudioResponse,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const id = String(sessionId || "").trim()
    if (!id) {
      return appVoiceCoachAudioErrorResponse("asr_preview", "missing_session_id")
    }

    const resolved = await resolveAppVoiceCoachFacadeContext(request, "asr_preview")
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppVoiceCoachJsonBody(request, "asr_preview")
    if ("error" in body) return body.error

    return await transcribeAppVoiceCoachAudioResponse({
      body: body.body,
      ctx: resolved.ctx,
      scope: resolved.scope,
      sessionId: id,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "voice_coach_asr_provider_failed", "asr_preview")
  }
}
