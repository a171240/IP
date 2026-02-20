import customerLinesRaw from "@/lib/voice-coach/script-packs/customer_lines.v1.json"
import coachTemplatesRaw from "@/lib/voice-coach/script-packs/coach_templates.v1.json"
import intentGraphRaw from "@/lib/voice-coach/script-packs/intent_graph.v1.json"
import openingAudioMapRaw from "@/lib/voice-coach/script-packs/opening_audio_map.v1.json"

import type { VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"

export type VoiceCoachCategoryId = "presale" | "sale" | "postsale" | "crisis"
export type VoiceCoachReplySource = "fixed" | "model" | "mixed"

export type VoiceCoachCategoryMeta = {
  id: VoiceCoachCategoryId
  name: string
  subtitle: string
  objective: string
}

type CustomerLine = {
  line_id: string
  category_id: VoiceCoachCategoryId
  intent_id: string
  angle_id: string
  difficulty: number
  text: string
  emotion?: VoiceCoachEmotion
  tag?: string
  tone: string
  compliance_flags: string[]
  audio_seed_path?: string
}

type OpeningSeed = {
  line_id: string
  intent_id: string
  angle_id: string
  text: string
  emotion: VoiceCoachEmotion
  tag: string
  audio_seed_path: string
  audio_seconds?: number
}

type HintTemplate = {
  category_id: VoiceCoachCategoryId
  intent_id: string
  hint_text: string
  hint_points?: string[]
}

type AnalysisTemplate = {
  category_id: VoiceCoachCategoryId
  intent_id: string
  suggestions: string[]
  polished: string
}

type CrisisGoalTemplate = {
  goal_template_id: string
  name: string
  description: string
  default_goal: string
}

type IntentNode = {
  intent_id: string
  angles: string[]
}

type CategoryGraph = {
  intents: IntentNode[]
}

type IntentGraph = {
  loop_guard: {
    stagnation_threshold: number
    max_same_intent_rounds: number
  }
  categories: Record<VoiceCoachCategoryId, CategoryGraph>
}

export type VoiceCoachPolicyState = {
  version: string
  category_id: VoiceCoachCategoryId
  intent_index: number
  angle_index: number
  same_intent_rounds: number
  stagnation_count: number
  used_line_ids: string[]
  last_beautician_signature: string
  goal_template_id?: string | null
  goal_custom?: string | null
}

export type VoiceCoachCategoryRecommendation = {
  category_id: VoiceCoachCategoryId
  reason: string
  based_on_report: {
    weakest_dimensions: string[]
    scores: Record<string, number>
  }
  strategy: "weakness_70_random_30"
}

export type NextLineSelection = {
  line: CustomerLine
  policy_state: VoiceCoachPolicyState
  intent_id: string
  angle_id: string
  loop_guard_triggered: boolean
}

const CATEGORIES: VoiceCoachCategoryMeta[] = [
  {
    id: "presale",
    name: "售前",
    subtitle: "破冰与需求诊断",
    objective: "识别需求、预算、时间与安全顾虑，建立基础信任。",
  },
  {
    id: "sale",
    name: "售中",
    subtitle: "异议处理与推进成交",
    objective: "处理价格/安全/效果/对比异议，推动可执行下一步。",
  },
  {
    id: "postsale",
    name: "售后",
    subtitle: "复购与裂变",
    objective: "复盘效果、安排维护、推动升级与转介绍。",
  },
  {
    id: "crisis",
    name: "危机",
    subtitle: "情绪急救与止损",
    objective: "先稳情绪，再补救，再转售后流程，不继续硬卖。",
  },
]

const CATEGORY_SET = new Set<VoiceCoachCategoryId>(CATEGORIES.map((item) => item.id))

const customerLines = ((customerLinesRaw as any)?.lines || []) as CustomerLine[]
const hintTemplates = ((coachTemplatesRaw as any)?.hint_templates || []) as HintTemplate[]
const analysisTemplates = ((coachTemplatesRaw as any)?.analysis_templates || []) as AnalysisTemplate[]
const crisisGoalTemplates = ((coachTemplatesRaw as any)?.crisis_goal_templates || []) as CrisisGoalTemplate[]
const openingMap = (((openingAudioMapRaw as any)?.openings || {}) as Record<VoiceCoachCategoryId, OpeningSeed[]>)
const intentGraph = (intentGraphRaw as any) as IntentGraph

const DIMENSION_TO_CATEGORY_WEIGHTS: Record<string, Array<[VoiceCoachCategoryId, number]>> = {
  persuasion: [
    ["sale", 0.6],
    ["crisis", 0.4],
  ],
  organization: [
    ["presale", 0.5],
    ["sale", 0.5],
  ],
  fluency: [
    ["postsale", 0.6],
    ["presale", 0.4],
  ],
  expression: [
    ["presale", 0.5],
    ["postsale", 0.5],
  ],
  pronunciation: [
    ["presale", 0.7],
    ["postsale", 0.3],
  ],
}

const SIGNAL_PATTERNS: Array<[RegExp, string]> = [
  [/安全|风险|卫生|禁忌|评估|规范|资质|认证/, "safety"],
  [/价格|预算|贵|性价比|折扣|优惠|套餐/, "price"],
  [/案例|前后|对比|反馈|证据|品牌|认证/, "proof"],
  [/时间|频次|周期|复访|安排|节奏/, "schedule"],
  [/售后|补救|处理|责任|投诉|跟进/, "aftercare"],
]

function quickHash(input: string): number {
  const s = String(input || "")
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 131 + s.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function clampIndex(n: number, max: number): number {
  if (max <= 0) return 0
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n >= max) return max - 1
  return Math.floor(n)
}

function extractSignal(text: string): string {
  const s = String(text || "")
  const hits: string[] = []
  for (let i = 0; i < SIGNAL_PATTERNS.length; i++) {
    const [pattern, key] = SIGNAL_PATTERNS[i]
    if (pattern.test(s)) hits.push(key)
  }
  return hits.sort().join("|") || "generic"
}

function shouldUseModelRewrite(probability = 0.3): boolean {
  const p = Number.isFinite(probability) ? Math.max(0, Math.min(1, probability)) : 0.3
  return Math.random() < p
}

function pickCandidateLine(opts: {
  categoryId: VoiceCoachCategoryId
  intentId: string
  angleId: string
  usedLineIds: Set<string>
  historyCustomerTexts: Set<string>
  seedText: string
}): CustomerLine | null {
  const scoped = customerLines.filter(
    (line) => line.category_id === opts.categoryId && line.intent_id === opts.intentId && line.angle_id === opts.angleId,
  )
  if (!scoped.length) return null

  const fresh = scoped.filter((line) => !opts.usedLineIds.has(line.line_id) && !opts.historyCustomerTexts.has(line.text))
  const pool = fresh.length ? fresh : scoped.filter((line) => !opts.historyCustomerTexts.has(line.text))
  const finalPool = pool.length ? pool : scoped

  const idx = quickHash(`${opts.seedText}|${opts.intentId}|${opts.angleId}`) % finalPool.length
  return finalPool[idx]
}

function listIntentNodes(categoryId: VoiceCoachCategoryId): IntentNode[] {
  const nodes = intentGraph?.categories?.[categoryId]?.intents
  if (Array.isArray(nodes) && nodes.length) return nodes
  const fallbackIntent = customerLines.find((line) => line.category_id === categoryId)
  if (fallbackIntent) {
    return [
      {
        intent_id: fallbackIntent.intent_id,
        angles: [fallbackIntent.angle_id],
      },
    ]
  }
  return [
    {
      intent_id: "general_followup",
      angles: ["default"],
    },
  ]
}

function normalizePolicyState(
  categoryId: VoiceCoachCategoryId,
  state: Partial<VoiceCoachPolicyState> | null | undefined,
): VoiceCoachPolicyState {
  const intents = listIntentNodes(categoryId)
  const intentIndex = clampIndex(Number(state?.intent_index || 0), intents.length)
  const angleIndex = clampIndex(Number(state?.angle_index || 0), intents[intentIndex]?.angles?.length || 1)

  return {
    version: "v1",
    category_id: categoryId,
    intent_index: intentIndex,
    angle_index: angleIndex,
    same_intent_rounds: Math.max(0, Number(state?.same_intent_rounds || 0) || 0),
    stagnation_count: Math.max(0, Number(state?.stagnation_count || 0) || 0),
    used_line_ids: Array.isArray(state?.used_line_ids)
      ? state!.used_line_ids.filter((item) => typeof item === "string" && item)
      : [],
    last_beautician_signature: typeof state?.last_beautician_signature === "string" ? state.last_beautician_signature : "",
    goal_template_id: typeof state?.goal_template_id === "string" ? state.goal_template_id : null,
    goal_custom: typeof state?.goal_custom === "string" ? state.goal_custom : null,
  }
}

function hasInfoProgress(prevSignal: string, nextSignal: string): boolean {
  if (!nextSignal) return false
  if (!prevSignal) return true
  return prevSignal !== nextSignal
}

function normalizeEmotion(raw: unknown, fallback: VoiceCoachEmotion = "skeptical"): VoiceCoachEmotion {
  const emo = String(raw || "") as VoiceCoachEmotion
  if (["neutral", "worried", "skeptical", "impatient", "pleased"].includes(emo)) {
    return emo
  }
  return fallback
}

function normalizeTag(raw: unknown, fallback = "跟进追问"): string {
  const tag = String(raw || "").trim()
  return tag || fallback
}

function uniqueStrings(items: string[], maxLen = 150): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    const id = String(items[i] || "").trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= maxLen) break
  }
  return out
}

