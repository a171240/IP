// 智能体配置文件
// 定义智能体和解决方案包的数据结构

// 使用场景类型
export type AgentScene =
  | "research"
  | "creation"
  | "topic"
  | "marketing"
  | "efficiency"
  | "workflow"

// 智能体配置
export interface AgentConfig {
  id: string
  name: string
  description: string
  scene: AgentScene
  icon: string
  promptFile?: string
  workflowStepId?: string
  isCollection?: boolean
  collectionCount?: number
  collectionPath?: string
}

// 解决方案包配置
export interface SolutionPackConfig {
  id: string
  name: string
  title: string
  description: string
  icon: string
  color: string
  modules: string[]
  moduleCount: number
  downloadable: boolean
  memberOnly: boolean
}

// 场景配置
export const sceneConfig: Record<AgentScene, { name: string; icon: string; color: string }> = {
  workflow: { name: "核心工作流", icon: "Layers", color: "violet" },
  research: { name: "研究分析", icon: "Search", color: "purple" },
  creation: { name: "内容创作", icon: "PenTool", color: "emerald" },
  topic: { name: "选题策划", icon: "Lightbulb", color: "blue" },
  marketing: { name: "营销转化", icon: "TrendingUp", color: "amber" },
  efficiency: { name: "效率优化", icon: "Zap", color: "zinc" },
}

// 快捷入口配置
export const quickAccessConfig = [
  { id: "P1", name: "行业分析", description: "AI运用第一性原理分析行业", icon: "Target", workflowStepId: "P1" },
  { id: "IP传记", name: "IP传记", description: "深度访谈挖掘20+张力故事", icon: "BookOpen", workflowStepId: "IP传记" },
  { id: "P7", name: "选题生成", description: "150个多维度选题库", icon: "Layers", workflowStepId: "P7" },
  { id: "P8", name: "脚本创作", description: "6种智能体框架创作", icon: "PenTool", workflowStepId: "P8" },
]

