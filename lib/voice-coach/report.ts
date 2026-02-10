import { z } from "zod"

export const DimensionIdSchema = z.enum([
  "persuasion",
  "fluency",
  "expression",
  "pronunciation",
  "organization",
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

export const ReportPersuasionTabSchema = z.object({
  title: z.literal("说服力"),
  submetrics: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      stars: z.number(),
      advice_paragraph: z.string(),
    })
  ),
  tags: z.array(z.string()),
  customer_objection: z.string(),
  your_response: z.string(),
  improved_response: z.string(),
})

export type ReportPersuasionTab = z.infer<typeof ReportPersuasionTabSchema>

export const ReportFluencyTabSchema = z.object({
  title: z.literal("流利度"),
  submetrics: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      stars: z.number(),
      advice_paragraph: z.string(),
    })
  ),
  avg_speed_wpm: z.number().nullable(),
  target_speed_range: z.tuple([z.number(), z.number()]),
  charts: z.array(ChartSchema),
})

export type ReportFluencyTab = z.infer<typeof ReportFluencyTabSchema>

export const ReportExpressionTabSchema = z.object({
  title: z.literal("语言表达"),
  submetrics: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      stars: z.number(),
      advice_paragraph: z.string(),
    })
  ),
  filler_ratio: z.number().nullable(),
  charts: z.array(ChartSchema),
})

export type ReportExpressionTab = z.infer<typeof ReportExpressionTabSchema>

export const ReportPronunciationTabSchema = z.object({
  title: z.literal("发音准确度"),
  submetrics: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      stars: z.number(),
      advice_paragraph: z.string(),
    })
  ),
  charts: z.array(ChartSchema),
})

export type ReportPronunciationTab = z.infer<typeof ReportPronunciationTabSchema>

export const AudioExampleSchema = z.object({
  turn_id: z.string(),
  audio_path: z.string(),
  audio_seconds: z.number().nullable(),
})

export type AudioExample = z.infer<typeof AudioExampleSchema>

export const ReportOrganizationTabSchema = z.object({
  title: z.literal("语言组织"),
  submetrics: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      stars: z.number(),
      advice_paragraph: z.string(),
    })
  ),
  advice_paragraph: z.string(),
  audio_examples: z.array(AudioExampleSchema),
})

export type ReportOrganizationTab = z.infer<typeof ReportOrganizationTabSchema>

export const VoiceCoachReportSchema = z.object({
  total_score: z.number(),
  dimension: z.array(DimensionScoreSchema),
  summary_blocks: z.array(z.string()),
  tabs: z.object({
    persuasion: ReportPersuasionTabSchema,
    fluency: ReportFluencyTabSchema,
    expression: ReportExpressionTabSchema,
    pronunciation: ReportPronunciationTabSchema,
    organization: ReportOrganizationTabSchema,
  }),
})

export type VoiceCoachReport = z.infer<typeof VoiceCoachReportSchema>

