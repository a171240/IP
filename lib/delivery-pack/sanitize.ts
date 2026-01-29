import { DeliveryPackInput, DeliveryPackOutput } from "./schema"

const bannedPattern =
  /(击败|超过|行业排名|同行百分比|前\s*\d+%|top\s*\d+%|领先\s*\d+%|超过\s*\d+%)/i

const TEAM_TYPE_LABELS: Record<string, string> = {
  agency: "代运营团队",
  mcn: "MCN矩阵",
  brand_team: "品牌内容部",
  local_store: "本地生活门店",
  creator: "个人",
}

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  video_account: "视频号",
  wechat: "公众号",
}

const PLATFORM_TOKEN_MAP: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  video_account: "视频号",
  wechat: "公众号",
}

const TITLE_MAX = 36
const HOOK_MAX = 32
const OUTLINE_MAX = 36
const CTA_MAX = 40
const ACTION_TITLE_MAX = 36
const ACTION_DO_MAX = 42
const TOPIC_TITLE_MAX = 36
const KEYWORD_MAX = 12
const SCRIPT_TITLE_MAX = 36
const SCRIPT_CTA_MAX = 42
const PINNED_MAX = 60

function stripDayPrefix(text: string): string {
  return text.replace(/^\s*(day|Day)\s*\d+\s*[-–—·:：]?\s*/i, "").trim()
}

function normalizeTokens(text: string): string {
  let normalized = text
  Object.entries(PLATFORM_TOKEN_MAP).forEach(([key, label]) => {
    normalized = normalized.replace(new RegExp(key, "gi"), label)
  })
  return normalized
}