// 智能体库配置
export const agentsConfig: AgentConfig[] = [
  // 核心工作流
  { id: "p5-ip-type", name: "IP类型定位大师", description: "确定专业型/娱乐型/记者型定位", scene: "workflow", icon: "Compass", promptFile: "P5-IP类型定位大师v2.0.md", workflowStepId: "P5" },
  { id: "p6-content-director", name: "4X4内容运营总监", description: "制定60期内容计划匹配最佳形式", scene: "workflow", icon: "LayoutGrid", promptFile: "P6-商业IP4X4内容运营总监v2.0.md", workflowStepId: "P6" },
  { id: "p7-topic-master", name: "选题库生成大师", description: "生成150个多维度选题库", scene: "workflow", icon: "Lightbulb", promptFile: "P7-选题库生成大师v1.0.md", workflowStepId: "P7" },
  { id: "p8-script-center", name: "脚本创作中心", description: "6种智能体框架创作脚本", scene: "workflow", icon: "FileEdit", promptFile: "P8-脚本创作中心v1.0.md", workflowStepId: "P8" },
  { id: "p9-oral-optimizer", name: "口语化优化大师", description: "去除AI感提升自然度", scene: "workflow", icon: "MessageSquare", promptFile: "P9-口语化优化大师v1.0.md", workflowStepId: "P9" },
  { id: "p10-iteration-manager", name: "迭代管理器", description: "闭环反馈持续优化内容", scene: "workflow", icon: "RefreshCw", promptFile: "P10-迭代管理器v1.0.md", workflowStepId: "P10" },
  // 研究分析
  { id: "mx-product-research", name: "MX产品调研记者", description: "深度产品调研与市场分析", scene: "research", icon: "Newspaper", promptFile: "1. MX产品调研记者智能体.md" },
  { id: "competitor-analysis", name: "竞品视频拉片分析", description: "深度分析竞品视频的结构和技巧", scene: "research", icon: "Video", promptFile: "2. 摸象竞品视频拉片分析智能体.md" },
  { id: "4x4-competitor", name: "4X4竞品分析专家", description: "多维度竞品对比分析", scene: "research", icon: "Grid3X3", promptFile: "4X4竞品分析专家.md" },
  { id: "viral-template", name: "短视频爆款模板分析", description: "从逐字稿提取可复制的内容模板", scene: "research", icon: "Sparkles", promptFile: "短视频爆款模板分析和内容输出智能体.md" },
  { id: "ip-style-extract", name: "IP辩论风格提取", description: "分析辩论型IP的表达风格特征", scene: "research", icon: "Mic", promptFile: "IP辩论风格提取分析智能体.md" },
  { id: "ip-concept-generator", name: "IP概念生成器", description: "输出差异化定位与人设框架", scene: "research", icon: "Lightbulb", promptFile: "IP概念生成器智能体（1.0）.md" },
  { id: "ip-emotion-story", name: "IP情绪张力故事提取", description: "提取可复用的张力故事片段", scene: "research", icon: "Heart", promptFile: "IP情绪张力故事片段提取器.md" },
  { id: "ip-biography-basic", name: "IP传记采访（基础版）", description: "深度访谈挖掘人物故事", scene: "research", icon: "BookOpen", promptFile: "IP传记采访机器人v1.1（基础版）.md" },
  { id: "ip-biography-deep", name: "IP传记采访（情绪深挖）", description: "情绪深挖版深度访谈", scene: "research", icon: "BookHeart", promptFile: "IP传记采访机器人v1.3（情绪深挖版）.md" },
  { id: "originality-check", name: "脚本原创度检测", description: "双盲测试检测内容原创性", scene: "research", icon: "ShieldCheck", promptFile: "脚本原创度双盲测试.md" },
  { id: "content-dedup", name: "内容去重分析", description: "检测内容相似度避免重复创作", scene: "research", icon: "Copy", promptFile: "短视频内容分析与去重智能体提示词.md" },
  { id: "customer-portrait", name: "客户标准画像构建", description: "精准构建目标客户画像", scene: "research", icon: "Users", promptFile: "客户标准画像构建专家.md" },
  { id: "search-hotspot", name: "搜索热点切入分析", description: "分析搜索热点找切入视角", scene: "research", icon: "Search", promptFile: "搜索热点切入点分析工具.md" },
  { id: "industry-cognition", name: "行业认知挖掘（播客）", description: "播客专用行业认知深挖", scene: "research", icon: "Podcast", promptFile: "行业认知挖掘智能体（播客专用）.md" },
  { id: "writing-style-analysis", name: "文风分析与创作", description: "分析并模仿特定文风", scene: "research", icon: "Type", promptFile: "文风分析与创作专家.md" },
  { id: "video-transcript", name: "逐字稿总结视频", description: "从视频逐字稿提取核心观点", scene: "research", icon: "FileText", promptFile: "C1 豆包技能 - 逐字稿总结视频.txt" },
  { id: "video-scripting", name: "视频拉片指令", description: "标准化视频拉片分析流程", scene: "research", icon: "Film", promptFile: "视频拉片指令.md" },
  { id: "ip-industry-workbench", name: "IP行业分析工作台", description: "完整的行业分析工具集合", scene: "research", icon: "Briefcase", isCollection: true, collectionCount: 10, collectionPath: "IP行业分析工作台" },
  // 内容创作
  { id: "golden-sentence", name: "金句型脚本生成", description: "20种人设+3-2-1金句分布原则", scene: "creation", icon: "Quote", promptFile: "金句型脚本创作智能体 4.1.md" },
  { id: "deep-resonance", name: "深度共鸣脚本", description: "16种框架引发强烈情感共鸣", scene: "creation", icon: "Heart", promptFile: "深度共鸣短视频脚本创作智能体v1.4.md" },
  { id: "life-story", name: "人生故事脚本", description: "4种故事框架叙述真实经历", scene: "creation", icon: "BookOpen", promptFile: "人生故事脚本生成器.md" },
  { id: "promo-hook", name: "促销钩子脚本", description: "限时促销引流活动脚本", scene: "creation", icon: "Megaphone", promptFile: "促销引流钩子脚本生成器v1.3.md" },
  { id: "product-display", name: "产品展示脚本", description: "产品介绍和品牌置顶视频", scene: "creation", icon: "Package", promptFile: "产品展示脚本创作智能体v1.3.md" },
  { id: "weird-question", name: "奇葩问题脚本", description: "用奇葩问题引发好奇和讨论", scene: "creation", icon: "MessageCircle", promptFile: "奇葩问题短视频脚本生成器.md" },
  { id: "city-topic", name: "城市话题脚本", description: "城市相关热门话题创作", scene: "creation", icon: "Building", promptFile: "城市话题短视频脚本创作智能体提示词.md" },
  { id: "reverse-thinking", name: "反向思维爆款", description: "反向思维创造爆款脚本", scene: "creation", icon: "RotateCcw", promptFile: "反向思维爆款脚本生成智能体提示词.md" },
  { id: "ipb-case-video", name: "案例拆解短视频", description: "案例分析型短视频创作", scene: "creation", icon: "FileSearch", promptFile: "IPB案例拆解短视频创作助手v1.4.md" },
  { id: "ai-interview-video", name: "AI访谈视频助手", description: "访谈类视频脚本生成", scene: "creation", icon: "Mic2", promptFile: "AI访谈视频助手v1.3.md" },
  { id: "storyboard", name: "通用分镜头脚本", description: "视频分镜头脚本生成", scene: "creation", icon: "LayoutPanelLeft", promptFile: "通用分镜头脚本生成器v1.3.md" },
  { id: "oral-video-layout", name: "口播短视频构图", description: "口播视频构图策划方案", scene: "creation", icon: "SquareSplitHorizontal", promptFile: "口播短视频构图策划助手.md" },
  { id: "restaurant-content", name: "餐饮门店引流内容", description: "餐饮行业引流内容策划", scene: "creation", icon: "UtensilsCrossed", promptFile: "餐饮门店引流内容策划大师v1.4.md" },
  { id: "retail-loop-script", name: "实体店直播循环话术", description: "门店直播引流话术生成", scene: "creation", icon: "Store", promptFile: "星盒实体门店引流文案直播循环话术.md" },
  { id: "retail-batch-content", name: "门店短视频批量生成", description: "批量生成门店营销文案", scene: "creation", icon: "Layers", promptFile: "实体门店短视频营销文案批量生成专家.md" },
  { id: "xiaohongshu-retail", name: "门店小红书图文", description: "实体门店小红书营销笔记", scene: "creation", icon: "Image", promptFile: "实体门店小红书图文笔记营销专家.md" },
  { id: "my-friend-script", name: "我有一个朋友", description: "用朋友故事引发共鸣", scene: "creation", icon: "UserPlus", promptFile: "我有一个朋友.txt" },
  { id: "course-from-text", name: "文案变课程", description: "将文案内容转化为课程", scene: "creation", icon: "GraduationCap", promptFile: "外部奇奇怪的文案变课程智能体.md" },
  { id: "empathy-scripts", name: "共情内容生成智能体", description: "多种共情类型脚本模板", scene: "creation", icon: "HeartHandshake", isCollection: true, collectionCount: 8, collectionPath: "共情内容生成智能体提示词" },
  { id: "trust-case-scripts", name: "MX信任场景案例脚本", description: "信任建立型案例脚本集", scene: "creation", icon: "Shield", isCollection: true, collectionCount: 6, collectionPath: "MX信任场景案例型脚本智能体" },
  { id: "xiaohongshu-generator", name: "小红书图文智能生成", description: "小红书爆款图文生成工具", scene: "creation", icon: "Palette", isCollection: true, collectionCount: 5, collectionPath: "小红书图文智能生成智能体" },
  { id: "same-industry-clone", name: "同行业1:1风格拆解", description: "同行业爆款风格复刻模板", scene: "creation", icon: "Copy", isCollection: true, collectionCount: 10, collectionPath: "同行业1比1拆解风格模板" },
  // 选题策划
  { id: "hot-topic", name: "热点引流选题", description: "借助热点流量快速获取曝光", scene: "topic", icon: "Flame", promptFile: "热点引流选题智能体.md" },
  { id: "emotion-topic", name: "行业情绪选题分析", description: "8大类别正反观点选题", scene: "topic", icon: "Heart", promptFile: "行业情绪化正反观点选题分析.md" },
  { id: "pain-point", name: "策略痛点挖掘", description: "挖掘目标受众核心痛点", scene: "topic", icon: "Target", promptFile: "策略痛点挖掘与情绪分点设计智能体v3.0.md" },
  { id: "hook-front", name: "爆点前置", description: "将内容爆点前置吸引注意", scene: "topic", icon: "Zap", promptFile: "爆点前置智能体提示词.md" },
  { id: "xinghe-7ip", name: "星盒7大IP策划画布", description: "7大维度IP策划方法论", scene: "topic", icon: "LayoutDashboard", promptFile: "星盒7大IP策划画布IP策划大师.md" },
  { id: "commercial-matrix", name: "商业赛道内容矩阵", description: "商业赛道内容营销参考", scene: "topic", icon: "Grid2X2", promptFile: "商业赛道参考内容营销矩阵智能体.md" },
  { id: "platform-select", name: "内容营销平台选择", description: "选择最佳内容分发平台", scene: "topic", icon: "Share2", promptFile: "内容营销平台选择策划大师.md" },
  { id: "industry-topics", name: "垂类行业选题生成器", description: "覆盖46个行业的专属选题生成", scene: "topic", icon: "Factory", isCollection: true, collectionCount: 46, collectionPath: "各垂类正反观点情绪选题生成器" },
  // 营销转化
  { id: "marketing-diagnosis", name: "新媒体营销诊断", description: "全面诊断新媒体营销策略", scene: "marketing", icon: "Stethoscope", promptFile: "新媒体营销策略诊断大师.md" },
  { id: "investment-planning", name: "招商策划大师", description: "专业招商策划和方案设计", scene: "marketing", icon: "Handshake", promptFile: "招商策划大师.md" },
  { id: "info-flow", name: "信息流策略专家", description: "信息流广告投放策略", scene: "marketing", icon: "BarChart3", promptFile: "信息流营销策略专家智能体.md" },
  { id: "comment-operation", name: "评论区运营策略", description: "视频评论区互动运营", scene: "marketing", icon: "MessageCircle", promptFile: "视频评论区运营策略智能体.md" },
  { id: "ai-seo-article", name: "AI SEO软文生成", description: "SEO优化的软文内容生成", scene: "marketing", icon: "FileSearch", promptFile: "AI.SEO软文生成.md" },
  { id: "ai-seo-analysis", name: "AI SEO数据分析", description: "SEO效果数据分析优化", scene: "marketing", icon: "TrendingUp", promptFile: "AI.SEO数据分析.md" },
  { id: "music-wechat", name: "少儿音乐培训朋友圈", description: "音乐培训机构朋友圈运营", scene: "marketing", icon: "Music", promptFile: "少儿音乐培训机构知识主播朋友圈运营智能体提示词 v12.md" },
  { id: "art-wechat", name: "少儿艺术培训朋友圈", description: "艺术培训机构朋友圈运营", scene: "marketing", icon: "Palette", promptFile: "少儿综合艺术培训机构朋友圈运营智能体提示词v12.md" },
  { id: "cyber-ip-clone", name: "赛博IP复刻", description: "12个名人IP风格复刻智能体", scene: "marketing", icon: "Users", isCollection: true, collectionCount: 12, collectionPath: "赛博IP复刻" },
  { id: "ip-presentation", name: "IP呈现方式策划", description: "11种IP内容呈现风格模板", scene: "marketing", icon: "Presentation", isCollection: true, collectionCount: 11, collectionPath: "商业IP呈现方式策划助手v1.3" },
  // 效率优化
  { id: "colloquial-optimize-v12", name: "口语化风格优化v1.2", description: "基础版口语化优化", scene: "efficiency", icon: "MessageSquare", promptFile: "口语化风格优化指令v1.2.md" },
  { id: "colloquial-optimize-v14", name: "口语化风格优化v1.4", description: "细节和逻辑增强版", scene: "efficiency", icon: "MessageSquareMore", promptFile: "口语化风格优化指令v1.4（细节和逻辑）.md" },
  { id: "script-scoring", name: "脚本批改打分", description: "专业评分和改进建议", scene: "efficiency", icon: "ClipboardCheck", promptFile: "脚本批改打分器.txt" },
  { id: "ai-style-audit", name: "AI风格审核员", description: "检测AI生成痕迹", scene: "efficiency", icon: "Bot", promptFile: "AI风格最终审核员.md" },
  { id: "ai-style-audit-v13", name: "AI风格审核员v1.3", description: "增强版AI痕迹检测", scene: "efficiency", icon: "BotMessageSquare", promptFile: "AI风格最终审核员v1.3.md" },
  { id: "pdf-word-convert", name: "PDF-Word格式互转", description: "文档格式智能转换", scene: "efficiency", icon: "FileType", promptFile: "PDF-Word格式互转智能体.md" },
  { id: "beauty-knowledge", name: "美业干货知识提取", description: "美业行业知识点提取", scene: "efficiency", icon: "Sparkles", promptFile: "美业干货知识提取助手.txt" },
  { id: "slice-style", name: "切片化风格定义", description: "定义切片化内容风格", scene: "efficiency", icon: "Scissors", promptFile: "切片化风格的定义.txt" },
  { id: "safety-distance", name: "安全距离原则", description: "内容合规安全检查", scene: "efficiency", icon: "ShieldAlert", promptFile: "安全距离原则.md" },
  { id: "night-market-hook", name: "夜市版黄金三秒优化", description: "夜市场景短视频开头优化", scene: "efficiency", icon: "Moon", promptFile: "夜市版 短视频脚本黄金三秒适度优化提示词.md" },
  { id: "fortune-telling", name: "奇门遁甲算命", description: "传统文化算命智能体", scene: "efficiency", icon: "Compass", promptFile: "奇门遁甲算命智能体提示词.md" },
  { id: "ai-keyword-tool", name: "AI挖词工具", description: "关键词挖掘分析工具集", scene: "efficiency", icon: "KeyRound", isCollection: true, collectionCount: 5, collectionPath: "Ai挖词工具" },
  { id: "text-formatter", name: "文章排版生成器", description: "文档排版格式化工具", scene: "efficiency", icon: "AlignLeft", isCollection: true, collectionCount: 3, collectionPath: "文章排版生成器" },
  { id: "prompt-analysis", name: "提示词分析（操盘手视角）", description: "分析优秀提示词的亮点", scene: "efficiency", icon: "Eye", isCollection: true, collectionCount: 5, collectionPath: "这个提示词好在哪？操盘手视角" },
]

