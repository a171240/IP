// IP内容工厂 - 数据分析与埋点工具
// 用于追踪用户行为、转化漏斗和使用统计

// 事件类型定义
export type AnalyticsEvent =
  // 页面访问
  | 'page_view'
  // 快速体验相关
  | 'quick_start_view'
  | 'quick_start_agent_select'
  | 'quick_start_generate'
  | 'quick_start_copy'
  | 'quick_start_regenerate'
  // 转化相关
  | 'cta_upgrade_click'
  | 'cta_pricing_view'
  | 'cta_first_order_click'
  | 'cta_workflow_click'
  // 用户旅程
  | 'signup_start'
  | 'signup_complete'
  | 'login'
  | 'subscription_start'
  | 'subscription_complete'
  // 工作流相关
  | 'workflow_step_start'
  | 'workflow_step_complete'
  | 'workflow_document_generate'

// 事件属性
export interface AnalyticsProperties {
  // 通用属性
  page?: string
  source?: string
  // 快速体验属性
  agent_type?: string
  industry?: string
  city?: string
  ip_style?: string
  generation_count?: number
  // 转化属性
  plan_name?: string
  price?: number
  promo_code?: string
  // 工作流属性
  step_id?: string
  document_type?: string
  // 其他
  [key: string]: string | number | boolean | undefined
}

// 使用统计数据结构
export interface UsageStats {
  totalUsers: number
  todayGenerations: number
  totalGenerations: number
  lastUpdated: string
}

// 本地存储键
const STORAGE_KEYS = {
  USAGE_COUNT: 'quickStartUsageCount',
  USER_ID: 'analytics_user_id',
  SESSION_ID: 'analytics_session_id',
  EVENTS_QUEUE: 'analytics_events_queue',
} as const

// 生成唯一ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// 获取或创建用户ID
export function getUserId(): string {
  if (typeof window === 'undefined') return 'server'

  let userId = localStorage.getItem(STORAGE_KEYS.USER_ID)
  if (!userId) {
    userId = `user_${generateId()}`
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId)
  }
  return userId
}

// 获取或创建会话ID
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  let sessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID)
  if (!sessionId) {
    sessionId = `session_${generateId()}`
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId)
  }
  return sessionId
}

// 追踪事件
export function trackEvent(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties
): void {
  if (typeof window === 'undefined') return

  const eventData = {
    event,
    properties: {
      ...properties,
      timestamp: new Date().toISOString(),
      user_id: getUserId(),
      session_id: getSessionId(),
      url: window.location.href,
      referrer: document.referrer,
    },
  }

  // 开发环境打印日志
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', eventData)
  }

  // 将事件加入队列（可以后续批量发送到后端）
  const queue = getEventsQueue()
  queue.push(eventData)
  localStorage.setItem(STORAGE_KEYS.EVENTS_QUEUE, JSON.stringify(queue.slice(-100))) // 保留最近100条

  // TODO: 发送到后端分析服务
  // sendToAnalyticsServer(eventData)
}

// 获取事件队列
function getEventsQueue(): Array<{ event: string; properties: Record<string, unknown> }> {
  try {
    const queue = localStorage.getItem(STORAGE_KEYS.EVENTS_QUEUE)
    return queue ? JSON.parse(queue) : []
  } catch {
    return []
  }
}

// 快速体验专用追踪函数
export const quickStartAnalytics = {
  // 查看快速体验页面
  trackView() {
    trackEvent('quick_start_view')
  },

  // 选择智能体
  trackAgentSelect(agentType: string) {
    trackEvent('quick_start_agent_select', { agent_type: agentType })
  },

  // 生成内容
  trackGenerate(agentType: string, industry?: string, ipStyle?: string) {
    trackEvent('quick_start_generate', {
      agent_type: agentType,
      industry,
      ip_style: ipStyle,
      generation_count: getUsageCount(),
    })
  },

  // 复制结果
  trackCopy(agentType: string) {
    trackEvent('quick_start_copy', { agent_type: agentType })
  },

  // 重新生成
  trackRegenerate(agentType: string) {
    trackEvent('quick_start_regenerate', { agent_type: agentType })
  },
}

// 转化追踪函数
export const conversionAnalytics = {
  // 点击升级按钮
  trackUpgradeClick(source: string, planName?: string) {
    trackEvent('cta_upgrade_click', { source, plan_name: planName })
  },

  // 查看定价页
  trackPricingView(source?: string) {
    trackEvent('cta_pricing_view', { source })
  },

  // 点击首单特惠
  trackFirstOrderClick(source: string) {
    trackEvent('cta_first_order_click', { source })
  },

  // 点击查看工作流
  trackWorkflowClick(source: string) {
    trackEvent('cta_workflow_click', { source })
  },
}

// 获取使用次数
export function getUsageCount(): number {
  if (typeof window === 'undefined') return 0
  const count = localStorage.getItem(STORAGE_KEYS.USAGE_COUNT)
  return count ? parseInt(count, 10) : 0
}

// 增加使用次数
export function incrementUsageCount(): number {
  if (typeof window === 'undefined') return 0
  const newCount = getUsageCount() + 1
  localStorage.setItem(STORAGE_KEYS.USAGE_COUNT, newCount.toString())
  return newCount
}

// 模拟获取全局统计数据（实际应从API获取）
export function getGlobalStats(): UsageStats {
  // TODO: 替换为真实API调用
  // 目前返回模拟数据，后续可以接入真实后端
  const baseUsers = 2847
  const baseGenerations = 45000
  const todayBase = 1293

  // 添加一些随机变化使数据看起来更真实
  const randomOffset = Math.floor(Math.random() * 50)

  return {
    totalUsers: baseUsers + Math.floor(Date.now() / 100000000) % 200,
    todayGenerations: todayBase + randomOffset,
    totalGenerations: baseGenerations + Math.floor(Date.now() / 10000000) % 5000,
    lastUpdated: new Date().toISOString(),
  }
}

// 格式化数字（添加千位分隔符）
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN')
}

// 转化漏斗阶段
export const FUNNEL_STAGES = {
  VISIT: 'visit',           // 访问网站
  QUICK_START: 'quick_start', // 进入快速体验
  GENERATE: 'generate',     // 生成内容
  VIEW_CTA: 'view_cta',     // 看到转化CTA
  CLICK_CTA: 'click_cta',   // 点击CTA
  VIEW_PRICING: 'view_pricing', // 查看定价
  START_PAYMENT: 'start_payment', // 开始支付
  COMPLETE_PAYMENT: 'complete_payment', // 完成支付
} as const

// 追踪漏斗阶段
export function trackFunnelStage(stage: keyof typeof FUNNEL_STAGES, properties?: AnalyticsProperties): void {
  trackEvent('page_view', {
    ...properties,
    funnel_stage: FUNNEL_STAGES[stage],
  })
}
