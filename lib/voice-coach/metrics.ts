export const DEFAULT_TARGET_WPM_RANGE: [number, number] = [180, 260]

const FILLER_WORDS = ["嗯", "呃", "啊", "那个", "就是", "然后", "可能", "其实"] as const

export function countChineseChars(text: string): number {
  const m = text.match(/[\u4e00-\u9fff]/g)
  return m ? m.length : 0
}

export function calcWpm(transcript: string, audioSeconds: number | null | undefined): number | null {
  const seconds = Number(audioSeconds || 0)
  if (!seconds || seconds <= 0) return null
  const chars = countChineseChars(transcript)
  if (!chars) return 0
  return (chars / seconds) * 60
}

export function calcFillerRatio(transcript: string): number | null {
  const total = countChineseChars(transcript)
  if (!total) return null

  let fillerCount = 0
  for (const w of FILLER_WORDS) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    fillerCount += (transcript.match(re) || []).length
  }
  return fillerCount / total
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  if (score < 0) return 0
  if (score > 100) return 100
  return score
}

export function scoreToStars(score: number): number {
  const s = clampScore(score)
  const stars = Math.ceil(s / 20)
  return Math.max(1, Math.min(5, stars))
}

export function scoreFluencyFromWpm(wpm: number | null, targetRange = DEFAULT_TARGET_WPM_RANGE): number {
  if (wpm == null) return 60
  const [min, max] = targetRange
  if (wpm >= min && wpm <= max) {
    // Within target: reward higher, gently.
    const mid = (min + max) / 2
    const delta = Math.abs(wpm - mid)
    const maxDelta = (max - min) / 2
    const t = maxDelta ? 1 - delta / maxDelta : 1
    return 82 + 18 * t
  }

  // Outside target: linear penalty with a floor.
  const dist = wpm < min ? min - wpm : wpm - max
  const penalty = Math.min(55, dist * 0.35)
  return Math.max(35, 80 - penalty)
}

export function scoreExpressionFromFillerRatio(ratio: number | null): number {
  if (ratio == null) return 70
  // ratio 0.00 => 95, ratio 0.04 => ~80, ratio 0.10 => ~55
  return clampScore(95 - ratio * 375)
}

export function normalizeAsrConfidence(conf: number | null | undefined): number | null {
  const raw = Number(conf)
  if (!Number.isFinite(raw)) return null
  if (raw <= 0.01) return null
  if (raw > 1 && raw <= 100) return raw / 100
  if (raw > 1) return null
  return Math.max(0, Math.min(1, raw))
}

export function estimatePronunciationFromSpeech(opts: {
  transcript?: string | null
  wpm: number | null
  fillerRatio: number | null
}): number {
  const transcript = String(opts.transcript || "")
  const chars = countChineseChars(transcript)
  const paceScore = scoreFluencyFromWpm(opts.wpm)
  const fillerScore = scoreExpressionFromFillerRatio(opts.fillerRatio)

  let articulationBase = 72
  if (chars >= 22) articulationBase = 82
  else if (chars >= 14) articulationBase = 78
  else if (chars >= 8) articulationBase = 74
  else if (chars <= 3) articulationBase = 64

  return clampScore(articulationBase * 0.25 + paceScore * 0.45 + fillerScore * 0.3)
}

export function derivePronunciationSignal(opts: {
  transcript?: string | null
  wpm: number | null
  fillerRatio: number | null
  asrConfidence: number | null
}): {
  score: number
  normalizedConfidence: number | null
  estimatedScore: number
  source: "confidence" | "estimated"
} {
  const normalizedConfidence = normalizeAsrConfidence(opts.asrConfidence)
  const estimatedScore = estimatePronunciationFromSpeech(opts)
  if (normalizedConfidence == null) {
    return {
      score: estimatedScore,
      normalizedConfidence: null,
      estimatedScore,
      source: "estimated",
    }
  }

  return {
    score: clampScore(normalizedConfidence * 100 * 0.72 + estimatedScore * 0.28),
    normalizedConfidence,
    estimatedScore,
    source: "confidence",
  }
}

export function scorePronunciationFromAsrConfidence(conf: number | null): number {
  const normalized = normalizeAsrConfidence(conf)
  if (normalized == null) return 70
  return clampScore(normalized * 100)
}

export function computePerTurnScores(opts: {
  transcript?: string | null
  wpm: number | null
  fillerRatio: number | null
  asrConfidence: number | null
  llmPersuasion?: number | null
  llmOrganization?: number | null
}): Record<string, number> {
  const pronunciation = derivePronunciationSignal({
    transcript: opts.transcript,
    wpm: opts.wpm,
    fillerRatio: opts.fillerRatio,
    asrConfidence: opts.asrConfidence,
  }).score

  return {
    persuasion: clampScore(opts.llmPersuasion ?? 70),
    fluency: scoreFluencyFromWpm(opts.wpm),
    expression: scoreExpressionFromFillerRatio(opts.fillerRatio),
    pronunciation,
    organization: clampScore(opts.llmOrganization ?? 68),
  }
}

