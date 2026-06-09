import type { VoiceCoachScenario } from "./scenarios"
import {
  calcFillerRatio,
  calcWpm,
  clampScore,
  DEFAULT_TARGET_WPM_RANGE,
  derivePronunciationSignal,
  scoreExpressionFromFillerRatio,
  scoreFluencyFromWpm,
  scoreToStars,
} from "./metrics"
import {
  type DimensionId,
  VoiceCoachReportSchema,
  type VoiceCoachReport,
  type VoiceCoachReportReferenceTurn,
} from "./report"
import { getVoiceCoachSceneKindPolicy } from "./scene-kind-policy"
import { getVoiceCoachSessionInsights } from "./session-context-insights"
import { normalizeScenarioTag } from "./tag-utils"

export type VoiceCoachTurnRow = {
  id: string
  role: "customer" | "beautician"
  text: string
  emotion: string | null
  audio_path: string | null
  audio_seconds: number | null
  asr_confidence: number | null
  analysis_json: any
  features_json: any
  turn_index: number
  created_at?: string
}

type BaseDimensionId = Exclude<DimensionId, "professionalism">
type BaseDimensionScores = Record<BaseDimensionId, number>
type ReportDimensionScores = BaseDimensionScores & Partial<Record<"professionalism", number>>

type ScoredBeauticianTurn = {
  turn: VoiceCoachTurnRow
  scores: Partial<BaseDimensionScores>
}

type RepresentativeTurn = {
  beautician: VoiceCoachTurnRow | null
  customer: VoiceCoachTurnRow | null
}

type TrainingContextReview = NonNullable<VoiceCoachReport["training_context"]>
type ProfessionalismTab = NonNullable<VoiceCoachReport["tabs"]["professionalism"]>
type ProfessionalismReview = {
  score: number
  tab: ProfessionalismTab
  redFlagCap: number | null
}

const DIMENSION_NAMES: Record<DimensionId, string> = {
  persuasion: "说服力",
  fluency: "流利度",
  expression: "语言表达",
  pronunciation: "发音准确度",
  organization: "语言组织",
  professionalism: "专业度",
}

const NEXT_ROUND_DIMENSION_PRIORITY: DimensionId[] = [
  "professionalism",
  "persuasion",
  "organization",
  "expression",
  "fluency",
]

function safeAvg(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function safeSpread(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  if (vals.length < 2) return null
  return Math.max(...vals) - Math.min(...vals)
}

function pronunciationStatus(score: number | null): string {
  const n = Number(score)
  if (!Number.isFinite(n)) return "一般"
  if (n >= 82) return "稳定"
  if (n >= 70) return "一般"
  return "待加强"
}

function pronunciationStabilityStatus(spread: number | null): string {
  if (spread == null) return "一般"
  if (spread <= 10) return "稳定"
  if (spread <= 18) return "一般"
  return "待加强"
}

function pronunciationStabilityScore(spread: number | null): number {
  if (spread == null) return 72
  if (spread <= 8) return 88
  if (spread <= 14) return 78
  if (spread <= 22) return 68
  return 58
}

function weightedTotal(scores: ReportDimensionScores): number {
  const baseTotal =
    scores.persuasion * 0.3 +
    scores.fluency * 0.2 +
    scores.expression * 0.2 +
    scores.pronunciation * 0.15 +
    scores.organization * 0.15
  const total =
    typeof scores.professionalism === "number"
      ? baseTotal * 0.8 + scores.professionalism * 0.2
      : baseTotal
  return clampScore(total)
}

function readTurnFeature(turn: VoiceCoachTurnRow, key: string): number | null {
  const features = turn.features_json
  if (!features || typeof features !== "object") return null
  const value = (features as Record<string, unknown>)[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readTurnScore(turn: VoiceCoachTurnRow, dimensionId: DimensionId): number | null {
  const analysis = turn.analysis_json
  if (!analysis || typeof analysis !== "object") return null

  const perTurnScores = analysis.per_turn_scores
  if (perTurnScores && typeof perTurnScores === "object") {
    const value = (perTurnScores as Record<string, unknown>)[dimensionId]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }

  if (dimensionId === "persuasion") {
    const value = analysis.persuasion_score
    if (typeof value === "number" && Number.isFinite(value)) return clampScore(value)
  }

  if (dimensionId === "organization") {
    const value = analysis.organization_score
    if (typeof value === "number" && Number.isFinite(value)) return clampScore(value)
  }

  return null
}

function aggregateDimensionScores(turns: VoiceCoachTurnRow[]): BaseDimensionScores | null {
  const turnScores = turns
    .map((turn) => turn.analysis_json?.per_turn_scores)
    .filter((scores): scores is Record<string, number> => !!scores && typeof scores === "object")

  if (!turnScores.length) return null

  const dimensions: BaseDimensionId[] = [
    "persuasion",
    "fluency",
    "expression",
    "pronunciation",
    "organization",
  ]
  const result = {} as BaseDimensionScores

  for (const dimensionId of dimensions) {
    let weightedSum = 0
    let totalWeight = 0

    turnScores.forEach((scores, index) => {
      if (typeof scores[dimensionId] !== "number") return
      const weight = index + 1
      weightedSum += scores[dimensionId] * weight
      totalWeight += weight
    })

    result[dimensionId] = totalWeight > 0 ? clampScore(Math.round(weightedSum / totalWeight)) : 65
  }

  return result
}

function buildTurnCurve(
  turns: VoiceCoachTurnRow[],
  extractor: (turn: VoiceCoachTurnRow, index: number) => number | null,
): Array<{ x: number; y: number }> {
  let elapsed = 0
  const points: Array<{ x: number; y: number }> = []

  turns.forEach((turn, index) => {
    const value = extractor(turn, index)
    const seconds = Number(turn.audio_seconds || 0)
    elapsed += seconds
    if (value != null) points.push({ x: Math.round(elapsed), y: value })
  })

  return points.length >= 2 ? points : []
}

function toScoredBeauticianTurns(turns: VoiceCoachTurnRow[]): ScoredBeauticianTurn[] {
  return turns
    .map((turn) => ({
      turn,
      scores: {
        persuasion: readTurnScore(turn, "persuasion") ?? undefined,
        fluency: readTurnScore(turn, "fluency") ?? undefined,
        expression: readTurnScore(turn, "expression") ?? undefined,
        pronunciation: readTurnScore(turn, "pronunciation") ?? undefined,
        organization: readTurnScore(turn, "organization") ?? undefined,
      },
    }))
    .filter((entry) => Object.values(entry.scores).some((value) => typeof value === "number"))
}

function pickTurnByScore(
  scoredTurns: ScoredBeauticianTurn[],
  dimensionId: DimensionId,
  mode: "lowest" | "highest",
): VoiceCoachTurnRow | null {
  if (dimensionId === "professionalism") return null

  const candidates = scoredTurns
    .map((entry) => ({
      turn: entry.turn,
      score: entry.scores[dimensionId],
    }))
    .filter((entry): entry is { turn: VoiceCoachTurnRow; score: number } => typeof entry.score === "number")

  if (!candidates.length) return null

  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return mode === "lowest" ? left.score - right.score : right.score - left.score
    }
    return right.turn.turn_index - left.turn.turn_index
  })

  return candidates[0]?.turn || null
}

