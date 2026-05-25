import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  BAIBAITU_BRAND_CODE,
  buildBaibaituTaskSetup,
  findBaibaituTrainingTask,
  loadBaibaituTrainingDashboard,
  resolveBaibaituTrainingAccess,
} from "@/lib/voice-training/baibaitu.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params
  const task = findBaibaituTrainingTask(taskId)
  if (!task) return jsonError(404, "训练任务不存在", "task_not_found")

  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const access = await resolveBaibaituTrainingAccess({ admin, ctx: auth.ctx, user: auth.user })
  if (!access.enabled) return jsonError(403, "当前账号暂未开放白白兔训练营", "baibaitu_training_not_enabled")

  try {
    const dashboard = await loadBaibaituTrainingDashboard({ admin, ctx: auth.ctx, user: auth.user })
    const taskView = (dashboard.tasks || []).find((item: any) => item.id === task.id)
    if (taskView?.locked) {
      return jsonError(403, "请先完成前一关", "task_locked", {
        current_task_id: dashboard.currentTask?.id || "",
      })
    }

    return NextResponse.json({
      ok: true,
      brand_code: BAIBAITU_BRAND_CODE,
      context: accountContextPayload(auth.ctx),
      task: taskView || task,
      setup: buildBaibaituTaskSetup(task),
      progress: dashboard.progress,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "training_task_start_failed", "training_task_start_failed")
  }
}
