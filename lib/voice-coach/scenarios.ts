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
    name: "异议处理·安全性（胸部安全）",
    goal: "在不夸大承诺、不触碰医疗结论的前提下，消除顾客对安全性的顾虑，并引导下一步（看案例/预约体验/了解会员）。",
    customerPersona: "谨慎、担心风险、会反复追问“是否安全/有没有证据/有没有真实案例”。",
    businessContext: "你是一家美容机构的美容师，正在向顾客介绍胸部护理/按摩相关服务与会员卡。",
    safetyConstraints: [
      "禁止虚假承诺（如“100%有效”“一定不复发”）。",
      "避免医疗诊断/治疗结论；可强调规范流程、资质、卫生消毒、风险提示与个体差异。",
      "不要诱导顾客忽略医生建议；可建议如有疾病/不适先咨询医生。",
    ],
    seedTopics: ["胸部安全", "真实案例", "价格贵", "产品信任"],
  },
}

export function getScenario(id: string | undefined | null): VoiceCoachScenario {
  if (!id) return SCENARIOS[DEFAULT_SCENARIO_ID]
  const found = SCENARIOS[id as VoiceCoachScenarioId]
  return found || SCENARIOS[DEFAULT_SCENARIO_ID]
}

