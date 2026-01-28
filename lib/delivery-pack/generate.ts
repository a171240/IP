import { ZodError } from "zod"
import { jsonrepair } from "jsonrepair"
import { deliveryPackOutputSchema, DeliveryPackInput, DeliveryPackOutput } from "./schema"
import { calculateScore } from "../diagnosis/scoring"
import { sanitizeDeliveryPack } from "./sanitize"

const APIMART_API_KEY = process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY
const APIMART_BASE_URL =
  process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1"
const APIMART_MODEL = process.env.APIMART_MODEL || "kimi-k2-thinking"
const APIMART_QUICK_MODEL = process.env.APIMART_QUICK_MODEL || "kimi-k2-thinking-turbo"
const LLM_TIMEOUT_MS = Number(process.env.APIMART_TIMEOUT_MS || 240000)
const USE_FUNCTION_CALLING = process.env.APIMART_USE_TOOL !== "false"
const USE_SPLIT_GENERATION = process.env.APIMART_USE_SPLIT !== "false"
const USE_RESPONSE_FORMAT = process.env.APIMART_USE_RESPONSE_FORMAT === "true"
const LLM_MAX_RETRIES = 2

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

const OFFER_TYPE_LABELS: Record<string, string> = {
  service: "服务交付",
  course: "课程",
  ecommerce_product: "产品电商",
  saas: "SaaS工具",
  other: "其他",
}

const REQUIRED_DIMENSIONS = ["交付定位", "内容供给", "产能效率", "质检复盘", "成交转化"] as const

const SCORE_DIMENSION_MAP = {
  positioning: "交付定位",
  content: "内容供给",
  efficiency: "产能效率",
  emotion: "质检复盘",
  conversion: "成交转化",
} as const

function buildFallbackScores(input: DeliveryPackInput) {
  const answers: Record<string, string> = {
    sop_level: input.sop_level || "",
    guideline_level: input.guideline_level || "",
    topic_library: input.topic_library || "",
    multi_project: input.multi_project || "",
    script_review: input.script_review || "",
    qc_process: input.qc_process || "",
    conversion_path: input.conversion_path || "",
    review_frequency: input.review_frequency || "",
  }
  const result = calculateScore(answers)
  return Object.entries(SCORE_DIMENSION_MAP).map(([key, name]) => {
    const dim = result.dimensions[key as keyof typeof result.dimensions]
    const rawScore = typeof dim?.score === "number" ? dim.score : 0
    const safeScore = rawScore > 0 ? Math.min(10, Math.max(1, Math.round(rawScore))) : 5
    return {
      dimension: name,
      score: safeScore,
      insight: dim?.insight || "当前存在改进空间",
      fix: "本次交付包提供可执行方案",
    }
  })
}

const bannedPattern =
  /(击败|超过|行业排名|同行百分比|前\s*\d+%|top\s*\d+%|领先\s*\d+%|超过\s*\d+%)/i

const DELIVERY_PACK_TOOL = {
  type: "function",
  function: {
    name: "GenerateDeliveryPackV2",
    description: "Generate delivery pack v2 JSON for PDF delivery",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "meta",
        "bottleneck",
        "top_actions",
        "scores",
        "calendar_7d",
        "topics_10",
        "scripts_3",
        "qc_checklist",
        "archive_rules",
        "upsell",
      ],
      properties: {
        meta: {
          type: "object",
          additionalProperties: false,
          required: ["industry", "platform", "team_type", "offer_desc"],
          properties: {
            industry: { type: "string" },
            platform: { type: "string" },
            team_type: { type: "string" },
            offer_desc: { type: "string" },
          },
        },
        bottleneck: { type: "string" },
        top_actions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "why", "do_in_7_days"],
            properties: {
              title: { type: "string" },
              why: { type: "string" },
              do_in_7_days: {
                type: "array",
                minItems: 2,
                items: { type: "string" },
              },
            },
          },
        },
        scores: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dimension", "score", "insight", "fix"],
            properties: {
              dimension: { type: "string" },
              score: { type: "number", minimum: 0, maximum: 10 },
              insight: { type: "string" },
              fix: { type: "string" },
            },
          },
        },
        calendar_7d: {
          type: "array",
          minItems: 7,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["day", "type", "title", "hook", "outline", "cta", "script_id"],
            properties: {
              day: { type: "integer", minimum: 1, maximum: 7 },
              type: { type: "string" },
              title: { type: "string" },
              hook: { type: "string" },
              outline: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string" },
              },
              cta: { type: "string" },
              script_id: { type: "string" },
            },
          },
        },
        topics_10: {
          type: "array",
          minItems: 10,
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "audience", "scene", "pain", "keywords", "type", "cta"],
            properties: {
              title: { type: "string" },
              audience: { type: "string" },
              scene: { type: "string" },
              pain: { type: "string" },
              keywords: {
                type: "array",
                minItems: 2,
                maxItems: 5,
                items: { type: "string" },
              },
              type: { type: "string" },
              cta: { type: "string" },
            },
          },
        },
        scripts_3: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "duration", "shots", "cta", "title_options", "pinned_comment"],
            properties: {
              id: { type: "string" },
              type: { type: "string" },
              duration: { type: "string" },
              shots: {
                type: "array",
                minItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["t", "line", "visual"],
                  properties: {
                    t: { type: "string" },
                    line: { type: "string" },
                    visual: { type: "string" },
                  },
                },
              },
              cta: { type: "string" },
              title_options: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              pinned_comment: { type: "string" },
            },
          },
        },
        qc_checklist: {
          type: "object",
          additionalProperties: false,
          required: ["title", "body", "cta_and_compliance"],
          properties: {
            title: { type: "array", minItems: 3, items: { type: "string" } },
            body: { type: "array", minItems: 3, items: { type: "string" } },
            cta_and_compliance: { type: "array", minItems: 3, items: { type: "string" } },
          },
        },
        archive_rules: {
          type: "object",
          additionalProperties: false,
          required: ["naming", "tags", "dedupe"],
          properties: {
            naming: { type: "string" },
            tags: { type: "array", minItems: 3, items: { type: "string" } },
            dedupe: { type: "array", minItems: 3, items: { type: "string" } },
          },
        },
        upsell: {
          type: "object",
          additionalProperties: false,
          required: ["when_to_upgrade", "cta"],
          properties: {
            when_to_upgrade: { type: "array", minItems: 2, items: { type: "string" } },
            cta: { type: "string" },
          },
        },
        thinking_summary: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: { type: "string" },
        },
      },
    },
  },
} as const

