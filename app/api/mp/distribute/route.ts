import { NextRequest, NextResponse } from "next/server"

import { distributeRequestSchema } from "@/lib/types/content-pipeline"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  DISTRIBUTION_ERROR_CODES,
  type DistributionErrorCode,
  normalizeDistributionError,
  submitDistributionJob,
  trackDistributeFail,
  trackDistributeSubmit,
  trackDistributeSuccess,
} from "@/lib/distribution/service"

export const runtime = "nodejs"

function toFailCode(value: unknown): DistributionErrorCode {
  if (typeof value === "string" && DISTRIBUTION_ERROR_CODES.includes(value as DistributionErrorCode)) {
    return value as DistributionErrorCode
  }
  return "platform_api_denied"
}

function errorResponse(opts: {
  error_code: DistributionErrorCode
  message: string
  status: number
  details?: unknown
}) {
  const payload = {
    ok: false as const,
    error_code: opts.error_code,
    message: opts.message,
    details: opts.details ?? null,
    // backward compatibility
    code: opts.error_code,
  }
  return NextResponse.json(payload, { status: opts.status })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse({
      error_code: "platform_api_denied",
      message: "请先登录",
      status: 401,
    })
  }

  const body = await request.json().catch(() => null)
  const parsed = distributeRequestSchema.safeParse(body)
  if (!parsed.success) {
    await trackDistributeFail({
      request,
      userId: user.id,
      code: "platform_api_denied",
      message: "invalid_payload",
      details: { issues: parsed.error.issues.slice(0, 10) },
    })
    return errorResponse({
      error_code: "platform_api_denied",
      message: "invalid_payload",
      details: parsed.error.issues,
      status: 400,
    })
  }

  const input = parsed.data
  await trackDistributeSubmit({ request, userId: user.id, input })

  try {
    const result = await submitDistributionJob({
      request,
      supabase,
      userId: user.id,
      input,
    })

    if (result.job.status === "failed") {
      const firstTaskError = result.tasks.find((task) => task.status === "failed")?.error
      await trackDistributeFail({
        request,
        userId: user.id,
        code: toFailCode(firstTaskError),
        message: "distribution_job_failed",
        details: {
          job_id: result.job.id,
          tasks: result.tasks.map((task) => ({
            platform: task.platform,
            mode: task.mode,
            status: task.status,
            error: task.error,
          })),
        },
      })
    } else {
      await trackDistributeSuccess({
        request,
        userId: user.id,
        result,
      })
    }

    return NextResponse.json({
      ok: true,
      job_id: result.job.id,
      tasks: result.tasks.map((task) => ({
        platform: task.platform,
        mode: task.mode,
        status: task.status,
        publish_url: task.publish_url,
        action_payload: task.action_payload,
        error: task.error,
      })),
    })
  } catch (error) {
    const normalized = normalizeDistributionError(error)
    await trackDistributeFail({
      request,
      userId: user.id,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    })

    return errorResponse({
      error_code: normalized.code,
      message: normalized.message,
      details: normalized.details || null,
      status: normalized.status,
    })
  }
}
