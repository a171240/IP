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
      action: "xhs.cover",
      ctx: resolved.ctx,
      kind: "xhs",
      message: "App XHS cover facade is auth-closed. Cover image generation and asset writes remain disabled for this safe App route.",
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_xhs_cover_failed")
  }
}
