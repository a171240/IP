import { NextRequest, NextResponse } from "next/server"

import {
  advanceVideoRenderJob,
  getVideoRenderJobById,
  normalizeVideoPipelineError,
  toVideoJobView,
  type VideoPipelineErrorCode,
} from "@/lib/video-pipeline/jobs.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

type ErrorPayload = {
  ok: false
  error_code: VideoPipelineErrorCode
  message: string
}

function errorResponse(code: VideoPipelineErrorCode, message: string, status = 400) {
  const payload: ErrorPayload = {
    ok: false,
    error_code: code,
    message: message || code,
  }
  return NextResponse.json(payload, { status })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const id = (jobId || "").trim()
  if (!id) {
    return errorResponse("video_render_failed", "missing_job_id", 400)
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse("video_render_failed", "请先登录", 401)
  }

  try {
    const job = await getVideoRenderJobById({
      supabase,
      userId: user.id,
      jobId: id,
    })

    if (!job) {
      return errorResponse("video_render_failed", "job_not_found", 404)
    }

    const nextJob =
      job.status === "queued" || job.status === "running"
        ? await advanceVideoRenderJob({
            supabase,
            userId: user.id,
            job,
          })
        : job

    const view = await toVideoJobView(nextJob)

    return NextResponse.json({
      ok: true,
      job: {
        status: view.status,
        progress: view.progress,
        video_url: view.video_url,
        error: view.error,
      },
    })
  } catch (error) {
    const normalized = normalizeVideoPipelineError(error)
    const status = normalized.code === "avatar_input_invalid" ? 400 : 500
    return errorResponse(normalized.code, normalized.message, status)
  }
}

export async function POST() {
  return errorResponse("video_render_failed", "method_not_allowed", 405)
}
