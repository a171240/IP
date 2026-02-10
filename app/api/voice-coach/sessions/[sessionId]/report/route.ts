import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

async function signAudioExamples(report: any) {
  const examples = report?.tabs?.organization?.audio_examples
  if (!Array.isArray(examples)) return report

  const signed = await Promise.all(
    examples.map(async (ex: any) => {
      const path = typeof ex?.audio_path === "string" ? ex.audio_path : ""
      if (!path) return ex
      try {
        const url = await signVoiceCoachAudio(path)
        return { ...ex, audio_url: url }
      } catch {
        return ex
      }
    })
  )

  return {
    ...report,
    tabs: {
      ...report.tabs,
      organization: {
        ...report.tabs.organization,
        audio_examples: signed,
      },
    },
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, report_json")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")
    if (!session.report_json) return jsonError(404, "report_not_found")

    const report = await signAudioExamples(session.report_json)
    return NextResponse.json({ report })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
