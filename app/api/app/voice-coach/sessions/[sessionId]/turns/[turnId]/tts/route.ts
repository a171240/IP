import { NextRequest, NextResponse } from "next/server"

import {
  appVoiceCoachFacadeErrorResponse,
  appVoiceCoachTtsProviderRequiredResponse,
  readOptionalAppVoiceCoachJsonBody,
  resolveAppVoiceCoachFacadeContext,
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
      return NextResponse.json({ ok: false, error: "missing_params", code: "missing_params" }, { status: 400 })
    }

    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppVoiceCoachJsonBody(request)
    if ("error" in body) return body.error

    return appVoiceCoachTtsProviderRequiredResponse({
      ctx: resolved.ctx,
      scope: resolved.scope,
      sessionId: id,
      turnId: voiceTurnId,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_tts_failed")
  }
}
