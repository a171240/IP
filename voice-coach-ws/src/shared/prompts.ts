export type VoiceCoachEmotion = "neutral" | "worried" | "skeptical" | "impatient" | "pleased"

export type VoiceCoachScenario = {
  id: string
  name: string
  goal: string
  customerPersona: string
  businessContext: string
  safetyConstraints: string[]
  seedTopics?: string[]
}

export type VoiceCoachTurn = {
  role: "customer" | "beautician"
  text: string
  emotion?: VoiceCoachEmotion
}

export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type BuildMergedPromptOptions = {
  scenario: VoiceCoachScenario
  history: VoiceCoachTurn[]
  beauticianText: string
  sessionContextText?: string
  variationSeed?: string
}

export type BuildAsyncAnalysisPromptOptions = BuildMergedPromptOptions & {
  customerText: string
  customerEmotion?: VoiceCoachEmotion
  tag?: string
}

export const ANALYSIS_DELIMITER = "---ANALYSIS---"
export const REPLY_META_DELIMITER = "---META---"

function formatSafetyConstraints(lines: string[]): string {
  return lines.length ? lines.map((line) => `- ${line}`).join("\n") : "- (无额外约束)"
}

function formatSessionContext(text?: string): string {
  const normalized = String(text || "").trim()
  if (!normalized) return ""
  return `当前训练设定：\n${normalized}`
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function buildVariationDirective(seed?: string, historyLength = 0): string {
  const normalizedSeed = String(seed || "").trim()
  if (!normalizedSeed) return ""

  const archetypes = [
    "本轮顾客更偏谨慎核实，不要复用最泛的追问句式。",
    "本轮顾客更偏信任缺口，会追着证据和边界问。",
    "本轮顾客更偏现实安排，会优先问流程、恢复期或时间成本。",
    "本轮顾客更偏比较判断，会优先追问差异、适配边界和值不值。",
  ]
  const nudges = [
    "尽量换一个更自然的切入角度。",
    "避免复述上一轮或上一场最常见的那句问法。",
    "即使核心顾虑相同，也要换一个更具体的说法。",
    "不要用固定模板句把对话带回同一路径。",
  ]
  const baseIndex = quickHash(`${normalizedSeed}:${historyLength}`) % archetypes.length
  const nudgeIndex = quickHash(`${normalizedSeed}:nudge:${historyLength}`) % nudges.length
  return `${archetypes[baseIndex]}${nudges[nudgeIndex]}`
}

export function formatHistory(history: VoiceCoachTurn[]): string {
  if (!history.length) return "(无历史对话)"

  return history
    .map((turn) => {
      const who = turn.role === "customer" ? "顾客" : "美容师"
      const emotion = turn.role === "customer" && turn.emotion ? `（情绪：${turn.emotion}）` : ""
      return `${who}${emotion}：${turn.text}`
    })
    .join("\n")
}

export function buildFastReplyPrompt(opts: BuildMergedPromptOptions): ChatMessage[] {
  const variationDirective = buildVariationDirective(opts.variationSeed, opts.history.length)
  const system = [
    "你是美容销售训练里的模拟顾客，只生成下一句顾客回复。",
    `场景：${opts.scenario.name}`,
    `目标：${opts.scenario.goal}`,
    `背景：${opts.scenario.businessContext}`,
    `人设：${opts.scenario.customerPersona}`,
    formatSessionContext(opts.sessionContextText),
    `约束：\n${formatSafetyConstraints(opts.scenario.safetyConstraints)}`,
    "",
    "输出规则：",
    "1. 先写 1 句顾客回复，优先 20-50 字，最多 60 字。",
    "2. 口语化、自然，带明确顾虑或兴趣点，只站在顾客视角推进对话。",
    "3. 顾客不是来配合成交的；如果美容师回答空泛、夸大、施压或跳过顾虑，顾客要自然追问或后撤。",
    "4. 如果训练设定里标明是到店顾客训练，就优先围绕信任、安全、恢复期、时间安排和是否会被推销来追问；如果标明是新品推广训练，就优先围绕原理、适用边界、证据、比较和价值来追问。",
    "5. 如果有当前训练设定，必须与设定里的顾客、场景和项目保持一致。",
    "6. 不要解释、列表、JSON、引号、角色名或舞台说明。",
    variationDirective ? `6.5 ${variationDirective}` : "",
    `7. 换行后单独输出 ${REPLY_META_DELIMITER}`,
    '8. 最后一行输出紧凑 JSON：{"emotion":"neutral|worried|skeptical|impatient|pleased","tag":"话题标签"}',
    "极简示例：我还是想先弄清楚，会不会做完反而更敏感？",
  ].filter(Boolean).join("\n")

  const user = [
    formatSessionContext(opts.sessionContextText),
    "对话历史：",
    formatHistory(opts.history),
    `美容师本轮说：${opts.beauticianText}`,
    "按规则续写顾客下一句。",
  ].filter(Boolean).join("\n\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

export function buildAsyncAnalysisPrompt(opts: BuildAsyncAnalysisPromptOptions): ChatMessage[] {
  const system = [
    "你是美容销售训练复盘教练，只输出严格 JSON。",
    "不要添加代码块、解释、标题或前后缀。",
    "{",
    '  "suggestions": ["建议1", "建议2", "建议3"],',
    '  "polished": "润色后的美容师话术",',
    '  "highlights": [{"text": "原文片段", "severity": "info|warning|danger"}],',
    '  "risk_notes": ["风险提示"],',
    '  "persuasion_score": number,',
    '  "organization_score": number',
    "}",
    "规则：",
    "1. suggestions 必须正好 3 条，短句、具体、能立刻执行。",
    "2. polished 要更自然、更稳妥、可直接说出口，同时保持推进感；优先体现“接情绪 -> 讲事实 -> 给下一步”。",
    "3. 不要夸大承诺，不碰医疗结论。",
    "4. 到店顾客训练更看重信任建立、流程/恢复期解释；新品推广训练更看重原理、适用边界、证据和价值。",
    "5. 不鼓励逼单、恐吓、伪限时或替顾客做决定。",
  ].join("\n")

  const user = [
    `场景：${opts.scenario.name}`,
    `目标：${opts.scenario.goal}`,
    `背景：${opts.scenario.businessContext}`,
    `顾客人设：${opts.scenario.customerPersona}`,
    formatSessionContext(opts.sessionContextText),
    `合规约束：\n${formatSafetyConstraints(opts.scenario.safetyConstraints)}`,
    "",
    "最近对话：",
    formatHistory(opts.history),
    `美容师本轮说：${opts.beauticianText}`,
    `顾客本轮回复：${opts.customerText}`,
    `顾客情绪：${opts.customerEmotion || "neutral"}`,
    `话题标签：${opts.tag || ""}`,
    "请基于以上内容复盘美容师话术。",
  ].filter(Boolean).join("\n\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

export function buildMergedPrompt(opts: BuildMergedPromptOptions): ChatMessage[] {
  const system = [
    "你是美容销售话术教练的模拟顾客。",
    `场景：${opts.scenario.name}`,
    `目标：${opts.scenario.goal}`,
    `背景：${opts.scenario.businessContext}`,
    `顾客人设：${opts.scenario.customerPersona}`,
    formatSessionContext(opts.sessionContextText),
    `合规约束：\n${formatSafetyConstraints(opts.scenario.safetyConstraints)}`,
    "",
    "任务：",
    "1. 先以顾客身份回复美容师，只输出纯文本，不要 JSON。",
    `2. 回复完成后，输出一行 ${ANALYSIS_DELIMITER}`,
    "3. 然后输出严格 JSON：",
    "{",
    '  "emotion": "neutral|worried|skeptical|impatient|pleased",',
    '  "tag": "话题标签",',
    '  "analysis": {',
    '    "suggestions": ["建议1", "建议2", "建议3"],',
    '    "polished": "润色后的美容师话术",',
    '    "highlights": [{"text": "原文片段", "severity": "info|warning|danger"}],',
    '    "risk_notes": ["风险提示"]',
    "  }",
    "}",
    "",
    "约束：",
    "- 顾客回复控制在 30-80 字。",
    "- 情绪要符合对话上下文。",
    "- 建议要具体可执行。",
    "- 润色表达优先体现“接情绪 -> 讲事实 -> 给下一步”，不要使用逼单或恐吓。",
  ].filter(Boolean).join("\n")

  const user = [
    formatSessionContext(opts.sessionContextText),
    "对话历史：",
    formatHistory(opts.history),
    `美容师本轮说：${opts.beauticianText}`,
  ].filter(Boolean).join("\n\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}
