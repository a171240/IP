import { NextRequest, NextResponse } from "next/server"

import {
  appContentContextPayload,
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

    return NextResponse.json(
      {
        ok: true,
        success: true,
        action: "xhs.danger_check",
        status: "accepted",
        check_status: "not_configured",
        code: "app_xhs_danger_check_not_configured",
        context: appContentContextPayload(resolved.ctx, resolved.scope),
        data: {
          riskLevel: "manual_review_required",
          dangerCount: 0,
          flags: [],
          manualReviewRequired: true,
        },
        message: "App danger-check facade is auth-closed. External upstream checks and draft risk writes are disabled for this safe route.",
      },
      { status: 202 },
    )
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_xhs_danger_check_failed")
  }
}
