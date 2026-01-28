export interface Question {
  id: string
  type: "single" | "multiple" | "text"
  question: string
  description?: string
  options?: Option[]
  placeholder?: string
  maxLength?: number
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
    id: "team_type",
    type: "single",
    question: "你的团队类型是？",
    description: "用于匹配交付包风格",
    isClassification: true,
    options: [
      { value: "agency", label: "代运营团队" },
      { value: "mcn", label: "MCN矩阵" },
      { value: "brand_team", label: "品牌内容部" },
      { value: "local_store", label: "本地生活门店" },
      { value: "creator", label: "个人" },
    ],
  },
  {
    id: "team_size",
    type: "single",
    question: "团队规模",
    isClassification: true,
    options: [
      { value: "1-3", label: "1-3人" },
      { value: "4-8", label: "4-8人" },
      { value: "9-20", label: "9-20人" },
      { value: "20_plus", label: "20人以上" },
    ],
  },
  {
    id: "industry",
    type: "single",
    question: "你的行业/赛道",
    description: "用于生成更贴合行业的内容",
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
    question: "你的主战平台",
    isClassification: true,
    options: [
      { value: "xiaohongshu", label: "小红书" },
      { value: "douyin", label: "抖音" },
      { value: "video_account", label: "视频号" },
      { value: "wechat", label: "公众号" },
    ],
  },
  {
    id: "offer_type",
    type: "single",
    question: "你的主要成交类型",
    isClassification: true,
    options: [
      { value: "service", label: "服务交付" },
      { value: "course", label: "课程" },
      { value: "ecommerce_product", label: "产品电商" },
      { value: "saas", label: "SaaS工具" },
      { value: "other", label: "其他" },
    ],
  },
  {
    id: "offer_desc",
    type: "text",
    question: "一句话说明你卖什么",
    description: "20-40字即可，越具体越好",
    placeholder: "例如：为餐饮连锁做小红书代运营，主打引流到店与转化",
    maxLength: 50,
    isClassification: true,
  },
  {
    id: "sop_level",
    type: "single",
    question: "是否有 SOP（选题/脚本/质检/归档）",
    dimension: "efficiency",
    weight: 1,
    options: [
      { value: "none", label: "几乎没有", score: 3 },
      { value: "partial", label: "有部分SOP", score: 6 },
      { value: "mostly", label: "大部分环节清晰", score: 8 },
      { value: "complete", label: "完整且可复盘", score: 10 },
    ],
  },
  {
    id: "guideline_level",
    type: "single",
    question: "是否有统一口径/禁词/风格指南",
    dimension: "positioning",
    weight: 1,
    options: [
      { value: "none", label: "没有", score: 3 },
      { value: "partial", label: "部分有规范", score: 6 },
      { value: "clear", label: "口径清晰且能执行", score: 9 },
    ],
  },
  {
    id: "topic_library",
    type: "single",
    question: "是否有选题库（字段/去重/复用）",
    dimension: "content",
    weight: 1,
    options: [
      { value: "none", label: "没有体系", score: 3 },
      { value: "basic", label: "有基础清单", score: 6 },
      { value: "mature", label: "字段齐全可复用", score: 9 },
    ],
  },
  {
    id: "multi_project",
    type: "single",
    question: "多项目并行怎么管理",
    dimension: "efficiency",
    weight: 1,
    options: [
      { value: "none", label: "没有负责人/节奏", score: 3 },
      { value: "basic", label: "有负责人但节奏不稳", score: 6 },
      { value: "clear", label: "负责人明确且排产稳定", score: 9 },
    ],
  },
  {
    id: "script_review",
    type: "single",
    question: "脚本如何审稿",
    dimension: "emotion",
    weight: 1,
    options: [
      { value: "none", label: "基本不审稿", score: 3 },
      { value: "one_round", label: "一轮审核", score: 6 },
      { value: "multi_round", label: "多轮+标准清晰", score: 9 },
    ],
  },
  {
    id: "qc_process",
    type: "single",
    question: "质检有没有清单",
    dimension: "emotion",
    weight: 1,
    options: [
      { value: "none", label: "没有", score: 3 },
      { value: "partial", label: "有部分清单", score: 6 },
      { value: "clear", label: "清单完整可执行", score: 9 },
    ],
  },
  {
    id: "conversion_path",
    type: "single",
    question: "成交路径是什么",
    dimension: "conversion",
    weight: 1,
    options: [
      { value: "unclear", label: "不清楚", score: 3 },
      { value: "basic", label: "有简单路径", score: 6 },
      { value: "clear", label: "路径清晰可复用", score: 9 },
    ],
  },
  {
    id: "review_frequency",
    type: "single",
    question: "数据复盘频率",
    dimension: "efficiency",
    weight: 1,
    options: [
      { value: "none", label: "几乎不复盘", score: 3 },
      { value: "monthly", label: "每月一次", score: 6 },
      { value: "weekly", label: "每周复盘", score: 9 },
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
    description: "选题与脚本的体系化供给能力",
    maxScore: 10,
    relatedSteps: ["P7", "P8"],
    agentIds: ["topic-generator"],
  },
  efficiency: {
    name: "产能效率",
    description: "协作节奏与排产稳定性",
    maxScore: 10,
    relatedSteps: ["P6", "P10"],
    agentIds: ["iteration-manager"],
  },
  emotion: {
    name: "质检复盘",
    description: "交付质量与复盘机制",
    maxScore: 10,
    relatedSteps: ["P3"],
    agentIds: ["quality-checker"],
  },
  conversion: {
    name: "成交转化",
    description: "内容到成交的承接完整度",
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
