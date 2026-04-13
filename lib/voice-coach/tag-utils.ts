import type { VoiceCoachScenario } from "./scenarios"

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function pickAllowedTagByKeyword(allowedTags: string[], candidate: string) {
  if (!candidate) return ""

  const keywordMatchers: Array<{ pattern: RegExp; preferred: string[] }> = [
    { pattern: /赶时间|预约|排期|改约|来不及|明天|午休/, preferred: ["时间顾虑"] },
    { pattern: /敏感|体质|红肿|发痒|过敏|恢复|副作用/, preferred: ["敏感体质", "安全恢复"] },
    { pattern: /安全|风险|资质|规范|保障|卫生/, preferred: ["安全恢复"] },
    { pattern: /价格|贵|折扣|优惠|套餐|会员|性价比/, preferred: ["价格价值"] },
    { pattern: /案例|反馈|见证|对比|真实/, preferred: ["真实案例"] },
    { pattern: /推销|办卡|套路|服务|变样|售后|信任/, preferred: ["服务信任", "是否推销"] },
    { pattern: /效果|见效|多久|改善|维持|变化/, preferred: ["效果预期"] },
  ]

  for (const matcher of keywordMatchers) {
    if (!matcher.pattern.test(candidate)) continue
    for (const preferred of matcher.preferred) {
      const matched = allowedTags.find((tag) => tag.includes(preferred) || preferred.includes(tag))
      if (matched) return matched
    }
  }

  const fuzzyMatched = allowedTags.find((tag) => candidate.includes(tag) || tag.includes(candidate))
  return fuzzyMatched || ""
}

export function getAllowedScenarioTags(scenario: VoiceCoachScenario): string[] {
  return uniqueStrings(Array.isArray(scenario.seedTopics) ? scenario.seedTopics : [])
}

export function normalizeScenarioTag(rawTag: unknown, scenario: VoiceCoachScenario): string {
  const allowedTags = getAllowedScenarioTags(scenario)
  if (!allowedTags.length) return normalizeText(rawTag)

  const candidate = normalizeText(rawTag)
  if (!candidate) return allowedTags[0]

  const exactMatch = allowedTags.find((tag) => tag === candidate)
  if (exactMatch) return exactMatch

  const fuzzyMatch = pickAllowedTagByKeyword(allowedTags, candidate)
  return fuzzyMatch || allowedTags[0]
}
