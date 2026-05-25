import { z } from "zod"

import { getVoiceCoachSceneKindPolicy } from "./scene-kind-policy"

export const VOICE_COACH_SCENE_KIND_VALUES = ["customer_visit", "offer_promo"] as const
export const VOICE_COACH_SCENE_KIND_LABELS: Record<(typeof VOICE_COACH_SCENE_KIND_VALUES)[number], string> = {
  customer_visit: "到店顾客训练",
  offer_promo: "新品推广训练",
}

export const VOICE_COACH_FOCUS_STAGE_VALUES = [
  "启动破冰",
  "需求深挖",
  "价值呈现",
  "异议预处理",
  "现场异议",
  "成交推进",
] as const

const stringListSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(12)

export const voiceCoachCustomerProfilePayloadSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age_label: z.string().trim().max(30).optional().nullable(),
  occupation: z.string().trim().max(40).optional().nullable(),
  personality_tags: z.union([z.string(), stringListSchema]).optional().nullable(),
  communication_style: z.string().trim().max(120).optional().nullable(),
  core_concerns: z.union([z.string(), stringListSchema]).optional().nullable(),
  trust_triggers: z.union([z.string(), stringListSchema]).optional().nullable(),
  past_experience: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
})

export const voiceCoachSceneCardPayloadSchema = z.object({
  name: z.string().trim().min(1).max(50),
  scene_kind: z.enum(VOICE_COACH_SCENE_KIND_VALUES).default("customer_visit"),
  service_name: z.string().trim().max(60).optional().nullable(),
  customer_stage: z.string().trim().max(40).optional().nullable(),
  scene_goal: z.string().trim().max(160).optional().nullable(),
  focus_stages: z.union([z.string(), stringListSchema]).optional().nullable(),
  likely_questions: z.union([z.string(), stringListSchema]).optional().nullable(),
  target_objections: z.union([z.string(), stringListSchema]).optional().nullable(),
  communication_method_tags: z.union([z.string(), stringListSchema]).optional().nullable(),
  must_cover_points: z.union([z.string(), stringListSchema]).optional().nullable(),
  do_not_say: z.union([z.string(), stringListSchema]).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
})

export const voiceCoachSessionCreateSchema = z.object({
  scenario_id: z.string().trim().min(1).max(60).optional(),
  customer_profile_id: z.string().uuid().optional().nullable(),
  scene_card_id: z.string().uuid().optional().nullable(),
  live_notes: z.string().trim().max(500).optional().nullable(),
  training_task_id: z.string().trim().min(1).max(80).optional().nullable(),
  training_pack_id: z.string().trim().min(1).max(80).optional().nullable(),
  training_brand_code: z.string().trim().min(1).max(40).optional().nullable(),
  training_context: z
    .object({
      brand_code: z.string().trim().min(1).max(40).optional().nullable(),
      pack_id: z.string().trim().min(1).max(80).optional().nullable(),
      task_id: z.string().trim().min(1).max(80).optional().nullable(),
    })
    .passthrough()
    .optional()
    .nullable(),
  followup_context: z
    .object({
      source_session_id: z.string().uuid(),
    })
    .passthrough()
    .optional()
    .nullable(),
})

export type VoiceCoachCustomerProfileInput = z.infer<typeof voiceCoachCustomerProfilePayloadSchema>
export type VoiceCoachSceneCardInput = z.infer<typeof voiceCoachSceneCardPayloadSchema>
export type VoiceCoachSessionCreateInput = z.infer<typeof voiceCoachSessionCreateSchema>
export type VoiceCoachSceneKind = (typeof VOICE_COACH_SCENE_KIND_VALUES)[number]

export type VoiceCoachCustomerProfileRecord = {
  id: string
  name: string
  age_label?: string | null
  occupation?: string | null
  personality_tags?: unknown
  communication_style?: string | null
  core_concerns?: unknown
  trust_triggers?: unknown
  past_experience?: string | null
  notes?: string | null
}

