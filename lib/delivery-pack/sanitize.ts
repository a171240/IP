import { DeliveryPackOutput } from "./schema"

const bannedPattern =
  /(击败|超过|行业排名|前\s*\d+%|top\s*\d+%|领先\s*\d+%|前\s*\d+%)/i

function sanitizeText(value: string, path: string): string {
  if (!bannedPattern.test(value)) return value
  console.warn(`[delivery-pack] sanitized banned phrasing at ${path}`)
  return "基于输入的推断"
}

function buildFallbackSummary(output: DeliveryPackOutput): string[] {
  const summary = [
    `核心瓶颈：${output.scorecard.core_bottleneck}`,
    output.scorecard.top_actions?.length
      ? `优先动作：${output.scorecard.top_actions.slice(0, 2).join(" / ")}`
      : "",
    output.calendar_7d?.[0]?.theme ? `7天排产主线：${output.calendar_7d[0].theme}` : "",
    output.scripts_3?.[0]?.title ? `成交脚本主弹点：${output.scripts_3[0].title}` : "",
  ]
  return summary.filter(Boolean).slice(0, 4)
}

export function sanitizeDeliveryPack(output: DeliveryPackOutput): DeliveryPackOutput {
  const thinkingSummary = output.thinking_summary?.length
    ? output.thinking_summary
    : buildFallbackSummary(output)
  return {
    scorecard: {
      dimensions: output.scorecard.dimensions.map((item, index) => ({
        ...item,
        name: sanitizeText(item.name, `scorecard.dimensions.${index}.name`),
        insight: sanitizeText(item.insight, `scorecard.dimensions.${index}.insight`),
      })),
      core_bottleneck: sanitizeText(output.scorecard.core_bottleneck, "scorecard.core_bottleneck"),
      top_actions: output.scorecard.top_actions.map((item, index) =>
        sanitizeText(item, `scorecard.top_actions.${index}`)
      ),
    },
    calendar_7d: output.calendar_7d.map((item, index) => ({
      ...item,
      day: sanitizeText(item.day, `calendar_7d.${index}.day`),
      theme: sanitizeText(item.theme, `calendar_7d.${index}.theme`),
      deliverable: sanitizeText(item.deliverable, `calendar_7d.${index}.deliverable`),
      notes: item.notes ? sanitizeText(item.notes, `calendar_7d.${index}.notes`) : undefined,
    })),
    topic_bank_10: output.topic_bank_10.map((item, index) => ({
      ...item,
      title: sanitizeText(item.title, `topic_bank_10.${index}.title`),
      intent: sanitizeText(item.intent, `topic_bank_10.${index}.intent`),
      hook: sanitizeText(item.hook, `topic_bank_10.${index}.hook`),
    })),
    scripts_3: output.scripts_3.map((item, index) => ({
      ...item,
      title: sanitizeText(item.title, `scripts_3.${index}.title`),
      hook: sanitizeText(item.hook, `scripts_3.${index}.hook`),
      outline: item.outline.map((line, lineIndex) =>
        sanitizeText(line, `scripts_3.${index}.outline.${lineIndex}`)
      ),
      cta: sanitizeText(item.cta, `scripts_3.${index}.cta`),
    })),
    qc_checklist_10: output.qc_checklist_10.map((item, index) =>
      sanitizeText(item, `qc_checklist_10.${index}`)
    ),
    thinking_summary: thinkingSummary.map((item, index) =>
      sanitizeText(item, `thinking_summary.${index}`)
    ),
  }
}
