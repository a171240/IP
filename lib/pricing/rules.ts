import { agentsConfig, type AgentScene, type AgentTier } from "@/lib/agents/config"

export type PlanId = "free" | "basic" | "pro" | "vip"

export const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "vip"]

// 会员名称：创作者版→Plus，团队版→Pro
export const PLAN_LABELS: Record<PlanId, string> = {
  free: "体验版",
  basic: "Plus",
  pro: "Pro",
  vip: "企业版",
}

// 会员特性描述
export const PLAN_FEATURES: Record<PlanId, string> = {
  free: "P1-P2 研究定位",
  basic: "P3-P5 人设构建 + IP传记 + 100+专属智能体",
  pro: "P6-P10 内容生产 + 全部智能体包 + 下载",
  vip: "全功能 + 定制服务 + 积分不限量",
}

export function normalizePlan(input: unknown): PlanId {
  return input === "free" || input === "basic" || input === "pro" || input === "vip" ? input : "free"
}

export function isPlanSufficient(current: unknown, required: PlanId) {
  const currentPlan = normalizePlan(current)
  return PLAN_ORDER.indexOf(currentPlan) >= PLAN_ORDER.indexOf(required)
}

// 计算跨级倍率
export function getCrossLevelMultiplier(currentPlan: PlanId, requiredPlan: PlanId): number {
  const currentIndex = PLAN_ORDER.indexOf(currentPlan)
  const requiredIndex = PLAN_ORDER.indexOf(requiredPlan)

  if (currentIndex >= requiredIndex) return 1  // 不跨级

  const levelDiff = requiredIndex - currentIndex
  if (levelDiff === 1) return 2   // 跨1级：2倍
  if (levelDiff >= 2) return 4    // 跨2级：4倍
  return 1
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

// 根据智能体tier获取所需会员等级
export function getRequiredPlanForAgentTier(tier: AgentTier | undefined): PlanId {
  if (tier === "free") return "free"
  if (tier === "member") return "basic"      // Plus会员赠送
  if (tier === "pro_benefit") return "pro"   // Pro会员赠送
  if (tier === "normal") return "basic"      // 普通智能体属于basic
  if (tier === "premium") return "basic"     // 高级智能体也属于basic（但积分更高）
  return "basic"
}

export function getRequiredPlanForAgent(agentId: string, promptFile?: string): PlanId {
  const agent = agentsConfig.find((a) => a.id === agentId)

  if (agent?.scene === "workflow" && agent.workflowStepId) {
    return getRequiredPlanForWorkflowStep(agent.workflowStepId)
  }

  // 如果有tier字段，使用tier判断
  if (agent?.tier) {
    return getRequiredPlanForAgentTier(agent.tier)
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

// 智能体基础积分
export function getAgentBaseCreditCost(tier: AgentTier | undefined): number {
  if (tier === "free") return 0
  if (tier === "member") return 0      // 会员赠送，对会员免费
  if (tier === "pro_benefit") return 0 // Pro会员赠送，对Pro免费
  if (tier === "normal") return 2
  if (tier === "premium") return 4
  return 2  // 默认
}

// 智能体实际积分消耗（含跨级和会员权益）
export function getAgentCreditCost(
  tier: AgentTier | undefined,
  currentPlan: PlanId
): number {
  // VIP用户跳过积分检查
  if (currentPlan === "vip") return 0

  // Plus会员赠送智能体（实体营销、垂类选题）
  if (tier === "member") {
    if (isPlanSufficient(currentPlan, "basic")) return 0  // Plus+免费
    return 12  // 体验版：固定12积分/次
  }

  // Pro会员赠送智能体（赛博IP、内容矩阵）
  if (tier === "pro_benefit") {
    if (isPlanSufficient(currentPlan, "pro")) return 0   // Pro免费
    if (isPlanSufficient(currentPlan, "basic")) return 8 // Plus: 8积分
    return 16  // 体验版：16积分
  }

  // 普通和高级智能体，应用跨级倍率
  const base = getAgentBaseCreditCost(tier)  // normal=2, premium=4
  const requiredPlan: PlanId = "basic"  // 普通智能体默认属于basic级别
  const multiplier = getCrossLevelMultiplier(currentPlan, requiredPlan)

  return base * multiplier  // 体验版×2，Plus×1
}

// 工作流步骤基础积分消耗
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

// 工作流步骤实际积分消耗（含跨级倍率）
export function getCreditCostForUseWithPlanRule(opts: {
  stepId: string | undefined
  mode: string | undefined
  planOk: boolean
  allowCreditsOverride: boolean
  currentPlan?: PlanId
}) {
  const base = getCreditCostForUse(opts.stepId, opts.mode)

  // 权限满足，正常消耗
  if (opts.planOk) return base

  // 不允许积分解锁
  if (!opts.allowCreditsOverride) return base

  // 计算跨级倍率
  if (opts.currentPlan && opts.stepId) {
    const requiredPlan = getRequiredPlanForWorkflowStep(opts.stepId)
    const multiplier = getCrossLevelMultiplier(opts.currentPlan, requiredPlan)
    return base * multiplier
  }

  // 兼容旧逻辑：默认3倍，最少6积分
  return Math.max(6, base * 3)
}

export function getPromptPreviewMaxChars(file: string) {
  if (file.startsWith("实体店营销全家桶/")) return 700
  if (file.startsWith("各垂类正反观点情绪选题生成器/")) return 700
  return 900
}

// 是否可下载解决方案包
export function canDownloadPack(packId: string, currentPlan: PlanId): boolean {
  if (currentPlan === "vip") return true
  if (currentPlan === "pro") return true

  // Plus只能下载实体营销和垂类选题
  if (currentPlan === "basic") {
    return packId === "retail-marketing" || packId === "industry-topics"
  }

  return false  // 体验版不能下载
}

// 是否可下载单个提示词
export function canDownloadPrompt(file: string, currentPlan: PlanId): boolean {
  if (currentPlan === "vip") return true
  if (currentPlan === "pro") return true

  // Plus只能下载Plus包的提示词
  if (currentPlan === "basic") {
    if (file.startsWith("实体店营销全家桶/")) return true
    if (file.startsWith("各垂类正反观点情绪选题生成器/")) return true
    return false
  }

  return false  // 体验版不能下载
}

// 下载积分消耗（有权限的情况下免费）
export function getCreditCostForPromptDownload(file: string, currentPlan: PlanId): number {
  if (!canDownloadPrompt(file, currentPlan)) return -1  // -1表示不可下载
  return 0  // 有权限免费下载
}

export function getCreditCostForPackFileDownload(packId: string, currentPlan: PlanId): number {
  if (!canDownloadPack(packId, currentPlan)) return -1  // -1表示不可下载
  return 0  // 有权限免费下载
}

export function getCreditCostForPackMarkdownDownload(packId: string, currentPlan: PlanId): number {
  if (!canDownloadPack(packId, currentPlan)) return -1  // -1表示不可下载
  return 0  // 有权限免费下载
}

// 获取下载权限提示信息
export function getDownloadPermissionMessage(packId: string, currentPlan: PlanId): string {
  if (canDownloadPack(packId, currentPlan)) return ""

  if (currentPlan === "free") {
    if (packId === "retail-marketing" || packId === "industry-topics") {
      return "升级至Plus即可下载此资源包"
    }
    return "升级至Pro即可下载此资源包"
  }

  if (currentPlan === "basic") {
    return "升级至Pro即可下载此资源包"
  }

  return "请升级会员以下载此资源"
}
