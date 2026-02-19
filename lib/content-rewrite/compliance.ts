import type { ComplianceReport } from "@/lib/types/content-pipeline"

import type { RewriteComplianceReport, RewriteResult } from "@/lib/content-rewrite/types"

type RiskLevel = ComplianceReport["risk_level"]

type RiskRule = {
  flag: string
  level: RiskLevel
  re: RegExp
  replacement?: string
}

const RISK_RULES: RiskRule[] = [
  {
    flag: "absolute_promise",
    level: "high",
    re: /百分百|100%|包过|包赚|绝对有效|无效退款|必火|根治|治愈|永久见效/gi,
    replacement: "更稳妥",
  },
  {
    flag: "medical_claim",
    level: "high",
    re: /治疗|治好|药到病除|医学奇迹|手到病除/gi,
    replacement: "改善",
  },
  {
    flag: "effect_guarantee",
    level: "medium",
    re: /保证|立刻见效|马上见效|秒见效|立马见效/gi,
    replacement: "尽量",
  },
  {
    flag: "contact_drain",
    level: "high",
    re: /加\s*微\s*信|加\s*v\s*x|加V|加v|vx|v信|扫码|二维码|手机号|电话|私信我/gi,
    replacement: "私下沟通",
  },
  {
    flag: "transaction_drain",
    level: "medium",
    re: /下单|团购|买券|核销|返现|优惠链接|点击链接/gi,
    replacement: "了解详情",
  },
]

const PHONE_NUMBER_RE = /\b1\d{10}\b/g

const SEVERITY_WEIGHT: Record<RiskLevel, number> = {
  safe: 0,
  medium: 1,
  high: 2,
}

function normalizeInlineText(value: string): string {
  return value.replace(/[ \t]+/g, " ").trim()
}

function normalizeMultilineText(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim()
  if (!normalized) return ""

  const lines = normalized.split("\n").map((line) => normalizeInlineText(line))
  const compacted: string[] = []
  let lastEmpty = false

  for (const line of lines) {
    if (!line) {
      if (!lastEmpty) {
        compacted.push("")
        lastEmpty = true
      }
      continue
    }

    compacted.push(line)
    lastEmpty = false
  }

  return compacted.join("\n").trim()
}

function sanitizeTextForRisk(text: string): string {
  let next = text
  for (const rule of RISK_RULES) {
    if (!rule.replacement) continue
    next = next.replace(rule.re, rule.replacement)
  }
  next = next.replace(PHONE_NUMBER_RE, "联系方式")
  return next
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function normalizeResult(result: RewriteResult): RewriteResult {
  return {
    title: normalizeInlineText(result.title),
    body: normalizeMultilineText(result.body),
    script: normalizeMultilineText(result.script),
    tags: uniqueStrings(result.tags.map((item) => normalizeInlineText(item))),
    cover_prompts: uniqueStrings(result.cover_prompts.map((item) => normalizeInlineText(item))),
  }
}

function sanitizeResult(result: RewriteResult): RewriteResult {
  const normalized = normalizeResult(result)
  return {
    title: normalizeInlineText(sanitizeTextForRisk(normalized.title)),
    body: normalizeMultilineText(sanitizeTextForRisk(normalized.body)),
    script: normalizeMultilineText(sanitizeTextForRisk(normalized.script)),
    tags: uniqueStrings(normalized.tags.map((item) => normalizeInlineText(sanitizeTextForRisk(item)))),
    cover_prompts: uniqueStrings(
      normalized.cover_prompts.map((item) => normalizeInlineText(sanitizeTextForRisk(item)))
    ),
  }
}

function detectRuleFlags(field: string, text: string): Array<{ flag: string; level: RiskLevel; hit: string }> {
  const flags: Array<{ flag: string; level: RiskLevel; hit: string }> = []

  for (const rule of RISK_RULES) {
    const matches = text.match(rule.re)
    if (!matches?.length) continue

    for (const hit of uniqueStrings(matches).slice(0, 6)) {
      flags.push({
        flag: rule.flag,
        level: rule.level,
        hit,
      })
    }
  }

  const phoneMatches = text.match(PHONE_NUMBER_RE)
  if (phoneMatches?.length) {
    for (const hit of uniqueStrings(phoneMatches).slice(0, 6)) {
      flags.push({
        flag: "contact_drain",
        level: "high",
        hit,
      })
    }
  }

  return flags.map((item) => ({ ...item, hit: `${field}:${item.hit}` }))
}

function detectLocalCompliance(result: RewriteResult): ComplianceReport {
  const fieldPairs: Array<[string, string]> = [
    ["title", result.title],
    ["body", result.body],
    ["script", result.script],
    ["tags", result.tags.join(" | ")],
    ["cover_prompts", result.cover_prompts.join(" | ")],
  ]

  const rawFlags = fieldPairs.flatMap(([field, text]) => detectRuleFlags(field, text))
  const flags = uniqueStrings(rawFlags.map((item) => `risk_word:${item.flag}:${item.hit}`)).slice(0, 50)

  const highCount = rawFlags.filter((item) => item.level === "high").length
  const total = rawFlags.length

  let riskLevel: RiskLevel = "safe"
  if (highCount >= 2 || total >= 5) {
    riskLevel = "high"
  } else if (total >= 1) {
    riskLevel = "medium"
  }

  return {
    risk_level: riskLevel,
    flags,
  }
}

function normalizeIncomingRiskLevel(level: string | undefined): RiskLevel {
  if (level === "high") return "high"
  if (level === "medium") return "medium"
  return "safe"
}

function mergeRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return SEVERITY_WEIGHT[a] >= SEVERITY_WEIGHT[b] ? a : b
}

export function applyRewriteCompliance(opts: {
  result: RewriteResult
  avoidRiskWords: boolean
  modelCompliance?: RewriteComplianceReport | null
}): {
  result: RewriteResult
  compliance_report: ComplianceReport
  shouldFail: boolean
} {
  const normalized = normalizeResult(opts.result)
  const rewritten = opts.avoidRiskWords ? sanitizeResult(normalized) : normalized

  const localReport = detectLocalCompliance(rewritten)
  const modelReport = opts.modelCompliance
    ? {
        risk_level: normalizeIncomingRiskLevel(opts.modelCompliance.risk_level),
        flags: uniqueStrings(opts.modelCompliance.flags).slice(0, 50),
      }
    : { risk_level: "safe" as RiskLevel, flags: [] }

  const mergedRiskLevel = mergeRiskLevel(localReport.risk_level, modelReport.risk_level)
  const mergedFlags = uniqueStrings([...localReport.flags, ...modelReport.flags]).slice(0, 50)

  return {
    result: rewritten,
    compliance_report: {
      risk_level: mergedRiskLevel,
      flags: mergedFlags,
    },
    shouldFail: opts.avoidRiskWords && mergedRiskLevel === "high",
  }
}
