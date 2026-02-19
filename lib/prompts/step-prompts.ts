// IP内容工厂 - 专业智能体提示词配置
// 根据步骤ID自动加载对应的专业提示词

// 研究定位阶段 (Phase 1)
import { p1IndustryPrompt } from './research/p1-industry'
import { p2CognitionPrompt } from './research/p2-cognition'
import { p3EmotionPrompt } from './research/p3-emotion'
import { ipBiographyPrompt } from './research/ip-biography'

// 人设构建阶段 (Phase 2)
import { p4ConceptPrompt } from './persona/p4-concept'
import { getP5TypePositioningPrompt } from './persona/p5-type-positioning'
import { getP6ContentDirectorPrompt } from './persona/p6-content-director'

// 内容生产阶段 (Phase 3)
import { getP7AttractionPrompt, p7AttractionPrompt } from './content/p7-attraction'
import { getP8RationalPrompt, p8RationalPrompt } from './content/p8-rational'
import { getP9ProductPrompt, p9ProductPrompt } from './content/p9-product'
import { getP10EmotionPrompt, p10EmotionPrompt } from './content/p10-emotion'

export const stepPrompts: Record<string, string> = {
  // 研究定位阶段
  'P1': p1IndustryPrompt,
  'P2': p2CognitionPrompt,
  'P3': p3EmotionPrompt,
  'IP传记': ipBiographyPrompt,

  // 人设构建阶段
  'P4': p4ConceptPrompt,
  // P5 和 P6 使用动态加载函数

  // 内容生产阶段
  'P7': p7AttractionPrompt,
  'P8': p8RationalPrompt,
  'P9': p9ProductPrompt,
  'P10': p10EmotionPrompt,
}

// 内容改写（V2）提示词文件映射，仅用于 API 侧按 target 选择模板
export const rewritePromptFileMap = {
  'REWRITE_BASE': '链接内容提取与重构v1.md',
  'REWRITE_DOUYIN_VIDEO': '抖音脚本复刻改写v1.md',
  'REWRITE_XHS_NOTE': '小红书图文改写再创作v1.md',
} as const

/**
 * 根据步骤ID获取对应的提示词
 * @param stepId 步骤ID (例如: 'P1', 'P2', 'P3', 'IP传记', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10')
 * @returns 提示词内容，如果未找到则返回空字符串
 */
export function getStepPrompt(stepId: string): string {
  // P5 IP类型定位 - 使用动态加载函数
  if (stepId === 'P5') return getP5TypePositioningPrompt()

  // P6 4X4内容运营总监 - 使用动态加载函数
  if (stepId === 'P6') return getP6ContentDirectorPrompt()

  // P7-P10 优先使用提示词文件内容
  if (stepId === 'P7') return getP7AttractionPrompt()
  if (stepId === 'P8') return getP8RationalPrompt()
  if (stepId === 'P9') return getP9ProductPrompt()
  if (stepId === 'P10') return getP10EmotionPrompt()

  // 其他步骤从 stepPrompts 对象获取
  return stepPrompts[stepId] || ''
}
