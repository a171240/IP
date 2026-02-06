const PLAN_ORDER = ["free", "basic", "pro", "vip"]

function normalizePlan(plan) {
  return PLAN_ORDER.includes(plan) ? plan : "free"
}

function getCrossLevelMultiplier(currentPlan, requiredPlan) {
  const cur = PLAN_ORDER.indexOf(normalizePlan(currentPlan))
  const req = PLAN_ORDER.indexOf(normalizePlan(requiredPlan))
  if (cur >= req) return 1
  const diff = req - cur
  if (diff === 1) return 2
  return 4
}

function getRequiredPlanForWorkflowStep(stepId) {
  const sid = String(stepId || "").trim()
  if (!sid) return "free"
  if (sid === "P1" || sid === "P2") return "free"
  if (sid === "P3" || sid === "IP传记" || sid === "P4" || sid === "P5") return "basic"
  if (/^P(6|7|8|9|10)$/.test(sid)) return "pro"
  return "pro"
}

function getWorkflowBaseCost(stepId) {
  const sid = String(stepId || "").trim()
  if (!sid) return 1
  if (sid === "IP传记") return 6
  if (/^P(7|8|9|10)$/.test(sid)) return 3
  if (/^P(1|2|3|4|5|6)$/.test(sid)) return 2
  return 3
}

function estimateWorkflowCreditsCost(stepId, plan, allowCreditsOverride = true) {
  const base = getWorkflowBaseCost(stepId)
  const requiredPlan = getRequiredPlanForWorkflowStep(stepId)

  const cur = normalizePlan(plan)
  const planOk = PLAN_ORDER.indexOf(cur) >= PLAN_ORDER.indexOf(requiredPlan)
  if (planOk) return base
  if (!allowCreditsOverride) return base

  const multiplier = getCrossLevelMultiplier(cur, requiredPlan)
  return base * multiplier
}

function readHeader(headers, key) {
  const target = String(key || "").toLowerCase()
  if (!headers || typeof headers !== "object") return ""

  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === target) {
      return headers[k]
    }
  }

  return ""
}

function parseCreditsFromHeaders(headers) {
  const costRaw = readHeader(headers, "X-Credits-Cost")
  const remainingRaw = readHeader(headers, "X-Credits-Remaining")
  const unlimitedRaw = readHeader(headers, "X-Credits-Unlimited")

  const cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : null
  const remaining = typeof remainingRaw === "string" ? remainingRaw : remainingRaw != null ? String(remainingRaw) : ""
  const unlimited = unlimitedRaw === "1" || unlimitedRaw === 1 || String(unlimitedRaw).toLowerCase() === "true"

  return { cost, remaining, unlimited }
}

module.exports = {
  estimateWorkflowCreditsCost,
  parseCreditsFromHeaders,
  normalizePlan,
}

