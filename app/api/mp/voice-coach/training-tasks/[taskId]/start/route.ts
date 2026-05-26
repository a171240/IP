import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  knowledgeSpacePayload,
  resolveActiveKnowledgeSpace,
} from "@/lib/mp/knowledge-space.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import {
  buildVoiceTrainingTaskSetup,
  findVoiceTrainingTask,
  getVoiceTrainingPackForSpace,
  loadVoiceTrainingDashboard,
} from "@/lib/voice-training/knowledge-space-training.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params

  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const active = await resolveActiveKnowledgeSpace({ admin, request, ctx: auth.ctx, user: auth.user, required: true })
  if (!active.ok) return active.error
  const pack = getVoiceTrainingPackForSpace(active.active)
  const task = findVoiceTrainingTask(pack, taskId)
  if (!active.active || !pack || !task) return jsonError(404, "训练任务不存在", "task_not_found")

  try {
    const dashboard = await loadVoiceTrainingDashboard({
      admin,
      ctx: auth.ctx,
      user: auth.user,
      knowledgeSpace: active.active,
    })
    if (!dashboard) return jsonError(404, "训练包不存在", "training_pack_not_found")
    const taskView = (dashboard.tasks || []).find((item: any) => item.id === task.id)
    if (taskView?.locked) {
      return jsonError(403, "请先完成前一关", "task_locked", {
        current_task_id: dashboard.currentTask?.id || "",
      })
    }

    return NextResponse.json({
      ok: true,
      brand_code: pack.brandCode,
      active_knowledge_space_id: active.active.id,
      active_knowledge_space: knowledgeSpacePayload(active.active),
      knowledge_spaces: active.options.map(knowledgeSpacePayload).filter(Boolean),
      context: accountContextPayload(auth.ctx),
      task: taskView || task,
      setup: buildVoiceTrainingTaskSetup({ pack, task, knowledgeSpace: active.active }),
      progress: dashboard.progress,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "training_task_start_failed", "training_task_start_failed")
  }
}