const OUTPUT_TEMPLATE = `{
  "meta": { "industry": "", "platform": "", "team_type": "", "offer_desc": "" },
  "bottleneck": "",
  "top_actions": [
    { "title": "", "why": "", "do_in_7_days": ["", ""] },
    { "title": "", "why": "", "do_in_7_days": ["", ""] },
    { "title": "", "why": "", "do_in_7_days": ["", ""] }
  ],
  "scores": [
    { "dimension": "交付定位", "score": 0, "insight": "", "fix": "" },
    { "dimension": "内容供给", "score": 0, "insight": "", "fix": "" },
    { "dimension": "产能效率", "score": 0, "insight": "", "fix": "" },
    { "dimension": "质检复盘", "score": 0, "insight": "", "fix": "" },
    { "dimension": "成交转化", "score": 0, "insight": "", "fix": "" }
  ],
  "calendar_7d": [
    { "day": 1, "type": "引流", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S1" },
    { "day": 2, "type": "引流", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S1" },
    { "day": 3, "type": "引流", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S2" },
    { "day": 4, "type": "建信", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S2" },
    { "day": 5, "type": "建信", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S3" },
    { "day": 6, "type": "转化", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S3" },
    { "day": 7, "type": "转化", "title": "", "hook": "", "outline": ["", "", ""], "cta": "", "script_id": "S3" }
  ],
  "topics_10": [
    { "title": "", "audience": "", "scene": "", "pain": "", "keywords": ["", ""], "type": "引流", "cta": "" }
  ],
  "scripts_3": [
    {
      "id": "S1",
      "type": "引流",
      "duration": "45s",
      "shots": [
        { "t": "0-3s", "line": "", "visual": "" },
        { "t": "3-15s", "line": "", "visual": "" },
        { "t": "15-35s", "line": "", "visual": "" }
      ],
      "cta": "",
      "title_options": ["", "", ""],
      "pinned_comment": ""
    }
  ],
  "qc_checklist": {
    "title": ["", "", ""],
    "body": ["", "", ""],
    "cta_and_compliance": ["", "", ""]
  },
  "archive_rules": { "naming": "", "tags": ["", "", ""], "dedupe": ["", "", ""] },
  "upsell": { "when_to_upgrade": ["", ""], "cta": "" },
  "thinking_summary": ["", "", ""]
}`


const CORE_SCHEMA = deliveryPackOutputSchema.pick({
  meta: true,
  bottleneck: true,
  top_actions: true,
  scores: true,
  thinking_summary: true,
})

const CALENDAR_SCHEMA = deliveryPackOutputSchema.pick({ calendar_7d: true })
const TOPICS_SCHEMA = deliveryPackOutputSchema.pick({ topics_10: true })
const SCRIPTS_SCHEMA = deliveryPackOutputSchema.pick({ scripts_3: true })
const QC_SCHEMA = deliveryPackOutputSchema.pick({ qc_checklist: true, archive_rules: true, upsell: true })

