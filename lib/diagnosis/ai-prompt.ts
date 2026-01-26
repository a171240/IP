import { Dimension, QUESTIONS, INDUSTRY_LABELS, DIMENSIONS } from './questions'

// AI报告类型定义 - 成就-问题-机会三段论
export interface AIReport {
  summary: string
  // 成就：用户做得好的地方（先给正向反馈）
  achievements: Array<{
    dimension: Dimension
    title: string
    content: string
  }>
  // 问题：需要改进的地方
  insights: Array<{
    dimension: Dimension
    title: string
    content: string
    severity: 'high' | 'medium' | 'low'
  }>
  // 建议：可执行的行动
  recommendations: Array<{
    title: string
    content: string
    priority: number
  }>
  // 工作流推荐：带预期收益
  workflowSteps: Array<{
    stepId: string
    title: string
    reason: string
    priority: number
    estimatedTime?: string   // 预计完成时间
    expectedROI?: string     // 预期收益
    requiredPlan?: 'free' | 'plus' | 'pro'  // 所需会员等级
  }>
}

// 工作流步骤信息
export const WORKFLOW_STEPS: Record<string, { title: string; description: string }> = {
  'P1': { title: '行业目标分析', description: '第一性原理分析行业，定位目标受众' },
  'P2': { title: '认知深度分析', description: '道法术器势框架，找到内容切入点' },
  'P3': { title: '情绪价值分析', description: '穷举情绪触点，建立情绪价值全景图' },
  'P4': { title: 'IP概念生成', description: '打造差异化IP定位、视觉锤、语言钉' },
  'P5': { title: 'IP类型定位', description: '7大IP画布确定专业型/娱乐型/记者型定位' },
  'P6': { title: '4X4内容规划', description: '60期规划，匹配10种呈现形式' },
  'P7': { title: '选题库生成', description: '150个多维度选题' },
  'P8': { title: '脚本创作中心', description: '6种智能体，多种框架匹配' },
  'P9': { title: '口语化优化', description: '去AI味，让脚本更自然' },
  'P10': { title: '迭代管理', description: '版本记录，智能迭代建议' },
  'IP传记': { title: 'IP传记采访', description: '深度访谈挖掘20+张力故事' }
}

// 维度→工作流映射
export const DIMENSION_WORKFLOW_MAP: Record<Dimension, string[]> = {
  positioning: ['P1', 'P2', 'P4', 'P5'],
  content: ['P7', 'P8', 'P9'],
  efficiency: ['P6', 'P10'],
  emotion: ['P3', 'IP传记'],
  conversion: ['P6']
}

// 系统提示词 - 成就-问题-机会三段论（详细版）
export const DIAGNOSIS_SYSTEM_PROMPT = `# 角色定义
你是「IP内容健康诊断专家」，专注于帮助内容创作者分析IP内容健康状况，提供深度、个性化的改进建议。

# 核心理念（重要！）
采用"成就-问题-机会"三段论：
1. 先肯定用户做得好的地方（achievements）→ 建立信心
2. 再指出需要改进的问题（insights）→ 发现症结
3. 最后展示改进后的收益（opportunities in workflowSteps）→ 激发行动

# 核心能力
1. 深度解读五维诊断数据（IP定位、内容生产、效率系统、情绪价值、转化能力）
2. 结合用户的行业背景和具体回答，生成针对性洞察
3. 推荐最适合的工作流步骤（P1-P10）

# 工作流步骤说明（带会员等级）
根据用户的弱项维度，推荐对应的工作流步骤：

## IP定位维度（positioning）弱时推荐：
- P1: 行业目标分析 [免费] - 约15分钟完成
- P2: 认知深度分析 [免费] - 约20分钟完成
- P4: IP概念生成 [Plus] - 约30分钟完成
- P5: IP类型定位 [Plus] - 约20分钟完成

## 情绪价值维度（emotion）弱时推荐：
- P3: 情绪价值分析 [Plus] - 约25分钟完成
- IP传记: 深度访谈 [Plus] - 约40分钟完成

## 内容生产维度（content）弱时推荐：
- P7: 选题库生成 [Pro] - 约10分钟完成
- P8: 脚本创作中心 [Pro] - 约15分钟完成
- P9: 口语化优化 [Pro] - 约5分钟完成

## 效率系统维度（efficiency）弱时推荐：
- P6: 4X4内容规划 [Pro] - 约30分钟完成
- P10: 迭代管理 [Pro] - 约10分钟完成

## 转化能力维度（conversion）弱时推荐：
- P6: 4X4内容规划 [Pro] - 优化引流/理性/产品/情绪内容配比

# 输出格式要求
你的输出必须是严格的 JSON 格式，不要包含任何其他文字，结构如下：

{
  "summary": "总体诊断总结（40-60字，先肯定用户的核心优势，再简要指出主要提升方向）",
  "achievements": [
    {
      "dimension": "positioning|content|efficiency|emotion|conversion",
      "title": "亮点标题（12字以内，积极正向）",
      "content": "详细说明（150-200字，深入分析用户做得好的地方，结合具体回答举例说明，给予真诚的肯定）",
    }
  ],
  "insights": [
    {
      "dimension": "positioning|content|efficiency|emotion|conversion",
      "title": "问题标题（12字以内）",
      "content": "详细分析（200-250字，必须结合用户的具体回答深入分析问题根源，说明这个问题如何影响内容效果，以及不解决会带来什么后果）",
      "severity": "high|medium|low"
    }
  ],
  "recommendations": [
    {
      "title": "建议标题（15字以内）",
      "content": "具体建议（150-200字，包含可操作的2-3个具体步骤，说明每个步骤的目的和预期效果）",
      "priority": 1
    }
  ],
  "workflowSteps": [
    {
      "stepId": "P1|P2|P3|P4|P5|P6|P7|P8|P9|P10|IP传记",
      "title": "步骤名称",
      "reason": "推荐理由（100-150字，详细说明这个工作流能解决用户的什么具体问题，预期能带来什么改变）",
      "priority": 1,
      "estimatedTime": "约15分钟",
      "expectedROI": "预计可提升20%的XX能力",
      "requiredPlan": "free|plus|pro"
    }
  ]
}

# 重要规则
1. achievements 数量：2-3条，必须从用户的强项维度（status为strong或normal且score>=6）中挖掘亮点
2. insights 数量：3-4条，聚焦弱项维度，severity分布要合理（1个high，1-2个medium，1个low）
3. recommendations 数量：4-5条，可执行的具体建议，覆盖短期（立即可做）和中期（需要规划）行动
4. workflowSteps 数量：3-5个，按优先级排序，必须包含requiredPlan字段
5. 所有内容必须针对用户的具体回答，不能是模板话术，要体现你读过并理解了用户的回答
6. 语言风格：专业但亲切，像一位经验丰富的导师，先鼓励再建议，内容要有深度
7. 必须输出合法的JSON格式，不要有其他内容
8. expectedROI要具体量化，如"提升30%内容产出效率"、"节省50%选题时间"等
9. 内容要有洞察力，不能是泛泛而谈，要让用户感觉"你真的懂我"`

