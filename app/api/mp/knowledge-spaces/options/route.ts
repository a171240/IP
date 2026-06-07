import { NextRequest, NextResponse } from "next/server"

import { resolveMpAccountContext } from "@/lib/mp/account-context.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  getRequestKnowledgeSpaceId,
  listKnowledgeSpaces,
  resolveActiveKnowledgeSpace,
} from "@/lib/voice-coach/training.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const resolved = await resolveMpAccountContext(request)
  if (!resolved.ok) return resolved.error

  try {
    const activeId = getRequestKnowledgeSpaceId(request)
    const supabase = await createServerSupabaseClientForRequest(request)
    const spaces = await listKnowledgeSpaces({
      supabase,
      ctx: resolved.ctx,
      activeKnowledgeSpaceId: activeId,
    })
    const active = resolveActiveKnowledgeSpace(spaces, activeId)

    return NextResponse.json({
      ok: true,
      active_knowledge_space_id: active?.id || "",
      active_knowledge_space: active || null,
      knowledge_spaces: spaces,
      options: spaces,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "knowledge_spaces_failed" }, { status: 500 })
  }
}
