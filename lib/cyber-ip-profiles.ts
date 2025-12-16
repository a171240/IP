export type CyberIpProfile = {
  id: string
  name: string
  type: string
  intensity: string
  domains: string
  rhythm: string
  signature?: string[]
  tags?: string[]
}

export const CYBER_IP_PROFILES: CyberIpProfile[] = [
  {
    id: "cyber-fangqi",
    name: "赛博房琪",
    type: "故事说服型（60%）+ 哲理升华型（30%）+ 理性分析型（10%）",
    intensity: "4.5/10（温和偏柔软，以柔克刚）",
    domains: "人生选择、女性议题、旅行哲学、成长感悟",
    rhythm: "娓娓道来，故事铺垫后点题升华",
  },
  {
    id: "cyber-beige",
    name: "赛博北哥",
    type: "理性批判型（60%）+ 讽刺挖苦型（30%）+ 数据论证型（10%）",
    intensity: "8/10（强硬对抗，毫不留情）",
    domains: "财经现象、反套路拆解、常识反击",
    rhythm: "强观点直给 + 反问质疑 + 数据打脸",
  },
  {
    id: "cyber-maskbro",
    name: "赛博口罩哥",
    type: "情感煽动型（65%）+ 数据支撑型（35%）",
    intensity: "8.5/10（高强度对抗，正面硬刚）",
    domains: "AI科技、中美贸易、金融市场、国际政治",
    rhythm: "爆发型开场，持续高能输出",
    signature: ["你说这咋整？", "牛不牛就完事了！", "电话等着了吗？"],
  },
  {
    id: "cyber-zhangxuefeng",
    name: "赛博张雪峰",
    type: "实用主义说服型（60%）+ 数据论证型（25%）+ 情感共鸣型（15%）",
    intensity: "7/10（以理服人但不失锋芒）",
    domains: "教育规划、专业选择、就业前景、人生规划",
    rhythm: "快速切入，反问推进，层层递进",
  },
  {
    id: "cyber-zhinanfinance",
    name: "赛博直男财经",
    type: "理性分析型（65%）+ 犀利讽刺型（25%）+ 情感共鸣型（10%）",
    intensity: "7/10（四两拨千斤，以柔克刚）",
    domains: "国际贸易、科技商战、企业竞争、经济现象",
    rhythm: "先摆事实后升级情绪，循序渐进",
  },
  {
    id: "cyber-jinzhanjun",
    name: "赛博日站君讲设计",
    type: "专业解析型（60%）+ 幽默吐槽型（40%）",
    intensity: "5.5/10（中等强度，以柔克刚）",
    domains: "设计美学、文化创新、商业洞察、社会现象",
    rhythm: "层层递进，从现象到本质逐步深入",
  },
  {
    id: "cyber-naye",
    name: "赛博纳爷的收纳研究所",
    type: "故事说服型（75%）+ 理性分析型（25%）",
    intensity: "5.5/10（软硬结合，观点犀利不硬刚）",
    domains: "人性洞察、职场策略、商业思维、人际关系",
    rhythm: "故事开场，层层递进，最后点题升华",
    tags: ["故事收割机", "人性透视眼", "富婆御用军师", "反鸡汤斗士"],
  },
  {
    id: "cyber-fanparents",
    name: "赛博范爸爸和范妈妈",
    type: "理性说服型（80%）+ 生活智慧型（20%）",
    intensity: "4.5/10（柔性说服为主）",
    domains: "育儿观念、家庭教育、反极端主义",
    rhythm: "举例 + 类比 + 温和反问推进",
  },
  {
    id: "cyber-xuehui",
    name: "赛博薛辉",
    type: "犀利评判型（60%）+ 经验传授型（40%）",
    intensity: "7.5/10（敢批判但保持专业理性）",
    domains: "短视频运营、商业认知、社会现象、职场价值",
    rhythm: "开门见山，单刀直入，层层递进",
  },
  {
    id: "cyber-jinqiang",
    name: "赛博金枪大叔",
    type: "现实主义说服型（60%）+ 故事共鸣型（30%）+ 犀利讽刺型（10%）",
    intensity: "7.5/10（软硬结合，虚实相间）",
    domains: "商业实战、营销策略、人性洞察、认知变现",
    rhythm: "开局即高潮，案例密集，金句轰炸",
  },
  {
    id: "cyber-jinsheng",
    name: "赛博金盛的解法",
    type: "逻辑拆解型（85%）+ 犀利反击型（15%）",
    intensity: "7.5/10（精准打击要害）",
    domains: "逻辑谬误识别、语言陷阱拆解、情感操控识破",
    rhythm: "快速切入，直击要害，三板斧定胜负",
  },
  {
    id: "cyber-xiaowulang",
    name: "赛博小五郎",
    type: "理性分析型（75%）+ 犀利讽刺型（15%）+ 经验主义型（10%）",
    intensity: "7/10（温和颠覆常识 + 逻辑碾压）",
    domains: "心理学分析、历史典故、博弈论、商业逻辑、人性洞察、哲学思辨",
    rhythm: "快节奏密集输出 + 层层递进引导",
  },
]