function pickRepresentativeTurn(
  turns: VoiceCoachTurnRow[],
  beauticianTurns: VoiceCoachTurnRow[],
  scoredTurns: ScoredBeauticianTurn[],
): RepresentativeTurn {
  const representativeBeautician =
    pickTurnByScore(scoredTurns, "persuasion", "lowest") ||
    [...beauticianTurns].reverse().find((turn) => String(turn.text || "").trim()) ||
    null

  if (!representativeBeautician) {
    return {
      beautician: null,
      customer: null,
    }
  }

  const representativeCustomer =
    [...turns]
      .filter((turn) => turn.role === "customer" && turn.turn_index < representativeBeautician.turn_index)
      .sort((left, right) => right.turn_index - left.turn_index)[0] || null

  return {
    beautician: representativeBeautician,
    customer: representativeCustomer,
  }
}

function pickOrganizationExamples(
  beauticianTurns: VoiceCoachTurnRow[],
  scoredTurns: ScoredBeauticianTurn[],
): VoiceCoachTurnRow[] {
  const scoredAudioTurns = scoredTurns
    .map((entry) => ({
      turn: entry.turn,
      score: entry.scores.organization,
    }))
    .filter(
      (entry): entry is { turn: VoiceCoachTurnRow; score: number } =>
        Boolean(entry.turn.audio_path) && typeof entry.score === "number",
    )
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score
      return right.turn.turn_index - left.turn.turn_index
    })
    .slice(0, 3)
    .map((entry) => entry.turn)

  if (scoredAudioTurns.length) return scoredAudioTurns

  return [...beauticianTurns]
    .filter((turn) => Boolean(turn.audio_path))
    .sort((left, right) => right.turn_index - left.turn_index)
    .slice(0, 3)
}

function quoteSnippet(text: string, maxLength = 14): string {
  const normalized = String(text || "").replace(/\s+/g, "").trim()
  if (!normalized) return "这轮表达"
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function statusFromScore(score: number, threshold: { strong: number; mid: number }) {
  if (score >= threshold.strong) return "稳定"
  if (score >= threshold.mid) return "一般"
  return "待加强"
}

function simplifyMatchText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\r\n\t，。,；;：:“”‘’"'`()（）【】《》、\-]/g, "")
    .trim()
}

function uniqueLimited(items: Array<string | null | undefined>, max = 6): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < items.length; i += 1) {
    const value = String(items[i] || "").trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
    if (result.length >= max) break
  }

  return result
}