export type VoiceCoachSceneCardRecord = {
  id: string
  name: string
  scene_kind?: string | null
  service_name?: string | null
  customer_stage?: string | null
  scene_goal?: string | null
  focus_stages?: unknown
  likely_questions?: unknown
  target_objections?: unknown
  communication_method_tags?: unknown
  must_cover_points?: unknown
  do_not_say?: unknown
  notes?: string | null
}

export type VoiceCoachFollowupReferenceTurn = {
  role: "customer" | "beautician"
  turn_id?: string
  turn_index?: number | null
  text: string
}

export type VoiceCoachFollowupContext = {
  source_session_id: string
  source_report_generated_at?: string
  focus_dimension_id?: string
  focus_dimension_name?: string
  focus_score?: number | null
  title: string
  instruction: string
  practice_points: string[]
  missed_points: string[]
  risk_points: string[]
  summary_blocks: string[]
  reference_turns: VoiceCoachFollowupReferenceTurn[]
  customer_objection?: string
  your_response?: string
  suggested_response?: string
}

export type VoiceCoachSessionSnapshot = {
  version: "v1"
  customer_profile: ReturnType<typeof normalizeCustomerProfileRecord> | null
  scene_card: ReturnType<typeof normalizeSceneCardRecord> | null
  followup_context: VoiceCoachFollowupContext | null
  live_notes: string
  prompt_context_text: string
  display: {
    customer_name: string
    customer_summary: string
    scene_name: string
    scene_kind: string
    scene_kind_label: string
    service_name: string
    summary_lines: string[]
  }
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 12)
  }

  const text = String(value || "")
    .replace(/\r/g, "\n")
    .trim()
  if (!text) return []

  return Array.from(
    new Set(
      text
        .split(/[\n,，、；;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12)
}

function nullableText(value: unknown, max = 300): string | null {
  const text = String(value || "").trim()
  if (!text) return null
  return text.slice(0, max)
}

function boundedText(value: unknown, max = 300): string {
  return nullableText(value, max) || ""
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeTrainingTaskClientContext(input: unknown) {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!data) return null
  const taskId = boundedText(data.task_id || data.taskId, 80)
  if (!taskId) return null
  return {
    brand_code: boundedText(data.brand_code || data.brandCode, 40),
    pack_id: boundedText(data.pack_id || data.packId, 80),
    task_id: taskId,
    title: boundedText(data.title, 80),
    day_index: numberOrNull(data.day_index || data.dayIndex),
  }
}

function normalizeFollowupReferenceTurn(input: unknown): VoiceCoachFollowupReferenceTurn | null {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!data) return null
  const role = data.role === "beautician" ? "beautician" : data.role === "customer" ? "customer" : null
  const text = boundedText(data.text, 120)
  if (!role || !text) return null
  const rawTurnIndex = Number(data.turn_index)
  return {
    role,
    ...(boundedText(data.turn_id, 80) ? { turn_id: boundedText(data.turn_id, 80) } : {}),
    ...(Number.isFinite(rawTurnIndex) ? { turn_index: rawTurnIndex } : {}),
    text,
  }
}

export function normalizeVoiceCoachFollowupContext(input: unknown): VoiceCoachFollowupContext | null {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!data) return null

  const sourceSessionId = boundedText(data.source_session_id, 80)
  const title = boundedText(data.title, 80)
  const instruction = boundedText(data.instruction, 220)
  const practicePoints = toStringList(data.practice_points).slice(0, 5)
  const missedPoints = toStringList(data.missed_points).slice(0, 4)
  const riskPoints = toStringList(data.risk_points).slice(0, 3)
  const summaryBlocks = toStringList(data.summary_blocks).slice(0, 3)
  const referenceTurns = Array.isArray(data.reference_turns)
    ? data.reference_turns
        .map((item) => normalizeFollowupReferenceTurn(item))
        .filter((item): item is VoiceCoachFollowupReferenceTurn => Boolean(item))
        .slice(0, 6)
    : []

  if (
    !sourceSessionId &&
    !title &&
    !instruction &&
    !practicePoints.length &&
    !missedPoints.length &&
    !summaryBlocks.length &&
    !referenceTurns.length
  ) {
    return null
  }

  return {
    source_session_id: sourceSessionId,
    ...(boundedText(data.source_report_generated_at, 40)
      ? { source_report_generated_at: boundedText(data.source_report_generated_at, 40) }
      : {}),
    ...(boundedText(data.focus_dimension_id, 40) ? { focus_dimension_id: boundedText(data.focus_dimension_id, 40) } : {}),
    ...(boundedText(data.focus_dimension_name, 40)
      ? { focus_dimension_name: boundedText(data.focus_dimension_name, 40) }
      : {}),
    focus_score: numberOrNull(data.focus_score),
    title: title || "上一轮复练重点",
    instruction: instruction || practicePoints[0] || missedPoints[0] || "围绕上一轮薄弱点继续训练。",
    practice_points: practicePoints,
    missed_points: missedPoints,
    risk_points: riskPoints,
    summary_blocks: summaryBlocks,
    reference_turns: referenceTurns,
    ...(boundedText(data.customer_objection, 120) ? { customer_objection: boundedText(data.customer_objection, 120) } : {}),
    ...(boundedText(data.your_response, 120) ? { your_response: boundedText(data.your_response, 120) } : {}),
    ...(boundedText(data.suggested_response, 180) ? { suggested_response: boundedText(data.suggested_response, 180) } : {}),
  }
}

