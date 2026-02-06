export function normalizeTopicKey(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
}

function stripRiskSuffix(input: string): string {
  let s = String(input || "").trim()
  if (!s) return s

  // Remove common risk annotations like: （风险：低） / (risk: high)
  s = s.replace(/（[^）]{0,40}(风险|risk)[^）]*）/gi, "").trim()
  s = s.replace(/\([^)]{0,40}(风险|risk)[^)]*\)/gi, "").trim()
  s = s.replace(/\[[^\]]{0,40}(风险|risk)[^\]]*\]/gi, "").trim()

  // Remove inline "风险：低/中/高" tail
  s = s.replace(/\s*[,，;；]?\s*(风险|risk)\s*[:：]\s*(低|中|高|low|medium|high|critical)\s*$/gi, "").trim()
  return s
}

function stripListPrefix(line: string): string {
  const s = String(line || "").trim()
  if (!s) return ""

  // 1) / 1. / 1、 / 1.1) / 1） etc.
  const numbered = s.match(/^\d+(?:\.\d+)*\s*[\.、\)]\s*(.+)$/)
  if (numbered) return numbered[1].trim()

  const bullet = s.match(/^[-*•]\s+(.+)$/)
  if (bullet) return bullet[1].trim()

  return s
}

function isLikelyNoise(s: string): boolean {
  const t = s.trim()
  if (!t) return true

  // Headings / meta lines
  if (/^(要求|注意|说明|提示|输出|结构|评分|风险|结尾|正文|钩子|置顶评论)\b/.test(t)) return true
  if (/^top\s*\d+/i.test(t)) return true
  if (/^day\s*\d+/i.test(t)) return false // keep day titles; they can be topics

  return false
}

export function extractTopicsFromText(content: string, max = 200): string[] {
  const text = String(content || "")
  if (!text.trim()) return []

  const lines = text.split(/\r?\n/)
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of lines) {
    let s = String(raw || "").trim()
    if (!s) continue

    // Basic markdown heading cleanup
    s = s.replace(/^#+\s*/, "").trim()

    s = stripListPrefix(s)
    s = stripRiskSuffix(s)
    s = s.replace(/\s+/g, " ").trim()

    if (isLikelyNoise(s)) continue
    if (s.length < 4) continue
    if (s.length > 120) continue

    const key = normalizeTopicKey(s)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }

  return out
}