export function listVoiceCoachCategories(): VoiceCoachCategoryMeta[] {
  return CATEGORIES.slice()
}

export function isVoiceCoachCategoryId(raw: string | null | undefined): raw is VoiceCoachCategoryId {
  if (!raw) return false
  return CATEGORY_SET.has(raw as VoiceCoachCategoryId)
}

export function normalizeVoiceCoachCategoryId(raw: string | null | undefined): VoiceCoachCategoryId {
  if (isVoiceCoachCategoryId(raw)) return raw
  return "sale"
}

export function getCategoryMeta(categoryId: VoiceCoachCategoryId): VoiceCoachCategoryMeta {
  return CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[1]
}

export function listCrisisGoalTemplates(): CrisisGoalTemplate[] {
  return crisisGoalTemplates.slice()
}

export function getHintTemplate(categoryId: VoiceCoachCategoryId, intentId: string) {
  const exact = hintTemplates.find((tpl) => tpl.category_id === categoryId && tpl.intent_id === intentId)
  if (exact) return exact
  return hintTemplates.find((tpl) => tpl.category_id === categoryId) || null
}

export function getAnalysisTemplate(categoryId: VoiceCoachCategoryId, intentId: string) {
  const exact = analysisTemplates.find((tpl) => tpl.category_id === categoryId && tpl.intent_id === intentId)
  if (exact) return exact
  return analysisTemplates.find((tpl) => tpl.category_id === categoryId) || null
}

