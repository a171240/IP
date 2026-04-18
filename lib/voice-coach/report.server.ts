import type { VoiceCoachScenario } from "./scenarios"
import {
  calcFillerRatio,
  calcWpm,
  clampScore,
  DEFAULT_TARGET_WPM_RANGE,
  scoreExpressionFromFillerRatio,
  scoreFluencyFromWpm,
  scorePronunciationFromAsrConfidence,
  scoreToStars,
} from "./metrics"
import { type DimensionId, VoiceCoachReportSchema, type VoiceCoachReport } from "./report"
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

type DimensionScores = Record<DimensionId, number>

type ScoredBeauticianTurn = {
  turn: VoiceCoachTurnRow
  scores: Partial<DimensionScores>
}

type RepresentativeTurn = {
  beautician: VoiceCoachTurnRow | null
  customer: VoiceCoachTurnRow | null
}

type TrainingContextReview = NonNullable<VoiceCoachReport["training_context"]>

const DIMENSION_NAMES: Record<DimensionId, string> = {
  persuasion: "说服力",
  fluency: "流利度",
  expression: "语言表达",
  pronunciation: "发音准确度",
  organization: "语言组织",
}

function safeAvg(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function weightedTotal(scores: DimensionScores): number {
  const total =
    scores.persuasion * 0.3 +
    scores.fluency * 0.2 +
    scores.expression * 0.2 +
    scores.pronunciation * 0.15 +
    scores.organization * 0.15
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

function aggregateDimensionScores(turns: VoiceCoachTurnRow[]): DimensionScores | null {
  const turnScores = turns
    .map((turn) => turn.analysis_json?.per_turn_scores)
    .filter((scores): scores is Record<string, number> => !!scores && typeof scores === "object")

  if (!turnScores.length) return null

  const dimensions: DimensionId[] = [
    "persuasion",
    "fluency",
    "expression",
    "pronunciation",
    "organization",
  ]
  const result = {} as DimensionScores

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
  extractor: (turn: VoiceCoachTurnRow) => number | null,
): Array<{ x: number; y: number }> {
  let elapsed = 0
  const points: Array<{ x: number; y: number }> = []

  for (const turn of turns) {
    const value = extractor(turn)
    const seconds = Number(turn.audio_seconds || 0)
    elapsed += seconds
    if (value != null) points.push({ x: Math.round(elapsed), y: value })
  }

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
    focus_points: focusPoints,
    hit_points: uniqueLimited(hitPoints, 4),
    missed_points: uniqueLimited(missedPoints, 4),
    risk_points: uniqueLimited(riskPoints, 3),
  }
}

function buildNextStepBlock(trainingContext?: TrainingContextReview) {
  const missed = trainingContext?.missed_points?.[0]
  const hit = trainingContext?.hit_points?.[0]
  const risk = trainingContext?.risk_points?.[0]

  if (missed) {
    const riskTail = risk ? ` 同时${risk}。` : ""
    return `下一轮：先把“${missed}”这一点说清楚，再补一条可验证信息和一个低压力下一步。${riskTail}`
  }

  if (hit) {
    return `下一轮：可以继续沿着“${hit}”往下讲，先接住情绪，再给证据和行动建议。`
  }

  return "下一轮：先用“我理解你担心……”起手，再补一条证据和一句推进，可优先讲保障或先讲案例。"
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
    return `这轮还没正面回应训练重点“${trainingContext.missed_points[0]}”。建议先接住顾客当下情绪，再给一条和这个点直接相关的可验证信息。`
  }
  if (persuasionScore >= 80) {
    return "你已经能先接住顾客担心，再补证据和下一步，这个顺序可以继续保持。"
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

function strongestDimension(scores: DimensionScores): DimensionId {
  return (Object.entries(scores) as Array<[DimensionId, number]>)
    .slice()
    .sort((left, right) => right[1] - left[1])[0][0]
}

function weakestDimension(scores: DimensionScores): DimensionId {
  return (Object.entries(scores) as Array<[DimensionId, number]>)
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
    default:
      return `${customerSnippet}还需要再聚焦一点`
  }
}

function buildSummaryBlocks(args: {
  scores: DimensionScores
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
  const avgConfidence = safeAvg(
    beauticianTurns.map((turn) => (typeof turn.asr_confidence === "number" ? turn.asr_confidence : null)),
  )

  const aggregatedScores = aggregateDimensionScores(beauticianTurns)
  const hasAnyAnalysis = beauticianTurns.some((turn) => turn.analysis_json && typeof turn.analysis_json === "object")

  const scores: DimensionScores = {
    persuasion: aggregatedScores?.persuasion ?? (hasAnyAnalysis ? 74 : 66),
    fluency: aggregatedScores?.fluency ?? scoreFluencyFromWpm(avgWpm, DEFAULT_TARGET_WPM_RANGE),
    expression: aggregatedScores?.expression ?? scoreExpressionFromFillerRatio(avgFillerRatio),
    pronunciation: aggregatedScores?.pronunciation ?? scorePronunciationFromAsrConfidence(avgConfidence),
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

  const totalScore = weightedTotal(scores)
  const summaryBlocks = buildSummaryBlocks({
    scores,
    representative,
    bestTurn,
    avgWpm,
    avgFillerRatio,
    avgConfidence,
    trainingContext,
  })

  const wpmCurve = buildTurnCurve(beauticianTurns, (turn) => {
    return readTurnFeature(turn, "wpm") ?? calcWpm(turn.text || "", turn.audio_seconds)
  })
  const fillerCurve = buildTurnCurve(beauticianTurns, (turn) => {
    const ratio = readTurnFeature(turn, "filler_ratio") ?? calcFillerRatio(turn.text || "")
    return ratio == null ? null : Number((ratio * 100).toFixed(2))
  })
  const clarityCurve = buildTurnCurve(beauticianTurns, (turn) => {
    return typeof turn.asr_confidence === "number" ? Number((turn.asr_confidence * 100).toFixed(2)) : null
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
    ],
    summary_blocks: summaryBlocks,
    training_context: trainingContext,
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
        improved_response: buildImprovedResponse(representative),
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
            status:
              avgConfidence == null
                ? "一般"
                : avgConfidence >= 0.78
                  ? "稳定"
                  : avgConfidence >= 0.68
                    ? "一般"
                    : "待加强",
            stars: scoreToStars(scores.pronunciation),
            advice_paragraph:
              avgConfidence == null
                ? "从当前录音看，可识别度基本够用。建议关键句放慢并咬字更清楚。"
                : avgConfidence >= 0.78
                  ? `整体可识别度约 ${(avgConfidence * 100).toFixed(0)} 分，语音清晰度比较稳。`
                  : `整体可识别度约 ${(avgConfidence * 100).toFixed(0)} 分。建议关键名词和保障句再说清楚一些。`,
          },
        ],
        charts: [
          {
            id: "clarity_curve",
            label: "清晰度变化曲线",
            unit: "分",
            target_range: [75, 95],
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
