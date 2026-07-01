import { NextRequest } from "next/server"

import {
  appContentAcceptedResponse,
  appContentWorkflowErrorResponse,
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

    return appContentAcceptedResponse({
      action: "poster.generate",
      ctx: resolved.ctx,
      kind: "poster",
      message: "App poster facade is auth-closed. Image generation remains disabled until production provider and billing closure are explicitly enabled.",
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_poster_generate_failed")
  }
}
