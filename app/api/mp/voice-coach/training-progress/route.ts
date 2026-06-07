import { NextRequest, NextResponse } from "next/server"

import { resolveMpAccountContext } from "@/lib/mp/account-context.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  buildProgressPayload,
  getRequestKnowledgeSpaceId,
  getRequestTrainingPackMode,
  getTrainingProgress,
  listKnowledgeSpaces,
  resolveActiveKnowledgeSpace,
  resolveTrainingPack,
  serializeTrainingPack,
} from "@/lib/voice-coach/training.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved.error

  try {
    const supabase = await createServerSupabaseClientForRequest(request)
    const activeId = getRequestKnowledgeSpaceId(request)
    const requestedMode = getRequestTrainingPackMode(request)
    const spaces = await listKnowledgeSpaces({
      supabase,
      ctx: resolved.ctx,
      activeKnowledgeSpaceId: activeId,
    })
    const space = resolveActiveKnowledgeSpace(spaces, activeId, requestedMode)
    if (!space) {
      return NextResponse.json({ ok: true, progress: null, knowledge_spaces: spaces })
    }
    const pack = await resolveTrainingPack({ supabase, space })
    if (!pack) {
      return NextResponse.json({ ok: true, progress: null, active_knowledge_space: space, knowledge_spaces: spaces })
    }
    const progress = await getTrainingProgress({
      supabase,
      userId: resolved.ctx.userId,
      knowledgeSpaceId: space.id,
      packId: pack.pack_id,
    })

    return NextResponse.json({
      ok: true,
      active_knowledge_space_id: space.id,
      active_knowledge_space: space,
      pack: serializeTrainingPack(pack),
      progress: buildProgressPayload(progress, null),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "training_progress_failed" }, { status: 500 })
  }
}
