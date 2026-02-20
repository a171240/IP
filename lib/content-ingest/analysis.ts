import type { ProfileAnalysis } from "@/lib/content-ingest/types"
import type { ExtractedPayload } from "@/lib/types/content-pipeline"

function normalizeLine(input: string): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
}

function pickTopicCandidates(items: ExtractedPayload[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const pool = [item.title, item.text]

    for (const text of pool) {
      if (!text) continue
      const segments = normalizeLine(text)
        .split(/[。.!！?？,，;；:：|｜\-]+/)
        .map((segment) => normalizeLine(segment))
        .filter((segment) => segment.length >= 4 && segment.length <= 24)

      for (const segment of segments) {
        if (seen.has(segment)) continue
        seen.add(segment)
        out.push(segment)
        if (out.length >= 8) return out
      }
    }
  }

  return out
}

function detectHookPatterns(items: ExtractedPayload[]): string[] {
  const patterns = new Set<string>()

  for (const item of items) {
    const title = `${item.title} ${item.text}`

    if (/[?？]/.test(title)) patterns.add("疑问开场")
    if (/\d+/.test(title)) patterns.add("数字结果型")
    if (/(为什么|怎么|如何|步骤|教程)/.test(title)) patterns.add("方法教学型")
    if (/(避坑|不要|别再|误区|踩雷)/.test(title)) patterns.add("避坑警示型")
    if (/(对比|前后|变化|翻车|反差)/.test(title)) patterns.add("前后对比型")
  }

  const fallback = ["场景痛点切入", "结果承诺切入", "步骤拆解切入"]
  for (const item of fallback) {
    if (patterns.size >= 5) break
    patterns.add(item)
  }

  return Array.from(patterns)
}

function buildScriptPack(topics: string[], hooks: string[]): string[] {
  const topicA = topics[0] || "同城用户常见痛点"
  const topicB = topics[1] || "服务前后变化"
  const topicC = topics[2] || "成交关键动作"

  const hookA = hooks[0] || "疑问开场"
  const hookB = hooks[1] || "数字结果型"
  const hookC = hooks[2] || "步骤拆解切入"

  return [
    `脚本1（${hookA}）：3秒抛出问题“${topicA}为什么一直做不好？”→10秒给结论→15秒给行动建议。`,
    `脚本2（${hookB}）：开头先报结果，围绕“${topicB}”讲前后对比，再用1句行动召唤收尾。`,
    `脚本3（${hookC}）：按“问题-方法-结果”三段讲“${topicC}”，结尾给可执行清单。`,
  ]
}

export function buildProfileAnalysis(items: ExtractedPayload[]): ProfileAnalysis {
  const topics = pickTopicCandidates(items)
  const hooks = detectHookPatterns(items)
  const scriptPack = buildScriptPack(topics, hooks)

  return {
    topic_clusters: topics.slice(0, 6),
    hook_patterns: hooks.slice(0, 6),
    script_pack: scriptPack.length >= 3 ? scriptPack : [...scriptPack, "脚本补充1", "脚本补充2", "脚本补充3"].slice(0, 3),
  }
}
