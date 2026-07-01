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
      action: "xhs.generate",
      ctx: resolved.ctx,
      kind: "xhs",
      message: "App XHS text facade is auth-closed. AI generation, billing, and draft persistence are disabled in this App-facing closure route.",
      scope: resolved.scope,
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_xhs_generate_failed")
  }
}