// 构建用户提示词
export function buildUserPrompt(
  answers: Record<string, string | string[]>,
  scores: Record<Dimension, { score: number; status: string }>,
  totalScore: number,
  level: string,
  industry: string
): string {
  // 格式化用户回答
  const formattedAnswers = QUESTIONS.map(q => {
    const answer = answers[q.id]
    if (!answer) return null

    const answerLabels = Array.isArray(answer)
      ? answer.map(v => q.options.find(o => o.value === v)?.label || v).join('、')
      : q.options.find(o => o.value === answer)?.label || answer

    return `${q.question}\n答：${answerLabels}`
  }).filter(Boolean).join('\n\n')

  // 格式化评分结果
  const formattedScores = Object.entries(scores).map(([key, value]) => {
    const dim = DIMENSIONS[key as Dimension]
    const statusLabel = value.status === 'strong' ? '优势' : value.status === 'weak' ? '待改进' : '正常'
    return `- ${dim.name}：${value.score}/10（${statusLabel}）`
  }).join('\n')

  // 等级标签
  const levelLabels: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    pass: '及格',
    needs_improvement: '需改进'
  }

  return `# 诊断数据

## 用户行业
${INDUSTRY_LABELS[industry] || industry}

## 问卷回答详情
${formattedAnswers}

## 五维评分结果
${formattedScores}

## 综合评分
总分：${totalScore}分
等级：${levelLabels[level] || level}

# 请求
请基于以上诊断数据，生成个性化的深度诊断报告。

注意：
1. 洞察要针对用户的具体回答（如用户选择了"不知道怎么定位IP"，就要提到这一点）
2. 建议要可落地执行，给出具体的1-2个步骤
3. 工作流推荐要与弱项维度匹配，并说明能解决用户什么问题
4. 只输出JSON，不要有其他内容`
}

// 清理AI生成的JSON，修复常见格式问题
function cleanJsonString(str: string): string {
  let cleaned = str

  // 移除可能的markdown代码块标记
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '')

  // 移除JSON前后的非JSON内容
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  // 修复尾随逗号问题（数组和对象中的）
  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1')

  // 修复换行符在字符串中的问题（替换为空格）
  cleaned = cleaned.replace(/([^\\])\\n/g, '$1 ')

  // 移除控制字符（保留换行和制表符的转义）
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return cleaned
}

// 解析AI响应
export function parseAIReport(content: string): AIReport | null {
  try {
    // 尝试提取JSON部分
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON object found in AI response')
      return null
    }

    // 清理JSON字符串
    const cleanedJson = cleanJsonString(jsonMatch[0])

    let parsed: any
    try {
      parsed = JSON.parse(cleanedJson)
    } catch (parseError) {
      // 如果仍然失败，记录更详细的错误信息
      console.error('JSON parse error:', parseError)
      console.error('Cleaned JSON (first 500 chars):', cleanedJson.slice(0, 500))
      return null
    }

    // 验证必要字段
    if (!parsed.summary || !parsed.insights || !parsed.recommendations || !parsed.workflowSteps) {
      console.error('Missing required fields in AI report')
      return null
    }

    // 兼容旧格式：如果没有achievements字段，创建空数组
    if (!parsed.achievements) {
      parsed.achievements = []
    }

    // 为workflowSteps添加默认值
    parsed.workflowSteps = parsed.workflowSteps.map((step: any) => ({
      ...step,
      estimatedTime: step.estimatedTime || '约15分钟',
      expectedROI: step.expectedROI || '',
      requiredPlan: step.requiredPlan || getDefaultPlanForStep(step.stepId)
    }))

    return parsed as AIReport
  } catch (error) {
    console.error('Failed to parse AI report:', error)
    return null
  }
}

// 根据步骤ID获取默认所需会员等级
function getDefaultPlanForStep(stepId: string): 'free' | 'plus' | 'pro' {
  if (stepId === 'P1' || stepId === 'P2') return 'free'
  if (stepId === 'P3' || stepId === 'P4' || stepId === 'P5' || stepId === 'IP传记') return 'plus'
  return 'pro'
}
