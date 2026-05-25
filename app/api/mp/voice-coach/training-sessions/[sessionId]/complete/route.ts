import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  buildBaibaituTrainingResult,
  findBaibaituTrainingTask,
  loadBaibaituTrainingDashboard,
  resolveBaibaituTrainingAccess,
  saveBaibaituTrainingResult,
} from "@/lib/voice-training/baibaitu.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params
  if (!sessionId) return jsonError(400, "缺少训练记录", "missing_session_id")

  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const access = await resolveBaibaituTrainingAccess({ admin, ctx: auth.ctx, user: auth.user })
  if (!access.enabled) return jsonError(403, "当前账号暂未开放白白兔训练营", "baibaitu_training_not_enabled")

  const { data: link, error: linkError } = await admin
    .from("voice_training_session_links")
    .select("*")
    .eq("session_id", sessionId)
    .eq("staff_user_id", auth.user.id)
    .maybeSingle()
  if (linkError) return jsonError(500, linkError.message, "training_link_query_failed")
  if (!link) return jsonError(404, "这次练习未绑定白白兔任务", "training_link_not_found")

  const task = findBaibaituTrainingTask(link.task_id)
  if (!task) return jsonError(404, "训练任务不存在", "task_not_found")

  const { data: session, error: sessionError } = await admin
    .from("voice_coach_sessions")
    .select("id, user_id, report_json, total_score, status")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (sessionError) return jsonError(500, sessionError.message, "session_query_failed")
  if (!session) return jsonError(404, "训练记录不存在", "session_not_found")

  const report = session.report_json && typeof session.report_json === "object" ? session.report_json : null
  if (!report) {
    return jsonError(409, "训练报告尚未生成", "report_not_ready")
  }

  const { data: turns, error: turnsError } = await admin
    .from("voice_coach_turns")
    .select("id, role, text, emotion, audio_seconds, turn_index")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true })
  if (turnsError) return jsonError(500, turnsError.message, "turns_query_failed")

  try {
    const result = buildBaibaituTrainingResult({
      task,
      sessionId,
      report,
      turns: turns || [],
    })
    const saved = await saveBaibaituTrainingResult({
      admin,
      ctx: auth.ctx,
      user: auth.user,
      sessionId,
      task,
      result,
    })
    const dashboard = await loadBaibaituTrainingDashboard({ admin, ctx: auth.ctx, user: auth.user })

    return NextResponse.json({
      ok: true,
      context: accountContextPayload(auth.ctx),
      task,
      result,
      progress: saved.progress,
      rewards: saved.rewards,
      dashboard,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "training_session_complete_failed", "training_session_complete_failed")
  }
}
