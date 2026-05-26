import { z } from "zod"

export const PRIVATE_COPY_MODULES = ["moment_post", "invitation", "follow_up", "moment_reply"] as const
export const PRIVATE_COPY_STATUSES = ["generating", "draft", "used", "archived", "failed"] as const

export type PrivateCopyModule = (typeof PRIVATE_COPY_MODULES)[number]
export type PrivateCopyStatus = (typeof PRIVATE_COPY_STATUSES)[number]

export const privateCopyInputSchema = z.object({
  tone: z.string().trim().max(40).optional().default("温柔自然"),
  extraNotes: z.string().trim().max(500).optional().default(""),
  quickText: z.string().trim().max(160).optional().default(""),

  topic: z.string().trim().max(160).optional().default(""),
  projectName: z.string().trim().max(80).optional().default(""),
  targetAudience: z.string().trim().max(120).optional().default(""),
  imageNotes: z.string().trim().max(160).optional().default(""),

  customerRelation: z.string().trim().max(40).optional().default("老顾客"),
  invitePurpose: z.string().trim().max(160).optional().default(""),
  lastVisitAt: z.string().trim().max(80).optional().default(""),
  availableTimes: z.array(z.string().trim().max(80)).max(4).optional().default([]),
  concern: z.string().trim().max(160).optional().default(""),

  finishedAt: z.string().trim().max(80).optional().default(""),
  followUpStage: z.string().trim().max(40).optional().default("day2"),
  customerStatus: z.string().trim().max(160).optional().default(""),
  careTips: z.array(z.string().trim().max(120)).max(5).optional().default([]),
  needRebook: z.boolean().optional().default(false),

  commentText: z.string().trim().max(200).optional().default(""),
  replyGoal: z.string().trim().max(40).optional().default("自然回应"),
  relationship: z.string().trim().max(40).optional().default("普通顾客"),
  privateFollow: z.boolean().optional().default(false),
})

export const privateCopyGenerateRequestSchema = z.object({
  module: z.enum(PRIVATE_COPY_MODULES),
  scene: z.string().trim().max(80).optional().default(""),
  channel: z.string().trim().max(40).optional().default(""),
  variant_of: z.string().uuid().optional(),
  customer_profile_id: z.string().uuid().optional(),
  input: privateCopyInputSchema,
})

export type PrivateCopyInput = z.infer<typeof privateCopyInputSchema>
export type PrivateCopyGenerateRequest = z.infer<typeof privateCopyGenerateRequestSchema>

export type PrivateCopyCustomerProfile = {
  id: string
  name: string | null
  age_label: string | null
  occupation: string | null
  personality_tags: unknown
  communication_style: string | null
  core_concerns: unknown
  trust_triggers: unknown
  past_experience: string | null
  notes: string | null
}

export type PrivateCopyOutput = {
  id: string
  title: string
  text: string
  sendTiming?: string
  privateMessageSuggestion?: string
  riskNotes?: string[]
}

export type PrivateCopyRisk = {
  level: "low" | "medium" | "high"
  flags: string[]
}

export type PrivateCopyResult = {
  outputs: PrivateCopyOutput[]
  usageTips: string[]
  risk: PrivateCopyRisk
  model: string
}

export const privateCopyLlmOutputSchema = z.object({
  outputs: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(40),
        text: z.string().trim().min(8).max(800),
        sendTiming: z.string().trim().max(80).optional().default(""),
        privateMessageSuggestion: z.string().trim().max(180).optional().default(""),
        riskNotes: z.array(z.string().trim().min(1).max(120)).max(5).optional().default([]),
      })
    )
    .min(1)
    .max(3),
  usageTips: z.array(z.string().trim().min(1).max(120)).max(4).optional().default([]),
  risk: z
    .object({
      level: z.enum(["low", "medium", "high"]).optional().default("low"),
      flags: z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
    })
    .optional()
    .default({ level: "low", flags: [] }),
})
