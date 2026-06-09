import {
  getVoiceCoachSessionClientContext,
  normalizeVoiceCoachFollowupContext,
  normalizeCustomerProfileRecord,
  normalizeSceneCardRecord,
  normalizeVoiceCoachTrainingContext,
  type VoiceCoachProfessionalProfile,
  type VoiceCoachSessionSnapshot,
} from "./session-context"
import { getVoiceCoachSceneKindPolicy } from "./scene-kind-policy"

function uniqStrings(items: Array<string | null | undefined>, max = 12): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (let i = 0; i < items.length; i += 1) {
    const value = String(items[i] || "").trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
    if (result.length >= max) break
  }

  return result
}

function compactJoin(items: Array<string | null | undefined>, separator = "，") {
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(separator)
}

function truncateText(text: string, max = 160) {
  const normalized = String(text || "").trim()
  if (!normalized) return ""
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

export type VoiceCoachSessionInsights = {
  hasContext: boolean
  customerName: string
  customerSummary: string
  sceneName: string
  sceneKind: string
  sceneKindLabel: string
  sceneKindPolicySummary: string
  serviceName: string
  liveNotes: string
  summaryLines: string[]
  backgroundSummary: string
  sceneGoal: string
  customerStage: string
  focusStages: string[]
  coreConcerns: string[]
  trustTriggers: string[]
  likelyQuestions: string[]
  targetObjections: string[]
  communicationMethodTags: string[]
  mustCoverPoints: string[]
  doNotSay: string[]
  professionalProfile: VoiceCoachProfessionalProfile | null
  professionalSummary: string
  professionalMustAsk: string[]
  professionalMustCover: string[]
  professionalAllowedPhrases: string[]
  professionalDoNotSay: string[]
  professionalPauseAndRefer: string[]
  focusPoints: string[]
  followupTitle: string
  followupInstruction: string
  followupPracticePoints: string[]
  followupMissedPoints: string[]
  followupRiskPoints: string[]
}

export function getVoiceCoachSessionInsights(args: {
  snapshot?: unknown
  sessionContext?: unknown
}): VoiceCoachSessionInsights {
  const snapshotObject =
    args.snapshot && typeof args.snapshot === "object"
      ? (args.snapshot as Partial<VoiceCoachSessionSnapshot>)
      : null

  const customerProfile = normalizeCustomerProfileRecord(
    (snapshotObject?.customer_profile as any) || null,
  )
  const sceneCard = normalizeSceneCardRecord((snapshotObject?.scene_card as any) || null)
  const followupContext = normalizeVoiceCoachFollowupContext(snapshotObject?.followup_context || null)
  const trainingContext =
    normalizeVoiceCoachTrainingContext(snapshotObject?.training_context || null) ||
    normalizeVoiceCoachTrainingContext(
      args.sessionContext && typeof args.sessionContext === "object"
        ? (args.sessionContext as { training_context?: unknown }).training_context || null
        : null,
    )
  const professionalProfile = trainingContext?.professional_profile || null
  const clientContext = getVoiceCoachSessionClientContext({
    snapshot: args.snapshot,
    sessionContext: args.sessionContext,
  })
  const sceneKindPolicy = getVoiceCoachSceneKindPolicy(
    clientContext.scene_kind,
    clientContext.service_name,
  )

  const summaryLines = uniqStrings(clientContext.summary_lines || [], 6)
  const focusPoints = uniqStrings(
    [
      ...(customerProfile?.core_concerns || []),
      ...(sceneCard?.target_objections || []),
      ...(sceneCard?.communication_method_tags || []),
      ...(sceneCard?.must_cover_points || []),
      ...(sceneCard?.likely_questions || []),
      ...(followupContext?.practice_points || []),
      ...(followupContext?.missed_points || []),
      ...(professionalProfile?.must_ask || []),
      ...(professionalProfile?.must_cover || []),
    ],
    6,
  )

  const customerLabel = compactJoin(
    [clientContext.customer_name, clientContext.customer_summary],
    "｜",
  )
  const sceneLabel = compactJoin(
    [
      clientContext.scene_name,
      clientContext.scene_kind_label,
      clientContext.service_name ? `项目 ${clientContext.service_name}` : "",
    ],
    "｜",
  )

  const backgroundParts: string[] = []
  if (customerLabel) backgroundParts.push(`顾客设定：${customerLabel}`)
  if (sceneLabel) backgroundParts.push(`训练场景：${sceneLabel}`)
  if (sceneCard?.scene_goal) backgroundParts.push(`目标：${sceneCard.scene_goal}`)
  if (clientContext.live_notes) backgroundParts.push(`备注：${clientContext.live_notes}`)
  if (followupContext?.title) backgroundParts.push(`复练重点：${followupContext.title}`)
  if (professionalProfile) {
    backgroundParts.push(
      `专业主题：${compactJoin(
        [
          professionalProfile.title,
          professionalProfile.domain_label || professionalProfile.domain,
          professionalProfile.plain_definition,
        ],
        "｜",
      )}`,
    )
  }

  return {
    hasContext: Boolean(
      customerLabel ||
        sceneLabel ||
        clientContext.live_notes ||
        followupContext?.title ||
        summaryLines.length ||
        focusPoints.length ||
        Boolean(professionalProfile),
    ),
    customerName: clientContext.customer_name,
    customerSummary: clientContext.customer_summary,
    sceneName: clientContext.scene_name,
    sceneKind: clientContext.scene_kind,
    sceneKindLabel: clientContext.scene_kind_label,
    sceneKindPolicySummary: sceneKindPolicy.reportFocus,
    serviceName: clientContext.service_name,
    liveNotes: clientContext.live_notes,
    summaryLines,
    backgroundSummary: truncateText(backgroundParts.join("；"), 220),
    sceneGoal: String(sceneCard?.scene_goal || "").trim(),
    customerStage: String(sceneCard?.customer_stage || "").trim(),
    focusStages: uniqStrings(sceneCard?.focus_stages || [], 6),
    coreConcerns: uniqStrings(customerProfile?.core_concerns || [], 6),
    trustTriggers: uniqStrings(customerProfile?.trust_triggers || [], 6),
    likelyQuestions: uniqStrings(sceneCard?.likely_questions || [], 6),
    targetObjections: uniqStrings(sceneCard?.target_objections || [], 6),
    communicationMethodTags: uniqStrings(sceneCard?.communication_method_tags || [], 6),
    mustCoverPoints: uniqStrings(sceneCard?.must_cover_points || [], 6),
    doNotSay: uniqStrings([...(sceneCard?.do_not_say || []), ...(professionalProfile?.do_not_say || [])], 8),
    professionalProfile,
    professionalSummary: professionalProfile
      ? truncateText(
          compactJoin(
            [
              professionalProfile.title,
              professionalProfile.domain_label || professionalProfile.domain,
              professionalProfile.safe_frame,
              professionalProfile.plain_definition,
              ...professionalProfile.core_mechanism.slice(0, 3),
            ],
            "；",
          ),
          260,
        )
      : "",
    professionalMustAsk: uniqStrings(professionalProfile?.must_ask || [], 8),
    professionalMustCover: uniqStrings(professionalProfile?.must_cover || [], 10),
    professionalAllowedPhrases: uniqStrings(professionalProfile?.allowed_phrases || [], 8),
    professionalDoNotSay: uniqStrings(professionalProfile?.do_not_say || [], 10),
    professionalPauseAndRefer: uniqStrings(professionalProfile?.pause_and_refer || [], 8),
    focusPoints,
    followupTitle: followupContext?.title || "",
    followupInstruction: followupContext?.instruction || "",
    followupPracticePoints: uniqStrings(followupContext?.practice_points || [], 5),
    followupMissedPoints: uniqStrings(followupContext?.missed_points || [], 4),
    followupRiskPoints: uniqStrings(followupContext?.risk_points || [], 3),
  }
}
