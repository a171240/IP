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

export function scorePronunciationFromAsrConfidence(conf: number | null): number {
  if (conf == null) return 70
  return clampScore(conf * 100)
}