function buildPrompt(input: DeliveryPackInput): string {
  const teamTypeLabel = TEAM_TYPE_LABELS[input.team_type] || input.team_type
  const platformLabel = PLATFORM_LABELS[input.platform] || input.platform
  const offerTypeLabel = OFFER_TYPE_LABELS[input.offer_type] || input.offer_type

  const payload = {
    team_type: input.team_type,
    team_type_label: teamTypeLabel,
    team_size: input.team_size,
    industry: input.industry,
    platform: input.platform,
    platform_label: platformLabel,
    offer_type: input.offer_type,
    offer_type_label: offerTypeLabel,
    offer_desc: input.offer_desc,
    sop_level: input.sop_level,
    guideline_level: input.guideline_level,
    topic_library: input.topic_library,
    multi_project: input.multi_project,
    script_review: input.script_review,
    qc_process: input.qc_process,
    conversion_path: input.conversion_path,
    review_frequency: input.review_frequency,
    product_or_service: input.product_or_service,
    target_audience: input.target_audience,
    price_range: input.price_range,
    tone: input.tone,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

输入：
${JSON.stringify(payload, null, 2)}

硬性规则：
1) 输出只用简体中文。
2) 禁止出现：击败、超过、行业排名、前XX%、top% 等不可验证表述。
3) scores 维度必须严格包含：交付定位 / 内容供给 / 产能效率 / 质检复盘 / 成交转化（各1条）。
4) 标题长度上限：calendar_7d.title、topics_10.title、top_actions.title、scripts_3.title_options ≤ 24 字。
5) calendar_7d.type 只能是 引流 / 建信 / 转化，比例至少 引流>=3、建信>=2、转化>=2。
6) scripts_3 必须包含 shots（镜头时间段t + 台词line + 画面visual），且每条脚本必须有 CTA。
7) 至少引用 ${teamTypeLabel}、${platformLabel}、"${input.offer_desc}" 各>=2次（可出现在不同字段）。
8) calendar_7d.day=1 必须给出“明天第一条”可直接发布的标题+钩子+结构+CTA。
9) thinking_summary 为 3-5 条“思考摘要”，不得暴露推理过程。
10) 必须输出完整结构，严禁缺失 scripts_3 / qc_checklist / archive_rules / upsell。

结构说明（字段必须存在）：
- meta: { industry, platform, team_type, offer_desc }
- bottleneck: 1条核心瓶颈
- top_actions: 3条，每条包含 title / why / do_in_7_days[]
- scores: 5条维度分数（0-10）
- calendar_7d: 7天排产（day/type/title/hook/outline[3]/cta/script_id）
- topics_10: 10条高意图选题（title/audience/scene/pain/keywords/type/cta）
- scripts_3: 3条脚本（id=S1/S2/S3, type, duration, shots[], cta, title_options[3], pinned_comment）
- qc_checklist: title/body/cta_and_compliance 三块清单
- archive_rules: naming/tags/dedupe
- upsell: when_to_upgrade[], cta

`.trim()
}

function buildCorePrompt(input: DeliveryPackInput): string {
  const teamTypeLabel = TEAM_TYPE_LABELS[input.team_type] || input.team_type
  const platformLabel = PLATFORM_LABELS[input.platform] || input.platform
  const offerTypeLabel = OFFER_TYPE_LABELS[input.offer_type] || input.offer_type

  const payload = {
    team_type: input.team_type,
    team_type_label: teamTypeLabel,
    team_size: input.team_size,
    industry: input.industry,
    platform: input.platform,
    platform_label: platformLabel,
    offer_type: input.offer_type,
    offer_type_label: offerTypeLabel,
    offer_desc: input.offer_desc,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

输入：
${JSON.stringify(payload, null, 2)}

硬性规则：
1) 输出只用简体中文。
2) 禁止出现：击败、超过、行业排名、前XX%、top% 等不可验证表述。
3) scores 维度必须严格包含：交付定位 / 内容供给 / 产能效率 / 质检复盘 / 成交转化（各1条）。
4) top_actions 3条，每条必须具体可执行。
5) thinking_summary 3-5条摘要，不暴露推理过程。
6) 至少引用 ${teamTypeLabel}、${platformLabel}、"${input.offer_desc}" 各>=2次。
`.trim()
}

function buildCalendarPrompt(
  input: DeliveryPackInput,
  core: Pick<DeliveryPackOutput, "meta" | "bottleneck" | "top_actions">
): string {
  const payload = {
    meta: core.meta,
    bottleneck: core.bottleneck,
    top_actions: core.top_actions,
    offer_desc: input.offer_desc,
    platform: input.platform,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

已确认的核心信息（必须保持一致）：
${JSON.stringify(payload, null, 2)}

仅输出字段：calendar_7d（7条）。

硬性规则：
1) 输出只用简体中文。
2) calendar_7d.type 只能是 引流 / 建信 / 转化，比例至少 引流>=3、建信>=2、转化>=2。
3) 每条包含 day/title/hook/outline[3]/cta/script_id。
4) day=1 必须给出“明天第一条”可直接发布的标题+钩子+结构+CTA。
`.trim()
}

function buildTopicsPrompt(
  input: DeliveryPackInput,
  core: Pick<DeliveryPackOutput, "meta" | "bottleneck" | "top_actions">
): string {
  const payload = {
    meta: core.meta,
    bottleneck: core.bottleneck,
    top_actions: core.top_actions,
    offer_desc: input.offer_desc,
    platform: input.platform,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

已确认的核心信息（必须保持一致）：
${JSON.stringify(payload, null, 2)}

仅输出字段：topics_10（10条）。

硬性规则：
1) 输出只用简体中文。
2) 每条包含 title/audience/scene/pain/keywords(>=2)/type/cta。
3) 必须明确人群+场景+痛点+关键词，确保可直接使用。
`.trim()
}

