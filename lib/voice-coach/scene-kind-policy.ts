type VoiceCoachSceneKindPolicy = {
  sceneKind: "customer_visit" | "offer_promo" | ""
  label: string
  promptSummary: string
  firstTurnGuidance: string
  customerReplyGuidance: string
  hintFocus: string
  reportFocus: string
  fallbackQuestions: string[]
}

function buildCustomerVisitPolicy(serviceName: string): VoiceCoachSceneKindPolicy {
  const serviceLabel = serviceName || "这个项目"
  return {
    sceneKind: "customer_visit",
    label: "到店顾客训练",
    promptSummary:
      "当前是到店顾客训练，顾客更关注是否值得到店、是否安全、恢复期和时间安排、是否会被持续推销。后续追问应更偏信任建立与到店决策。",
    firstTurnGuidance:
      "For customer_visit, open like a real customer who is still deciding whether to trust, come in, or continue the consultation. Prioritize safety, recovery time, scheduling, service consistency, and fear of being sold to.",
    customerReplyGuidance:
      "For customer_visit turns, keep the customer anchored in trust, safety, recovery time, visit arrangement, and low-pressure decision-making.",
    hintFocus:
      "For customer_visit, coach the beautician to first receive the concern, then explain assessment, process, recovery or visit arrangement, and only then offer one low-pressure next step.",
    reportFocus:
      "本类训练更看重是否接住顾客顾虑、建立信任、解释评估/流程/恢复期，并自然推进到低压力下一步。",
    fallbackQuestions: [
      `如果我真要来做${serviceLabel}，会不会影响第二天上班或见人？`,
      `我不想一来就被一直推项目，你们通常会怎么安排沟通？`,
      `如果按我的情况做${serviceLabel}，你觉得我最该先确认哪一个风险点？`,
    ],
  }
}

function buildOfferPromoPolicy(serviceName: string): VoiceCoachSceneKindPolicy {
  const serviceLabel = serviceName || "这个新品项"
  return {
    sceneKind: "offer_promo",
    label: "新品推广训练",
    promptSummary:
      "当前是新品项推广训练，顾客更可能先问专业原理、适用边界、是否适合自己、风险与效果证据，再进入价格和值不值。后续追问应更偏专业判断与价值转换。",
    firstTurnGuidance:
      "For offer_promo, open like a cautious customer evaluating a new offer. Prioritize mechanism, suitability boundaries, expected experience, comparison, evidence, and why it is worth considering.",
    customerReplyGuidance:
      "For offer_promo turns, keep the customer anchored in professional questions, suitability boundaries, evidence, comparison, and value.",
    hintFocus:
      "For offer_promo, coach the beautician to explain mechanism and suitability boundaries first, then evidence and value, instead of jumping straight to package promotion.",
    reportFocus:
      "本类训练更看重是否讲清原理、适用边界、风险与证据，并把价值讲清，而不是只强调成交推进。",
    fallbackQuestions: [
      `${serviceLabel}和你们原来常做的项目，核心差别到底在哪里？`,
      `如果按我的情况，什么人更适合做${serviceLabel}，什么人反而不太适合？`,
      `除了价格，你觉得${serviceLabel}真正值在哪里？`,
    ],
  }
}

function buildDefaultPolicy(serviceName: string): VoiceCoachSceneKindPolicy {
  const serviceLabel = serviceName || "这个项目"
  return {
    sceneKind: "",
    label: "通用训练",
    promptSummary:
      "当前是通用训练场景，顾客会围绕信任、风险、效果、价格和值不值来追问，优先保持真实顾虑和低压力决策。",
    firstTurnGuidance:
      "Keep the opening grounded in a realistic concern, and make it sound like a customer who is still evaluating fit, risk, and whether the service is worth considering.",
    customerReplyGuidance:
      "Keep the customer focused on realistic concerns, evidence, risk, and value instead of cooperating with the sale.",
    hintFocus:
      "Coach the beautician to receive the concern first, then offer concrete evidence, and finish with one clear but low-pressure next step.",
    reportFocus:
      "本类训练更看重是否接住顾客顾虑、补充证据，并给出清晰但不过压的下一步。",
    fallbackQuestions: [
      `如果按我的情况了解${serviceLabel}，你觉得我最该先确认什么？`,
      `你刚刚说了不少优点，但我还是想听更具体一点的依据。`,
    ],
  }
}

export function getVoiceCoachSceneKindPolicy(
  sceneKind?: string | null,
  serviceName?: string | null,
): VoiceCoachSceneKindPolicy {
  const normalizedKind = String(sceneKind || "").trim()
  const normalizedServiceName = String(serviceName || "").trim()

  if (normalizedKind === "customer_visit") {
    return buildCustomerVisitPolicy(normalizedServiceName)
  }

  if (normalizedKind === "offer_promo") {
    return buildOfferPromoPolicy(normalizedServiceName)
  }

  return buildDefaultPolicy(normalizedServiceName)
}
