import { NextRequest, NextResponse } from "next/server"

import {
  appVoiceCoachEndAcceptedResponse,
  appVoiceCoachFacadeErrorResponse,
  readOptionalAppVoiceCoachJsonBody,
  resolveAppVoiceCoachFacadeContext,
} from "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const id = String(sessionId || "").trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_session_id", code: "missing_session_id" }, { status: 400 })
    }

    const resolved = await resolveAppVoiceCoachFacadeContext(request)
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppVoiceCoachJsonBody(request)
    if ("error" in body) return body.error

    return appVoiceCoachEndAcceptedResponse({
      ctx: resolved.ctx,
      scope: resolved.scope,
      sessionId: id,
    })
  } catch (error) {
    return appVoiceCoachFacadeErrorResponse(error, "app_voice_coach_end_failed")
  }
}