function buildScriptsPrompt(
  input: DeliveryPackInput,
  core: Pick<DeliveryPackOutput, "meta" | "bottleneck" | "top_actions">
): string {
  const payload = {
    meta: core.meta,
    bottleneck: core.bottleneck,
    top_actions: core.top_actions,
    offer_desc: input.offer_desc,
    platform: input.platform,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

已确认的核心信息（必须保持一致）：
${JSON.stringify(payload, null, 2)}

仅输出字段：scripts_3（3条）。

硬性规则：
1) 输出只用简体中文。
2) 每条脚本必须包含 shots（t/line/visual）至少3段，并包含 CTA。
3) title_options 给出3个可直接用的标题。
4) pinned_comment 给出可直接用的置顶评论话术。
`.trim()
}

function buildChecklistPrompt(
  input: DeliveryPackInput,
  core: Pick<DeliveryPackOutput, "meta" | "bottleneck" | "top_actions">
): string {
  const payload = {
    meta: core.meta,
    bottleneck: core.bottleneck,
    top_actions: core.top_actions,
    offer_desc: input.offer_desc,
    platform: input.platform,
  }

  return `
只输出合法 JSON，不要 Markdown，不要解释说明。

已确认的核心信息（必须保持一致）：
${JSON.stringify(payload, null, 2)}

仅输出字段：qc_checklist / archive_rules / upsell。

硬性规则：
1) 输出只用简体中文。
2) qc_checklist 三块清单，每块>=3条。
3) archive_rules 包含命名/标签/去重规则。
4) upsell 给出升级时机+CTA（不强引导微信）。
`.trim()
}

function extractJson(content: string): string {
  let cleaned = content.trim()
  const markerStart = "<<<JSON_START>>>"
  const markerEnd = "<<<JSON_END>>>"
  if (cleaned.includes(markerStart) && cleaned.includes(markerEnd)) {
    const start = cleaned.indexOf(markerStart) + markerStart.length
    const end = cleaned.indexOf(markerEnd, start)
    if (end > start) {
      cleaned = cleaned.slice(start, end).trim()
    }
  }
  cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "")
  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1)
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1")
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  return escapeNewlinesInStrings(cleaned)
}

function parseJsonPayload(raw: string): unknown {
  const cleaned = extractJson(raw)
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    try {
      return JSON.parse(jsonrepair(cleaned))
    } catch {
      throw error
    }
  }
}

function escapeNewlinesInStrings(input: string): string {
  let result = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inString) {
      if (escaped) {
        escaped = false
        if (char === "\n") {
          result += "n"
          continue
        }
        if (char === "\r") {
          result += "r"
          continue
        }
        if (char === "\t") {
          result += "t"
          continue
        }
        result += char
        continue
      }
      if (char === "\\") {
        escaped = true
        result += char
        continue
      }
      if (char === "\"") {
        inString = false
        result += char
        continue
      }
      if (char === "\n") {
        result += "\\n"
        continue
      }
      if (char === "\r") {
        continue
      }
      if (char === "\t") {
        result += "\\t"
        continue
      }
    } else if (char === "\"") {
      inString = true
    }
    result += char
  }
  return result
}

function coerceToolArgs(value: unknown): string {
  if (typeof value === "string") return value
  if (!value) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

function buildRepairPrompt(raw: string, issues?: string[]): string {
  const issueLine = issues?.length ? `\n缺失/错误字段：${issues.join(", ")}` : ""
  return `
只输出合法 JSON，不要 Markdown，不要解释说明。请根据下方原始输出修复为合法结构。${issueLine}

输出模板（必须填满所有字段，不能保留示例内容）：
${OUTPUT_TEMPLATE}