export function normalizeCustomerProfileInput(input: VoiceCoachCustomerProfileInput) {
  return {
    name: String(input.name || "").trim(),
    age_label: nullableText(input.age_label, 30),
    occupation: nullableText(input.occupation, 40),
    personality_tags: toStringList(input.personality_tags),
    communication_style: nullableText(input.communication_style, 120),
    core_concerns: toStringList(input.core_concerns),
    trust_triggers: toStringList(input.trust_triggers),
    past_experience: nullableText(input.past_experience, 200),
    notes: nullableText(input.notes, 300),
  }
}

export function normalizeSceneCardInput(input: VoiceCoachSceneCardInput) {
  const rawKind = String(input.scene_kind || "customer_visit").trim()
  const sceneKind = VOICE_COACH_SCENE_KIND_VALUES.includes(rawKind as VoiceCoachSceneKind)
    ? (rawKind as VoiceCoachSceneKind)
    : "customer_visit"

  return {
    name: String(input.name || "").trim(),
    scene_kind: sceneKind,
    service_name: nullableText(input.service_name, 60),
    customer_stage: nullableText(input.customer_stage, 40),
    scene_goal: nullableText(input.scene_goal, 160),
    focus_stages: toStringList(input.focus_stages).filter((item) =>
      VOICE_COACH_FOCUS_STAGE_VALUES.includes(item as (typeof VOICE_COACH_FOCUS_STAGE_VALUES)[number]),
    ),
    likely_questions: toStringList(input.likely_questions),
    target_objections: toStringList(input.target_objections),
    communication_method_tags: toStringList(input.communication_method_tags),
    must_cover_points: toStringList(input.must_cover_points),
    do_not_say: toStringList(input.do_not_say),
    notes: nullableText(input.notes, 300),
  }
}

export function normalizeCustomerProfileRecord(record: VoiceCoachCustomerProfileRecord | null | undefined) {
  if (!record) return null
  return {
    id: String(record.id || ""),
    name: String(record.name || "").trim(),
    age_label: nullableText(record.age_label, 30),
    occupation: nullableText(record.occupation, 40),
    personality_tags: toStringList(record.personality_tags),
    communication_style: nullableText(record.communication_style, 120),
    core_concerns: toStringList(record.core_concerns),
    trust_triggers: toStringList(record.trust_triggers),
    past_experience: nullableText(record.past_experience, 200),
    notes: nullableText(record.notes, 300),
  }
}

