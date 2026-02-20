import { z } from "zod"

export const INGEST_MODE_VALUES = ["single_link", "douyin_profile"] as const
export const SOURCE_PLATFORM_VALUES = ["douyin", "xiaohongshu"] as const
export const TARGET_VALUES = ["douyin_video", "xhs_note"] as const
export const DISTRIBUTION_PLATFORM_VALUES = ["xiaohongshu", "douyin", "video_account"] as const
export const DISTRIBUTION_MODE_VALUES = ["immediate", "scheduled"] as const
export const DISTRIBUTION_TASK_MODE_VALUES = ["api", "assistant"] as const
export const VIDEO_DURATION_VALUES = ["15_25s"] as const

export const CONTENT_PIPELINE_ERROR_CODES = [
  "unsupported_platform",
  "invalid_link",
  "extract_failed",
  "private_or_deleted_content",
  "rewrite_failed",
  "avatar_input_invalid",
  "video_render_failed",
  "platform_not_connected",
  "platform_api_denied",
  "assistant_fallback_required",
  "insufficient_credits",
  "plan_required",
] as const

export type IngestMode = (typeof INGEST_MODE_VALUES)[number]
export type SourcePlatformId = (typeof SOURCE_PLATFORM_VALUES)[number]
export type RewriteTargetId = (typeof TARGET_VALUES)[number]
export type DistributionPlatformId = (typeof DISTRIBUTION_PLATFORM_VALUES)[number]
export type DistributionMode = (typeof DISTRIBUTION_MODE_VALUES)[number]
export type DistributionTaskMode = (typeof DISTRIBUTION_TASK_MODE_VALUES)[number]
export type VideoDurationProfile = (typeof VIDEO_DURATION_VALUES)[number]
export type ContentPipelineErrorCode = (typeof CONTENT_PIPELINE_ERROR_CODES)[number]

export const ingestSingleLinkSchema = z.object({
  mode: z.literal("single_link"),
  url: z.string().trim().url().max(2000),
})

export const ingestProfileSchema = z.object({
  mode: z.literal("douyin_profile"),
  profile_url: z.string().trim().url().max(2000),
  limit: z.number().int().min(1).max(20).optional().default(20),
})

export const rewriteRequestSchema = z.object({
  source_id: z.string().uuid(),
  target: z.enum(TARGET_VALUES),
  tone: z.enum(["professional", "sharp", "warm"]).optional().default("professional"),
  constraints: z
    .object({
      avoid_risk_words: z.boolean().optional().default(true),
    })
    .optional()
    .default({ avoid_risk_words: true }),
})

export const createVideoJobSchema = z.object({
  rewrite_id: z.string().uuid(),
  duration_profile: z.enum(VIDEO_DURATION_VALUES).optional().default("15_25s"),
  avatar_profile_id: z.string().uuid(),
  product_assets: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
})

export const distributeRequestSchema = z
  .object({
    content_id: z.string().uuid(),
    platforms: z.array(z.enum(DISTRIBUTION_PLATFORM_VALUES)).min(1).max(3),
    mode: z.enum(DISTRIBUTION_MODE_VALUES),
    schedule_at: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "scheduled" && !value.schedule_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule_at"],
        message: "schedule_at required when mode=scheduled",
      })
    }
  })

export type IngestSingleLinkInput = z.infer<typeof ingestSingleLinkSchema>
export type IngestProfileInput = z.infer<typeof ingestProfileSchema>
export type RewriteRequestInput = z.infer<typeof rewriteRequestSchema>
export type CreateVideoJobInput = z.infer<typeof createVideoJobSchema>
export type DistributeRequestInput = z.infer<typeof distributeRequestSchema>

export type ExtractedPayload = {
  title: string
  text: string
  images: string[]
  video_url: string | null
  author: string | null
  meta: Record<string, unknown>
}

export type ComplianceReport = {
  risk_level: "safe" | "medium" | "high"
  flags: string[]
}
