import { z } from "zod"

export const DimensionIdSchema = z.enum([
  "persuasion",
  "fluency",
  "expression",
  "pronunciation",
  "organization",
  "professionalism",
])

export type DimensionId = z.infer<typeof DimensionIdSchema>

export const DimensionScoreSchema = z.object({
  id: DimensionIdSchema,
  name: z.string(),
  score: z.number(),
  stars: z.number(),
})

export type DimensionScore = z.infer<typeof DimensionScoreSchema>

export const ChartPointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export type ChartPoint = z.infer<typeof ChartPointSchema>

export const ChartSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string().optional(),
  target_range: z.tuple([z.number(), z.number()]).optional(),
  points: z.array(ChartPointSchema),
})

export type Chart = z.infer<typeof ChartSchema>

const SubmetricSchema = z.object({
  name: z.string(),
  status: z.string(),
  stars: z.number(),
  advice_paragraph: z.string(),
})

export const ReportPersuasionTabSchema = z.object({
  title: z.string().min(1),
  submetrics: z.array(SubmetricSchema),
  tags: z.array(z.string()),
  customer_objection: z.string(),
  your_response: z.string(),
  improved_response: z.string(),
})

export type ReportPersuasionTab = z.infer<typeof ReportPersuasionTabSchema>

export const ReportFluencyTabSchema = z.object({
  title: z.string().min(1),
  submetrics: z.array(SubmetricSchema),
  avg_speed_wpm: z.number().nullable(),
  target_speed_range: z.tuple([z.number(), z.number()]),
  charts: z.array(ChartSchema),
})

export type ReportFluencyTab = z.infer<typeof ReportFluencyTabSchema>

export const ReportExpressionTabSchema = z.object({
  title: z.string().min(1),
  submetrics: z.array(SubmetricSchema),
  filler_ratio: z.number().nullable(),
  charts: z.array(ChartSchema),
})

export type ReportExpressionTab = z.infer<typeof ReportExpressionTabSchema>

export const ReportPronunciationTabSchema = z.object({
  title: z.string().min(1),
  submetrics: z.array(SubmetricSchema),
  charts: z.array(ChartSchema),
})

export type ReportPronunciationTab = z.infer<typeof ReportPronunciationTabSchema>

export const AudioExampleSchema = z.object({
  turn_id: z.string(),
  audio_path: z.string(),
  audio_seconds: z.number().nullable(),
  audio_url: z.string().optional(),
})

export type AudioExample = z.infer<typeof AudioExampleSchema>

export const ReportOrganizationTabSchema = z.object({
  title: z.string().min(1),
  submetrics: z.array(SubmetricSchema),
  advice_paragraph: z.string(),
  audio_examples: z.array(AudioExampleSchema),
})

export type ReportOrganizationTab = z.infer<typeof ReportOrganizationTabSchema>

const ProfessionalismSubmetricSchema = z.object({
  code: z.string(),
  name: z.string(),
  label: z.string(),
  score: z.number(),
  stars: z.number(),
  evidence_quote: z.string(),
  missed_point: z.string(),
  advice: z.string(),
  advice_paragraph: z.string(),
  status: z.string(),
})

const ProfessionalismRedFlagSchema = z.object({
  code: z.string(),
  quote: z.string(),
  safer_rewrite: z.string(),
})

export const ReportProfessionalismTabSchema = z.object({
  summary: z.string(),
  advice_paragraph: z.string(),
  submetrics: z.array(ProfessionalismSubmetricSchema),
  red_flags: z.array(ProfessionalismRedFlagSchema),
  missed_must_cover: z.array(z.string()),
  must_cover_hits: z.array(z.string()),
  next_practice_focus: z.string(),
})

export type ReportProfessionalismTab = z.infer<typeof ReportProfessionalismTabSchema>

export const VoiceCoachReportMetaSchema = z.object({
  version: z.literal("v2"),
  generated_at: z.string(),
  total_turn_count: z.number().int().nonnegative(),
  total_beautician_turn_count: z.number().int().nonnegative(),
  analyzed_beautician_turn_count: z.number().int().nonnegative(),
  is_complete: z.boolean(),
  representative_turn_id: z.string().nullable(),
  organization_example_turn_ids: z.array(z.string()),
})

export type VoiceCoachReportMeta = z.infer<typeof VoiceCoachReportMetaSchema>

export const VoiceCoachReportTrainingContextSchema = z.object({
  title: z.string().min(1),
  background_summary: z.string(),
  scene_kind: z.string().optional(),
  scene_kind_label: z.string().optional(),
  policy_focus: z.string().optional(),
  focus_points: z.array(z.string()),
  hit_points: z.array(z.string()),
  missed_points: z.array(z.string()),
  risk_points: z.array(z.string()),
})

export type VoiceCoachReportTrainingContext = z.infer<typeof VoiceCoachReportTrainingContextSchema>

export const VoiceCoachReportReferenceTurnSchema = z.object({
  role: z.enum(["customer", "beautician"]),
  turn_id: z.string().optional(),
  turn_index: z.number().int().optional(),
  text: z.string(),
})

export type VoiceCoachReportReferenceTurn = z.infer<typeof VoiceCoachReportReferenceTurnSchema>

export const VoiceCoachReportNextRoundFocusSchema = z.object({
  source_session_id: z.string().optional(),
  focus_dimension_id: DimensionIdSchema,
  focus_dimension_name: z.string(),
  focus_score: z.number(),
  title: z.string(),
  instruction: z.string(),
  practice_points: z.array(z.string()),
  missed_points: z.array(z.string()),
  risk_points: z.array(z.string()),
  summary_blocks: z.array(z.string()),
  reference_turns: z.array(VoiceCoachReportReferenceTurnSchema),
  suggested_response: z.string().optional(),
})

export type VoiceCoachReportNextRoundFocus = z.infer<typeof VoiceCoachReportNextRoundFocusSchema>

export const VoiceCoachReportSchema = z.object({
  total_score: z.number(),
  dimension: z.array(DimensionScoreSchema).min(5).max(6),
  summary_blocks: z.array(z.string()).length(3),
  training_context: VoiceCoachReportTrainingContextSchema.optional(),
  next_round_focus: VoiceCoachReportNextRoundFocusSchema.optional(),
  tabs: z.object({
    persuasion: ReportPersuasionTabSchema,
    fluency: ReportFluencyTabSchema,
    expression: ReportExpressionTabSchema,
    pronunciation: ReportPronunciationTabSchema,
    organization: ReportOrganizationTabSchema,
    professionalism: ReportProfessionalismTabSchema.optional(),
  }),
  meta: VoiceCoachReportMetaSchema.optional(),
})

export type VoiceCoachReport = z.infer<typeof VoiceCoachReportSchema>
