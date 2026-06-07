import type { PrivateCopyModule, PrivateCopyOutput } from "./schema"

type RiskLevel = "low" | "medium" | "high"

const MEDICAL_TERMS = ["水光", "深层缺水", "医美", "治疗", "修复屏障", "永久", "逆龄"]
const PROMISE_TERMS = ["一定", "保证", "马上改善", "立刻变美", "彻底修复", "永久维持", "效果更好"]
const FAKE_PROOF_TERMS = ["很多顾客反馈", "刚有顾客说", "案例", "反馈特别好"]
const SMS_TERMS = ["短信", "退订", "模板审核", "群发"]
const PUBLIC_SALES_TERMS = ["预约", "到店", "价格", "疗程", "办卡", "优惠", "名额"]

function hasAny(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term))
}

function maxRisk(current: RiskLevel, next: RiskLevel): RiskLevel {
  const order: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 }
  return order[next] > order[current] ? next : current
}

export function runPrivateCopyGuardrails(opts: {
  module: PrivateCopyModule
  outputs: PrivateCopyOutput[]
}) {
  let level: RiskLevel = "low"
  const flags: string[] = []
  const outputs = opts.outputs.map((output) => {
    const text = output.text || ""
    const riskNotes = [...(output.riskNotes || [])]

    const medical = hasAny(text, MEDICAL_TERMS)
    if (medical.length) {
      level = maxRisk(level, "medium")
      flags.push(...medical.map((term) => `medical:${term}`))
      riskNotes.push("含偏医美或医疗化表达，复制前建议改成更温和的护理说法。")
    }

    const promises = hasAny(text, PROMISE_TERMS)
    if (promises.length) {
      level = maxRisk(level, "high")
      flags.push(...promises.map((term) => `promise:${term}`))
      riskNotes.push("含效果承诺表达，建议删除或改成观察状态。")
    }

    const fakeProof = hasAny(text, FAKE_PROOF_TERMS)
    if (fakeProof.length) {
      level = maxRisk(level, "high")
      flags.push(...fakeProof.map((term) => `fake_proof:${term}`))
      riskNotes.push("含未提供的顾客反馈或案例，建议删除。")
    }

    const sms = hasAny(text, SMS_TERMS)
    if (sms.length) {
      level = maxRisk(level, "high")
      flags.push(...sms.map((term) => `sms:${term}`))
      riskNotes.push("当前功能只生成微信文案，不应出现短信逻辑。")
    }

    if (opts.module === "moment_reply") {
      const publicSales = hasAny(text, PUBLIC_SALES_TERMS)
      if (publicSales.length) {
        level = maxRisk(level, "high")
        flags.push(...publicSales.map((term) => `public_sales:${term}`))
        riskNotes.push("朋友圈公开回复不应写预约、价格、疗程或到店邀请。")
      }
    }

    return { ...output, riskNotes: Array.from(new Set(riskNotes)).slice(0, 5) }
  })

  return {
    outputs,
    risk: {
      level,
      flags: Array.from(new Set(flags)).slice(0, 20),
    },
  }
}
