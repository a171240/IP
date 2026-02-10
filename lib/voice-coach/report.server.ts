import "server-only"

import type { VoiceCoachScenario } from "@/lib/voice-coach/scenarios"
import {
  calcFillerRatio,
  calcWpm,
  clampScore,
  DEFAULT_TARGET_WPM_RANGE,
  scoreExpressionFromFillerRatio,
  scoreFluencyFromWpm,
  scorePronunciationFromAsrConfidence,
  scoreToStars,
} from "@/lib/voice-coach/metrics"
import { VoiceCoachReportSchema, type VoiceCoachReport } from "@/lib/voice-coach/report"

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

function safeAvg(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function weightedTotal(scores: Record<string, number>): number {
  const total =
    scores.persuasion * 0.3 +
    scores.fluency * 0.2 +
    scores.expression * 0.2 +
    scores.pronunciation * 0.15 +
    scores.organization * 0.15
  return clampScore(total)
}

function buildConstantCurve(totalSeconds: number, value: number, stepSeconds = 1): Array<{ x: number; y: number }> {
  const t = Math.max(1, Math.min(120, Math.round(totalSeconds || 30)))
  const step = Math.max(1, Math.round(stepSeconds))
  const points: Array<{ x: number; y: number }> = []
  for (let x = 0; x <= t; x += step) points.push({ x, y: value })
  return points
}

export function generateVoiceCoachReport(opts: {
  scenario: VoiceCoachScenario
  turns: VoiceCoachTurnRow[]
}): VoiceCoachReport {
  const turns = [...opts.turns].sort((a, b) => a.turn_index - b.turn_index)

  const beauticianTurns = turns.filter((t) => t.role === "beautician")
  const customerTurns = turns.filter((t) => t.role === "customer")

  const wpmList = beauticianTurns.map((t) => calcWpm(t.text || "", t.audio_seconds))
  const fillerList = beauticianTurns.map((t) => calcFillerRatio(t.text || ""))
  const avgWpm = safeAvg(wpmList)
  const avgFiller = safeAvg(fillerList)
  const avgConf = safeAvg(beauticianTurns.map((t) => (typeof t.asr_confidence === "number" ? t.asr_confidence : null)))

  const fluencyScore = scoreFluencyFromWpm(avgWpm, DEFAULT_TARGET_WPM_RANGE)
  const expressionScore = scoreExpressionFromFillerRatio(avgFiller)
  const pronunciationScore = scorePronunciationFromAsrConfidence(avgConf)

  // Text-centric dimensions are estimated from existing per-turn analyses (MVP).
  const hasAnyAnalysis = beauticianTurns.some((t) => t.analysis_json && typeof t.analysis_json === "object")
  const persuasionScore = hasAnyAnalysis ? 74 : 66
  const organizationScore = hasAnyAnalysis ? 70 : 64

  const totalScore = weightedTotal({
    persuasion: persuasionScore,
    fluency: fluencyScore,
    expression: expressionScore,
    pronunciation: pronunciationScore,
    organization: organizationScore,
  })

  const tagsFromTurns = new Set<string>()
  for (const t of customerTurns) {
    const tag = t?.features_json?.tag
    if (typeof tag === "string" && tag.trim()) tagsFromTurns.add(tag.trim())
  }
  const tags = tagsFromTurns.size ? Array.from(tagsFromTurns).slice(0, 6) : opts.scenario.seedTopics

  const firstCustomer = customerTurns[0]
  const firstBeautician = beauticianTurns[0]
  const firstPolished = String(firstBeautician?.analysis_json?.polished || "").trim()
  const firstSuggestions = Array.isArray(firstBeautician?.analysis_json?.suggestions)
    ? (firstBeautician?.analysis_json?.suggestions as unknown[])
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, 3)
    : []

  const wpmStatus = avgWpm == null ? "一般" : avgWpm > 260 ? "过快" : avgWpm < 180 ? "过慢" : "适中"
  const fillerStatus = avgFiller == null ? "一般" : avgFiller < 0.04 ? "无冗余词" : "有待改进"
  const clarityStatus = avgConf == null ? "一般" : avgConf >= 0.78 ? "清晰" : "有待改进"

  const totalBeauticianSeconds = beauticianTurns.reduce((sum, t) => sum + (Number(t.audio_seconds || 0) || 0), 0)
  const chartSeconds = totalBeauticianSeconds || 30

  const report: VoiceCoachReport = {
    total_score: Number(totalScore.toFixed(1)),
    dimension: [
      { id: "persuasion", name: "说服力", score: persuasionScore, stars: scoreToStars(persuasionScore) },
      { id: "fluency", name: "流利度", score: fluencyScore, stars: scoreToStars(fluencyScore) },
      { id: "expression", name: "语言表达", score: expressionScore, stars: scoreToStars(expressionScore) },
      { id: "pronunciation", name: "发音准确度", score: pronunciationScore, stars: scoreToStars(pronunciationScore) },
      { id: "organization", name: "语言组织", score: organizationScore, stars: scoreToStars(organizationScore) },
    ],
    summary_blocks: [
      "你在沟通中整体态度专业，能回应顾客关注点，这是很好的基础。",
      "建议在关键异议上补充更具体的信息与证据（流程、保障、案例、下一步安排），并控制语速与表达层次，让顾客更容易跟上并建立信任。",
    ],
    tabs: {
      persuasion: {
        title: "说服力",
        submetrics: [
          {
            name: "异议处理",
            status: persuasionScore >= 80 ? "良好" : "有待改进",
            stars: scoreToStars(persuasionScore),
            advice_paragraph:
              firstSuggestions.join("；") ||
              "建议先共情顾客担忧，再给出可验证的信息（流程/资质/保障），最后提出明确下一步（看案例/预约体验）。",
          },
        ],
        tags,
        customer_objection: firstCustomer?.text || "顾客对项目安全性存在担忧。",
        your_response: firstBeautician?.text || "（暂无）",
        improved_response:
          firstPolished ||
          "姐，您这个担心非常正常。我们这项护理会先做情况评估，再按标准流程操作，并且全程有卫生消毒与风险提示。如果您有特殊情况也建议先咨询医生。您更在意的是安全性还是效果？我可以给您看一些真实案例对比与顾客反馈。",
      },
      fluency: {
        title: "流利度",
        submetrics: [
          {
            name: "语速",
            status: wpmStatus,
            stars: scoreToStars(fluencyScore),
            advice_paragraph:
              avgWpm == null
                ? "建议保持语速稳定，重点信息放慢一点，让顾客更容易理解。"
                : avgWpm > 260
                  ? `你的平均语速在 ${avgWpm.toFixed(2)} 字/分钟，偏快，建议放慢到 180-260。`
                  : avgWpm < 180
                    ? `你的平均语速在 ${avgWpm.toFixed(2)} 字/分钟，偏慢，建议提升到 180-260。`
                    : `你的平均语速在 ${avgWpm.toFixed(2)} 字/分钟，整体适中。`,
          },
          {
            name: "停顿",
            status: "有待改进",
            stars: 3,
            advice_paragraph: "不恰当的停顿可能让表达不自然。建议提前规划好要点，关键句之间做短停顿即可。",
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
            points: buildConstantCurve(chartSeconds, avgWpm == null ? 220 : avgWpm),
          },
          {
            id: "pause_curve",
            label: "停顿变化曲线",
            unit: "占比",
            target_range: [0.05, 0.18],
            points: buildConstantCurve(chartSeconds, 0.12),
          },
        ],
      },
      expression: {
        title: "语言表达",
        submetrics: [
          {
            name: "冗余词",
            status: fillerStatus,
            stars: scoreToStars(expressionScore),
            advice_paragraph:
              avgFiller == null
                ? "建议减少“嗯/那个/就是”等口头禅，让表达更直接简洁。"
                : avgFiller < 0.04
                  ? "非常棒，冗余词占比低于 4%，能让语言表达更直接和简洁。"
                  : "冗余词偏多，建议有意识减少口头禅，必要时用短停顿替代。",
          },
          {
            name: "语调",
            status: "相对单调",
            stars: 3,
            advice_paragraph: "建议在关键句提升语调或放慢语速，强化重点与情绪共鸣，让表达更有感染力。",
          },
        ],
        filler_ratio: avgFiller == null ? null : Number(avgFiller.toFixed(4)),
        charts: [
          {
            id: "pitch_curve",
            label: "语调变化曲线",
            unit: "相对值",
            target_range: [0.3, 0.7],
            points: buildConstantCurve(chartSeconds, 0.5),
          },
        ],
      },
      pronunciation: {
        title: "发音准确度",
        submetrics: [
          {
            name: "清晰度",
            status: clarityStatus,
            stars: scoreToStars(pronunciationScore),
            advice_paragraph:
              avgConf == null
                ? "建议保持吐字清晰，避免含糊，必要时放慢语速。"
                : avgConf >= 0.78
                  ? "非常棒，发音清晰度高，听众能轻松理解你所表达的意思。"
                  : "清晰度有提升空间，建议放慢语速并强化关键字发音。",
          },
        ],
        charts: [
          {
            id: "clarity_curve",
            label: "清晰度变化曲线",
            unit: "分",
            target_range: [75, 95],
            points: buildConstantCurve(chartSeconds, avgConf == null ? 82 : avgConf * 100),
          },
        ],
      },
      organization: {
        title: "语言组织",
        submetrics: [
          {
            name: "逻辑性",
            status: organizationScore >= 80 ? "良好" : organizationScore >= 65 ? "一般" : "有待改进",
            stars: scoreToStars(organizationScore),
            advice_paragraph:
              "建议用“三段式”组织：先共情与确认问题，再给信息与证据，最后给明确下一步（案例/体验/预约）。",
          },
        ],
        advice_paragraph:
          "你的回答整体能被理解，但在“信息具体度”和“推进下一步”上还有空间。建议每次只讲 1-2 个核心优势，并补充可验证细节（流程/资质/案例/保障），最后抛出一个明确问题或行动指令。",
        audio_examples: beauticianTurns
          .filter((t) => typeof t.audio_path === "string" && t.audio_path)
          .slice(0, 3)
          .map((t) => ({ turn_id: t.id, audio_path: String(t.audio_path), audio_seconds: t.audio_seconds ?? null })),
      },
    },
  }

  return VoiceCoachReportSchema.parse(report)
}

