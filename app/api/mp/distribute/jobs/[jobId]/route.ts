import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { getDistributionJob, normalizeDistributionError, type DistributionErrorCode } from "@/lib/distribution/service"

export const runtime = "nodejs"

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const id = (jobId || "").trim()

  if (!id) {
    return errorResponse({
      error_code: "platform_api_denied",
      message: "missing_job_id",
      status: 400,
    })
  }

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

  try {
    const result = await getDistributionJob({
      supabase,
      userId: user.id,
      jobId: id,
    })

    return NextResponse.json({
      ok: true,
      job: result.job,
      tasks: result.tasks.map((task) => ({
        platform: task.platform,
        mode: task.mode,
        status: task.status,
        publish_url: task.publish_url,
        action_payload: task.action_payload,
        error: task.error,
        retry_count: task.retry_count,
        updated_at: task.updated_at,
      })),
    })
  } catch (error) {
    const normalized = normalizeDistributionError(error)
    return errorResponse({
      error_code: normalized.code,
      message: normalized.message,
      details: normalized.details || null,
      status: normalized.status,
    })
  }
}
