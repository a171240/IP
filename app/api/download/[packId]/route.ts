import { NextRequest, NextResponse } from "next/server"
import { solutionPacksConfig } from "@/lib/agents/config"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { canDownloadPack, getCreditCostForPackMarkdownDownload, getDownloadPermissionMessage, normalizePlan, PLAN_LABELS } from "@/lib/pricing/rules"
import { consumeCredits, ensureTrialCreditsIfNeeded, getClientIp, hashIp } from "@/lib/pricing/profile.server"

// 解决方案包的详细内容
const packContents: Record<string, string> = {
  "retail-marketing": `# 实体店营销全家桶

> 一站式实体门店 AI 营销解决方案，覆盖 13 个场景模块，100+ 智能体

## 场景模块

### 1. 场景营销
- 节日促销方案生成器
- 季节性活动策划师
- 本地化营销顾问
- 场景化陈列设计师

### 2. 精细化运营
- 会员分层运营专家
- 复购率提升顾问
- 客单价优化师
- 库存周转分析师

### 3. 客户服务
- 客诉处理专家
- VIP 客户维护顾问
- 服务话术优化师
- 满意度提升专家

### 4. 内容创作
- 门店文案创作师
- 产品描述生成器
- 促销海报文案师
- 朋友圈内容规划师

### 5. 内容种草
- 小红书种草文案师
- 大众点评优化师
- 口碑营销策划师
- UGC 内容引导师

### 6. 品牌建设
- 品牌故事撰写师
- 品牌调性定位师
- 视觉识别顾问
- 品牌传播策划师

### 7. 数据分析
- 销售数据分析师
- 客流量分析专家
- 转化率优化师
- 竞品分析顾问

### 8. 文案优化
- 标题优化大师
- 卖点提炼专家
- 促销文案优化师
- A/B 测试分析师

### 9. 特色服务
- 增值服务设计师
- 差异化服务顾问
- 服务流程优化师
- 体验升级专家

### 10. 引流获客
- 线上引流专家
- 异业合作顾问
- 地推活动策划师
- 老带新方案设计师

### 11. 营销推广
- 活动策划专家
- 促销方案设计师
- 营销日历规划师
- ROI 优化顾问

### 12. 运营管理
- 门店 SOP 设计师
- 员工培训规划师
- 排班优化专家
- 成本控制顾问

### 13. 智能工具
- 智能客服配置师
- 自动化营销设计师
- 数据看板搭建师
- 效率工具整合师

---

## 使用说明

1. 根据您的业务需求选择对应的场景模块
2. 复制相关智能体的提示词到您的 AI 对话工具
3. 按提示输入具体业务信息
4. 获取定制化营销方案和内容

## 最佳实践

- 先使用“数据分析”模块了解现状
- 再用“精细化运营”制定策略
- 配合“内容创作”产出物料
- 通过“营销推广”执行落地

---

© IP超级个体 - 会员专属资源`,

  "industry-topics": `# 46行业选题生成器

> 覆盖 46 个热门行业的 AI 选题生成器，帮您快速产出高质量内容选题

## 行业列表

### 互联网科技
1. 人工智能/AI
2. 电商运营
3. 新媒体运营
4. 产品经理
5. 程序开发

### 金融财经
6. 投资理财
7. 保险规划
8. 银行业务
9. 财务会计
10. 股票基金

### 教育培训
11. K12 教育
12. 职业培训
13. 语言学习
14. 兴趣教育
15. 企业培训

### 医疗健康
16. 中医养生
17. 心理咨询
18. 营养健康
19. 医美护肤
20. 母婴育儿

### 生活服务
21. 餐饮美食
22. 家居装修
23. 旅游出行
24. 婚庆服务
25. 宠物服务

### 文化娱乐
26. 影视娱乐
27. 游戏电竞
28. 音乐艺术
29. 体育健身
30. 摄影摄像

### 商业服务
31. 法律服务
32. 人力资源
33. 企业管理
34. 市场营销
35. 品牌策划

### 制造工业
36. 汽车行业
37. 房地产
38. 建筑工程
39. 制造业
40. 农业农村

### 新兴领域
41. 新能源
42. 跨境电商
43. 直播带货
44. 知识付费
45. 创业人群
46. 高净值人群

---

## 使用方法

每个行业选题生成器都包含：
- 热点追踪模块
- 痛点挖掘模块
- 爆款公式模块
- 选题日历模块

只需输入您的行业和目标受众，即可获得：
- 30 个热门选题方向
- 每个选题的创作角度
- 预估流量潜力评分
- 最佳发布时间建议

---

© IP超级个体 - 会员专属资源`,

  "cyber-ip": `# 12 赛博 IP 人设模板

> 12 种经典赛博 IP 人设模板，快速打造独特的个人品牌形象

## IP 类型一览

### 1. 智慧导师型
**定位**：行业专家、知识布道者
**特点**：专业权威、深度洞察、循循善诱
**适合**：咨询顾问、培训讲师、行业专家

### 2. 热血创业者型
**定位**：连续创业者、商业实战派
**特点**：激情澎湃、实战经验、敢于冒险
**适合**：创业者、企业家、商业博主

### 3. 温暖陪伴型
**定位**：生活教练、情感顾问
**特点**：亲和力强、善于倾听、温暖治愈
**适合**：心理咨询、情感博主、生活教练

### 4. 犀利点评型
**定位**：行业观察者、毒舌评论家
**特点**：观点鲜明、语言犀利、一针见血
**适合**：行业评论、测评博主、观点输出

### 5. 技术极客型
**定位**：技术大咖、极客玩家
**特点**：技术过硬、追求极致、乐于分享
**适合**：程序员、技术博主、产品测评

### 6. 生活美学家型
**定位**：品质生活引导者
**特点**：审美独特、精致生活、品味卓越
**适合**：家居博主、时尚博主、生活方式

### 7. 励志逆袭型
**定位**：草根逆袭者、励志典范
**特点**：真实故事、逆境成长、激励人心
**适合**：个人成长、职场博主、教育博主

### 8. 幽默段子手型
**定位**：幽默表达者、快乐制造机
**特点**：幽默风趣、脑洞大开、娱乐大众
**适合**：娱乐博主、脱口秀、搞笑内容

### 9. 数据分析师型
**定位**：数据洞察者、理性派代表
**特点**：逻辑清晰、数据驱动、客观中立
**适合**：财经博主、科普博主、分析师

### 10. 文艺青年型
**定位**：文艺表达者、诗意生活家
**特点**：文笔优美、情感细腻、诗意浪漫
**适合**：作家、诗人、文化博主

### 11. 执行力狂人型
**定位**：行动派代表、结果导向者
**特点**：高效执行、结果说话、务实落地
**适合**：效率博主、管理者、职场达人

### 12. 跨界创新型
**定位**：跨界达人、创新先锋
**特点**：多元背景、创意无限、敢于突破
**适合**：斜杠青年、创意从业者、跨界博主

---

© IP超级个体 - 会员专属资源`,

  "content-matrix": `# 内容矩阵规划工具包

> 系统化的内容矩阵规划方法论，帮助构建完整的内容生产体系

## 内容矩阵框架

### 一、内容金字塔模型
- 旗帜内容（10%）：深度长文/系列课程
- 核心内容（30%）：专业干货/案例拆解
- 常规内容（60%）：日常更新/互动内容

### 二、4×4 内容矩阵
| 维度 | 教育价值 | 娱乐价值 | 情感价值 | 实用价值 |
| --- | --- | --- | --- | --- |
| 短视频 | 知识讲解 | 搞笑视频 | 情感 vlog | 教程演示 |
| 直播 | 在线课堂 | 才艺展示 | 粉丝互动 | 答疑解惑 |
| 长视频 | 深度解析 | 纪录片 | 人物访谈 | 完整教程 |
| 图文 | 观点输出 | 轻松阅读 | 情感共鸣 | 清单攻略 |

### 三、内容日历模板（示例）
- 周一：行业洞察
- 周二：干货分享
- 周三：案例拆解
- 周四：互动话题
- 周五：故事分享
- 周六：轻松内容
- 周日：复盘规划

---

## 平台分发策略

### 主阵地选择
根据目标受众选择 1-2 个主平台深耕。

### 内容适配原则
- 抖音：15-60 秒，节奏强，前 3 秒抓眼球
- 小红书：图文为主，种草导向，实用性强
- 视频号：2-5 分钟，知识向，私域联动
- B 站：5-15 分钟，深度内容，年轻化
- 公众号：长图文，深度阅读，品牌沉淀

### 发布时间参考
以目标受众的活跃时间为准，优先测试晚间与周末时段。

---

## 内容生产 SOP

### 1. 选题阶段
- [ ] 热点监控
- [ ] 竞品分析
- [ ] 用户调研
- [ ] 选题评审

### 2. 创作阶段
- [ ] 大纲设计
- [ ] 内容撰写
- [ ] 视觉设计
- [ ] 素材整理

### 3. 发布阶段
- [ ] 标题优化
- [ ] 标签设置
- [ ] 定时发布
- [ ] 评论互动

### 4. 运营阶段
- [ ] 数据复盘
- [ ] 反馈迭代
- [ ] 内容归档
- [ ] 模板沉淀

---

© IP超级个体 - 会员专属资源`,
    })
    creditsBalance = consumed.credits_balance
  }

  // Find solution pack config
  const pack = solutionPacksConfig.find((p) => p.id === packId)

  if (!pack) {
    return NextResponse.json(
      { error: "Solution pack not found" },
      { status: 404 }
    )
  }

  // Load pack content
  const content = packContents[packId]

  if (!content) {
    return NextResponse.json(
      { error: "Pack content missing" },
      { status: 404 }
    )
  }

  // Generate file name
  const fileName = `${pack.title}.md`

    // 创建响应，设置为下载文件
    const response = new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-cache",
        "X-Credits-Cost": String(cost),
        "X-Credits-Remaining": creditsUnlimited ? "inf" : String(creditsBalance)
      }
    })

    return response
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_credits") {
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      return NextResponse.json(
        {
          error: `Insufficient credits: required ${meta?.required ?? 0}, remaining ${meta?.balance ?? 0}.`,
          code: "insufficient_credits",
          required: meta?.required ?? 0,
          balance: meta?.balance ?? 0,
        },
        { status: 402 }
      )
    }

    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed." }, { status: 500 })
  }
}



