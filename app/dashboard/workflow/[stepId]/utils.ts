// 工作流步骤工具函数

import type { WorkflowStepConfig } from "@/lib/workflow/types"
import type { Conversation, Message as DbMessage } from "@/lib/supabase"

// 消息类型
export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
  timestamp: Date
}

// 步骤依赖关系配置
export const stepDependencies: Record<string, string[]> = {
  'P1': [],
  'P2': ['P1'],
  'P3': ['P1', 'P2'],
  'IP传记': [],
  'P4': ['P1', 'P2', 'P3', 'IP传记'],
  'P5': ['P4'],
  'P6': ['P1', 'P2', 'P3', 'IP传记', 'P4', 'P5'],
  'P7': ['P1', 'P3', 'P6', 'IP传记'],
  'P8': ['P7'],
  'P9': ['P8'],
  'P10': ['P9'],
}

// 报告标题映射
export const reportTitles: Record<string, string> = {
  P1: "《行业目标分析报告》",
  P2: "《行业认知深度报告》",
  P3: "《情绪价值分析报告》",
  'IP传记': "《IP传记》",
  P4: "《IP概念》",
  P5: "《IP类型定位报告》",
  P6: "《4X4内容规划报告》",
  P7: "《选题库》",
  P8: "《脚本初稿》",
  P9: "《口语化终稿》",
  P10: "《迭代管理》",
}

// 报告检测配置
export const reportDetectionPatterns: Record<string, {
  titlePatterns: string[]
  sectionPatterns: string[]
  minSections: number
}> = {
  P1: {
    titlePatterns: ["行业分析", "目标分析"],
    sectionPatterns: ["行业规模", "竞争", "机会", "核心指标", "5A", "行业周期", "客群"],
    minSections: 2,
  },
  P2: {
    titlePatterns: ["认知深度", "认知分析"],
    sectionPatterns: ["层", "级", "深", "浅", "专", "入门", "进阶"],
    minSections: 2,
  },
  P3: {
    titlePatterns: ["情绪价值", "情绪分析"],
    sectionPatterns: ["焦虑", "恐惧", "渴望", "愤怒", "痛点"],
    minSections: 2,
  },
  "IP传记": {
    titlePatterns: ["IP传记", "传记", "故事"],
    sectionPatterns: ["转折点", "高光时刻", "低谷时刻", "关键决定", "故事"],
    minSections: 2,
  },
  P4: {
    titlePatterns: ["IP概念"],
    sectionPatterns: ["定位", "人设", "差异", "标签", "锚点"],
    minSections: 2,
  },
  P5: {
    titlePatterns: ["类型定位", "IP类型"],
    sectionPatterns: ["专业", "娱乐", "记者", "主副", "模型"],
    minSections: 2,
  },
  P6: {
    titlePatterns: ["4X4", "内容规划"],
    sectionPatterns: ["选题", "形式", "周期", "规划", "矩阵"],
    minSections: 2,
  },
  P7: {
    titlePatterns: ["选题库", "TOP"],
    sectionPatterns: ["选题", "IP相关", "行业热点", "标题", "角度"],
    minSections: 2,
  },
  P8: {
    titlePatterns: ["脚本", "创作初稿"],
    sectionPatterns: ["开头", "正文", "结尾", "钩子", "金句", "转场"],
    minSections: 2,
  },
  P9: {
    titlePatterns: ["口语化", "终稿"],
    sectionPatterns: ["AI痕", "口语化", "自然", "流畅"],
    minSections: 2,
  },
  P10: {
    titlePatterns: ["迭代", "管理"],
    sectionPatterns: ["数据反馈", "优化", "复盘", "迭代"],
    minSections: 2,
  },
}

