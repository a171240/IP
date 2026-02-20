import { z } from "zod"

import type { ComplianceReport } from "@/lib/types/content-pipeline"

export const rewriteResultSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20000),
  script: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
  cover_prompts: z.array(z.string().trim().min(1).max(400)).min(1).max(10),
})

export const rewriteComplianceSchema = z.object({
  risk_level: z.enum(["safe", "medium", "high"]),
  flags: z.array(z.string().trim().min(1).max(160)).max(50),
})

export const rewriteModelOutputSchema = z.object({
  result: rewriteResultSchema,
  compliance_report: rewriteComplianceSchema,
})

export type RewriteResult = z.infer<typeof rewriteResultSchema>
export type RewriteComplianceReport = z.infer<typeof rewriteComplianceSchema>
export type RewriteModelOutput = z.infer<typeof rewriteModelOutputSchema>

export type ContentSourceForRewrite = {
  id: string
  platform: string
  source_url: string
  title: string | null
  text_content: string | null
  images: unknown
  video_url: string | null
  author: string | null
  meta: unknown
  raw_payload: unknown
  status: string
}

export type RewriteExecutionResult = {
  result: RewriteResult
  compliance_report: ComplianceReport
}
