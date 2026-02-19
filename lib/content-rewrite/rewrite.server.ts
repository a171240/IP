import "server-only"

import { applyRewriteCompliance } from "@/lib/content-rewrite/compliance"
import { callRewriteModel } from "@/lib/content-rewrite/llm.server"
import { loadRewritePromptBundle } from "@/lib/content-rewrite/prompt.server"
import {
  rewriteComplianceSchema,
  rewriteResultSchema,
  type ContentSourceForRewrite,
  type RewriteExecutionResult,
} from "@/lib/content-rewrite/types"
import type { RewriteRequestInput, RewriteTargetId } from "@/lib/types/content-pipeline"

export class RewriteGenerationError extends Error {
  readonly complianceReport?: RewriteExecutionResult["compliance_report"]

  constructor(message: string, complianceReport?: RewriteExecutionResult["compliance_report"]) {
    super(message)
    this.name = "RewriteGenerationError"
    this.complianceReport = complianceReport
  }
}

function truncateText(input: string, maxChars: number): string {
  return input.length <= maxChars ? input : `${input.slice(0, maxChars)}...(truncated)`
}

function stringifySafely(value: unknown, maxChars: number): string {
  try {
    const text = JSON.stringify(value ?? null)
    return truncateText(text, maxChars)
  } catch {
    return "{}"
  }
}

function toneGuide(tone: RewriteRequestInput["tone"]): string {
  if (tone === "sharp") return "表达要有观点锋芒，句子更短更有冲击力。"
  if (tone === "warm") return "表达要有温度和同理心，避免生硬说教。"
  return "表达要专业稳健，结构清晰，可直接发布。"
}

function targetGuide(target: RewriteTargetId): string {
  if (target === "douyin_video") {
    return [
      "目标平台：抖音短视频。",
      "script 必须是口播可直接使用的逐段脚本，建议包含开场钩子、核心观点、案例/方法、收束行动。",
      "body 作为视频发布文案，内容与 script 一致但更精炼。",
      "cover_prompts 用于封面图生成，强调文字可读性与场景感。",
    ].join("\n")
  }

  return [
    "目标平台：小红书图文。",
    "body 必须是可直接发布的图文正文，段落清晰、可读性高。",
    "script 作为可选口播版，便于图文转视频复用。",
    "cover_prompts 用于封面图生成，强调标题区留白与高对比排版。",
  ].join("\n")
}

function buildSourceSummary(source: ContentSourceForRewrite): string {
  const imagesText = Array.isArray(source.images) ? stringifySafely(source.images, 1000) : "[]"

  return [
    `source_id: ${source.id}`,
    `platform: ${source.platform}`,
    `source_url: ${source.source_url}`,
    `status: ${source.status}`,
    `title: ${source.title || ""}`,
    `author: ${source.author || ""}`,
    `video_url: ${source.video_url || ""}`,
    `text_content: ${truncateText(source.text_content || "", 12000)}`,
    `images: ${imagesText}`,
    `meta: ${stringifySafely(source.meta, 2000)}`,
    `raw_payload: ${stringifySafely(source.raw_payload, 2000)}`,
  ].join("\n")
}

function buildMessages(opts: {
  target: RewriteTargetId
  tone: RewriteRequestInput["tone"]
  avoidRiskWords: boolean
  source: ContentSourceForRewrite
  promptBundle: Awaited<ReturnType<typeof loadRewritePromptBundle>>
}) {
  const riskRule = opts.avoidRiskWords
    ? "必须主动规避高风险词（绝对化承诺、医疗疗效、联系方式导流、交易导流），优先改写为中性表达。"
    : "可以正常表达营销动作，但不能编造事实。"

  const systemPrompt = [
    opts.promptBundle.basePrompt,
    "---",
    opts.promptBundle.targetPrompt,
    "---",
    toneGuide(opts.tone),
    targetGuide(opts.target),
    riskRule,
    "输出必须是严格 JSON。禁止输出 markdown、解释、前后缀。",
    "JSON 必须完整包含 result 和 compliance_report，字段缺失视为失败。",
  ].join("\n\n")

  const userPrompt = [
    "请基于以下 source 进行改写。",
    "要求：保留核心事实，不杜撰具体数据或经历；语言更适配目标平台。",
    "source: ",
    buildSourceSummary(opts.source),
  ].join("\n")

  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ]
}

export async function generateContentRewrite(opts: {
  source: ContentSourceForRewrite
  target: RewriteTargetId
  tone: RewriteRequestInput["tone"]
  avoidRiskWords: boolean
}): Promise<RewriteExecutionResult> {
  const promptBundle = await loadRewritePromptBundle(opts.target)

  const modelOutput = await callRewriteModel({
    messages: buildMessages({
      target: opts.target,
      tone: opts.tone,
      avoidRiskWords: opts.avoidRiskWords,
      source: opts.source,
      promptBundle,
    }),
    maxTokens: 3200,
  })

  const applied = applyRewriteCompliance({
    result: modelOutput.result,
    avoidRiskWords: opts.avoidRiskWords,
    modelCompliance: modelOutput.compliance_report,
  })

  const resultChecked = rewriteResultSchema.safeParse(applied.result)
  if (!resultChecked.success) {
    throw new RewriteGenerationError("模型输出结构不完整")
  }

  const complianceChecked = rewriteComplianceSchema.safeParse(applied.compliance_report)
  if (!complianceChecked.success) {
    throw new RewriteGenerationError("合规报告结构无效")
  }

  if (applied.shouldFail) {
    throw new RewriteGenerationError("内容风险过高，无法自动改写", complianceChecked.data)
  }

  return {
    result: resultChecked.data,
    compliance_report: complianceChecked.data,
  }
}
