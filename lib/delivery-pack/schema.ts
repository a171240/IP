import { z } from "zod"

export const deliveryPackInputSchema = z.object({
  team_type: z.string().trim().min(1),
  team_size: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  offer_type: z.string().trim().min(1),
  offer_desc: z.string().trim().min(1),
  delivery_mode: z.string().trim().optional(),
  sop_level: z.string().trim().optional(),
  guideline_level: z.string().trim().optional(),
  current_problem: z.array(z.string().trim()).min(1).optional(),
  topic_library: z.string().trim().optional(),
  multi_project: z.string().trim().optional(),
  script_review: z.string().trim().optional(),
  qc_process: z.string().trim().optional(),
  conversion_path: z.string().trim().optional(),
  review_frequency: z.string().trim().optional(),
  product_or_service: z.string().trim().optional(),
  target_audience: z.string().trim().optional(),
  price_range: z.string().trim().optional(),
  tone: z.string().trim().optional(),
})

export type DeliveryPackInput = z.infer<typeof deliveryPackInputSchema>

export const deliveryPackOutputSchema = z.object({
  meta: z.object({
    industry: z.string().min(1),
    platform: z.string().min(1),
    team_type: z.string().min(1),
    offer_desc: z.string().min(1),
  }),
  bottleneck: z.string().min(1),
  top_actions: z
    .array(
      z.object({
        title: z.string().min(1),
        why: z.string().min(1),
        do_in_7_days: z.array(z.string().min(1)).min(2),
      })
    )
    .length(3),
  scores: z
    .array(
      z.object({
        dimension: z.string().min(1),
        score: z.number().min(0).max(100),
        insight: z.string().min(1),
        fix: z.string().min(1),
      })
    )
    .length(5),
  calendar_7d: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        type: z.string().min(1),
        title: z.string().min(1),
        hook: z.string().min(1),
        outline: z.array(z.string().min(1)).min(3),
        cta: z.string().min(1),
        script_id: z.string().min(1),
      })
    )
    .length(7),
  topics_10: z
    .array(
      z.object({
        title: z.string().min(1),
        audience: z.string().min(1),
        scene: z.string().min(1),
        pain: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(2),
        type: z.string().min(1),
        cta: z.string().min(1),
      })
    )
    .length(10),
  scripts_3: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.string().min(1),
        duration: z.string().min(1),
        shots: z
          .array(
            z.object({
              t: z.string().min(1),
              line: z.string().min(1),
              visual: z.string().min(1),
            })
          )
          .min(3),
        cta: z.string().min(1),
        title_options: z.array(z.string().min(1)).length(3),
        pinned_comment: z.string().min(1),
      })
    )
    .length(3),
  qc_checklist: z.object({
    title: z.array(z.string().min(1)).min(3),
    body: z.array(z.string().min(1)).min(3),
    cta_and_compliance: z.array(z.string().min(1)).min(3),
  }),
  archive_rules: z.object({
    naming: z.string().min(1),
    tags: z.array(z.string().min(1)).min(3),
    dedupe: z.array(z.string().min(1)).min(3),
  }),
  upsell: z.object({
    when_to_upgrade: z.array(z.string().min(1)).min(2),
    cta: z.string().min(1),
  }),
  thinking_summary: z.array(z.string().min(1)).min(3).max(6).optional(),
})

export type DeliveryPackOutput = z.infer<typeof deliveryPackOutputSchema>