// 检测AI输出内容是否包含完整报告
export function detectReportInContent(content: string, stepId: string): {
  isReport: boolean
  reportContent: string | null
  confidence: number
} {
  if (content.length < 300) {
    return { isReport: false, reportContent: null, confidence: 0 }
  }

  const patterns = reportDetectionPatterns[stepId]
  let confidence = 0

  const matchedKeywords = ['分析', '报告', '建议', '总结', '结论', '策略', '方案']
    .filter((kw) => content.includes(kw))
  confidence += Math.min(matchedKeywords.length * 8, 24)

  const headingCount = (content.match(/^#{1,3}\s+/gm) || []).length
  const listCount = (content.match(/^[-*]\s+|^\d+\.\s+/gm) || []).length
  if (headingCount >= 1) confidence += 15
  if (headingCount >= 3) confidence += 10
  if (listCount >= 3) confidence += 8
  if (content.length > 1200) confidence += 8
  if (content.length > 2500) confidence += 10

  if (patterns) {
    const hasTitlePattern = patterns.titlePatterns.some((p) =>
      content.toLowerCase().includes(p.toLowerCase())
    )
    if (hasTitlePattern) confidence += 25

    const matchedSections = patterns.sectionPatterns.filter((p) => content.includes(p))
    confidence += Math.min(matchedSections.length * 5, 25)
  }

  const isReport = confidence >= 45
  return { isReport, reportContent: isReport ? content : null, confidence }
}

// 安全解码URI组件
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// 格式化相对时间
export function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  return date.toLocaleDateString('zh-CN')
}

// 规范化对话标题
export function normalizeConversationTitle(text: string, maxLen = 28) {
  let s = (text || "").trim()
  if (!s) return ""

  s = s.replace(/\r/g, "")
  s = s.replace(/^>+\s*/g, "")
  s = s.replace(/^#{1,6}\s*/g, "")
  s = s.replace(/^\s*[-*]\s+/g, "")
  s = s.replace(/^\s*\d+\.\s+/g, "")

  const firstNonEmptyLine = s.split("\\n").find((line) => line.trim())?.trim() || ""
  s = firstNonEmptyLine

  s = s.split(/[。！？?]/)[0] || s
  s = s.replace(/\s+/g, " ").trim()
  s = s.replace(/^\"+/, "").replace(/\"+$/, "").trim()

  if (s.length > maxLen) return `${s.slice(0, maxLen)}…`
  return s
}

// 派生对话主题
export function deriveConversationTopic(conversation: Conversation, fallbackStepTitle: string) {
  const genericShort = new Set([
    "继续", "开始", "好的", "好", "嗯", "行", "可以", "ok", "OK", "yes", "Yes", "是", "吧"
  ])

  const isInjectedReportsMessage = (content: string) => {
    const t = content.trim()
    return (
      t.startsWith("以下是我之前生成的报告") ||
      t.startsWith("以下是之前生成的报告") ||
      t.startsWith("以下是我之前生成的") ||
      t.includes("已获取的前置报告")
    )
  }

  const msgs = Array.isArray(conversation.messages) ? conversation.messages : []
  const userMessages = msgs.filter((m) => m.role === "user" && typeof m.content === "string")
  for (const m of userMessages) {
    const raw = m.content?.trim() || ""
    if (!raw) continue
    if (isInjectedReportsMessage(raw)) continue

    const title = normalizeConversationTitle(raw)
    if (!title) continue
    if (title.length <= 2 || genericShort.has(title)) continue
    return title
  }

  const assistantMessages = msgs.filter((m) => m.role === "assistant" && typeof m.content === "string")
  for (const m of assistantMessages) {
    const content = m.content?.trim() || ""
    if (!content) continue

    const heading = content.match(/^#{1,3}\\s+(.+)$/m)?.[1]
    if (heading) {
      const title = normalizeConversationTitle(heading)
      if (title) return title
    }

    const title = normalizeConversationTitle(content)
    if (title && title.length > 4) return title
  }
  return fallbackStepTitle ? ("New Chat - " + fallbackStepTitle) : "New Chat"
}

// 生成带前置报告的初始提示
export function generateInitialPromptWithReports(basePrompt: string, reports: Record<string, string>): string {
  const reportKeys = Object.keys(reports)
  if (reportKeys.length === 0) return basePrompt

  let reportsSection = '\n\n---\n\n📋 **已获取的前置报告**\n\n'
  reportsSection += '我已经收到了你在之前步骤生成的报告，会基于这些报告进行分析：\n\n'

  for (const depStepId of reportKeys) {
    const title = reportTitles[depStepId] || depStepId
    reportsSection += `- ${title}\n`
  }

  reportsSection += '\n---\n\n'

  return basePrompt + reportsSection
}

// 将消息转换为数据库格式
export function messagesToDbFormat(msgs: Message[]): DbMessage[] {
  return msgs
    .filter(m => m.id !== "initial")
    .map(m => ({
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      timestamp: m.timestamp.toISOString()
    }))
}
