import "server-only"

import type { PrivateCopyOutput, PrivateCopyRisk } from "@/lib/private-copy/types"

const HIGH_RISK_PATTERNS = [
  /根治|治愈|包好|永久|百分百|立刻见效|立马见效|保证见效/g,
  /最低价|全网最低|唯一|第一|绝对/g,
  /\b1\d{10}\b/g,
  /微信号|加V|加v|vx|VX|二维码|扫码/g,
]

const MEDIUM_RISK_PATTERNS = [
  /价格|多少钱|报价|优惠|活动价/g,
  /祛斑|祛痘|抗衰|医美|治疗/g,
  /到店|预约|下单/g,
]

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

export function sanitizePrivateCopyText(text: string) {
  return String(text || "")
    .replace(/\b1\d{10}\b/g, "联系方式")
    .replace(/微信号|加V|加v|vx|VX|二维码|扫码/g, "联系方式")
    .replace(/根治|治愈|包好|永久|百分百|立刻见效|立马见效|保证见效/g, "护理改善")
    .replace(/最低价|全网最低|唯一|第一|绝对/g, "更适合")
    .trim()
}

export function assessPrivateCopyRisk(outputs: PrivateCopyOutput[]): PrivateCopyRisk {
  const text = outputs.map((item) => [item.text, item.privateMessageSuggestion, ...(item.riskNotes || [])].join("\n")).join("\n")
  const high = unique(HIGH_RISK_PATTERNS.flatMap((pattern) => text.match(pattern) || []))
  if (high.length) return { level: "high", flags: high.slice(0, 8) }

  const medium = unique(MEDIUM_RISK_PATTERNS.flatMap((pattern) => text.match(pattern) || []))
  if (medium.length) return { level: "medium", flags: medium.slice(0, 8) }

  return { level: "low", flags: [] }
}