function pointMatchesCorpus(point: string, corpus: string): boolean {
  const compactPoint = simplifyMatchText(point)
  if (!compactPoint || !corpus) return false
  if (corpus.includes(compactPoint)) return true
  if (!/[，。,；;：:“”‘’"'`()（）【】《》、/\s]/.test(String(point || "")) && compactPoint.length >= 4) {
    return false
  }

  const segments = Array.from(
    new Set(
      String(point || "")
        .split(/[，。,；;：:“”‘’"'`()（）【】《》、/\s]+/)
        .map((item) => simplifyMatchText(item))
        .filter((item) => item.length >= 2),
    ),
  ).sort((left, right) => right.length - left.length)

  if (!segments.length) return false

  let hits = 0
  const requiredHits = segments.length >= 3 ? 2 : 1
  for (let i = 0; i < Math.min(4, segments.length); i += 1) {
    if (!corpus.includes(segments[i])) continue
    hits += 1
    if (hits >= requiredHits) return true
  }

  return false
}

function strictPointMentioned(point: string, corpus: string): boolean {
  const compactPoint = simplifyMatchText(point)
  if (!compactPoint || !corpus) return false
  return corpus.includes(compactPoint)
}

function quoteOriginalText(text: string, maxLength = 90): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function splitClaimSegments(text: string): string[] {
  return String(text || "")
    .split(/[。！？!?；;\n]+/)
    .flatMap((sentence) => sentence.split(/(?<=[，,、])|(?=但|但是|不过|然而|而且|同时)/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasExplicitBoundaryNegation(text: string): boolean {
  const compact = simplifyMatchText(text)
  if (!compact) return false
  return /不做|不能|不可|不要|不建议|不能说|不承诺|不保证|无法保证|不是治疗|不属于治疗|不是诊断|不做诊断|只能|仅能|建议就医|咨询医生|暂停/u.test(compact)
}

function isBoundarySafeRedFlagSegment(text: string, code: string): boolean {
  const compact = simplifyMatchText(text)
  if (!compact || !hasExplicitBoundaryNegation(text)) return false

  if (code.startsWith("do_not_say_")) {
    return /(不能说|不要说|不可说|不可以说|不能这样说|不要这样说|不承诺|不保证|不能承诺|不会承诺|不做|不是)/u.test(compact)
  }

  if (code === "medical_treatment_claim") {
    return /(不做|不能|不可|不是|不属于).*(诊断|治疗|治好|根治|处方|药物|医学疗效|消炎|炎症治疗)|只能.*(美容护理|护理建议)|建议.*(就医|咨询医生)/u.test(compact)
  }

  if (code === "absolute_result_claim") {
    return /(不能|不可|不要|不承诺|不保证|无法保证).*(100%|百分之百|保证|一定|肯定|见效|有效|改善|变好|一次|清干净|清完|做好|解决)/u.test(compact)
  }

  if (code === "absolute_safety_claim") {
    return /(不能|不可|不要|不承诺|不保证|无法保证|不能说).*(绝对安全|完全没风险|任何问题|任何风险|任何副作用)/u.test(compact)
  }

  return false
}

function findEvidenceQuote(point: string, turns: VoiceCoachTurnRow[]): string {
  const compactPoint = simplifyMatchText(point)
  if (!compactPoint) return ""

  for (const turn of turns) {
    const rawText = String(turn.text || "")
    const corpus = simplifyMatchText(rawText)
    if (!corpus) continue
    if (strictPointMentioned(point, corpus) || pointMatchesCorpus(point, corpus)) {
      return quoteOriginalText(rawText)
    }
  }

  return ""
}

function findUnsafePointQuote(point: string, turns: VoiceCoachTurnRow[], code: string): string {
  const compactPoint = simplifyMatchText(point)
  if (!compactPoint) return ""

  for (const turn of turns) {
    for (const segment of splitClaimSegments(turn.text || "")) {
      const corpus = simplifyMatchText(segment)
      if (!corpus) continue
      if (!strictPointMentioned(point, corpus) && !pointMatchesCorpus(point, corpus)) continue
      if (isBoundarySafeRedFlagSegment(segment, code)) continue
      return quoteOriginalText(segment)
    }
  }

  return ""
}

function findRegexQuote(rule: RegExp, turns: VoiceCoachTurnRow[], code: string): string {
  for (const turn of turns) {
    for (const segment of splitClaimSegments(turn.text || "")) {
      rule.lastIndex = 0
      if (!rule.test(segment)) continue
      if (isBoundarySafeRedFlagSegment(segment, code)) continue
      return quoteOriginalText(segment)
    }
  }
  return ""
}

function buildTrainingContextReview(args: {
  beauticianTurns: VoiceCoachTurnRow[]
  sessionSnapshot?: unknown
  sessionContext?: unknown
}): TrainingContextReview | undefined {
  const insights = getVoiceCoachSessionInsights({
    snapshot: args.sessionSnapshot,
    sessionContext: args.sessionContext,
  })
  if (!insights.hasContext) return undefined
  const sceneKindPolicy = getVoiceCoachSceneKindPolicy(insights.sceneKind, insights.serviceName)

  const priorityPoints = uniqueLimited(
    [...insights.mustCoverPoints, ...insights.targetObjections, ...insights.communicationMethodTags],
    5,
  )
  const supportPoints = uniqueLimited(
    [...insights.coreConcerns, ...insights.likelyQuestions, ...insights.focusPoints],
    4,
  )
  const focusPoints = uniqueLimited([...priorityPoints, ...supportPoints], 5)
  const beauticianCorpus = simplifyMatchText(args.beauticianTurns.map((turn) => turn.text || "").join(" "))
  const rawBeauticianText = args.beauticianTurns.map((turn) => String(turn.text || "")).join("\n")

  const priorityHitPoints = priorityPoints.filter((item) => strictPointMentioned(item, beauticianCorpus))
  const priorityMissedPoints = priorityPoints.filter((item) => !strictPointMentioned(item, beauticianCorpus))
  const supportHitPoints = supportPoints.filter((item) => pointMatchesCorpus(item, beauticianCorpus))
  const supportMissedPoints = supportPoints.filter((item) => !pointMatchesCorpus(item, beauticianCorpus))

  const hitPoints = uniqueLimited([...priorityHitPoints, ...supportHitPoints], 4)
  const missedPoints = uniqueLimited([...priorityMissedPoints, ...supportMissedPoints], 4)

  const riskPoints: string[] = []
  insights.doNotSay.forEach((item) => {
    if (pointMatchesCorpus(item, beauticianCorpus)) {
      riskPoints.push(`出现了场景卡禁忌表达：${item}`)
    }
  })

  const genericRiskRules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /100%|百分之百|保证.*见效|包你有效|一定有效/u, label: "避免绝对化效果承诺" },
    { pattern: /绝对安全|完全没风险|不会有任何(问题|风险|副作用)/u, label: "避免绝对化安全承诺" },
    { pattern: /过了今天|今天不做就|最后一天|名额只剩|现在不做/u, label: "避免伪限时或逼单推进" },
    { pattern: /我帮你决定|你就直接做|必须做|一定要做/u, label: "避免替顾客做决定或强压成交" },
  ]

  genericRiskRules.forEach((rule) => {
    if (!rule.pattern.test(rawBeauticianText)) return
    riskPoints.push(rule.label)
  })

  return {
    title: "顾客/场景命中复盘",
    background_summary: insights.backgroundSummary,
    scene_kind: insights.sceneKind,
    scene_kind_label: insights.sceneKindLabel,
    policy_focus: sceneKindPolicy.reportFocus,
    focus_points: focusPoints,
    hit_points: uniqueLimited(hitPoints, 4),
    missed_points: uniqueLimited(missedPoints, 4),
    risk_points: uniqueLimited(riskPoints, 3),
  }
}

function buildProfessionalismReview(args: {
  beauticianTurns: VoiceCoachTurnRow[]
  sessionSnapshot?: unknown
  sessionContext?: unknown
}): ProfessionalismReview | undefined {
  const insights = getVoiceCoachSessionInsights({
    snapshot: args.sessionSnapshot,
    sessionContext: args.sessionContext,
  })
  const profile = insights.professionalProfile
  if (!profile) return undefined

  const mustAskPoints = uniqueLimited(insights.professionalMustAsk, 8)
  const mustCoverPoints = uniqueLimited(
    [
      ...insights.professionalMustCover,
      ...profile.core_mechanism.map((item) => `讲清原理：${item}`),
      profile.safe_frame ? `说明安全边界：${profile.safe_frame}` : "",
    ],
    10,
  )
  const submetrics: ProfessionalismTab["submetrics"] = []

  const pushPointMetric = (argsForPoint: {
    code: string
    label: string
    point: string
    hitAdvice: string
    missAdvice: string
  }) => {
    const evidenceQuote = findEvidenceQuote(argsForPoint.point, args.beauticianTurns)
    const hit = Boolean(evidenceQuote)
    const advice = hit ? argsForPoint.hitAdvice : argsForPoint.missAdvice
    const score = hit ? 88 : 52
    submetrics.push({
      code: argsForPoint.code,
      name: argsForPoint.label,
      label: argsForPoint.label,
      score,
      stars: scoreToStars(score),
      evidence_quote: evidenceQuote,
      missed_point: hit ? "" : argsForPoint.point,
      advice,
      advice_paragraph: advice,
      status: hit ? "hit" : "missed",
    })
  }

  mustAskPoints.forEach((point, index) => {
    pushPointMetric({
      code: `must_ask_${index + 1}`,
      label: "专业必问",
      point,
      hitAdvice: "这一项已经有原话证据，下一轮继续先问清再判断。",
      missAdvice: `下次先问清“${point}”，不要直接进入项目推荐。`,
    })
  })

  mustCoverPoints.forEach((point, index) => {
    pushPointMetric({
      code: `must_cover_${index + 1}`,
      label: "专业必讲",
      point,
      hitAdvice: "这一项已经有原话证据，下一轮可以继续把解释说短一点。",
      missAdvice: `下次必须补上“${point}”，并用顾客听得懂的话讲清楚。`,
    })
  })

  if (!submetrics.length && insights.professionalAllowedPhrases.length) {
    insights.professionalAllowedPhrases.slice(0, 3).forEach((point, index) => {
      pushPointMetric({
        code: `allowed_phrase_${index + 1}`,
        label: "推荐专业表达",
        point,
        hitAdvice: "这一项推荐表达已经有原话证据。",
        missAdvice: `下次可以练习把“${point}”自然说出来。`,
      })
    })
  }

  const redFlags: ProfessionalismTab["red_flags"] = []
  const redFlagCaps: number[] = []
  const addRedFlag = (code: string, quote: string, saferRewrite: string, cap: number) => {
    if (!quote) return
    if (redFlags.some((item) => item.code === code && item.quote === quote)) return
    redFlags.push({
      code,
      quote,
      safer_rewrite: saferRewrite,
    })
    redFlagCaps.push(cap)
  }

  insights.professionalDoNotSay.forEach((point, index) => {
    const quote = findUnsafePointQuote(point, args.beauticianTurns, `do_not_say_${index + 1}`)
    addRedFlag(
      `do_not_say_${index + 1}`,
      quote,
      "改成先说明适用边界、观察周期和个体差异，不做绝对承诺。",
      60,
    )
  })

  const genericRedFlagRules: Array<{ code: string; pattern: RegExp; saferRewrite: string; cap: number }> = [
    {
      code: "medical_treatment_claim",
      pattern: /(治疗|治好|根治|诊断|处方|药物|医学疗效|消炎|炎症治疗)/u,
      saferRewrite: "改成美容护理的舒缓、清洁或改善体验；涉及疾病、炎症、药物和诊断时建议顾客咨询医生。",
      cap: 55,
    },
    {
      code: "absolute_result_claim",
      pattern: /(100%|百分之百|保证.*(见效|有效|改善|变好|清干净|清完|做好|解决)|一定(能|会)?(有效|改善|变好|见效|清干净|清完|做好|解决)|肯定(能|会)?(有效|改善|变好|见效|清干净|清完|做好|解决)|包你有效)/u,
      saferRewrite: "改成基于评估给出预期范围，并说明效果存在个体差异。",
      cap: 60,
    },
    {
      code: "absolute_safety_claim",
      pattern: /(绝对安全|完全没风险|不会有任何(问题|风险|副作用))/u,
      saferRewrite: "改成先评估禁忌和敏感情况，再说明门店能做的安全流程。",
      cap: 60,
    },
  ]

  genericRedFlagRules.forEach((rule) => {
    addRedFlag(rule.code, findRegexQuote(rule.pattern, args.beauticianTurns, rule.code), rule.saferRewrite, rule.cap)
  })

  const missedMustCover = submetrics
    .filter((item) => item.code.startsWith("must_cover") && item.status !== "hit")
    .map((item) => item.missed_point)
    .filter(Boolean)
  const mustCoverHits = submetrics
    .filter((item) => item.code.startsWith("must_cover") && item.status === "hit" && item.evidence_quote)
    .map((item) => item.evidence_quote)
    .filter(Boolean)

  const baseScore = submetrics.length
    ? submetrics.reduce((sum, item) => sum + item.score, 0) / submetrics.length
    : redFlags.length
      ? 50
      : 70
  const redFlagCap = redFlagCaps.length ? Math.min(...redFlagCaps) : null
  const score = clampScore(Math.round(Math.min(baseScore, redFlagCap ?? 100)))
  const firstMissed = submetrics.find((item) => item.status !== "hit")?.missed_point || ""
  const firstRedFlag = redFlags[0]

  return {
    score,
    redFlagCap,
    tab: {
      summary: redFlags.length
        ? `本轮专业表达踩到了安全边界，专业度最高按 ${redFlagCap} 分处理。`
        : firstMissed
          ? `本轮专业主题是${profile.title || "当前训练主题"}，还有关键专业点没有用原话讲出来。`
          : `本轮专业主题是${profile.title || "当前训练主题"}，关键专业点已有原话证据。`,
      advice_paragraph: firstRedFlag
        ? `先把“${firstRedFlag.quote}”这类说法改掉：${firstRedFlag.safer_rewrite}`
        : firstMissed
          ? `下一轮先补“${firstMissed}”，必须让报告能从原话里找到证据。`
          : "下一轮继续保持先询问、再解释机制、最后说明边界的顺序。",
      submetrics,
      red_flags: redFlags,
      missed_must_cover: uniqueLimited(missedMustCover, 8),
      must_cover_hits: uniqueLimited(mustCoverHits, 6),
      next_practice_focus: firstRedFlag
        ? "先把医疗/治疗/保证类风险表达改成边界清楚的美容护理表达。"
        : firstMissed || "继续练习把专业解释压成顾客能复述的一句话。",
    },
  }
}

function buildNextStepBlock(trainingContext?: TrainingContextReview) {
  const missed = trainingContext?.missed_points?.[0]
  const hit = trainingContext?.hit_points?.[0]
  const risk = trainingContext?.risk_points?.[0]
  const sceneKind = String(trainingContext?.scene_kind || "").trim()
  const policyFocus = String(trainingContext?.policy_focus || "").trim()
  const actionFocus =
    sceneKind === "offer_promo"
      ? "优先把原理、适用边界或价值差异讲清，再给一个不施压的判断建议。"
      : sceneKind === "customer_visit"
        ? "优先接住顾虑，讲清评估、流程或恢复期安排，再给一个低压力到店下一步。"
        : "先接情绪，再补一条证据和一个低压力下一步。"

  if (missed) {
    const riskTail = risk ? ` 同时${risk}。` : ""
    return `下一轮：先把“${missed}”这一点说清楚，${actionFocus}${riskTail}`
  }

  if (hit) {
    return `下一轮：可以继续沿着“${hit}”往下讲，${actionFocus}`
  }

  return policyFocus
    ? `下一轮：${policyFocus}`
    : "下一轮：先用“我理解你担心……”起手，再补一条证据和一句推进，可优先讲保障或先讲案例。"
}

function scoreEntries(scores: ReportDimensionScores): Array<[DimensionId, number]> {
  return (Object.entries(scores) as Array<[DimensionId, number | undefined]>).filter(
    (entry): entry is [DimensionId, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
  )
}

function pickNextRoundDimension(scores: ReportDimensionScores): DimensionId {
  const available = new Set(scoreEntries(scores).map(([id]) => id))
  return (
    NEXT_ROUND_DIMENSION_PRIORITY.filter((id) => available.has(id)).sort(
      (left, right) => (scores[left] ?? 100) - (scores[right] ?? 100),
    )[0] || "persuasion"
  )
}

function dimensionPracticePoint(dimensionId: DimensionId): string {
  switch (dimensionId) {
    case "persuasion":
      return "先接住顾客顾虑，再补一条可验证证据，最后给低压力下一步。"
    case "organization":
      return "把回答压成“共情一句 + 证据一句 + 推进一步”，减少跳话题和信息堆叠。"
    case "expression":
      return "把重点句说短，把关键信息放前面，少用重复铺垫。"
    case "fluency":
      return "重点句放慢，转折减少，让顾客更容易听到证据和下一步。"
    case "pronunciation":
      return "关键名词、项目名称和保障句再放慢说清楚。"
    case "professionalism":
      return "先问清禁忌和状态，再用顾客能听懂的话讲机制、边界和下一步。"
    default:
      return "围绕顾客最在意的问题，补一条证据和一个清晰下一步。"
  }
}

function buildNextRoundInstruction(args: {
  focusDimensionId: DimensionId
  trainingContext?: TrainingContextReview
}) {
  const missed = args.trainingContext?.missed_points?.[0]
  const risk = args.trainingContext?.risk_points?.[0]

  if (missed) {
    return `第二轮优先围绕“${missed}”继续压测，让顾客追问这一点是否具体、可信、能落地。`
  }

  if (risk) {
    return `第二轮优先围绕“${risk}”继续训练，让顾客对这类表达提出追问，逼迫回答更稳妥。`
  }

  return `第二轮优先训练${DIMENSION_NAMES[args.focusDimensionId]}：${dimensionPracticePoint(args.focusDimensionId)}`
}

function buildNextRoundReferenceTurns(representative: RepresentativeTurn): VoiceCoachReportReferenceTurn[] {
  return [representative.customer, representative.beautician]
    .filter((turn): turn is VoiceCoachTurnRow => Boolean(turn && String(turn.text || "").trim()))
    .map((turn) => ({
      role: turn.role,
      turn_id: turn.id,
      turn_index: turn.turn_index,
      text: String(turn.text || "").trim().slice(0, 120),
    }))
}

function buildNextRoundFocus(args: {
  sourceSessionId?: string
  scores: ReportDimensionScores
  summaryBlocks: string[]
  representative: RepresentativeTurn
  trainingContext?: TrainingContextReview
  suggestedResponse?: string
}): NonNullable<VoiceCoachReport["next_round_focus"]> {
  const focusDimensionId = pickNextRoundDimension(args.scores)
  const focusDimensionName = DIMENSION_NAMES[focusDimensionId]
  const missedPoints = uniqueLimited(args.trainingContext?.missed_points || [], 4)
  const riskPoints = uniqueLimited(args.trainingContext?.risk_points || [], 3)
  const instruction = buildNextRoundInstruction({
    focusDimensionId,
    trainingContext: args.trainingContext,
  })
  const practicePoints = uniqueLimited(
    [
      ...missedPoints,
      ...riskPoints,
      dimensionPracticePoint(focusDimensionId),
      args.summaryBlocks.find((item) => /^下一轮[：:]/.test(item))?.replace(/^下一轮[：:]\s*/, ""),
    ],
    5,
  )

  return {
    ...(args.sourceSessionId ? { source_session_id: args.sourceSessionId } : {}),
    focus_dimension_id: focusDimensionId,
    focus_dimension_name: focusDimensionName,
    focus_score: args.scores[focusDimensionId] ?? 0,
    title: `下一轮先练：${missedPoints[0] || focusDimensionName}`,
    instruction,
    practice_points: practicePoints,
    missed_points: missedPoints,
    risk_points: riskPoints,
    summary_blocks: args.summaryBlocks.slice(0, 3),
    reference_turns: buildNextRoundReferenceTurns(args.representative),
    ...(args.suggestedResponse ? { suggested_response: args.suggestedResponse } : {}),
  }
}

function buildPersuasionAdvice(
  representative: RepresentativeTurn,
  persuasionScore: number,
  trainingContext?: TrainingContextReview,
) {
  const suggestions = Array.isArray(representative.beautician?.analysis_json?.suggestions)
    ? (representative.beautician?.analysis_json?.suggestions as unknown[])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 3)
    : []

  if (suggestions.length) return suggestions.join("；")
  if (trainingContext?.missed_points?.[0]) {
    if (trainingContext.scene_kind === "offer_promo") {
      return `这轮还没正面回应训练重点“${trainingContext.missed_points[0]}”。建议先把原理、适用边界或价值差异说清，再补一条可验证证据。`
    }
    if (trainingContext.scene_kind === "customer_visit") {
      return `这轮还没正面回应训练重点“${trainingContext.missed_points[0]}”。建议先接住顾客当下顾虑，再补一条和到店判断直接相关的流程、评估或恢复期信息。`
    }
    return `这轮还没正面回应训练重点“${trainingContext.missed_points[0]}”。建议先接住顾客当下情绪，再给一条和这个点直接相关的可验证信息。`
  }
  if (persuasionScore >= 80) {
    if (trainingContext?.scene_kind === "offer_promo") {
      return "你已经能先接住顾客疑问，再讲证据和价值，这个专业解释到价值转换的顺序可以继续保持。"
    }
    return "你已经能先接住顾客担心，再补证据和下一步，这个顺序可以继续保持。"
  }
  if (trainingContext?.scene_kind === "offer_promo") {
    return "建议先明确回应顾客最在意的原理、适用边界或价值问题，再补一条可验证证据，最后给出一个低压力判断建议。"
  }
  if (trainingContext?.scene_kind === "customer_visit") {
    return "建议先明确回应顾客最在意的到店顾虑，再补一条可验证证据，最后给出一个低压力的到店或了解下一步。"
  }
  return "建议先明确回应顾客最在意的点，再补一条可验证证据，最后给出一个清晰的下一步动作。"
}

function buildOrganizationAdvice(representative: RepresentativeTurn, organizationScore: number) {
  if (organizationScore >= 80) {
    return "这轮回答结构比较完整，已经能做到先回应顾客顾虑，再给信息，最后自然推进。"
  }

  const customerSnippet = representative.customer
    ? `围绕“${quoteSnippet(representative.customer.text, 10)}”时`
    : "围绕顾客当下异议时"
  return `${customerSnippet}，建议用“共情一句 + 证据一句 + 推进一步”的收束方式，减少信息堆叠和跳话题。`
}

function strongestDimension(scores: ReportDimensionScores): DimensionId {
  return scoreEntries(scores)
    .slice()
    .sort((left, right) => right[1] - left[1])[0][0]
}

function weakestDimension(scores: ReportDimensionScores): DimensionId {
  return scoreEntries(scores)
    .slice()
    .sort((left, right) => left[1] - right[1])[0][0]
}

function describeStrengthEvidence(args: {
  bestDimensionId: DimensionId
  bestTurn: VoiceCoachTurnRow | null
  avgWpm: number | null
  avgFillerRatio: number | null
  avgConfidence: number | null
}) {
  const { bestDimensionId, bestTurn, avgWpm, avgFillerRatio, avgConfidence } = args
  const turnLabel = bestTurn ? `第 ${bestTurn.turn_index + 1} 轮` : "本场对话"

  switch (bestDimensionId) {
    case "persuasion":
      return `${turnLabel}更能接住顾客异议后再往下推进`
    case "fluency":
      return avgWpm == null
        ? "整体节奏比较顺"
        : `语速基本落在可跟上的区间（约 ${avgWpm.toFixed(0)} 字/分钟）`
    case "expression":
      return avgFillerRatio == null
        ? "措辞已经比较干净"
        : `口头词占比控制得较稳（约 ${(avgFillerRatio * 100).toFixed(1)}%）`
    case "pronunciation":
      return avgConfidence == null
        ? "语音清晰度整体可接受"
        : `语音清晰度较稳（识别置信约 ${(avgConfidence * 100).toFixed(0)} 分）`
    case "organization":
      return `${turnLabel}能按“回应 - 说明 - 推进”去组织内容`
    case "professionalism":
      return `${turnLabel}能把专业判断和安全边界讲得更清楚`
    default:
      return "整体表现比较稳定"
  }
}

function describeWeaknessEvidence(args: {
  weakestDimensionId: DimensionId
  representative: RepresentativeTurn
}) {
  const { weakestDimensionId, representative } = args
  const customerSnippet = representative.customer
    ? `围绕“${quoteSnippet(representative.customer.text, 10)}”时`
    : "这轮回答里"

  switch (weakestDimensionId) {
    case "persuasion":
      return `${customerSnippet}还没把顾客最担心的点回应得足够具体`
    case "fluency":
      return `${customerSnippet}句子转折稍多，节奏还可以再收稳一点`
    case "expression":
      return `${customerSnippet}信息点偏散，重点句还不够干净`
    case "pronunciation":
      return `${customerSnippet}关键句的清晰度还有提升空间`
    case "organization":
      return `${customerSnippet}“共情 - 证据 - 推进”的顺序还不够收束`
    case "professionalism":
      return `${customerSnippet}专业依据、禁忌边界或必问项还没有讲到可验证`
    default:
      return `${customerSnippet}还需要再聚焦一点`
  }
}

function buildSummaryBlocks(args: {
  scores: ReportDimensionScores
  representative: RepresentativeTurn
  bestTurn: VoiceCoachTurnRow | null
  avgWpm: number | null
  avgFillerRatio: number | null
  avgConfidence: number | null
  trainingContext?: TrainingContextReview
}) {
  const {
    scores,
    representative,
    bestTurn,
    avgWpm,
    avgFillerRatio,
    avgConfidence,
    trainingContext,
  } = args
  const bestDimensionId = strongestDimension(scores)
  const weakestDimensionId = weakestDimension(scores)
  const representativeTurnLabel = representative.beautician
    ? `第 ${representative.beautician.turn_index + 1} 轮`
    : "代表轮次"

  return [
    `优势：${DIMENSION_NAMES[bestDimensionId]}最稳，${describeStrengthEvidence({
      bestDimensionId,
      bestTurn,
      avgWpm,
      avgFillerRatio,
      avgConfidence,
    })}。`,
    `改进：${DIMENSION_NAMES[weakestDimensionId]}最该补，${representativeTurnLabel}${describeWeaknessEvidence({
      weakestDimensionId,
      representative,
    })}。`,
    buildNextStepBlock(trainingContext),
  ]
}

function buildImprovedResponse(representative: RepresentativeTurn) {
  const polished = String(representative.beautician?.analysis_json?.polished || "").trim()
  if (polished) return polished

  const customerConcern = representative.customer?.text
    ? `我理解你现在最在意的是“${quoteSnippet(representative.customer.text, 10)}”。`
    : "我理解你现在最在意的是安全和效果能不能被证明。"

  return `${customerConcern}我先把和你最相关的一条证据说清楚，再告诉你下一步怎么低风险地继续了解，这样你会更容易判断值不值得做。`
}

export function generateVoiceCoachReport(opts: {
  scenario: VoiceCoachScenario
  turns: VoiceCoachTurnRow[]
  sessionSnapshot?: unknown
  sessionContext?: unknown
  sourceSessionId?: string
}): VoiceCoachReport {
  const turns = [...opts.turns].sort((left, right) => left.turn_index - right.turn_index)
  const beauticianTurns = turns.filter((turn) => turn.role === "beautician")
  const customerTurns = turns.filter((turn) => turn.role === "customer")
  const scoredTurns = toScoredBeauticianTurns(beauticianTurns)

  const wpmList = beauticianTurns.map(
    (turn) => readTurnFeature(turn, "wpm") ?? calcWpm(turn.text || "", turn.audio_seconds),
  )
  const fillerRatioList = beauticianTurns.map(
    (turn) => readTurnFeature(turn, "filler_ratio") ?? calcFillerRatio(turn.text || ""),
  )
  const avgWpm = safeAvg(wpmList)
  const avgFillerRatio = safeAvg(fillerRatioList)
  const pronunciationSignals = beauticianTurns.map((turn, index) =>
    derivePronunciationSignal({
      transcript: turn.text || "",
      wpm: wpmList[index] ?? null,
      fillerRatio: fillerRatioList[index] ?? null,
      asrConfidence: typeof turn.asr_confidence === "number" ? turn.asr_confidence : null,
    }),
  )
  const avgConfidence = safeAvg(
    pronunciationSignals.map((signal) => signal.normalizedConfidence),
  )
  const avgPronunciationScore = safeAvg(pronunciationSignals.map((signal) => signal.score))
  const avgPronunciationEstimate = safeAvg(pronunciationSignals.map((signal) => signal.estimatedScore))
  const pronunciationSpread = safeSpread(pronunciationSignals.map((signal) => signal.score))
  const pronunciationUsesConfidence = pronunciationSignals.some((signal) => signal.source === "confidence")

  const aggregatedScores = aggregateDimensionScores(beauticianTurns)
  const hasAnyAnalysis = beauticianTurns.some((turn) => turn.analysis_json && typeof turn.analysis_json === "object")

  const scores: ReportDimensionScores = {
    persuasion: aggregatedScores?.persuasion ?? (hasAnyAnalysis ? 74 : 66),
    fluency: aggregatedScores?.fluency ?? scoreFluencyFromWpm(avgWpm, DEFAULT_TARGET_WPM_RANGE),
    expression: aggregatedScores?.expression ?? scoreExpressionFromFillerRatio(avgFillerRatio),
    pronunciation: clampScore(Math.round(avgPronunciationScore ?? aggregatedScores?.pronunciation ?? 70)),
    organization: aggregatedScores?.organization ?? (hasAnyAnalysis ? 70 : 64),
  }

  const representative = pickRepresentativeTurn(turns, beauticianTurns, scoredTurns)
  const bestDimensionId = strongestDimension(scores)
  const bestTurn = pickTurnByScore(scoredTurns, bestDimensionId, "highest")
  const organizationExamples = pickOrganizationExamples(beauticianTurns, scoredTurns)
  const trainingContext = buildTrainingContextReview({
    beauticianTurns,
    sessionSnapshot: opts.sessionSnapshot,
    sessionContext: opts.sessionContext,
  })
  const professionalismReview = buildProfessionalismReview({
    beauticianTurns,
    sessionSnapshot: opts.sessionSnapshot,
    sessionContext: opts.sessionContext,
  })
  if (professionalismReview) {
    scores.professionalism = professionalismReview.score
  }

  const normalizedTags = Array.from(
    new Set(
      customerTurns
        .map((turn) => normalizeScenarioTag(turn?.features_json?.tag, opts.scenario))
        .filter(Boolean),
    ),
  )

  const tags = normalizedTags.length
    ? normalizedTags.slice(0, Math.max(3, opts.scenario.seedTopics.length))
    : opts.scenario.seedTopics

  const totalScore = professionalismReview?.redFlagCap
    ? Math.min(weightedTotal(scores), Math.max(65, professionalismReview.redFlagCap + 18))
    : weightedTotal(scores)
  const summaryBlocks = buildSummaryBlocks({
    scores,
    representative,
    bestTurn,
    avgWpm,
    avgFillerRatio,
    avgConfidence,
    trainingContext,
  })
  const improvedResponse = buildImprovedResponse(representative)
  const nextRoundFocus = buildNextRoundFocus({
    sourceSessionId: opts.sourceSessionId,
    scores,
    summaryBlocks,
    representative,
    trainingContext,
    suggestedResponse: improvedResponse,
  })

  const wpmCurve = buildTurnCurve(beauticianTurns, (turn) => {
    return readTurnFeature(turn, "wpm") ?? calcWpm(turn.text || "", turn.audio_seconds)
  })
  const fillerCurve = buildTurnCurve(beauticianTurns, (turn) => {
    const ratio = readTurnFeature(turn, "filler_ratio") ?? calcFillerRatio(turn.text || "")
    return ratio == null ? null : Number((ratio * 100).toFixed(2))
  })
  const clarityCurve = buildTurnCurve(beauticianTurns, (turn, index) => {
    const signal = pronunciationSignals[index]
    return signal ? Number(signal.score.toFixed(2)) : null
  })

  const analyzedBeauticianTurnCount = beauticianTurns.filter(
    (turn) => turn.analysis_json && typeof turn.analysis_json === "object",
  ).length

  const report: VoiceCoachReport = {
    total_score: Number(totalScore.toFixed(1)),
    dimension: [
      { id: "persuasion", name: "说服力", score: scores.persuasion, stars: scoreToStars(scores.persuasion) },
      { id: "fluency", name: "流利度", score: scores.fluency, stars: scoreToStars(scores.fluency) },
      { id: "expression", name: "语言表达", score: scores.expression, stars: scoreToStars(scores.expression) },
      {
        id: "pronunciation",
        name: "发音准确度",
        score: scores.pronunciation,
        stars: scoreToStars(scores.pronunciation),
      },
      {
        id: "organization",
        name: "语言组织",
        score: scores.organization,
        stars: scoreToStars(scores.organization),
      },
      ...(professionalismReview
        ? [
            {
              id: "professionalism" as const,
              name: "专业度",
              score: professionalismReview.score,
              stars: scoreToStars(professionalismReview.score),
            },
          ]
        : []),
    ],
    summary_blocks: summaryBlocks,
    training_context: trainingContext,
    next_round_focus: nextRoundFocus,
    tabs: {
      persuasion: {
        title: "说服力",
        submetrics: [
          {
            name: "关键异议处理",
            status: statusFromScore(scores.persuasion, { strong: 80, mid: 65 }),
            stars: scoreToStars(scores.persuasion),
            advice_paragraph: buildPersuasionAdvice(representative, scores.persuasion, trainingContext),
          },
        ],
        tags,
        customer_objection: representative.customer?.text || customerTurns[0]?.text || "客户本轮异议暂无完整记录。",
        your_response: representative.beautician?.text || beauticianTurns[0]?.text || "（本轮暂无有效回答）",
        improved_response: improvedResponse,
      },
      fluency: {
        title: "流利度",
        submetrics: [
          {
            name: "语速控制",
            status:
              avgWpm == null ? "一般" : avgWpm > 260 ? "偏快" : avgWpm < 180 ? "偏慢" : "适中",
            stars: scoreToStars(scores.fluency),
            advice_paragraph:
              avgWpm == null
                ? "整体节奏已基本可跟上，建议重点句继续放慢，让关键信息和下一步更清楚。"
                : avgWpm > 260
                  ? `平均语速约 ${avgWpm.toFixed(0)} 字/分钟，略快。建议把关键句放慢到 180-260 字/分钟。`
                  : avgWpm < 180
                    ? `平均语速约 ${avgWpm.toFixed(0)} 字/分钟，略慢。建议在停顿保留的同时把重点句说得更完整。`
                    : `平均语速约 ${avgWpm.toFixed(0)} 字/分钟，整体适中。继续保持重点句略慢、推进句更明确。`,
          },
        ],
        avg_speed_wpm: avgWpm == null ? null : Number(avgWpm.toFixed(2)),
        target_speed_range: DEFAULT_TARGET_WPM_RANGE,
        charts: [
          {
            id: "speech_rate_curve",
            label: "语速变化曲线",
            unit: "字/分钟",
            target_range: DEFAULT_TARGET_WPM_RANGE,
            points: wpmCurve,
          },
        ],
      },
      expression: {
        title: "语言表达",
        submetrics: [
          {
            name: "表达干净度",
            status:
              avgFillerRatio == null
                ? "一般"
                : avgFillerRatio < 0.04
                  ? "稳定"
                  : avgFillerRatio < 0.08
                    ? "一般"
                    : "待加强",
            stars: scoreToStars(scores.expression),
            advice_paragraph:
              avgFillerRatio == null
                ? "建议继续减少“嗯、那个、就是”这类口头词，让证据句和推进句更利落。"
                : avgFillerRatio < 0.04
                  ? `口头词占比约 ${(avgFillerRatio * 100).toFixed(1)}%，表达已经比较干净，可以继续保持。`
                  : `口头词占比约 ${(avgFillerRatio * 100).toFixed(1)}%，建议删掉重复铺垫，让重点信息更靠前。`,
          },
        ],
        filler_ratio: avgFillerRatio == null ? null : Number(avgFillerRatio.toFixed(4)),
        charts: [
          {
            id: "filler_ratio_curve",
            label: "口头词占比曲线",
            unit: "%",
            target_range: [0, 4],
            points: fillerCurve,
          },
        ],
      },
      pronunciation: {
        title: "发音准确度",
        submetrics: [
          {
            name: "语音清晰度",
            status: pronunciationStatus(avgPronunciationScore),
            stars: scoreToStars(scores.pronunciation),
            advice_paragraph:
              pronunciationUsesConfidence && avgConfidence != null
                ? avgConfidence >= 0.78
                  ? `整体识别置信约 ${(avgConfidence * 100).toFixed(0)} 分，语音清晰度比较稳。`
                  : `整体识别置信约 ${(avgConfidence * 100).toFixed(0)} 分。建议关键名词、项目名称和保障句再说清楚一些。`
                : `当前识别服务没有返回稳定置信度，先按语速、口头词和转写稳定度估算清晰度，当前约 ${(avgPronunciationEstimate || scores.pronunciation).toFixed(0)} 分。建议重点句再放慢一点。`,
          },
          {
            name: "清晰稳定性",
            status: pronunciationStabilityStatus(pronunciationSpread),
            stars: scoreToStars(pronunciationStabilityScore(pronunciationSpread)),
            advice_paragraph:
              pronunciationSpread == null
                ? "当前轮次还少，先继续多练几轮，再看清晰度是否稳定。"
                : pronunciationSpread <= 10
                  ? `各轮清晰度波动约 ${pronunciationSpread.toFixed(0)} 分，整体比较稳。`
                  : `各轮清晰度波动约 ${pronunciationSpread.toFixed(0)} 分，说明有些句子清楚、有些句子会掉。建议把项目名、时间安排和保障句固定成更顺口的表达。`,
          },
        ],
        charts: [
          {
            id: "clarity_curve",
            label: "清晰度变化曲线",
            unit: "分",
            target_range: [72, 92],
            points: clarityCurve,
          },
        ],
      },
      organization: {
        title: "语言组织",
        submetrics: [
          {
            name: "结构完成度",
            status: statusFromScore(scores.organization, { strong: 80, mid: 65 }),
            stars: scoreToStars(scores.organization),
            advice_paragraph: buildOrganizationAdvice(representative, scores.organization),
          },
        ],
        advice_paragraph:
          representative.beautician && representative.customer
            ? `围绕“${quoteSnippet(representative.customer.text, 10)}”时，建议先回应顾客顾虑，再给一条证据，最后用一句行动建议把对话推进下去。`
            : "建议把每轮回答压成“共情一句 + 证据一句 + 推进一步”，这样逻辑会更稳定。",
        audio_examples: organizationExamples.map((turn) => ({
          turn_id: turn.id,
          audio_path: String(turn.audio_path),
          audio_seconds: turn.audio_seconds ?? null,
        })),
      },
      ...(professionalismReview ? { professionalism: professionalismReview.tab } : {}),
    },
    meta: {
      version: "v2",
      generated_at: new Date().toISOString(),
      total_turn_count: turns.length,
      total_beautician_turn_count: beauticianTurns.length,
      analyzed_beautician_turn_count: analyzedBeauticianTurnCount,
      is_complete: beauticianTurns.length > 0 && analyzedBeauticianTurnCount === beauticianTurns.length,
      representative_turn_id: representative.beautician?.id || null,
      organization_example_turn_ids: organizationExamples.map((turn) => turn.id),
    },
  }

  return VoiceCoachReportSchema.parse(report)
}
