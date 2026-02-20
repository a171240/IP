import { NextRequest, NextResponse } from "next/server"

import { generateContentRewrite, RewriteGenerationError } from "@/lib/content-rewrite"
import type { ContentSourceForRewrite } from "@/lib/content-rewrite"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import {
  rewriteRequestSchema,
  type ComplianceReport,
  type ContentPipelineErrorCode,
  type RewriteRequestInput,
} from "@/lib/types/content-pipeline"

export const runtime = "nodejs"

const REWRITE_FAILED_CODE: ContentPipelineErrorCode = "rewrite_failed"

function failResponse(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error_code: REWRITE_FAILED_CODE,
      message,
    },
    { status }
  )
}

function mapRewriteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "rewrite_failed"

  if (message.includes("rewrite_model_output_invalid")) return "模型输出结构化失败"
  if (message.includes("rewrite_model_timeout")) return "改写超时，请重试"
  if (message.includes("rewrite_upstream_error")) return "改写模型调用失败"
  if (message.includes("APIMART_API_KEY")) return "改写服务未配置"
  if (message.startsWith("prompt_")) return "提示词不可用"
  if (message.includes("内容风险过高")) return "内容风险过高，无法自动改写"
  if (message.includes("结构")) return message

  return "改写失败"
}

async function loadSource(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
  userId: string
  sourceId: string
}): Promise<ContentSourceForRewrite | null> {
  const { data, error } = await opts.supabase
    .from("content_sources")
    .select("id, platform, source_url, title, text_content, images, video_url, author, meta, raw_payload, status")
    .eq("id", opts.sourceId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (error || !data) return null

  return data as ContentSourceForRewrite
}

async function tryInsertFailedRewriteRecord(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
  userId: string
  input: RewriteRequestInput
  compliance?: ComplianceReport
  reason: string
}) {
  const { error } = await opts.supabase.from("content_rewrites").insert({
    user_id: opts.userId,
    source_id: opts.input.source_id,
    target: opts.input.target,
    tone: opts.input.tone,
    constraints: opts.input.constraints,
    compliance_risk_level: opts.compliance?.risk_level || null,
    compliance_flags: opts.compliance?.flags || null,
    status: "failed",
    error_code: REWRITE_FAILED_CODE,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error("[content-rewrite] failed to record rewrite failure", {
      reason: opts.reason,
      user_id: opts.userId,
      source_id: opts.input.source_id,
      target: opts.input.target,
      error: error.message,
    })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = rewriteRequestSchema.safeParse(body)
  if (!parsed.success) {
    return failResponse("请求参数不合法", 400)
  }

  const input = parsed.data
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return failResponse("请先登录", 401)
  }

  const source = await loadSource({
    supabase,
    userId: user.id,
    sourceId: input.source_id,
  })

  if (!source) {
    // source_id 无效时不能写 content_rewrites（FK 约束），改为明确日志可追踪。
    console.warn("[content-rewrite] source not found", {
      user_id: user.id,
      source_id: input.source_id,
      target: input.target,
    })

    return failResponse("source_id 不存在或无权限", 404)
  }

  if (source.status === "failed") {
    await tryInsertFailedRewriteRecord({
      supabase,
      userId: user.id,
      input,
      reason: "source_status_failed",
    })

    return failResponse("源内容不可改写", 400)
  }

  try {
    const rewritten = await generateContentRewrite({
      source,
      target: input.target,
      tone: input.tone,
      avoidRiskWords: input.constraints.avoid_risk_words,
    })

    const now = new Date().toISOString()

    const { data: created, error: insertError } = await supabase
      .from("content_rewrites")
      .insert({
        user_id: user.id,
        source_id: input.source_id,
        target: input.target,
        tone: input.tone,
        constraints: input.constraints,
        result_title: rewritten.result.title,
        result_body: rewritten.result.body,
        result_script: rewritten.result.script,
        result_tags: rewritten.result.tags,
        cover_prompts: rewritten.result.cover_prompts,
        compliance_risk_level: rewritten.compliance_report.risk_level,
        compliance_flags: rewritten.compliance_report.flags,
        status: "done",
        error_code: null,
        updated_at: now,
      })
      .select("id")
      .single()

    if (insertError || !created?.id) {
      throw new Error(insertError?.message || "rewrite_insert_failed")
    }

    return NextResponse.json({
      ok: true,
      rewrite_id: created.id,
      result: rewritten.result,
      compliance_report: rewritten.compliance_report,
    })
  } catch (error) {
    const mappedMessage = mapRewriteErrorMessage(error)

    const complianceReport = error instanceof RewriteGenerationError ? error.complianceReport : undefined

    await tryInsertFailedRewriteRecord({
      supabase,
      userId: user.id,
      input,
      compliance: complianceReport,
      reason: "rewrite_runtime_error",
    })

    return failResponse(mappedMessage, 500)
  }
}