export function normalizeSceneCardRecord(record: VoiceCoachSceneCardRecord | null | undefined) {
  if (!record) return null
  const rawKind = String(record.scene_kind || "customer_visit").trim()
  const sceneKind = VOICE_COACH_SCENE_KIND_VALUES.includes(rawKind as VoiceCoachSceneKind)
    ? (rawKind as VoiceCoachSceneKind)
    : "customer_visit"

  return {
    id: String(record.id || ""),
    name: String(record.name || "").trim(),
    scene_kind: sceneKind,
    scene_kind_label: VOICE_COACH_SCENE_KIND_LABELS[sceneKind],
    service_name: nullableText(record.service_name, 60),
    customer_stage: nullableText(record.customer_stage, 40),
    scene_goal: nullableText(record.scene_goal, 160),
    focus_stages: toStringList(record.focus_stages),
    likely_questions: toStringList(record.likely_questions),
    target_objections: toStringList(record.target_objections),
    communication_method_tags: toStringList(record.communication_method_tags),
    must_cover_points: toStringList(record.must_cover_points),
    do_not_say: toStringList(record.do_not_say),
    notes: nullableText(record.notes, 300),
  }
}

function buildCustomerSummary(profile: ReturnType<typeof normalizeCustomerProfileRecord>) {
  if (!profile) return ""
  const bits = [profile.age_label, profile.occupation].filter(Boolean)
  const tagText = profile.personality_tags.length ? `性格/${profile.personality_tags.join("、")}` : ""
  if (tagText) bits.push(tagText)
  return bits.join(" · ")
}

function formatBulletLine(label: string, values: Array<string | null | undefined>) {
  const compact = values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
  if (!compact.length) return ""
  return `${label}：${compact.join("；")}`
}