原始输出：
${raw}
`.trim()
}

function collectStrings(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === "string") {
    bucket.push(value)
    return bucket
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, bucket))
    return bucket
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, bucket))
  }
  return bucket
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(escaped, "g")
  return (text.match(regex) || []).length
}

function buildFallbackBottleneck(input: DeliveryPackInput): string {
  return `${input.platform}上的交付节奏不稳定，导致优质内容无法连续产出`
}

function buildFallbackTopActions(input: DeliveryPackInput) {
  return [
    {
      title: "明确交付目标与节奏",
      why: `${input.team_type}需要先统一7天的交付目标与节奏`,
      do_in_7_days: ["确定7天产出目标与角色分工", "建立每日发布检查表"],
    },
    {
      title: "建立脚本与选题模板",
      why: "模板化能让产能稳定并减少返工",
      do_in_7_days: ["整理3类高意图选题模板", "形成标准脚本结构"],
    },
    {
      title: "加强质检与成交承接",
      why: "产出后必须有成交动作承接",
      do_in_7_days: ["统一CTA话术", "建立发布前质检清单"],
    },
  ]
}

function normalizeCoreOutput(input: DeliveryPackInput, value: any) {
  const output = { ...(value || {}) }
  output.meta = output.meta || {
    industry: input.industry,
    platform: input.platform,
    team_type: input.team_type,
    offer_desc: input.offer_desc,
  }

  output.bottleneck = output.bottleneck || buildFallbackBottleneck(input)

  if (!Array.isArray(output.top_actions)) {
    output.top_actions = buildFallbackTopActions(input)
  } else {
    output.top_actions = output.top_actions.map((item: any, index: number) => {
      if (typeof item === "string") {
        return {
          title: item,
          why: "需要快速聚焦交付效果",
          do_in_7_days: ["完成今日可执行动作", "确认负责人并复盘"],
        }
      }
      return {
        title: item.title || `优先动作 ${index + 1}`,
        why: item.why || "需要提升交付效果",
        do_in_7_days: Array.isArray(item.do_in_7_days) && item.do_in_7_days.length
          ? item.do_in_7_days
          : ["完成关键动作一", "完成关键动作二"],
      }
    })
  }

  const baseScores = buildFallbackScores(input).map((item) => ({
    dimension: item.dimension,
    score: item.score,
    insight: item.insight,
    fix: item.fix,
  }))

  if (Array.isArray(output.scores)) {
    output.scores.forEach((item: any) => {
      if (!item) return
      const match = baseScores.find((score) => String(item.dimension || "").includes(score.dimension))
      if (match) {
        if (typeof item.score === "number" && item.score > 0) {
          match.score = Math.min(10, Math.max(1, Math.round(item.score)))
        }
        match.insight = item.insight || match.insight
        match.fix = item.fix || match.fix
      }
    })
    output.scores = baseScores
  } else if (output.scores && typeof output.scores === "object") {
    Object.entries(output.scores).forEach(([key, value]) => {
      const match = baseScores.find((score) => key.includes(score.dimension))
      if (match) {
        if (typeof value === "number" && value > 0) {
          match.score = Math.min(10, Math.max(1, Math.round(value)))
        }
      }
    })
    output.scores = baseScores
  } else {
    output.scores = baseScores
  }

  if (!Array.isArray(output.thinking_summary)) {
    output.thinking_summary = [
      "根据输入信息提取交付核心矛盾",
      "优先输出可执行的7天交付动作",
      "保证内容可直接复制发布",
    ]
  }

  return output
}

function buildFallbackCalendar(input: DeliveryPackInput) {
  const base = [
    { type: "引流", title: "痛点共鸣：为什么总做不出稳定交付", hook: "3秒告诉你交付不稳的真因", outline: ["抛出痛点", "举例说明", "给出解决方向"], cta: "评论【排产】领模板", script_id: "S1" },
    { type: "引流", title: "3步搭建交付节奏", hook: "教你搭出7天交付节奏", outline: ["步骤一", "步骤二", "步骤三"], cta: "私信【节奏】获取清单", script_id: "S1" },
    { type: "引流", title: "选题库如何避免重复", hook: "避免选题内耗", outline: ["列出痛点词", "建立去重规则", "复用高意图"], cta: "评论【选题】拿清单", script_id: "S2" },
    { type: "建信", title: "脚本模板拆解", hook: "1分钟讲清脚本结构", outline: ["钩子", "问题拆解", "方法给出"], cta: "私信【脚本】领取模板", script_id: "S2" },
    { type: "建信", title: "质检清单怎么用", hook: "发布前必做3件事", outline: ["标题检查", "结构检查", "CTA检查"], cta: "评论【质检】拿清单", script_id: "S3" },
    { type: "转化", title: "交付包能解决什么", hook: "为什么要用交付包", outline: ["解决节奏", "解决质量", "解决成交"], cta: "站内领取交付包PDF", script_id: "S3" },
    { type: "转化", title: "7天交付包适合谁", hook: "哪些团队最适合", outline: ["适用场景", "能省的时间", "能提升的效果"], cta: "点击生成交付包", script_id: "S3" },
  ]
  return base.map((item, index) => ({
    day: index + 1,
    ...item,
    title: item.title.replace("交付", `${input.offer_desc}`.slice(0, 6) ? "交付" : "交付"),
  }))
}

function normalizeCalendarOutput(input: DeliveryPackInput, value: any) {
  const fallback = buildFallbackCalendar(input)
  if (!Array.isArray(value?.calendar_7d)) {
    return { calendar_7d: fallback }
  }
  const normalized = value.calendar_7d.map((item: any, index: number) => {
    const parsedDay = Number(item?.day)
    const safeDay = Number.isFinite(parsedDay) && parsedDay > 0 ? Math.round(parsedDay) : index + 1
    return {
      day: safeDay,
    type: item?.type || fallback[index]?.type || "引流",
    title: item?.title || fallback[index]?.title,
    hook: item?.hook || fallback[index]?.hook,
    outline: Array.isArray(item?.outline) && item.outline.length ? item.outline.slice(0, 3) : fallback[index]?.outline,
    cta: item?.cta || fallback[index]?.cta,
    script_id: item?.script_id || fallback[index]?.script_id || "S1",
    }
  })
  while (normalized.length < 7) {
    normalized.push(fallback[normalized.length])
  }
  return { calendar_7d: normalized.slice(0, 7) }
}

function buildFallbackTopics(input: DeliveryPackInput) {
  const base = [
    "交付节奏不稳的3个原因",
    "7天排产怎么做到不返工",
    "高意图选题从哪来",
    "脚本产出慢怎么解决",
    "质检清单避免踩坑",
    "小红书成交话术怎么写",
    "代运营团队如何协作",
    "内容复盘如何做",
    "素材归档怎么做",
    "交付包能省哪些时间",
  ]
  return base.map((title) => ({
    title,
    audience: "门店负责人",
    scene: "交付压力大",
    pain: "产能不稳导致成交下降",
    keywords: ["交付", "排产"],
    type: "引流",
    cta: "评论【交付】领取模板",
  }))
}

function normalizeTopicsOutput(input: DeliveryPackInput, value: any) {
  const fallback = buildFallbackTopics(input)
  if (!Array.isArray(value?.topics_10)) {
    return { topics_10: fallback }
  }
  const normalized = value.topics_10.map((item: any, index: number) => ({
    title: item?.title || fallback[index]?.title,
    audience: item?.audience || fallback[index]?.audience,
    scene: item?.scene || fallback[index]?.scene,
    pain: item?.pain || fallback[index]?.pain,
    keywords: Array.isArray(item?.keywords) && item.keywords.length ? item.keywords.slice(0, 5) : fallback[index]?.keywords,
    type: item?.type || fallback[index]?.type,
    cta: item?.cta || fallback[index]?.cta,
  }))
  while (normalized.length < 10) {
    normalized.push(fallback[normalized.length])
  }
  return { topics_10: normalized.slice(0, 10) }
}

function buildFallbackScripts() {
  const base = [
    { id: "S1", type: "引流" },
    { id: "S2", type: "建信" },
    { id: "S3", type: "转化" },
  ]
  return base.map((item) => ({
    id: item.id,
    type: item.type,
    duration: "45s",
    shots: [
      { t: "0-3s", line: "直接抛出问题", visual: "正面出镜+标题" },
      { t: "3-15s", line: "拆解痛点", visual: "要点弹幕" },
      { t: "15-35s", line: "给出方法", visual: "流程示意" },
    ],
    cta: "评论关键词领取交付包",
    title_options: ["交付为什么做不稳", "7天排产怎么做", "交付包能解决什么"],
    pinned_comment: "评论【交付】领取7天排产PDF",
  }))
}

function normalizeScriptsOutput(value: any) {
  const fallback = buildFallbackScripts()
  if (!Array.isArray(value?.scripts_3)) {
    return { scripts_3: fallback }
  }
  const normalized = value.scripts_3.map((item: any, index: number) => ({
    id: item?.id || fallback[index]?.id,
    type: item?.type || fallback[index]?.type,
    duration: item?.duration || fallback[index]?.duration,
    shots: Array.isArray(item?.shots) && item.shots.length ? item.shots.slice(0, 3) : fallback[index]?.shots,
    cta: item?.cta || fallback[index]?.cta,
    title_options: Array.isArray(item?.title_options) && item.title_options.length ? item.title_options.slice(0, 3) : fallback[index]?.title_options,
    pinned_comment: item?.pinned_comment || fallback[index]?.pinned_comment,
  }))
  while (normalized.length < 3) {
    normalized.push(fallback[normalized.length])
  }
  return { scripts_3: normalized.slice(0, 3) }
}

function normalizeChecklistOutput(value: any) {
  const fallback = {
    qc_checklist: {
      title: ["标题是否清晰", "是否点出痛点", "是否含关键词"],
      body: ["结构是否完整", "要点是否清楚", "节奏是否紧凑"],
      cta_and_compliance: [
        "CTA是否明确",
        "是否避免违规引导",
        "是否引导站内动作",
      ],
    },
    archive_rules: {
      naming: "日期_平台_选题_负责人",
      tags: ["引流", "建信", "转化"],
      dedupe: [
        "同主题间隔3天",
        "同关键词间隔5天",
        "同脚本间隔7天",
      ],
    },
    upsell: {
      when_to_upgrade: ["需要连续交付2周以上", "团队多人协同需要模板化"],
      cta: "开通Pro获取持续交付与更多模板",
    },
  }

  const qc = value?.qc_checklist ?? {}
  const archive = value?.archive_rules ?? {}
  const upsell = value?.upsell ?? {}

  const cleanText = (value: unknown, fallbackText: string) => {
    if (typeof value !== "string") return fallbackText
    const trimmed = value.trim()
    if (!trimmed) return fallbackText
    if (/^\?+$/.test(trimmed)) return fallbackText
    if (trimmed.replace(/\?/g, "").length < 2) return fallbackText
    return trimmed
  }

  const cleanList = (items: unknown, fallbackList: string[]) => {
    if (!Array.isArray(items) || items.length === 0) return fallbackList
    const cleaned = items.map((item, index) => cleanText(item, fallbackList[index] ?? fallbackList[0]))
    return cleaned.filter(Boolean).length ? cleaned : fallbackList
  }

  return {
    qc_checklist: {
      title: cleanList(qc.title, fallback.qc_checklist.title).slice(0, 10),
      body: cleanList(qc.body, fallback.qc_checklist.body).slice(0, 10),
      cta_and_compliance: cleanList(qc.cta_and_compliance, fallback.qc_checklist.cta_and_compliance).slice(0, 10),
    },
    archive_rules: {
      naming: cleanText(archive.naming, fallback.archive_rules.naming),
      tags: cleanList(archive.tags, fallback.archive_rules.tags).slice(0, 6),
      dedupe: cleanList(archive.dedupe, fallback.archive_rules.dedupe).slice(0, 6),
    },
    upsell: {
      when_to_upgrade: cleanList(upsell.when_to_upgrade, fallback.upsell.when_to_upgrade).slice(0, 6),
      cta: cleanText(upsell.cta, fallback.upsell.cta),
    },
  }
}

function validateDeliveryPackRules(output: DeliveryPackOutput, input: DeliveryPackInput): string[] {
  const errors: string[] = []
  const allText = collectStrings(output).join("\n")

  if (bannedPattern.test(allText)) {
    errors.push("contains_banned_phrases")
  }

  const teamLabel = TEAM_TYPE_LABELS[input.team_type] || input.team_type
  const platformLabel = PLATFORM_LABELS[input.platform] || input.platform
  const offerDesc = input.offer_desc

  if (countOccurrences(allText, teamLabel) < 2) {
    errors.push("team_type_mention")
  }
  if (countOccurrences(allText, platformLabel) < 2) {
    errors.push("platform_mention")
  }
  if (countOccurrences(allText, offerDesc) < 1) {
    errors.push("offer_desc_mention")
  }

  const dimensionNames = output.scores.map((item) => item.dimension)
  REQUIRED_DIMENSIONS.forEach((name) => {
    if (!dimensionNames.some((value) => value.includes(name))) {
      errors.push(`missing_dimension_${name}`)
    }
  })

  const titleViolations = [
    ...output.calendar_7d.map((item) => item.title),
    ...output.topics_10.map((item) => item.title),
    ...output.top_actions.map((item) => item.title),
    ...output.scripts_3.flatMap((item) => item.title_options),
  ].filter((title) => title.length > 24)

  if (titleViolations.length) {
    errors.push("title_too_long")
  }

  const typeCounts = output.calendar_7d.reduce(
    (acc, item) => {
      const label = item.type
      if (label.includes("引流") || label.includes("获客")) acc.lead += 1
      else if (label.includes("建信") || label.includes("信任")) acc.trust += 1
      else if (label.includes("转化") || label.includes("成交")) acc.convert += 1
      return acc
    },
    { lead: 0, trust: 0, convert: 0 }
  )

  if (typeCounts.lead < 3 || typeCounts.trust < 2 || typeCounts.convert < 2) {
    errors.push("calendar_type_ratio")
  }

  return errors
}

async function callLLM(
  prompt: string,
  temperature = 0.6,
  options?: { model?: string; maxTokens?: number; useFunctionCalling?: boolean }
): Promise<string> {
  if (!APIMART_API_KEY) {
    throw new Error("APIMART_API_KEY missing")
  }

  const model = options?.model || APIMART_MODEL
  const maxTokens = options?.maxTokens ?? 7000

  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a JSON generator. Output a single JSON object only. Do not include analysis, reasoning, or extra text.",
      },
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  }

  if (options?.useFunctionCalling ?? USE_FUNCTION_CALLING) {
    payload.tools = [DELIVERY_PACK_TOOL]
    payload.tool_choice = {
      type: "function",
      function: { name: "GenerateDeliveryPackV2" },
    }
  } else if (USE_RESPONSE_FORMAT) {
    payload.response_format = { type: "json_object" }
  }

  const isRetryableStatus = (status: number) => [429, 500, 502, 503, 504].includes(status)
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  let lastError: unknown

  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
    try {
      const response = await fetch(`${APIMART_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${APIMART_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (isRetryableStatus(response.status) && attempt < LLM_MAX_RETRIES) {
          await sleep(800 + attempt * 700)
          continue
        }
        throw new Error(`LLM request failed: ${response.status} ${errorText}`)
      }

      const responseText = await response.text()
      let json: {
        choices?: Array<{
          message?: {
            content?: string
            reasoning_content?: string
            tool_calls?: Array<{ function?: { arguments?: string } }>
            function_call?: { arguments?: string }
          }
        }>
      }
      try {
        json = JSON.parse(responseText) as typeof json
      } catch {
        throw new Error(`LLM response parse failed: ${responseText.slice(0, 600)}`)
      }
      const message = json.choices?.[0]?.message
      const toolArgs = coerceToolArgs(
        message?.tool_calls?.[0]?.function?.arguments || message?.function_call?.arguments
      )
      if (toolArgs.trim()) {
        return toolArgs
      }
      const content = message?.content?.trim() || ""
      if (!content) {
        throw new Error(`LLM response empty: ${responseText.slice(0, 600)}`)
      }
      return content
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("LLM request timeout")
      }
      if (attempt < LLM_MAX_RETRIES) {
        await sleep(800 + attempt * 700)
        continue
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

export async function generateDeliveryPackV2(input: DeliveryPackInput): Promise<DeliveryPackOutput> {
  let lastError: unknown
  let lastRaw = ""
  let lastIssues: string[] = []
  const primaryModel = APIMART_QUICK_MODEL || APIMART_MODEL
  const fallbackModel = APIMART_QUICK_MODEL || APIMART_MODEL
  if (!USE_SPLIT_GENERATION) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const prompt = attempt === 0 ? buildPrompt(input) : buildRepairPrompt(lastRaw, lastIssues)
        const raw = await callLLM(prompt, attempt === 0 ? 0.3 : 0.2, {
          model: attempt === 0 ? primaryModel : fallbackModel,
          maxTokens: attempt === 0 ? 7000 : 5200,
          useFunctionCalling: attempt === 0 ? USE_FUNCTION_CALLING : false,
        })
        lastRaw = raw
        const parsed = parseJsonPayload(raw)
        const validated = deliveryPackOutputSchema.parse(parsed)
        const sanitized = sanitizeDeliveryPack(input, validated)

        const ruleErrors = validateDeliveryPackRules(sanitized, input)
        if (ruleErrors.length && attempt === 0) {
          throw new Error(`rule_violation:${ruleErrors.join("|")}`)
        }
        if (ruleErrors.length) {
          console.warn("[delivery-pack] rule warnings:", ruleErrors)
        }

        return sanitized
      } catch (error) {
        lastError = error
        if (error instanceof ZodError) {
          lastIssues = error.issues.map((issue) => issue.path.join(".") || issue.message).slice(0, 8)
        } else {
          lastIssues = []
        }
        if (lastRaw) {
          console.warn("[delivery-pack] raw snippet:", lastRaw.slice(0, 600))
        }
        console.warn(`[delivery-pack] parse failed on attempt ${attempt + 1}`, error)
      }
    }
  }

  try {
    const splitModel = APIMART_QUICK_MODEL || "kimi-k2-thinking-turbo"
    const coreRaw = await callLLM(buildCorePrompt(input), 0.15, {
      model: splitModel,
      maxTokens: 6000,
      useFunctionCalling: false,
    })
    const coreParsed = CORE_SCHEMA.parse(normalizeCoreOutput(input, parseJsonPayload(coreRaw)))

    const calendarRaw = await callLLM(buildCalendarPrompt(input, coreParsed), 0.2, {
      model: splitModel,
      maxTokens: 6000,
      useFunctionCalling: false,
    })
    const calendarParsed = CALENDAR_SCHEMA.parse(normalizeCalendarOutput(input, parseJsonPayload(calendarRaw)))

    const topicsRaw = await callLLM(buildTopicsPrompt(input, coreParsed), 0.25, {
      model: splitModel,
      maxTokens: 6000,
      useFunctionCalling: false,
    })
    const topicsParsed = TOPICS_SCHEMA.parse(normalizeTopicsOutput(input, parseJsonPayload(topicsRaw)))

    const scriptsRaw = await callLLM(buildScriptsPrompt(input, coreParsed), 0.25, {
      model: splitModel,
      maxTokens: 7000,
      useFunctionCalling: false,
    })
    const scriptsParsed = SCRIPTS_SCHEMA.parse(normalizeScriptsOutput(parseJsonPayload(scriptsRaw)))

    const qcRaw = await callLLM(buildChecklistPrompt(input, coreParsed), 0.1, {
      model: splitModel,
      maxTokens: 4000,
      useFunctionCalling: false,
    })
    const qcParsed = QC_SCHEMA.parse(normalizeChecklistOutput(parseJsonPayload(qcRaw)))

    const merged = {
      ...coreParsed,
      ...calendarParsed,
      ...topicsParsed,
      ...scriptsParsed,
      ...qcParsed,
    } as DeliveryPackOutput
    const sanitized = sanitizeDeliveryPack(input, merged)
    const ruleErrors = validateDeliveryPackRules(sanitized, input)
    if (ruleErrors.length) {
      console.warn("[delivery-pack] rule warnings:", ruleErrors)
    }
    return sanitized
  } catch (error) {
    lastError = error
    console.warn("[delivery-pack] split generation failed", error)
  }
  throw lastError
}
