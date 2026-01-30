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
    maxLength: 60,
    isClassification: true,
  },
  {
    id: "target_audience",
    type: "text",
    question: "你主要卖给谁",
    description: "写清目标人群/场景（如：25-35岁白领、宝妈、小微老板）",
    placeholder: "例如：25-35岁通勤白领，午休时间有护肤需求",
    maxLength: 50,
    isClassification: true,
  },
  {
    id: "price_range",
    type: "single",
    question: "你的客单价/价格区间",
    isClassification: true,
    options: [
      { value: "low", label: "≤199元" },
      { value: "mid", label: "200-499元" },
      { value: "mid_high", label: "500-999元" },
      { value: "high", label: "1000-2999元" },
      { value: "premium", label: "3000元以上" },
    ],
  },
  {
    id: "tone",
    type: "single",
    question: "你希望脚本口吻",
    isClassification: true,
    options: [
      { value: "professional", label: "专业可信" },
      { value: "friendly", label: "亲和真诚" },
      { value: "direct", label: "干脆利落" },
      { value: "lively", label: "活泼有梗" },
      { value: "premium", label: "高端克制" },
    ],
  },
  {
    id: "current_problem",
    type: "multiple",
    question: "当前最大卡点（可多选）",
    isClassification: true,
    options: [
      { value: "topic_system_missing", label: "选题体系缺失" },
      { value: "calendar_blocked", label: "内容日历排不出来" },
      { value: "script_slow", label: "脚本产出慢/质量不稳" },
      { value: "qc_missing", label: "返工多口径乱（缺质检标准）" },
      { value: "conversion_unclear", label: "转化链路不清（内容有了但成交弱）" },
      { value: "archive_weak", label: "素材/知识不沉淀（复用差）" },
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
