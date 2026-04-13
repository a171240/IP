export type VoiceCoachEmotion = "neutral" | "worried" | "skeptical" | "impatient" | "pleased"

export type VoiceCoachScenarioId = "objection_safety"

export type VoiceCoachOpening = {
  text: string
  emotion: VoiceCoachEmotion
  tag: string
}

export type VoiceCoachScenario = {
  id: VoiceCoachScenarioId
  name: string
  goal: string
  customerPersona: string
  businessContext: string
  safetyConstraints: string[]
  seedTopics: string[]
  firstTurnPool?: VoiceCoachOpening[]
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
      "禁止虚假承诺，例如“100%有效”或“一定不会有任何风险”。",
      "避免医疗诊断或治疗结论；可强调规范流程、资质、消毒、风险提示与个体差异。",
      "不要诱导顾客忽略医生建议；如有疾病或不适，应建议优先咨询医生。",
      "不要使用恐吓、伪限时、替顾客做决定等压迫式成交表达。",
    ],
    seedTopics: ["时间顾虑", "价格价值", "安全恢复", "真实案例", "服务信任", "是否推销", "效果预期", "敏感体质"],
    firstTurnPool: [
      {
        text: "我先说最担心的点吧，这种护理会不会有安全隐患或者恢复期问题？",
        emotion: "worried",
        tag: "安全顾虑",
      },
      {
        text: "你们这个项目价格不低，我想先听清楚它到底值在哪里。",
        emotion: "skeptical",
        tag: "价格怀疑",
      },
      {
        text: "你先别讲概念，我更想看看有没有和我情况接近的真实案例。",
        emotion: "impatient",
        tag: "案例要求",
      },
      {
        text: "我体质比较敏感，最怕做完以后红、痒、肿，像我这种能做吗？",
        emotion: "worried",
        tag: "敏感体质",
      },
      {
        text: "我今天不是完全拒绝，就是想先低门槛试一次，再决定要不要继续。",
        emotion: "neutral",
        tag: "犹豫试做",
      },
      {
        text: "我以前在别家体验过，最怕今天说得很好，后面服务就变样了。",
        emotion: "skeptical",
        tag: "服务信任",
      },
      {
        text: "你先跟我说实话，会不会一进来就一直推销产品和办卡？",
        emotion: "impatient",
        tag: "推销顾虑",
      },
    ],
  },
}

export function getScenario(id: string | undefined | null): VoiceCoachScenario {
  if (!id) return SCENARIOS[DEFAULT_SCENARIO_ID]
  const found = SCENARIOS[id as VoiceCoachScenarioId]
  return found || SCENARIOS[DEFAULT_SCENARIO_ID]
}
