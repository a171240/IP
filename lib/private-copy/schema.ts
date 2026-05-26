import { z } from "zod"

export const PRIVATE_COPY_PROMPT_VERSION = "private-copy-v1"

export const privateCopyModuleSchema = z.enum(["moment_post", "invitation", "follow_up", "moment_reply"])
export const privateCopyChannelSchema = z.enum(["wechat", "moments", "comment"])
export const privateCopyVariantSchema = z.enum(["warm", "professional", "direct", "interactive", "private_follow"])

export type PrivateCopyModule = z.infer<typeof privateCopyModuleSchema>
export type PrivateCopyChannel = z.infer<typeof privateCopyChannelSchema>
export type PrivateCopyVariant = z.infer<typeof privateCopyVariantSchema>

export const privateCopyInputSchema = z
  .object({
    tone: z.string().trim().max(40).optional().default(""),
    extraNotes: z.string().trim().max(200).optional().default(""),

    topic: z.string().trim().max(120).optional().default(""),
    projectName: z.string().trim().max(60).optional().default(""),
    targetAudience: z.string().trim().max(80).optional().default(""),
    imageNotes: z.string().trim().max(160).optional().default(""),

    customerRelation: z.string().trim().max(40).optional().default(""),
    invitePurpose: z.string().trim().max(100).optional().default(""),
    lastVisitAt: z.string().trim().max(40).optional().default(""),
    availableTimes: z.array(z.string().trim().min(1).max(30)).max(2).optional().default([]),
    concern: z.string().trim().max(80).optional().default(""),

    finishedAt: z.string().trim().max(40).optional().default(""),
    followUpStage: z.enum(["same_day", "day2", "day7", "rebook"]).optional(),
    customerStatus: z.string().trim().max(80).optional().default(""),
    careTips: z.array(z.string().trim().min(1).max(50)).max(3).optional().default([]),
    needRebook: z.boolean().optional().default(false),

    commentText: z.string().trim().max(300).optional().default(""),
    replyGoal: z.string().trim().max(40).optional().default(""),
    relationship: z.string().trim().max(40).optional().default(""),
    privateFollow: z.boolean().optional().default(false),
  })
  .passthrough()

export const generatePrivateCopySchema = z.object({
  module: privateCopyModuleSchema,
  scene: z.string().trim().max(80).optional().default(""),
  channel: privateCopyChannelSchema.optional(),
  store_profile_id: z.string().uuid().optional(),
  storeProfileId: z.string().uuid().optional(),
  customer_profile_id: z.string().uuid().optional(),
  customerProfileId: z.string().uuid().optional(),
  draft_id: z.string().uuid().optional().nullable(),
  draftId: z.string().uuid().optional().nullable(),
  variant_of: z.string().uuid().optional().nullable(),
  variantOf: z.string().uuid().optional().nullable(),
  input: privateCopyInputSchema,
})

export type GeneratePrivateCopyInput = z.infer<typeof generatePrivateCopySchema>
export type PrivateCopyInput = z.infer<typeof privateCopyInputSchema>

export const privateCopyOutputSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(900),
  channel: privateCopyChannelSchema.optional(),
  variant: privateCopyVariantSchema.optional(),
  sendTiming: z.string().trim().max(80).optional(),
  secondFollowUp: z.string().trim().max(300).optional(),
  imageSuggestions: z.array(z.string().trim().max(80)).max(5).optional(),
  privateMessageSuggestion: z.string().trim().max(300).optional(),
  whyThisWorks: z.string().trim().max(300).optional(),
  riskNotes: z.array(z.string().trim().max(120)).max(5).optional().default([]),
})

export const privateCopyResultSchema = z.object({
  outputs: z.array(privateCopyOutputSchema).min(3).max(3),
  usageTips: z.array(z.string().trim().max(120)).max(5).optional().default([]),
})

const looseTrimmedString = z.preprocess((value) => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}, z.string().trim())

const looseStringArray = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : String(item ?? ""))).filter(Boolean)
  }
  if (typeof value === "string" && value.trim()) return [value]
  return []
}, z.array(z.string().trim()).default([]))

export const privateCopyLooseOutputSchema = z
  .object({
    id: looseTrimmedString.optional().default(""),
    title: looseTrimmedString.optional().default(""),
    text: looseTrimmedString.refine((value) => value.length > 0, "text_required"),
    channel: looseTrimmedString.optional().default(""),
    variant: looseTrimmedString.optional().default(""),
    sendTiming: looseTrimmedString.optional().default(""),
    secondFollowUp: looseTrimmedString.optional().default(""),
    imageSuggestions: looseStringArray.optional().default([]),
    privateMessageSuggestion: looseTrimmedString.optional().default(""),
    whyThisWorks: looseTrimmedString.optional().default(""),
    riskNotes: looseStringArray.optional().default([]),
  })
  .passthrough()

export const privateCopyLooseResultSchema = z
  .object({
    outputs: z.array(privateCopyLooseOutputSchema).min(1).max(6),
    usageTips: looseStringArray.optional().default([]),
  })
  .passthrough()

export type PrivateCopyOutput = z.infer<typeof privateCopyOutputSchema>
export type PrivateCopyResult = z.infer<typeof privateCopyResultSchema>
export type PrivateCopyLooseOutput = z.infer<typeof privateCopyLooseOutputSchema>
export type PrivateCopyLooseResult = z.infer<typeof privateCopyLooseResultSchema>

export const patchPrivateCopyDraftSchema = z.object({
  action: z.enum(["select_output", "record_copy", "mark_used", "archive", "edit_output"]),
  outputId: z.string().trim().max(40).optional(),
  text: z.string().trim().max(800).optional(),
})

export type PatchPrivateCopyDraftInput = z.infer<typeof patchPrivateCopyDraftSchema>

export function defaultChannelForModule(module: PrivateCopyModule): PrivateCopyChannel {
  if (module === "moment_post") return "moments"
  if (module === "moment_reply") return "comment"
  return "wechat"
}