function pickTopItems(value: unknown, max = 3): string[] {
  return toStringList(value).slice(0, max)
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function pickSeededItem(items: string[], seed: string, offset = 0): string {
  if (!items.length) return ""
  const index = (quickHash(seed) + offset) % items.length
  return items[index] || items[0] || ""
}

function compactSnippet(text: string, max = 28): string {
  const normalized = String(text || "").replace(/\s+/g, "").trim()
  if (!normalized) return ""
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

function buildFollowupPromptLines(followupContext: VoiceCoachFollowupContext | null): string[] {
  if (!followupContext) return []

  const lines = [
    formatBulletLine("上一轮复盘重点", [followupContext.title, followupContext.instruction]),
    followupContext.practice_points.length
      ? formatBulletLine("第二轮优先训练", followupContext.practice_points.slice(0, 4))
      : "",
    followupContext.missed_points.length
      ? formatBulletLine("上一轮缺失点", followupContext.missed_points.slice(0, 3))
      : "",
    followupContext.risk_points.length
      ? formatBulletLine("上一轮风险提醒", followupContext.risk_points.slice(0, 2))
      : "",
    followupContext.customer_objection
      ? formatBulletLine("上一轮关键异议", [followupContext.customer_objection])
      : "",
    followupContext.your_response ? formatBulletLine("上一轮原回答", [followupContext.your_response]) : "",
    followupContext.suggested_response
      ? formatBulletLine("上一轮建议表达", [followupContext.suggested_response])
      : "",
  ]

  const referenceText = followupContext.reference_turns
    .slice(0, 4)
    .map((turn) => `${turn.role === "customer" ? "顾客" : "美容师"}：${turn.text}`)
  if (referenceText.length) {
    lines.push(formatBulletLine("上一轮关键对话参考", referenceText))
  }

  lines.push("第二轮约束：上一轮内容只作为参考，不要原样复述；把第二轮当成新一场训练，围绕同类短板继续追问和压测。")

  return lines.filter(Boolean)
}

export function buildVoiceCoachFollowupOpening(snapshot: unknown): string {
  const snapshotObject =
    snapshot && typeof snapshot === "object" ? (snapshot as Partial<VoiceCoachSessionSnapshot>) : null
  const followupContext = normalizeVoiceCoachFollowupContext(snapshotObject?.followup_context || null)
  if (!followupContext) return ""

  const focus =
    followupContext.missed_points[0] ||
    followupContext.practice_points[0] ||
    followupContext.focus_dimension_name ||
    followupContext.title
  const objection = followupContext.customer_objection || followupContext.reference_turns.find((turn) => turn.role === "customer")?.text
  const focusSnippet = compactSnippet(focus, 18) || "这个重点"
  const objectionSnippet = compactSnippet(objection || "", 18)

  if (objectionSnippet) {
    return `上次我问到“${objectionSnippet}”，这次你能把${focusSnippet}讲具体一点吗？`
  }

  return `我这次最想确认${focusSnippet}，你能给我具体依据吗？`
}

export function buildVoiceCoachFirstTurnTarget(snapshot: unknown, variationSeed?: string): string {
  const snapshotObject =
    snapshot && typeof snapshot === "object" ? (snapshot as Partial<VoiceCoachSessionSnapshot>) : null
  const customerProfile = normalizeCustomerProfileRecord((snapshotObject?.customer_profile as any) || null)
  const sceneCard = normalizeSceneCardRecord((snapshotObject?.scene_card as any) || null)
  const followupContext = normalizeVoiceCoachFollowupContext(snapshotObject?.followup_context || null)
  const sceneKindPolicy = getVoiceCoachSceneKindPolicy(sceneCard?.scene_kind, sceneCard?.service_name)

  const coreConcerns = pickTopItems(customerProfile?.core_concerns, 3)
  const trustTriggers = pickTopItems(customerProfile?.trust_triggers, 3)
  const likelyQuestions = pickTopItems(sceneCard?.likely_questions, 3)
  const targetObjections = pickTopItems(sceneCard?.target_objections, 3)
  const communicationMethodTags = pickTopItems(sceneCard?.communication_method_tags, 3)
  const mustCoverPoints = pickTopItems(sceneCard?.must_cover_points, 3)
  const doNotSay = pickTopItems(sceneCard?.do_not_say, 2)
  const sceneGoal = String(sceneCard?.scene_goal || "").trim()
  const pastExperience = String(customerProfile?.past_experience || "").trim()
  const focusPool = [
    ...coreConcerns,
    ...likelyQuestions,
    ...targetObjections,
    ...mustCoverPoints,
    ...communicationMethodTags,
  ].filter(Boolean)
  const normalizedSeed =
    String(variationSeed || sceneCard?.id || customerProfile?.id || sceneGoal || "voice-coach").trim() ||
    "voice-coach"
  const primaryFocus = pickSeededItem(focusPool, normalizedSeed)
  const secondaryFocus = pickSeededItem(focusPool, `${normalizedSeed}:secondary`, 1)
  const openingStyles = [
    "Open with a cautious, detail-checking question instead of a broad generic opener.",
    "Open with a trust-gap concern before asking for process details.",
    "Open with a practical scheduling or recovery concern before discussing value.",
    "Open with a comparison or proof-oriented concern before discussing price.",
  ]
  const openingStyle = pickSeededItem(openingStyles, `${normalizedSeed}:style`)

  const instructions = [
    "Use the configured customer profile as the primary persona source.",
    followupContext
      ? "Open with the previous report weakness first; use explicit customer concerns only as persona support."
      : "Open with one of the customer's explicit core concerns instead of a generic default objection.",
    "Blend the customer's concern with the current training scene, so the first line sounds like this customer in this visit or promotion moment.",
    "Avoid reusing the same generic opening wording from previous sessions.",
    openingStyle,
  ]

  if (followupContext) {
    instructions.unshift(
      "This is a second-round follow-up training session. The opening customer line must pressure-test the previous report weakness.",
      `Previous focus: ${followupContext.title}. ${followupContext.instruction}`,
      followupContext.practice_points.length
        ? `Practice points to trigger: ${followupContext.practice_points.slice(0, 4).join(" / ")}.`
        : "",
      followupContext.customer_objection
        ? `Use the previous objection only as reference, not as a verbatim repeat: ${followupContext.customer_objection}.`
        : "",
      "Do not continue the old conversation as if it never ended; open a fresh but related scenario pressure point.",
    )
  }

  if (coreConcerns.length) {
    instructions.push(`Prioritize these explicit core concerns first: ${coreConcerns.join(" / ")}.`)
    if (primaryFocus && coreConcerns.includes(primaryFocus)) {
      instructions.push(`For this run, prefer opening with \"${primaryFocus}\".`)
    } else {
      instructions.push(`If multiple concerns exist, prefer opening with \"${coreConcerns[0]}\".`)
    }
  }

  if (sceneGoal) {
    instructions.push(`The opening should clearly serve this scene goal: ${sceneGoal}.`)
  }

  instructions.push(sceneKindPolicy.firstTurnGuidance)

  if (likelyQuestions.length) {
    instructions.push(
      `Naturally tee up one of these likely scene questions in the opening: ${likelyQuestions.join(" / ")}.`,
    )
  }

  if (targetObjections.length) {
    instructions.push(
      `When it fits the persona, surface one of these scene-card objections as the first pressure point: ${targetObjections.join(" / ")}.`,
    )
  }

  if (mustCoverPoints.length) {
    instructions.push(
      `Choose an opening that gives the beautician a natural path to cover: ${mustCoverPoints.join(" / ")}.`,
    )
  }

  if (primaryFocus) {
    instructions.push(`Primary focus for this run: ${primaryFocus}.`)
  }

  if (secondaryFocus && secondaryFocus !== primaryFocus) {
    instructions.push(`Secondary follow-up angle for this run: ${secondaryFocus}.`)
  }

  if (communicationMethodTags.length) {
    instructions.push(
      `Bias the conversation toward these communication methods: ${communicationMethodTags.join(" / ")}.`,
    )
  }

  if (trustTriggers.length) {
    instructions.push(`Use these trust-building needs only as supporting detail: ${trustTriggers.join(" / ")}.`)
  }

  if (doNotSay.length) {
    instructions.push(`Do not invite or reward forbidden lines such as: ${doNotSay.join(" / ")}.`)
  }

  if (pastExperience) {
    instructions.push(
      "Past experience can reinforce the concern, but should not replace an explicit core concern when one exists.",
    )
  }

  return instructions.join(" ")
}

export function buildVoiceCoachSessionSnapshot(args: {
  customerProfile?: VoiceCoachCustomerProfileRecord | null
  sceneCard?: VoiceCoachSceneCardRecord | null
  liveNotes?: string | null
  followupContext?: unknown
}): VoiceCoachSessionSnapshot {
  const customerProfile = normalizeCustomerProfileRecord(args.customerProfile || null)
  const sceneCard = normalizeSceneCardRecord(args.sceneCard || null)
  const liveNotes = String(args.liveNotes || "").trim().slice(0, 500)
  const followupContext = normalizeVoiceCoachFollowupContext(args.followupContext || null)
  const sceneKindPolicy = getVoiceCoachSceneKindPolicy(sceneCard?.scene_kind, sceneCard?.service_name)

  const summaryLines = [
    customerProfile
      ? formatBulletLine("顾客设定", [
          customerProfile.name,
          customerProfile.age_label,
          customerProfile.occupation,
          customerProfile.personality_tags.length ? `性格 ${customerProfile.personality_tags.join("、")}` : "",
        ])
      : "",
    customerProfile
      ? formatBulletLine("核心顾虑", customerProfile.core_concerns)
      : "",
    sceneCard
      ? formatBulletLine("场景卡", [
          sceneCard.name,
          sceneCard.scene_kind_label,
          sceneCard.service_name ? `项目 ${sceneCard.service_name}` : "",
          sceneCard.customer_stage ? `阶段 ${sceneCard.customer_stage}` : "",
        ])
      : "",
    sceneCard ? formatBulletLine("训练目标", [sceneCard.scene_goal]) : "",
    sceneCard ? formatBulletLine("沟通方法", sceneCard.communication_method_tags) : "",
    sceneCard ? formatBulletLine("重点环节", sceneCard.focus_stages) : "",
    sceneCard ? formatBulletLine("高频问题", sceneCard.likely_questions) : "",
    sceneCard ? formatBulletLine("重点异议", sceneCard.target_objections) : "",
    sceneCard ? formatBulletLine("必须覆盖", sceneCard.must_cover_points) : "",
    sceneCard ? formatBulletLine("禁忌表达", sceneCard.do_not_say) : "",
    liveNotes ? `本次补充：${liveNotes}` : "",
    followupContext ? formatBulletLine("复练重点", [followupContext.title]) : "",
  ].filter(Boolean)

  const promptLines = [
    ...summaryLines,
    formatBulletLine("场景策略", [sceneKindPolicy.promptSummary]),
    customerProfile ? formatBulletLine("沟通风格", [customerProfile.communication_style]) : "",
    customerProfile ? formatBulletLine("建立信任的点", customerProfile.trust_triggers) : "",
    customerProfile ? formatBulletLine("过往经历", [customerProfile.past_experience]) : "",
    customerProfile ? formatBulletLine("顾客补充备注", [customerProfile.notes]) : "",
    ...buildFollowupPromptLines(followupContext),
  ].filter(Boolean)

  const promptContextText = promptLines.join("\n")

  return {
    version: "v1",
    customer_profile: customerProfile,
    scene_card: sceneCard,
    followup_context: followupContext,
    live_notes: liveNotes,
    prompt_context_text: promptContextText,
    display: {
      customer_name: customerProfile?.name || "",
      customer_summary: buildCustomerSummary(customerProfile),
      scene_name: sceneCard?.name || "",
      scene_kind: sceneCard?.scene_kind || "",
      scene_kind_label: sceneCard?.scene_kind_label || "",
      service_name: sceneCard?.service_name || "",
      summary_lines: summaryLines.slice(0, 7),
    },
  }
}

export function getVoiceCoachSessionPromptContext(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return ""
  return String((snapshot as { prompt_context_text?: unknown }).prompt_context_text || "").trim()
}

export function getVoiceCoachSessionClientContext(args: {
  snapshot?: unknown
  customerProfileId?: string | null
  sceneCardId?: string | null
  sessionContext?: unknown
}) {
  const snapshotObject = args.snapshot && typeof args.snapshot === "object" ? (args.snapshot as VoiceCoachSessionSnapshot) : null
  const liveNotesFromSnapshot = String(snapshotObject?.live_notes || "").trim()
  const liveNotesFromContext =
    args.sessionContext && typeof args.sessionContext === "object"
      ? String((args.sessionContext as { live_notes?: unknown }).live_notes || "").trim()
      : ""
  const followupFromContext =
    args.sessionContext && typeof args.sessionContext === "object"
      ? normalizeVoiceCoachFollowupContext((args.sessionContext as { followup_context?: unknown }).followup_context || null)
      : null
  const trainingTaskFromContext =
    args.sessionContext && typeof args.sessionContext === "object"
      ? normalizeTrainingTaskClientContext((args.sessionContext as { training_task?: unknown }).training_task || null)
      : null

  return {
    customer_profile_id: args.customerProfileId || "",
    scene_card_id: args.sceneCardId || "",
    live_notes: liveNotesFromSnapshot || liveNotesFromContext,
    followup_context: normalizeVoiceCoachFollowupContext(snapshotObject?.followup_context || null) || followupFromContext,
    training_task: trainingTaskFromContext,
    customer_name: String(snapshotObject?.display?.customer_name || "").trim(),
    customer_summary: String(snapshotObject?.display?.customer_summary || "").trim(),
    scene_name: String(snapshotObject?.display?.scene_name || "").trim(),
    scene_kind: String(snapshotObject?.display?.scene_kind || "").trim(),
    scene_kind_label: String(snapshotObject?.display?.scene_kind_label || "").trim(),
    service_name: String(snapshotObject?.display?.service_name || "").trim(),
    summary_lines: Array.isArray(snapshotObject?.display?.summary_lines)
      ? snapshotObject!.display.summary_lines.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  }
}