export function createInitialPolicyState(args: {
  categoryId: VoiceCoachCategoryId
  goalTemplateId?: string | null
  goalCustom?: string | null
  openingIntentId?: string | null
  openingAngleId?: string | null
}): VoiceCoachPolicyState {
  const nodes = listIntentNodes(args.categoryId)
  let intentIndex = 0
  let angleIndex = 0

  if (args.openingIntentId) {
    const foundIntentIndex = nodes.findIndex((node) => node.intent_id === args.openingIntentId)
    if (foundIntentIndex >= 0) {
      intentIndex = foundIntentIndex
      const angles = nodes[foundIntentIndex]?.angles || []
      const foundAngleIndex = angles.findIndex((item) => item === args.openingAngleId)
      if (foundAngleIndex >= 0) angleIndex = foundAngleIndex
    }
  }

  return {
    version: "v1",
    category_id: args.categoryId,
    intent_index: intentIndex,
    angle_index: angleIndex,
    same_intent_rounds: 0,
    stagnation_count: 0,
    used_line_ids: [],
    last_beautician_signature: "",
    goal_template_id: args.goalTemplateId || null,
    goal_custom: args.goalCustom || null,
  }
}

export function pickOpeningSeed(args: {
  categoryId: VoiceCoachCategoryId
  recommendationDimension?: string | null
  userId?: string | null
}): OpeningSeed | null {
  const list = openingMap?.[args.categoryId]
  if (!Array.isArray(list) || !list.length) return null

  const seedText = `${args.categoryId}|${args.recommendationDimension || ""}|${args.userId || ""}`
  const idx = quickHash(seedText) % list.length
  const selected = list[idx]
  return {
    ...selected,
    emotion: normalizeEmotion(selected.emotion, "skeptical"),
    tag: normalizeTag(selected.tag, "开场追问"),
  }
}

