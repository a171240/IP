import { NextRequest, NextResponse } from "next/server"

import { resolveMpAccountContext } from "@/lib/mp/account-context.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  extractTrainingContextFromSession,
  markTrainingTaskComplete,
} from "@/lib/voice-coach/training.server"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved.error

  try {
    const { sessionId } = await context.params
    const id = decodeURIComponent(String(sessionId || "")).trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: "session_id_required" }, { status: 400 })
    }

    const supabase = await createServerSupabaseClientForRequest(request)
    const { data: session, error } = await supabase
      .from("voice_coach_sessions")
      .select("id, user_id, total_score, session_context_json, scenario_snapshot_json")
      .eq("id", id)
      .eq("user_id", resolved.ctx.userId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ ok: false, error: "session_query_failed", message: error.message }, { status: 500 })
    }
    if (!session) {
      return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })
    }

    const training = extractTrainingContextFromSession(session)
    if (!training.taskId || !training.packId || !training.knowledgeSpaceId) {
      return NextResponse.json({
        ok: true,
        completed: false,
        reason: "session_has_no_training_context",
        result: null,
      })
    }

    const result = await markTrainingTaskComplete({
      supabase,
      userId: resolved.ctx.userId,
      companyId: resolved.ctx.companyId,
      storeId: resolved.ctx.storeId,
      membershipId: resolved.ctx.membershipId,
      knowledgeSpaceId: training.knowledgeSpaceId,
      packId: training.packId,
      taskId: training.taskId,
      sessionId: id,
      score: Number.isFinite(Number(session.total_score)) ? Number(session.total_score) : null,
    })

    return NextResponse.json({
      ok: true,
      completed: true,
      persisted: result.persisted,
      progress: result.progress,
      result: null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "training_session_complete_failed" }, { status: 500 })
  }
}
