export interface Question {
  id: string
  type: 'single' | 'multiple' | 'scale'
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

export type Dimension = 'positioning' | 'content' | 'efficiency' | 'emotion' | 'conversion'

export const QUESTIONS: Question[] = [
  {
    id: 'q1',
    type: 'single',
    question: '你的行业/赛道是？',
    description: '选择你主要从事的领域',
    isClassification: true,
    options: [
      { value: 'food', label: '餐饮/食品' },
      { value: 'beauty', label: '美业/美妆' },
      { value: 'education', label: '教育/培训' },
      { value: 'realestate', label: '房产/家居' },
      { value: 'finance', label: '金融/保险' },
      { value: 'ecommerce', label: '电商/零售' },
      { value: 'knowledge', label: '知识付费/咨询' },
      { value: 'tech', label: '科技/互联网' },
      { value: 'health', label: '健康/医疗' },
      { value: 'other', label: '其他行业' }
    ]
  },
  {
    id: 'q2',
    type: 'multiple',
    question: '你目前遇到的内容困境是？',
    description: '可多选，选择所有符合的情况',
    dimension: 'positioning',
    weight: 0.25,
    options: [
      { value: 'no_position', label: '不知道怎么定位IP', score: 20, insight: 'IP定位模糊是最大的瓶颈' },
      { value: 'no_topic', label: '选题枯竭，不知道拍什么', score: 40, insight: '缺乏系统的选题库' },
      { value: 'slow_script', label: '脚本写不出来/很耗时', score: 50, insight: '需要脚本生产工具' },
      { value: 'no_traffic', label: '内容没流量/数据差', score: 60, insight: '可能是内容策略问题' },
      { value: 'no_convert', label: '有流量但不变现', score: 70, insight: '转化链路需要优化' },
      { value: 'low_efficiency', label: '团队执行效率低', score: 50, insight: '需要标准化流程' }
    ]
  },
  {
    id: 'q3',
    type: 'single',
    question: '你现在的内容产出频率是？',
    dimension: 'efficiency',
    weight: 0.20,
    options: [
      { value: 'not_started', label: '还没开始做', score: 20 },
      { value: '1-2_week', label: '每周1-2条', score: 50 },
      { value: '3-5_week', label: '每周3-5条', score: 80 },
      { value: 'daily', label: '日更或以上', score: 100 }
    ]
  },
  {
    id: 'q4',
    type: 'single',
    question: '你做IP内容的主要目标是？',
    dimension: 'conversion',
    weight: 0.20,
    options: [
      { value: 'brand', label: '品牌曝光/知名度', score: 70 },
      { value: 'private', label: '私域引流/加微信', score: 90 },
      { value: 'sales', label: '直接卖货/成交', score: 100 },
      { value: 'influence', label: '建立行业影响力', score: 80 }
    ]
  },
  {
    id: 'q5',
    type: 'single',
    question: '你或团队愿意出镜吗？',
    dimension: 'positioning',
    weight: 0.20,
    options: [
      { value: 'experienced', label: '愿意，且有出镜经验', score: 100 },
      { value: 'willing', label: '愿意，但不知道怎么做', score: 70 },
      { value: 'unwilling', label: '不愿意出镜', score: 40 },
      { value: 'virtual', label: '可以接受虚拟形象', score: 60 }
    ]
  },
  {
    id: 'q6',
    type: 'single',
    question: '你目前的内容团队规模？',
    dimension: 'efficiency',
    weight: 0.15,
    options: [
      { value: 'solo', label: '我一个人', score: 60 },
      { value: 'small', label: '2-3人小团队', score: 80 },
      { value: 'medium', label: '5人以上团队', score: 100 },
      { value: 'outsource', label: '外包/代运营', score: 70 }
    ]
  },
  {
    id: 'q7',
    type: 'single',
    question: '你期望多久看到效果？',
    dimension: 'emotion',
    weight: 0.20,
    options: [
      { value: '1month', label: '1个月内', score: 40, insight: '期望过高可能导致焦虑' },
      { value: '3months', label: '3个月', score: 70, insight: '比较合理的预期' },
      { value: '6months', label: '半年', score: 100, insight: '长期主义思维' },
      { value: 'unclear', label: '没想清楚', score: 30, insight: '需要先明确目标' }
    ]
  },
  {
    id: 'q8',
    type: 'single',
    question: '你最大的障碍是什么？',
    dimension: 'emotion',
    weight: 0.25,
    options: [
      { value: 'no_execution', label: '执行力差/坚持不下去', score: 20, insight: '最核心的障碍，需要建立习惯系统' },
      { value: 'no_method', label: '没有方法论/不知道怎么做', score: 35, insight: '可通过系统学习解决' },
      { value: 'no_time', label: '没时间', score: 50, insight: '需要提升效率或调整优先级' },
      { value: 'no_skill', label: '不会写/不会拍', score: 65, insight: '可借助AI工具快速提升' },
      { value: 'no_budget', label: '预算有限', score: 80, insight: '相对较容易通过规划解决' }
    ]
  }
]

export const DIMENSIONS = {
  positioning: {
    name: 'IP定位',
    description: 'IP人设的清晰度和差异化程度',
    maxScore: 25,
    relatedSteps: ['P1', 'P2', 'P4', 'P5'],
    agentIds: ['ip-concept', 'ip-biography', 'ip-positioning']
  },
  content: {
    name: '内容生产',
    description: '选题规划和脚本创作能力',
    maxScore: 25,
    relatedSteps: ['P7', 'P8', 'P9'],
    agentIds: ['topic-generator', 'script-center', 'style-optimizer']
  },
  efficiency: {
    name: '效率系统',
    description: '内容生产的效率和稳定性',
    maxScore: 20,
    relatedSteps: ['P6', 'P10'],
    agentIds: ['4x4-planner', 'iteration-manager']
  },
  emotion: {
    name: '情绪价值',
    description: '内容的情绪感染力和共鸣度',
    maxScore: 15,
    relatedSteps: ['P3', 'IP传记'],
    agentIds: ['emotion-analyzer', 'resonance-script']
  },
  conversion: {
    name: '转化能力',
    description: '内容到商业变现的转化效率',
    maxScore: 15,
    relatedSteps: ['4X4配比', '转化内容'],
    agentIds: ['conversion-optimizer', 'promo-script']
  }
} as const

export const INDUSTRY_LABELS: Record<string, string> = {
  food: '餐饮/食品',
  beauty: '美业/美妆',
  education: '教育/培训',
  realestate: '房产/家居',
  finance: '金融/保险',
  ecommerce: '电商/零售',
  knowledge: '知识付费/咨询',
  tech: '科技/互联网',
  health: '健康/医疗',
  other: '其他行业'
}