function readDimensionScores(input: any): Record<string, number> {
  const scores: Record<string, number> = {}
  const fromDimensionScores = input?.dimension_scores
  if (fromDimensionScores && typeof fromDimensionScores === "object") {
    for (const key of Object.keys(fromDimensionScores)) {
      const n = Number((fromDimensionScores as any)[key])
      if (Number.isFinite(n)) scores[key] = n
    }
  }

  const dimensionList = input?.report_json?.dimension || input?.dimension
  if (Array.isArray(dimensionList)) {
    for (let i = 0; i < dimensionList.length; i++) {
      const item = dimensionList[i]
      const id = String(item?.id || "")
      const score = Number(item?.score)
      if (id && Number.isFinite(score)) scores[id] = score
    }
  }

  return scores
}

export function recommendCategoryFromReport(input: any): VoiceCoachCategoryRecommendation {
  const scores = readDimensionScores(input)
  const dimensions = Object.keys(scores)

  if (!dimensions.length) {
    return {
      category_id: "sale",
      reason: "默认先练售中异议处理，再按报告短板动态推荐。",
      based_on_report: {
        weakest_dimensions: [],
        scores: {},
      },
      strategy: "weakness_70_random_30",
    }
  }

  const weakest = dimensions
    .sort((a, b) => Number(scores[a] || 0) - Number(scores[b] || 0))
    .slice(0, 2)

  const categoryScores: Record<VoiceCoachCategoryId, number> = {
    presale: 0,
    sale: 0,
    postsale: 0,
    crisis: 0,
  }

  weakest.forEach((dim, idx) => {
    const dimWeight = idx === 0 ? 1 : 0.8
    const pairs = DIMENSION_TO_CATEGORY_WEIGHTS[dim] || []
    for (let i = 0; i < pairs.length; i++) {
      const [categoryId, weight] = pairs[i]
      categoryScores[categoryId] += weight * dimWeight
    }
  })

  const ranked = (Object.keys(categoryScores) as VoiceCoachCategoryId[]).sort(
    (a, b) => categoryScores[b] - categoryScores[a],
  )

  let chosen = ranked[0] || "sale"
  if (ranked.length > 1 && Math.random() >= 0.7) {
    const candidates = ranked.slice(1)
    chosen = candidates[quickHash(JSON.stringify(scores) + Date.now()) % candidates.length] || chosen
  }

  return {
    category_id: chosen,
    reason: `根据上次短板维度（${weakest.join("、")}）优先推荐 ${getCategoryMeta(chosen).name} 训练。`,
    based_on_report: {
      weakest_dimensions: weakest,
      scores,
    },
    strategy: "weakness_70_random_30",
  }
}

