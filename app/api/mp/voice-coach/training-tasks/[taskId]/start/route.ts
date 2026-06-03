import { NextRequest, NextResponse } from "next/server"

import { resolveMpAccountContext } from "@/lib/mp/account-context.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  buildTrainingSetup,
  getRequestKnowledgeSpaceId,
  getRequestTrainingPackMode,
  getTrainingTask,
  listKnowledgeSpaces,
  resolveActiveKnowledgeSpace,
  resolveTrainingPack,
  serializeTrainingPack,
} from "@/lib/voice-coach/training.server"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ taskId: string }>
}

function cleanBodyValue(body: any, key: string) {
  return String(body && body[key] || "").trim()
}

export async function POST(request: NextRequest, context: RouteContext) {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved.error

  try {
    const { taskId } = await context.params
    const decodedTaskId = decodeURIComponent(String(taskId || "")).trim()
    const body = await request.json().catch(() => null)
    const requestedKnowledgeSpaceId = cleanBodyValue(body, "knowledge_space_id") || getRequestKnowledgeSpaceId(request)
    const requestedMode = cleanBodyValue(body, "training_pack_mode") || getRequestTrainingPackMode(request)

    const supabase = await createServerSupabaseClientForRequest(request)
    const spaces = await listKnowledgeSpaces({
      supabase,
      ctx: resolved.ctx,
      activeKnowledgeSpaceId: requestedKnowledgeSpaceId,
    })
    const space = resolveActiveKnowledgeSpace(spaces, requestedKnowledgeSpaceId, requestedMode)
    if (!space) {
      return NextResponse.json({ ok: false, error: "knowledge_space_not_found" }, { status: 404 })
    }

    const pack = await resolveTrainingPack({ supabase, space })
    if (!pack) {
      return NextResponse.json({ ok: false, error: "training_pack_not_found" }, { status: 404 })
    }

    const task = getTrainingTask(pack, decodedTaskId)
    if (!task) {
      return NextResponse.json({ ok: false, error: "training_task_not_found" }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      active_knowledge_space_id: space.id,
      active_knowledge_space: space,
      pack: serializeTrainingPack(pack),
      task,
      setup: buildTrainingSetup({ space, pack, task }),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "training_task_start_failed" }, { status: 500 })
  }
}
