import { z } from "zod"

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

export type VoiceCoachSessionSnapshot = {
  version: "v1"
  customer_profile: ReturnType<typeof normalizeCustomerProfileRecord> | null
  scene_card: ReturnType<typeof normalizeSceneCardRecord> | null
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

export function buildVoiceCoachSessionSnapshot(args: {
  customerProfile?: VoiceCoachCustomerProfileRecord | null
  sceneCard?: VoiceCoachSceneCardRecord | null
  liveNotes?: string | null
}): VoiceCoachSessionSnapshot {
  const customerProfile = normalizeCustomerProfileRecord(args.customerProfile || null)
  const sceneCard = normalizeSceneCardRecord(args.sceneCard || null)
  const liveNotes = String(args.liveNotes || "").trim().slice(0, 500)

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
    sceneCard ? formatBulletLine("重点环节", sceneCard.focus_stages) : "",
    sceneCard ? formatBulletLine("高频问题", sceneCard.likely_questions) : "",
    sceneCard ? formatBulletLine("重点异议", sceneCard.target_objections) : "",
    sceneCard ? formatBulletLine("必须覆盖", sceneCard.must_cover_points) : "",
    sceneCard ? formatBulletLine("禁忌表达", sceneCard.do_not_say) : "",
    liveNotes ? `本次补充：${liveNotes}` : "",
  ].filter(Boolean)

  const promptLines = [
    ...summaryLines,
    customerProfile ? formatBulletLine("沟通风格", [customerProfile.communication_style]) : "",
    customerProfile ? formatBulletLine("建立信任的点", customerProfile.trust_triggers) : "",
    customerProfile ? formatBulletLine("过往经历", [customerProfile.past_experience]) : "",
    customerProfile ? formatBulletLine("顾客补充备注", [customerProfile.notes]) : "",
  ].filter(Boolean)

  const promptContextText = promptLines.join("\n")

  return {
    version: "v1",
    customer_profile: customerProfile,
    scene_card: sceneCard,
    live_notes: liveNotes,
    prompt_context_text: promptContextText,
    display: {
      customer_name: customerProfile?.name || "",
      customer_summary: buildCustomerSummary(customerProfile),
      scene_name: sceneCard?.name || "",
      scene_kind: sceneCard?.scene_kind || "",
      scene_kind_label: sceneCard?.scene_kind_label || "",
      service_name: sceneCard?.service_name || "",
      summary_lines: summaryLines.slice(0, 6),
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

  return {
    customer_profile_id: args.customerProfileId || "",
    scene_card_id: args.sceneCardId || "",
    live_notes: liveNotesFromSnapshot || liveNotesFromContext,
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
