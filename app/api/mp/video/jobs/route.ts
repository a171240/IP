import { NextRequest, NextResponse } from "next/server"

import { createVideoJobSchema } from "@/lib/types/content-pipeline"
import { normalizeVideoPipelineError, type VideoPipelineErrorCode } from "@/lib/video-pipeline/jobs.server"
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

async function ensureProfileRowExists(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  user: { id: string; email?: string | null; user_metadata?: unknown },
) {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (!error && data?.id) return
  if (error?.code !== "PGRST116") return

  await supabase.from("profiles").insert({
    id: user.id,
    email: user.email,
    nickname: (user.user_metadata as Record<string, unknown> | null)?.nickname || user.email?.split("@")[0] || "User",
    avatar_url: (user.user_metadata as Record<string, unknown> | null)?.avatar_url || null,
    plan: "free",
    credits_balance: 30,
    credits_unlimited: false,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse("video_render_failed", "请先登录", 401)
  }

  const body = await request.json().catch(() => null)
  const parsed = createVideoJobSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse("video_render_failed", "invalid_payload", 400)
  }

  const input = parsed.data
  const now = new Date().toISOString()

  try {
    try {
      await ensureProfileRowExists(supabase, user)
    } catch {
      // Ignore and proceed; insert will surface a concrete error if FK constraints fail.
    }

    const { data: rewrite, error: rewriteError } = await supabase
      .from("content_rewrites")
      .select("id")
      .eq("id", input.rewrite_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (rewriteError) {
      return errorResponse("video_render_failed", rewriteError.message || "rewrite_query_failed", 500)
    }
    if (!rewrite?.id) {
      return errorResponse("video_render_failed", "rewrite_not_found", 400)
    }

    const { data: avatar, error: avatarError } = await supabase
      .from("store_profiles")
      .select("id, boss_drive_video_path, boss_portrait_path")
      .eq("id", input.avatar_profile_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (avatarError) {
      return errorResponse("video_render_failed", avatarError.message || "avatar_query_failed", 500)
    }
    if (!avatar?.id) {
      return errorResponse("avatar_input_invalid", "avatar_profile_not_found", 400)
    }

    const hasAvatarAssets =
      (typeof avatar.boss_drive_video_path === "string" && avatar.boss_drive_video_path.trim().length > 0) ||
      (typeof avatar.boss_portrait_path === "string" && avatar.boss_portrait_path.trim().length > 0)
    if (!hasAvatarAssets) {
      return errorResponse("avatar_input_invalid", "avatar_profile_assets_missing", 400)
    }

    const { data: existing, error: existingError } = await supabase
      .from("video_render_jobs")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("rewrite_id", input.rewrite_id)
      .eq("avatar_profile_id", input.avatar_profile_id)
      .eq("duration_profile", input.duration_profile)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return errorResponse("video_render_failed", existingError.message || "idempotency_query_failed", 500)
    }

    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        job_id: existing.id,
        status: "queued",
      })
    }

    const { data: created, error: createError } = await supabase
      .from("video_render_jobs")
      .insert({
        user_id: user.id,
        rewrite_id: input.rewrite_id,
        duration_profile: input.duration_profile,
        avatar_profile_id: input.avatar_profile_id,
        product_assets: input.product_assets,
        provider: "volc",
        provider_job_id: null,
        status: "queued",
        progress: 0,
        retry_count: 0,
        audio_storage_path: null,
        video_storage_path: null,
        error: null,
        updated_at: now,
      })
      .select("id, status")
      .single()

    if (createError || !created?.id) {
      return errorResponse("video_render_failed", createError?.message || "video_job_create_failed", 500)
    }

    // Best-effort bridge for downstream distribute flow.
    try {
      await supabase
        .from("xhs_drafts")
        .update({
          video_job_id: created.id,
          updated_at: now,
        })
        .eq("user_id", user.id)
        .eq("rewrite_id", input.rewrite_id)
        .is("video_job_id", null)
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      job_id: created.id,
      status: "queued",
    })
  } catch (error) {
    const normalized = normalizeVideoPipelineError(error)
    const status = normalized.code === "avatar_input_invalid" ? 400 : 500
    return errorResponse(normalized.code, normalized.message, status)
  }
}

export async function GET() {
  return errorResponse("video_render_failed", "method_not_allowed", 405)
}