function sanitizeText(value: string, path: string): string {
  const trimmed = value.trim()
  const cleaned = trimmed
    .replace(/^[?？·•\-—–]+/g, "")
    .replace(/\?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  const normalized = normalizeTokens(cleaned)
  if (!bannedPattern.test(normalized)) return normalized
  console.warn(`[delivery-pack] sanitized banned phrasing at ${path}`)
  return "基于输入的推断"
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return value.slice(0, maxLength)
}

function normalizeCalendarType(value: string): "引流" | "建信" | "转化" {
  if (value.includes("引流") || value.includes("获客")) return "引流"
  if (value.includes("建信") || value.includes("信任")) return "建信"
  if (value.includes("转化") || value.includes("成交")) return "转化"
  return "引流"
}

function normalizeScriptId(value: string, index: number): string {
  const upper = value.toUpperCase().trim()
  if (["S1", "S2", "S3"].includes(upper)) return upper
  return `S${Math.min(3, index + 1)}`
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 5
  const scaled = value > 10 ? value / 10 : value
  const clamped = Math.min(10, Math.max(1, scaled))
  return Math.round(clamped * 10) / 10
}

function buildFallbackSummary(output: DeliveryPackOutput): string[] {
  const firstCalendar = output.calendar_7d?.[0]
  const firstScript = output.scripts_3?.[0]
  const summary = [
    `核心瓶颈：${output.bottleneck}`,
    output.top_actions?.length ? `优先动作：${output.top_actions[0].title}` : "",
    firstCalendar ? `明日发布：${firstCalendar.title}` : "",
    firstScript ? `成交脚本：${firstScript.id}` : "",
  ]
  return summary.filter(Boolean).slice(0, 4)
}

export function sanitizeDeliveryPack(
  input: DeliveryPackInput,
  output: DeliveryPackOutput
): DeliveryPackOutput {
  const teamTypeLabel = TEAM_TYPE_LABELS[input.team_type] || input.team_type
  const platformLabel = PLATFORM_LABELS[input.platform] || input.platform
  const thinkingSummary = output.thinking_summary?.length
    ? output.thinking_summary
    : buildFallbackSummary(output)

  const normalizedCalendar = output.calendar_7d.map((item, index) => ({
    ...item,
    day: item.day || index + 1,
    type: normalizeCalendarType(item.type),
    title: truncateText(
      stripDayPrefix(sanitizeText(item.title, `calendar_7d.${index}.title`)),
      TITLE_MAX
    ),
    hook: truncateText(sanitizeText(item.hook, `calendar_7d.${index}.hook`), HOOK_MAX),
    outline: item.outline.slice(0, 3).map((line, lineIndex) =>
      truncateText(sanitizeText(line, `calendar_7d.${index}.outline.${lineIndex}`), OUTLINE_MAX)
    ),
    cta: truncateText(sanitizeText(item.cta, `calendar_7d.${index}.cta`), CTA_MAX),
    script_id: normalizeScriptId(item.script_id, index),
  }))

  const typeCounts = normalizedCalendar.reduce(
    (acc, item) => {
      if (item.type === "引流") acc.lead += 1
      if (item.type === "建信") acc.trust += 1
      if (item.type === "转化") acc.convert += 1
      return acc
    },
    { lead: 0, trust: 0, convert: 0 }
  )

  if (typeCounts.lead < 3 || typeCounts.trust < 2 || typeCounts.convert < 2) {
    normalizedCalendar.forEach((item, index) => {
      if (index <= 2) item.type = "引流"
      else if (index <= 4) item.type = "建信"
      else item.type = "转化"
    })
  }

  const normalizedScripts = output.scripts_3.map((script, index) => {
    const scriptId = normalizeScriptId(script.id, index)
    const shots = script.shots?.length ? script.shots.slice(0, 4) : []
    const fallbackShots = [
      {
        t: "0-3s",
        line: script.shots?.[0]?.line || script.title_options?.[0] || "开场抛出核心问题",
        visual: script.shots?.[0]?.visual || "正面出镜 + 大字标题",
      },
      {
        t: "3-15s",
        line: script.shots?.[1]?.line || script.title_options?.[1] || "拆解痛点与常见误区",
        visual: script.shots?.[1]?.visual || "要点弹幕 + 画面切换",
      },
      {
        t: "15-35s",
        line: script.shots?.[2]?.line || script.title_options?.[2] || "给出可执行方法",
        visual: script.shots?.[2]?.visual || "流程示意 + 简单案例",
      },
      {
        t: "35-45s",
        line: script.shots?.[3]?.line || script.cta || "收束并引导动作",
        visual: script.shots?.[3]?.visual || "强调CTA + 固定话术",
      },
    ]

    const normalizedShots = (shots.length >= 3 ? shots : fallbackShots).slice(0, 3).map((shot) => ({
      t: sanitizeText(shot.t, `scripts_3.${index}.shots.t`),
      line: sanitizeText(shot.line, `scripts_3.${index}.shots.line`),
      visual: sanitizeText(shot.visual, `scripts_3.${index}.shots.visual`),
    }))

    return {
      ...script,
      id: scriptId,
      type: sanitizeText(script.type, `scripts_3.${index}.type`),
      duration: sanitizeText(script.duration, `scripts_3.${index}.duration`),
      shots: normalizedShots,
      cta: truncateText(sanitizeText(script.cta, `scripts_3.${index}.cta`), SCRIPT_CTA_MAX),
      title_options: script.title_options
        .slice(0, 3)
        .map((title, optionIndex) =>
          truncateText(sanitizeText(title, `scripts_3.${index}.title_options.${optionIndex}`), SCRIPT_TITLE_MAX)
        ),
      pinned_comment: truncateText(
        sanitizeText(script.pinned_comment, `scripts_3.${index}.pinned_comment`),
        PINNED_MAX
      ),
    }
  })

  return {
    meta: {
      industry: sanitizeText(input.industry, "meta.industry"),
      platform: sanitizeText(platformLabel, "meta.platform"),
      team_type: sanitizeText(teamTypeLabel, "meta.team_type"),
      offer_desc: sanitizeText(input.offer_desc, "meta.offer_desc"),
    },
    bottleneck: sanitizeText(output.bottleneck, "bottleneck"),
    top_actions: output.top_actions.map((item, index) => ({
      title: truncateText(sanitizeText(item.title, `top_actions.${index}.title`), ACTION_TITLE_MAX),
      why: sanitizeText(item.why, `top_actions.${index}.why`),
      do_in_7_days: item.do_in_7_days.slice(0, 4).map((line, lineIndex) =>
        truncateText(sanitizeText(line, `top_actions.${index}.do_in_7_days.${lineIndex}`), ACTION_DO_MAX)
      ),
    })),
    scores: output.scores.map((item, index) => ({
      dimension: sanitizeText(item.dimension, `scores.${index}.dimension`),
      score: normalizeScore(item.score),
      insight: sanitizeText(item.insight, `scores.${index}.insight`),
      fix: sanitizeText(item.fix, `scores.${index}.fix`),
    })),
    calendar_7d: normalizedCalendar,
    topics_10: output.topics_10.map((item, index) => ({
      title: truncateText(sanitizeText(item.title, `topics_10.${index}.title`), TOPIC_TITLE_MAX),
      audience: sanitizeText(item.audience, `topics_10.${index}.audience`),
      scene: sanitizeText(item.scene, `topics_10.${index}.scene`),
      pain: sanitizeText(item.pain, `topics_10.${index}.pain`),
      keywords: item.keywords.slice(0, 5).map((keyword, keywordIndex) =>
        truncateText(sanitizeText(keyword, `topics_10.${index}.keywords.${keywordIndex}`), KEYWORD_MAX)
      ),
      type: normalizeCalendarType(item.type),
      cta: truncateText(sanitizeText(item.cta, `topics_10.${index}.cta`), CTA_MAX),
    })),
    scripts_3: normalizedScripts,
    qc_checklist: {
      title: output.qc_checklist.title.map((item, index) =>
        sanitizeText(item, `qc_checklist.title.${index}`)
      ),
      body: output.qc_checklist.body.map((item, index) =>
        sanitizeText(item, `qc_checklist.body.${index}`)
      ),
      cta_and_compliance: output.qc_checklist.cta_and_compliance.map((item, index) =>
        sanitizeText(item, `qc_checklist.cta_and_compliance.${index}`)
      ),
    },
    archive_rules: {
      naming: sanitizeText(output.archive_rules.naming, "archive_rules.naming"),
      tags: output.archive_rules.tags.map((item, index) =>
        sanitizeText(item, `archive_rules.tags.${index}`)
      ),
      dedupe: output.archive_rules.dedupe.map((item, index) =>
        sanitizeText(item, `archive_rules.dedupe.${index}`)
      ),
    },
    upsell: {
      when_to_upgrade: output.upsell.when_to_upgrade.map((item, index) =>
        sanitizeText(item, `upsell.when_to_upgrade.${index}`)
      ),
      cta: sanitizeText(output.upsell.cta, "upsell.cta"),
    },
    thinking_summary: thinkingSummary.map((item, index) =>
      sanitizeText(item, `thinking_summary.${index}`)
    ),
  }
}
