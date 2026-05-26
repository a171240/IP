import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  knowledgeSpacePayload,
  resolveActiveKnowledgeSpace,
} from "@/lib/mp/knowledge-space.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { loadVoiceTrainingDashboard } from "@/lib/voice-training/knowledge-space-training.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const active = await resolveActiveKnowledgeSpace({ admin, request, ctx: auth.ctx, user: auth.user })
  if (!active.ok) return active.error
  if (!active.active) {
    return NextResponse.json({
      ok: true,
      visible: false,
      brand_code: "",
      features: { voice_training: false, baibaitu_training: false },
      active_knowledge_space_id: "",
      active_knowledge_space: null,
      knowledge_spaces: active.options.map(knowledgeSpacePayload).filter(Boolean),
      context: accountContextPayload(auth.ctx),
    })
  }

  try {
    const dashboard = await loadVoiceTrainingDashboard({
      admin,
      ctx: auth.ctx,
      user: auth.user,
      knowledgeSpace: active.active,
    })
    if (!dashboard) {
      return NextResponse.json({
        ok: true,
        visible: false,
        brand_code: active.active.brandCode,
        features: { voice_training: false, baibaitu_training: active.active.brandCode === "baibaitu" },
        active_knowledge_space_id: active.active.id,
        active_knowledge_space: knowledgeSpacePayload(active.active),
        knowledge_spaces: active.options.map(knowledgeSpacePayload).filter(Boolean),
        context: accountContextPayload(auth.ctx),
      })
    }
    return NextResponse.json({
      ok: true,
      visible: true,
      brand_code: active.active.brandCode,
      features: { voice_training: true, baibaitu_training: active.active.brandCode === "baibaitu" },
      active_knowledge_space_id: active.active.id,
      active_knowledge_space: knowledgeSpacePayload(active.active),
      knowledge_spaces: active.options.map(knowledgeSpacePayload).filter(Boolean),
      context: accountContextPayload(auth.ctx),
      progress: dashboard.progress,
      tasks: dashboard.tasks,
      rewards: dashboard.rewards,
      currentTask: dashboard.currentTask,
      completedCount: dashboard.completedCount,
      totalCount: dashboard.totalCount,
      rewardCount: dashboard.rewardCount,
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "training_progress_failed", "training_progress_failed")
  }
}
