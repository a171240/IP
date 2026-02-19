import {
  normalizeVoiceCoachCategoryId,
  type VoiceCoachCategoryId,
  type VoiceCoachCategoryMeta,
  listVoiceCoachCategories,
} from "@/lib/voice-coach/script-packs"

export type VoiceCoachEmotion = "neutral" | "worried" | "skeptical" | "impatient" | "pleased"

export type VoiceCoachScenarioId = "presale" | "sale" | "postsale" | "crisis" | "objection_safety"

export type VoiceCoachScenario = {
  id: VoiceCoachScenarioId
  categoryId: VoiceCoachCategoryId
  categoryMeta: VoiceCoachCategoryMeta
  name: string
  goal: string
  customerPersona: string
  businessContext: string
  safetyConstraints: string[]
  seedTopics: string[]
}

export const DEFAULT_SCENARIO_ID: VoiceCoachScenarioId = "sale"

const CATEGORY_META_MAP = new Map<VoiceCoachCategoryId, VoiceCoachCategoryMeta>(
  listVoiceCoachCategories().map((item) => [item.id, item]),
)

const SCENARIOS: Record<Exclude<VoiceCoachScenarioId, "objection_safety">, VoiceCoachScenario> = {
  presale: {
    id: "presale",
    categoryId: "presale",
    categoryMeta: CATEGORY_META_MAP.get("presale")!,
    name: "售前·破冰与需求诊断",
    goal: "识别顾客需求、预算与时间限制，建立信任并推进低门槛下一步。",
    customerPersona: "谨慎、希望先了解，不接受强推，重视专业性与可验证信息。",
    businessContext: "你是美容机构美容师，目标是先诊断需求再推荐适配方案。",
    safetyConstraints: [
      "禁止夸大疗效与绝对承诺。",
      "避免贬低同行或施压成交。",
      "优先使用可验证信息，保持专业温和。",
    ],
    seedTopics: ["需求预算", "时间安排", "专业信任", "门店对比"],
  },
  sale: {
    id: "sale",
    categoryId: "sale",
    categoryMeta: CATEGORY_META_MAP.get("sale")!,
    name: "售中·异议处理与推进成交",
    goal: "处理顾客对安全、价格、证据的异议，形成可执行下一步。",
    customerPersona: "会反复追问、要求证据、对价格和安全敏感。",
    businessContext: "你是一家美容机构美容师，正在介绍护理服务与会员方案。",
    safetyConstraints: [
      "禁止虚假承诺（如100%有效）。",
      "避免医疗诊断/治疗结论。",
      "强调流程规范、风险提示、个体差异与可验证证据。",
    ],
    seedTopics: ["胸部安全", "价格贵", "效果证据", "产品信任"],
  },
  postsale: {
    id: "postsale",
    categoryId: "postsale",
    categoryMeta: CATEGORY_META_MAP.get("postsale")!,
    name: "售后·复购与裂变",
    goal: "复盘效果并给出维护计划，在不强推前提下推进复购或转介绍。",
    customerPersona: "看重稳定效果与服务持续性，关注维护成本和执行难度。",
    businessContext: "你是美容机构美容师，需要在售后阶段持续服务并提升复购。",
    safetyConstraints: [
      "避免“保证长期有效”等绝对表达。",
      "不夸大复购优惠与活动承诺。",
      "沟通聚焦可执行维护与回访节点。",
    ],
    seedTopics: ["效果复盘", "维护计划", "复购裂变"],
  },
  crisis: {
    id: "crisis",
    categoryId: "crisis",
    categoryMeta: CATEGORY_META_MAP.get("crisis")!,
    name: "危机·情绪急救与止损",
    goal: "先稳情绪再补救，明确时效与责任边界，并转入售后处理流程。",
    customerPersona: "情绪强烈、对处理结果敏感，不接受继续推销。",
    businessContext: "你是美容机构美容师，需要在危机沟通中先止损再修复关系。",
    safetyConstraints: [
      "禁止甩锅与对抗式回应。",
      "禁止情绪施压或继续强推销售。",
      "坚持共情 -> 可验证信息 -> 下一步选择。",
    ],
    seedTopics: ["情绪急救", "补救方案", "售后转交"],
  },
}

function scenarioFromCategory(categoryId: VoiceCoachCategoryId): VoiceCoachScenario {
  return SCENARIOS[categoryId]
}

function mapScenarioId(input: string | null | undefined): VoiceCoachScenarioId {
  const raw = String(input || "").trim().toLowerCase()
  if (!raw) return DEFAULT_SCENARIO_ID
  if (raw === "objection_safety") return "sale"
  if (raw === "presale" || raw === "sale" || raw === "postsale" || raw === "crisis") {
    return raw as VoiceCoachScenarioId
  }
  return DEFAULT_SCENARIO_ID
}

export function getScenario(id: string | undefined | null): VoiceCoachScenario {
  const normalizedId = mapScenarioId(id)
  const categoryId = normalizeVoiceCoachCategoryId(normalizedId)
  return scenarioFromCategory(categoryId)
}

export function getScenarioByCategory(categoryId: string | undefined | null): VoiceCoachScenario {
  const normalized = normalizeVoiceCoachCategoryId(categoryId || "")
  return scenarioFromCategory(normalized)
}

export function listScenarios(): VoiceCoachScenario[] {
  return (Object.keys(SCENARIOS) as Array<Exclude<VoiceCoachScenarioId, "objection_safety">>).map((id) => SCENARIOS[id])
}
