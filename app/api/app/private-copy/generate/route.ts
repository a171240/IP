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
      action: "private_copy.generate",
      ctx: resolved.ctx,
      kind: "private_copy",
      message: "App private-copy request was saved as a non-AI draft bridge. AI generation and billing remain disabled for this route.",
      payload: body.body,
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_private_copy_generate_failed")
  }
}
