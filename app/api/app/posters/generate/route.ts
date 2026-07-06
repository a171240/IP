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
      action: "poster.generate",
      ctx: resolved.ctx,
      kind: "poster",
      message: "App poster request was saved as a non-AI draft bridge. Image generation, billing, OSS upload, saving, and sharing remain disabled for this route.",
      payload: body.body,
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_poster_generate_failed")
  }
}
