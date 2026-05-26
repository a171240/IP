import { NextRequest, NextResponse } from "next/server"

import { accountContextPayload, resolveMpAccountContext } from "@/lib/mp/account-context.server"
import {
  knowledgeSpacePayload,
  listMpKnowledgeSpaceOptions,
  resolveActiveKnowledgeSpace,
} from "@/lib/mp/knowledge-space.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await resolveMpAccountContext(request)
  if (!auth.ok) return auth.error

  try {
    const admin = createAdminSupabaseClient()
    const active = await resolveActiveKnowledgeSpace({
      admin,
      request,
      ctx: auth.ctx,
      user: auth.user,
    })
    if (!active.ok) return active.error

    const options = active.options.length
      ? active.options
      : await listMpKnowledgeSpaceOptions({ admin, ctx: auth.ctx, user: auth.user })

    return NextResponse.json({
      ok: true,
      active_knowledge_space_id: active.active?.id || "",
      active_knowledge_space: knowledgeSpacePayload(active.active),
      options: options.map(knowledgeSpacePayload).filter(Boolean),
      context: accountContextPayload(auth.ctx),
    })
  } catch (error: any) {
    return jsonError(500, error?.message || "knowledge_space_options_failed", "knowledge_space_options_failed")
  }
}
