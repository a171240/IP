import { agentsConfig, type AgentScene } from "@/lib/agents/config"

export type PlanId = "free" | "basic" | "pro" | "vip"

export const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "vip"]

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "体验版",
  basic: "创作者版",
  pro: "团队版",
  vip: "企业版",
}

export function normalizePlan(input: unknown): PlanId {
  return input === "free" || input === "basic" || input === "pro" || input === "vip" ? input : "free"
}

export function isPlanSufficient(current: unknown, required: PlanId) {
  const currentPlan = normalizePlan(current)
  return PLAN_ORDER.indexOf(currentPlan) >= PLAN_ORDER.indexOf(required)
}

export function getRequiredPlanForWorkflowStep(stepId: string | undefined): PlanId {
  if (!stepId) return "free"
  if (stepId.startsWith("quick-")) return "free"

  if (stepId === "P1" || stepId === "P2") return "free"
  if (stepId === "P3" || stepId === "IP传记" || stepId === "P4" || stepId === "P5") return "basic"
  if (/^P(6|7|8|9|10)$/.test(stepId)) return "pro"

  return "pro"
}

function getDefaultPlanForAgentScene(scene: AgentScene): PlanId {
  if (scene === "workflow") return "free"
  if (scene === "research" || scene === "efficiency") return "basic"
  return "pro"
}

export function getRequiredPlanForAgent(agentId: string, promptFile?: string): PlanId {
  const agent = agentsConfig.find((a) => a.id === agentId)

  if (agent?.scene === "workflow" && agent.workflowStepId) {
    return getRequiredPlanForWorkflowStep(agent.workflowStepId)
  }

  if (agentId === "prompt-runner") {
    const file = (promptFile || "").trim()
    if (file.startsWith("实体店营销全家桶/")) return "basic"
    if (file.startsWith("各垂类正反观点情绪选题生成器/")) return "basic"
    return "pro"
  }

  if (!agent) return "pro"
  return getDefaultPlanForAgentScene(agent.scene)
}

export function getCreditCostForUse(stepId: string | undefined, mode: string | undefined): number {
  if (!stepId) return 1

  let base = 3

  if (stepId.startsWith("quick-")) base = 1
  else if (stepId.startsWith("agent:")) base = 2
  else if (stepId === "P1" || stepId === "P2") base = 2
  else if (stepId === "P3" || stepId === "P4" || stepId === "P5") base = 2
  else if (stepId === "IP传记") base = 6
  else if (stepId === "P6") base = 3
  else if (/^P(7|8|9|10)$/.test(stepId)) base = 3

  void mode
  return base
}

export function getCreditCostForUseWithPlanRule(opts: {
  stepId: string | undefined
  mode: string | undefined
  planOk: boolean
  allowCreditsOverride: boolean
}) {
  const base = getCreditCostForUse(opts.stepId, opts.mode)
  if (opts.planOk) return base
  if (!opts.allowCreditsOverride) return base
  return Math.max(6, base * 3)
}

export function getPromptPreviewMaxChars(file: string) {
  if (file.startsWith("实体店营销全家桶/")) return 700
  if (file.startsWith("各垂类正反观点情绪选题生成器/")) return 700
  return 900
}

export function getCreditCostForPromptDownload(file: string, currentPlan: PlanId) {
  if (file.startsWith("实体店营销全家桶/")) {
    if (currentPlan !== "free") return 0
    return 30
  }
  if (file.startsWith("各垂类正反观点情绪选题生成器/")) return 20
  return 20
}

export function getCreditCostForPackFileDownload(packId: string, currentPlan: PlanId) {
  if (packId === "retail-marketing") {
    if (currentPlan !== "free") return 0
    return 30
  }
  return 25
}

export function getCreditCostForPackMarkdownDownload(packId: string, currentPlan: PlanId) {
  if (packId === "retail-marketing") {
    if (currentPlan !== "free") return 0
    return 30
  }
  return 40
}
