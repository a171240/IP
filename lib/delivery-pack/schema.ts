import { z } from "zod"

export const deliveryPackInputSchema = z.object({
  industry: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  account_type: z.string().trim().min(1),
  team_size: z.string().trim().min(1),
  delivery_mode: z.string().trim().min(1),
  weekly_output: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  current_problem: z.array(z.string()).default([]),
  product_or_service: z.string().trim().optional(),
  target_audience: z.string().trim().optional(),
  price_range: z.string().trim().optional(),
  tone: z.string().trim().optional(),
})

export type DeliveryPackInput = z.infer<typeof deliveryPackInputSchema>

export const deliveryPackOutputSchema = z.object({
  scorecard: z.object({
    dimensions: z
      .array(
        z.object({
          name: z.string().min(1),
          score: z.number().min(0).max(10),
          insight: z.string().min(1),
        })
      )
      .min(5),
    core_bottleneck: z.string().min(1),
    top_actions: z.array(z.string().min(1)).min(3),
  }),
  calendar_7d: z
    .array(
      z.object({
        day: z.string().min(1),
        theme: z.string().min(1),
        deliverable: z.string().min(1),
        notes: z.string().optional(),
      })
    )
    .min(7),
  topic_bank_10: z
    .array(
      z.object({
        title: z.string().min(1),
        intent: z.string().min(1),
        hook: z.string().min(1),
      })
    )
    .min(10),
  scripts_3: z
    .array(
      z.object({
        title: z.string().min(1),
        hook: z.string().min(1),
        outline: z.array(z.string().min(1)).min(3),
        cta: z.string().min(1),
      })
    )
    .min(3),
  qc_checklist_10: z.array(z.string().min(1)).min(10),
  thinking_summary: z.array(z.string().min(1)).min(3).max(6).optional(),
})

export type DeliveryPackOutput = z.infer<typeof deliveryPackOutputSchema>
