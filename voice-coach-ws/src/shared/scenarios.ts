export type VoiceCoachEmotion = "neutral" | "worried" | "skeptical" | "impatient" | "pleased"

export type VoiceCoachScenarioId = "objection_safety"

export type VoiceCoachScenario = {
  id: VoiceCoachScenarioId
  name: string
  goal: string
  customerPersona: string
  businessContext: string
  safetyConstraints: string[]
  seedTopics: string[]
}

export const DEFAULT_SCENARIO_ID: VoiceCoachScenarioId = "objection_safety"

const SCENARIOS: Record<VoiceCoachScenarioId, VoiceCoachScenario> = {
  objection_safety: {
    id: "objection_safety",
    name: "异议处理·护理项目咨询",
    goal:
      "在不夸大承诺、不触碰医疗结论、不制造压迫感的前提下，围绕顾客对时间、价格、安全、效果、真实案例与服务一致性的顾虑，完成一次真实、专业的护理项目沟通，并引导到合理的下一步。",
    customerPersona:
      "谨慎、会先说感受再提问题，常围绕时间、价格、安全、案例、是否推销、服务会不会变反复确认；如果听到空泛承诺或逼单话术，会自然追问或后撤。",
    businessContext: "你是一家美容机构的美容师，正在向顾客介绍日常护理、皮肤管理或店内项目体验与会员方案。",
    safetyConstraints: [
      "禁止虚假承诺（如“100%有效”“一定不复发”）。",
      "避免医疗诊断/治疗结论；可强调规范流程、资质、卫生消毒、风险提示与个体差异。",
      "不要诱导顾客忽略医生建议；可建议如有疾病/不适先咨询医生。",
      "不要使用恐吓、伪限时、替顾客做决定等压迫式成交表达。",
    ],
    seedTopics: ["时间顾虑", "价格价值", "安全恢复", "真实案例", "服务信任", "是否推销", "效果预期", "敏感体质"],
  },
}

/**
 * Resolve a voice coach scenario by id, falling back to the default scenario.
 */
export function getScenario(id: string | undefined | null): VoiceCoachScenario {
  if (!id) return SCENARIOS[DEFAULT_SCENARIO_ID]
  const found = SCENARIOS[id as VoiceCoachScenarioId]
  return found || SCENARIOS[DEFAULT_SCENARIO_ID]
}
