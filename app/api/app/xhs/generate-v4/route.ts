import { NextRequest } from "next/server"

import {
  appContentWorkflowErrorResponse,
  createAppContentWorkflowDraft,
  readOptionalAppContentJsonBody,
  resolveAppContentWorkflowContext,
} from "@/lib/aliyun-rds/repositories/app-content-workflows.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveAppContentWorkflowContext(request)
    if ("error" in resolved) return resolved.error

    const body = await readOptionalAppContentJsonBody(request)
    if ("error" in body) return body.error

    return createAppContentWorkflowDraft({
      action: "xhs.generate",
      ctx: resolved.ctx,
      kind: "xhs",
      message: "App XHS text request was saved as a non-AI draft bridge. AI generation, cover generation, billing, and external posting remain disabled for this route.",
      payload: body.body,
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_xhs_generate_failed")
  }
}
