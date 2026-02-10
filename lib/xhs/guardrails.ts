import "server-only"

export type GuardrailFlag = {
  field: "body" | "cover_main" | "cover_sub" | "pinned_comment"
  rule: "cta" | "platform_name" | "medical" | "contact"
  match: string
}

// Body + cover must be extremely strict (no CTA words, no platform/transaction words).
// Pinned comment is allowed to be a CTA, but in v4 we explicitly forbid platform names (大众点评/抖音).
export const BODY_AND_COVER_BANNED_PATTERNS: Array<{ rule: GuardrailFlag["rule"]; re: RegExp; matchHint: string }> = [
  { rule: "cta", re: /评论|私信|关注|加V|加v|加\s*微\s*信|加\s*vx|预约|到店|进店/gi, matchHint: "互动/导流" },
  { rule: "platform_name", re: /大众点评|抖音|小红书/gi, matchHint: "平台名" },
  { rule: "cta", re: /团购|下单|买券|核销|价格|优惠|地址|定位|导航|链接/gi, matchHint: "交易/导流" },
  { rule: "contact", re: /微信|vx|v信|电话|手机号|二维码|扫码/gi, matchHint: "联系方式" },
  // Phone number patterns (avoid false positives for dates by requiring 7+ digits with optional separators)
  { rule: "contact", re: /\b1\d{10}\b/g, matchHint: "手机号" },
  { rule: "contact", re: /\b\d{7,}\b/g, matchHint: "长数字" },
]

export const PINNED_COMMENT_BANNED_PLATFORM_NAMES: Array<{ re: RegExp; matchHint: string }> = [
  { re: /大众点评/gi, matchHint: "大众点评" },
  { re: /抖音/gi, matchHint: "抖音" },
]

export const MEDICAL_BANNED_PATTERNS: Array<{ re: RegExp; matchHint: string }> = [
  { re: /治疗|根治|治好|包好|百分百|永久|立刻见效|立马见效|保证见效/gi, matchHint: "医疗/承诺" },
]

export function detectBodyAndCoverFlags(input: { body: string; coverMain: string; coverSub: string }): GuardrailFlag[] {
  const { body, coverMain, coverSub } = input
  const flags: GuardrailFlag[] = []

  const scan = (field: GuardrailFlag["field"], text: string) => {
    if (!text) return

    for (const p of BODY_AND_COVER_BANNED_PATTERNS) {
      const m = text.match(p.re)
      if (m && m.length) {
        for (const hit of Array.from(new Set(m.map((v) => String(v).trim()).filter(Boolean))).slice(0, 6)) {
          flags.push({ field, rule: p.rule, match: hit })
        }
      }
    }

    for (const p of MEDICAL_BANNED_PATTERNS) {
      const m = text.match(p.re)
      if (m && m.length) {
        for (const hit of Array.from(new Set(m.map((v) => String(v).trim()).filter(Boolean))).slice(0, 6)) {
          flags.push({ field, rule: "medical", match: hit })
        }
      }
    }
  }

  scan("body", body)
  scan("cover_main", coverMain)
  scan("cover_sub", coverSub)

  return flags
}

export function detectPinnedCommentFlags(pinnedComment: string): GuardrailFlag[] {
  const flags: GuardrailFlag[] = []
  if (!pinnedComment) return flags

  for (const p of PINNED_COMMENT_BANNED_PLATFORM_NAMES) {
    const m = pinnedComment.match(p.re)
    if (m && m.length) {
      for (const hit of Array.from(new Set(m.map((v) => String(v).trim()).filter(Boolean))).slice(0, 6)) {
        flags.push({ field: "pinned_comment", rule: "platform_name", match: hit })
      }
    }
  }

  // Still avoid contact collection in pinned comment.
  const contact = pinnedComment.match(/微信|vx|v信|电话|手机号|二维码|扫码|\b1\d{10}\b/gi)
  if (contact && contact.length) {
    for (const hit of Array.from(new Set(contact.map((v) => String(v).trim()).filter(Boolean))).slice(0, 6)) {
      flags.push({ field: "pinned_comment", rule: "contact", match: hit })
    }
  }

  return flags
}

