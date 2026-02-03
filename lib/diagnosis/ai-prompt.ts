import { Dimension, QUESTIONS, INDUSTRY_LABELS, DIMENSIONS } from "./questions"

export interface AIReport {
  summary: string
  achievements: Array<{
    dimension: Dimension
    title: string
    content: string
  }>
  insights: Array<{
    dimension: Dimension
    title: string
    content: string
    severity: "high" | "medium" | "low"
  }>
  recommendations: Array<{
    title: string
    content: string
    priority: number
  }>
  workflowSteps: Array<{
    stepId: string
    title: string
    reason: string
    priority: number
    estimatedTime?: string
    expectedROI?: string
    requiredPlan?: "free" | "plus" | "pro"
  }>
}

export const WORKFLOW_STEPS: Record<string, { title: string; description: string }> = {
  P1: { title: "行业与定位梳理", description: "明确交付定位与目标用户" },
  P2: { title: "内容结构拆解", description: "形成稳定的内容结构模板" },
  P3: { title: "质检复盘机制", description: "建立质检清单与复盘节奏" },
  P6: { title: "排产节奏规划", description: "锁定7天内容排产节奏" },
  P7: { title: "选题库建设", description: "沉淀可复用选题库" },
  P8: { title: "脚本批量产出", description: "脚本模板化与多轮审核" },
}

export const DIMENSION_WORKFLOW_MAP: Record<Dimension, string[]> = {
  positioning: ["P1", "P2"],
  content: ["P7", "P8"],
  efficiency: ["P6"],
  emotion: ["P3"],
  conversion: ["P6"],
}

export const DIAGNOSIS_SYSTEM_PROMPT = `你是内容交付系统诊断专家，请输出结构化JSON报告。要求：
1) 只输出JSON，不要输出额外文本；
2) 结合用户回答给出具体洞察与行动建议；
3) 不要使用行业排名或不可验证数据。`

export function buildUserPrompt(
  answers: Record<string, string | string[]>,
  scores: Record<Dimension, { score: number; status: string }>,
  totalScore: number,
  level: string,
  industry: string
): string {
  const formattedAnswers = QUESTIONS.map((q) => {
    const answer = answers[q.id]
    if (!answer) return null

    const resolveLabel = (value: string) => q.options?.find((o) => o.value === value)?.label || value
    const answerLabels = Array.isArray(answer)
      ? answer.map(resolveLabel).join("、")
      : resolveLabel(answer)

    return `${q.question}\n答：${answerLabels}`
  })
    .filter(Boolean)
    .join("\n\n")

  const formattedScores = Object.entries(scores)
    .map(([key, value]) => {
      const dim = DIMENSIONS[key as Dimension]
      const statusLabel = value.status === "strong" ? "优势" : value.status === "weak" ? "待改进" : "正常"
      return `- ${dim.name}：${value.score}/10（${statusLabel}）`
    })
    .join("\n")

  const levelLabels: Record<string, string> = {
    excellent: "优秀",
    good: "良好",
    pass: "及格",
    needs_improvement: "待提升",
  }

  return `# 诊断数据

## 用户行业
${INDUSTRY_LABELS[industry] || industry}

## 问卷回答
${formattedAnswers}

## 五维评分
${formattedScores}

## 综合评分
总分：${totalScore}
等级：${levelLabels[level] || level}

# 请求
请基于以上诊断数据输出AI报告JSON，包含 summary / achievements / insights / recommendations / workflowSteps。`
}

function cleanJsonString(value: string): string {
  let cleaned = value
  cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "")
  const firstBrace = cleaned.indexOf("{")
  const lastBrace = cleaned.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }
  cleaned = cleaned.replace(/,(\s*[\]}])/g, "$1")
  cleaned = cleaned.replace(/([^\\])\\n/g, "$1 ")
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  return cleaned
}

export function parseAIReport(content: string): AIReport | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const cleanedJson = cleanJsonString(jsonMatch[0])
    const parsed = JSON.parse(cleanedJson)

    if (!parsed.summary || !parsed.insights || !parsed.recommendations || !parsed.workflowSteps) {
      return null
    }

    if (!parsed.achievements) {
      parsed.achievements = []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsed.workflowSteps = parsed.workflowSteps.map((step: any) => ({
      ...step,
      estimatedTime: step.estimatedTime || "约15分钟",
      expectedROI: step.expectedROI || "",
      requiredPlan: step.requiredPlan || "free",
    }))

    return parsed as AIReport
  } catch {
    return null
  }
}