// 解决方案包配置
export const solutionPacksConfig: SolutionPackConfig[] = [
  {
    id: "retail-marketing",
    name: "实体店营销全套桉",
    title: "实体店营销全套桉",
    description: "覆盖实体店全链路营销的13个场景模块",
    icon: "Store",
    color: "orange",
    modules: ["场景营销", "精细化运营", "客户服务", "内容创作", "内容种草", "品牌建设", "数据分析", "文案优化", "特色服务", "引流获客", "营销推广", "运营管理", "智能工具"],
    moduleCount: 13,
    downloadable: true,
    memberOnly: true
  },
  {
    id: "industry-topics",
    name: "44行业选题生成器",
    title: "44行业选题生成器",
    description: "覆盖44个热门行业的专属选题生成",
    icon: "Factory",
    color: "cyan",
    modules: ["金融理财", "房产行业", "餐饮美食", "教育培训", "医疗健康", "美业护肤", "健身运动", "母婴育儿", "法律咨询", "心理咨询", "跨境电商", "直播电商", "服装行业", "珠宝玉石", "宠物行业", "旅游出行", "装修建材", "二手车", "保险行业", "养老服务"],
    moduleCount: 44,
    downloadable: true,
    memberOnly: true
  },
  {
    id: "cyber-ip",
    name: "12赛博IP人设模板",
    title: "12赛博IP人设模板",
    description: "12个名人IP风格复刻智能体",
    icon: "Users",
    color: "pink",
    modules: ["赛博张雪峰", "赛博房琪", "赛博北哥", "赛博口罩哥", "赛博小五郎", "赛博薛辉", "赛博纳爷的收纳研究所", "赛博范爸爸和范姐姐", "赛博金枪大叔", "赛博金盛的解法", "赛博日站君说设计", "赛博直男财经"],
    moduleCount: 12,
    downloadable: true,
    memberOnly: true
  },
  {
    id: "content-matrix",
    name: "内容矩阵规划工具包",
    title: "内容矩阵规划工具包",
    description: "系统化的内容矩阵规划方法论",
    icon: "LayoutGrid",
    color: "indigo",
    modules: ["内容金字塔模型", "4X4内容矩阵", "内容日历模板", "平台分发策略", "内容生产SOP"],
    moduleCount: 5,
    downloadable: true,
    memberOnly: true
  },
]

// 按场景分组智能体
export function getAgentsByScene(): Record<AgentScene, AgentConfig[]> {
  const grouped: Record<AgentScene, AgentConfig[]> = {
    workflow: [],
    research: [],
    creation: [],
    topic: [],
    marketing: [],
    efficiency: [],
  }
  agentsConfig.forEach(agent => {
    grouped[agent.scene].push(agent)
  })
  return grouped
}

// 获取智能体总数
export function getTotalAgentCount(): number {
  let count = 0
  agentsConfig.forEach(agent => {
    if (agent.isCollection && agent.collectionCount) {
      count += agent.collectionCount
    } else {
      count += 1
    }
  })
  return count
}
