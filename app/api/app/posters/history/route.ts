import { NextRequest, NextResponse } from "next/server"

import {
  appContentContextPayload,
  appContentWorkflowErrorResponse,
  resolveAppContentWorkflowContext,
  safeListAppContentDrafts,
} from "@/lib/aliyun-rds/repositories/app-content-workflows.server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAppContentWorkflowContext(request)
    if ("error" in resolved) return resolved.error

    const list = await safeListAppContentDrafts({
      kind: "poster",
      request,
      scope: resolved.scope,
    })

    return NextResponse.json({
      ok: true,
      status: "list",
      context: appContentContextPayload(resolved.ctx, resolved.scope),
      posters: list.drafts.map((draft) => ({
        posterId: draft.id,
        createdAt: draft.created_at,
        updatedAt: draft.updated_at,
        templateId: null,
        imageUrl: null,
        draft,
      })),
      drafts: list.drafts,
      warning: list.warning,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_poster_history_failed")
  }
}