export function selectNextCustomerLine(opts: {
  categoryId: VoiceCoachCategoryId
  policyState: Partial<VoiceCoachPolicyState> | null | undefined
  beauticianText: string
  history: Array<{ role: "customer" | "beautician"; text: string }>
}): NextLineSelection {
  const nodes = listIntentNodes(opts.categoryId)
  const state = normalizePolicyState(opts.categoryId, opts.policyState)

  const nextSignal = extractSignal(opts.beauticianText)
  const progressed = hasInfoProgress(state.last_beautician_signature, nextSignal)
  let stagnation = progressed ? 0 : state.stagnation_count + 1
  let loopGuardTriggered = false

  let intentIndex = clampIndex(state.intent_index, nodes.length)
  let angleIndex = clampIndex(state.angle_index, nodes[intentIndex]?.angles?.length || 1)

  const stagnationThreshold = Math.max(1, Number(intentGraph?.loop_guard?.stagnation_threshold || 2) || 2)
  const maxSameIntentRounds = Math.max(2, Number(intentGraph?.loop_guard?.max_same_intent_rounds || 4) || 4)

  if (stagnation >= stagnationThreshold) {
    loopGuardTriggered = true
    stagnation = 0
    const currentAngles = nodes[intentIndex]?.angles || []
    if (angleIndex + 1 < currentAngles.length) {
      angleIndex += 1
    } else {
      intentIndex = (intentIndex + 1) % nodes.length
      angleIndex = 0
    }
  }

  if (state.same_intent_rounds >= maxSameIntentRounds) {
    loopGuardTriggered = true
    intentIndex = (intentIndex + 1) % nodes.length
    angleIndex = 0
  }

  const usedLineIds = new Set(state.used_line_ids || [])
  const historyCustomerTexts = new Set(
    opts.history.filter((item) => item.role === "customer").map((item) => String(item.text || "").trim()),
  )

  let selected: CustomerLine | null = null
  let selectedIntentIndex = intentIndex
  let selectedAngleIndex = angleIndex
  const maxAttempts = Math.max(3, nodes.length * 4)

  for (let i = 0; i < maxAttempts; i++) {
    const node = nodes[selectedIntentIndex]
    const angles = node?.angles || ["default"]
    const angleId = angles[clampIndex(selectedAngleIndex, angles.length)]

    selected = pickCandidateLine({
      categoryId: opts.categoryId,
      intentId: node.intent_id,
      angleId,
      usedLineIds,
      historyCustomerTexts,
      seedText: `${opts.beauticianText}|${opts.history.length}|${state.used_line_ids.length}|${i}`,
    })

    if (selected) break

    if (selectedAngleIndex + 1 < angles.length) {
      selectedAngleIndex += 1
    } else {
      selectedIntentIndex = (selectedIntentIndex + 1) % nodes.length
      selectedAngleIndex = 0
    }
  }

  if (!selected) {
    const fallback = customerLines.find((line) => line.category_id === opts.categoryId) || customerLines[0]
    if (!fallback) {
      throw new Error("voice_coach_no_customer_lines")
    }
    selected = fallback
    selectedIntentIndex = 0
    selectedAngleIndex = 0
  }

  const selectedNode = nodes[selectedIntentIndex]
  const selectedAngleId = selectedNode?.angles?.[clampIndex(selectedAngleIndex, selectedNode.angles.length)] || selected.angle_id

  const nextUsedLineIds = uniqueStrings([...(state.used_line_ids || []), selected.line_id], 180)
  const sameIntentRounds =
    selectedIntentIndex === state.intent_index ? Math.max(1, Number(state.same_intent_rounds || 0) + 1) : 1

  const nextState: VoiceCoachPolicyState = {
    ...state,
    intent_index: selectedIntentIndex,
    angle_index: clampIndex(selectedAngleIndex, selectedNode?.angles?.length || 1),
    same_intent_rounds: sameIntentRounds,
    stagnation_count: stagnation,
    used_line_ids: nextUsedLineIds,
    last_beautician_signature: nextSignal,
  }

  return {
    line: {
      ...selected,
      emotion: normalizeEmotion(selected.emotion, "skeptical"),
      tag: normalizeTag(selected.tag, "跟进追问"),
    },
    policy_state: nextState,
    intent_id: selected.intent_id,
    angle_id: selectedAngleId,
    loop_guard_triggered: loopGuardTriggered,
  }
}

export async function maybeRewriteCustomerLine(opts: {
  enabled?: boolean
  probability?: number
  rewrite: () => Promise<{ text: string; emotion?: VoiceCoachEmotion; tag?: string }>
  base: { text: string; emotion: VoiceCoachEmotion; tag: string }
}): Promise<{ text: string; emotion: VoiceCoachEmotion; tag: string; reply_source: VoiceCoachReplySource }> {
  if (!opts.enabled) {
    return {
      ...opts.base,
      reply_source: "fixed",
    }
  }

  if (!shouldUseModelRewrite(opts.probability ?? 0.3)) {
    return {
      ...opts.base,
      reply_source: "fixed",
    }
  }

  try {
    const rewritten = await opts.rewrite()
    const text = String(rewritten?.text || "").trim()
    if (!text) {
      return {
        ...opts.base,
        reply_source: "fixed",
      }
    }

    return {
      text,
      emotion: normalizeEmotion(rewritten?.emotion, opts.base.emotion),
      tag: normalizeTag(rewritten?.tag, opts.base.tag),
      reply_source: "mixed",
    }
  } catch {
    return {
      ...opts.base,
      reply_source: "fixed",
    }
  }
}
