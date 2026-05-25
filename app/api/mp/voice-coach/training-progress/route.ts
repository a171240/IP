import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  BAIBAITU_BRAND_CODE,
  loadBaibaituTrainingDashboard,
  resolveBaibaituTrainingAccess,
} from "@/lib/voice-training/baibaitu.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  const admin = createAdminSupabaseClient()
  const access = await resolveBaibaituTrainingAccess({ admin, ctx: auth.ctx, user: auth.user })
  if (!access.enabled) {
    return NextResponse.json({
      ok: true,
      visible: false,
      brand_code: "",
      features: { baibaitu_training: false },
      context: accountContextPayload(auth.ctx),
    })
  }

  try {
    const dashboard = await loadBaibaituTrainingDashboard({ admin, ctx: auth.ctx, user: auth.user })
    return NextResponse.json({
      ok: true,
      visible: true,
      brand_code: BAIBAITU_BRAND_CODE,
      features: { baibaitu_training: true },
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
