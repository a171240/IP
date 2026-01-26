export interface Question {
  id: string
  type: "single" | "multiple" | "scale"
  question: string
  description?: string
  options: Option[]
  dimension?: Dimension
  weight?: number
  isClassification?: boolean
}

export interface Option {
  value: string
  label: string
  score?: number
  insight?: string
}

export type Dimension = "positioning" | "content" | "efficiency" | "emotion" | "conversion"

export const QUESTIONS: Question[] = [
  {
    id: "account_type",
    type: "single",
    question: "你是谁？",
    description: "选择最接近你的团队/角色",
    dimension: "positioning",
    weight: 1,
    options: [
      { value: "agency", label: "代运营团队", score: 7 },
      { value: "mcn", label: "MCN矩阵", score: 7 },
      { value: "brand_team", label: "品牌内容部", score: 8 },
      { value: "creator", label: "个人创作者", score: 6 },
    ],
  },
  {
    id: "industry",
    type: "single",
    question: "你的行业/赛道是？",
    description: "用于生成更贴合的交付包",
    isClassification: true,
    options: [
      { value: "food", label: "餐饮" },
      { value: "beauty", label: "美业" },
      { value: "education", label: "教育" },
      { value: "local_life", label: "本地生活" },
      { value: "ecommerce", label: "电商" },
      { value: "enterprise_service", label: "企业服务" },
      { value: "other", label: "其他" },
    ],
  },
  {
    id: "platform",
    type: "single",
    question: "你主战平台是？",
    dimension: "content",
    weight: 1,
    options: [
      { value: "xiaohongshu", label: "小红书", score: 7 },
      { value: "douyin", label: "抖音", score: 7 },
      { value: "video_account", label: "视频号", score: 7 },
      { value: "wechat", label: "公众号", score: 6 },
      { value: "multi", label: "多平台", score: 8 },
    ],
  },
  {
    id: "team_size",
    type: "single",
    question: "团队规模是？",
    dimension: "efficiency",
    weight: 1,
    options: [
      { value: "1", label: "1 人", score: 4 },
      { value: "2-3", label: "2-3 人", score: 6 },
      { value: "4-8", label: "4-8 人", score: 8 },
      { value: "9+", label: "9+ 人", score: 9 },
      { value: "outsourced", label: "外包协作", score: 6 },
    ],
  },
  {
    id: "delivery_mode",
    type: "single",
    question: "目前交付形态是？",
    dimension: "emotion",
    weight: 1,
    options: [
      { value: "ad_hoc", label: "靠经验口头对齐", score: 3 },
      { value: "partial_sop", label: "有部分 SOP", score: 5 },
      { value: "sop_unstable", label: "SOP 完整但执行不稳", score: 7 },
      { value: "sop_stable", label: "SOP 完整且可复盘", score: 9 },
    ],
  },
  {
    id: "current_problem",
    type: "multiple",
    question: "目前最大卡点是？",
    description: "可多选",
    dimension: "content",
    weight: 1,
    options: [
      { value: "topic_system_missing", label: "选题体系缺失", score: 4 },
      { value: "calendar_blocked", label: "内容日历排不出来", score: 4 },
      { value: "script_slow", label: "脚本产出慢/质量不稳", score: 5 },
      { value: "qc_missing", label: "返工多口径乱（缺质检标准）", score: 5 },
      { value: "conversion_weak", label: "转化链路不清（内容有了但成交弱）", score: 4 },
      { value: "archive_weak", label: "素材/知识不沉淀（复用差）", score: 6 },
    ],
  },
  {
    id: "weekly_output",
    type: "single",
    question: "周产出能力是？",
    dimension: "efficiency",
    weight: 1,
    options: [
      { value: "0-2", label: "0-2", score: 3 },
      { value: "3-5", label: "3-5", score: 5 },
      { value: "6-15", label: "6-15", score: 7 },
      { value: "16+", label: "16+", score: 9 },
    ],
  },
  {
    id: "goal",
    type: "single",
    question: "你希望 30 天内达成什么？",
    dimension: "conversion",
    weight: 1,
    options: [
      { value: "acquisition", label: "拉新获客", score: 6 },
      { value: "trust", label: "建立信任", score: 6 },
      { value: "conversion", label: "成交转化", score: 9 },
      { value: "delivery_stable", label: "团队交付稳定", score: 8 },
      { value: "multi_project", label: "多项目并行", score: 7 },
    ],
  },
]

export const DIMENSIONS = {
  positioning: {
    name: "交付定位",
    description: "团队角色与交付方向的清晰度",
    maxScore: 10,
    relatedSteps: ["P1", "P2", "P4"],
    agentIds: ["ip-positioning"],
  },
  content: {
    name: "内容供给",
    description: "选题与脚本产出的体系化程度",
    maxScore: 10,
    relatedSteps: ["P7", "P8"],
    agentIds: ["topic-generator"],
  },
  efficiency: {
    name: "产能效率",
    description: "团队产出节奏与协作效率",
    maxScore: 10,
    relatedSteps: ["P6", "P10"],
    agentIds: ["iteration-manager"],
  },
  emotion: {
    name: "质检复盘",
    description: "交付质量与复盘沉淀能力",
    maxScore: 10,
    relatedSteps: ["P3"],
    agentIds: ["quality-checker"],
  },
  conversion: {
    name: "成交转化",
    description: "内容到成交的链路完整度",
    maxScore: 10,
    relatedSteps: ["P6"],
    agentIds: ["conversion-optimizer"],
  },
} as const

export const INDUSTRY_LABELS: Record<string, string> = {
  food: "餐饮",
  beauty: "美业",
  education: "教育",
  local_life: "本地生活",
  ecommerce: "电商",
  enterprise_service: "企业服务",
  other: "其他",
}
