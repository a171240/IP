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
      kind: "xhs",
      request,
      scope: resolved.scope,
    })

    return NextResponse.json({
      ok: true,
      status: "list",
      context: appContentContextPayload(resolved.ctx, resolved.scope),
      drafts: list.drafts,
      next_cursor: null,
      warning: list.warning,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_xhs_drafts_failed")
  }
}
