# IP内容工厂 - 提示词模块化架构

## 目录结构

```
lib/prompts/
├── README.md                    # 本文件
├── step-prompts.ts             # 主配置文件（导入和映射）
├── research/                   # 研究定位阶段 (Phase 1)
│   ├── p1-industry.ts         # ✅ P1: 行业目标分析
│   ├── p2-cognition.ts        # ✅ P2: 行业认知深度
│   ├── p3-emotion.ts          # ✅ P3: 情绪价值分析
│   └── ip-biography.ts        # ✅ IP传记: 深度访谈
├── persona/                    # 人设构建阶段 (Phase 2)
│   ├── p4-concept.ts          # ✅ P4: IP概念生成
│   ├── p5-type-positioning.ts # ✅ P5: IP类型定位（动态加载）
│   └── p6-content-director.ts # ✅ P6: 4X4内容运营规划
└── content/                    # 内容生产阶段 (Phase 3) - 闭环反馈系统
    ├── p7-attraction.ts       # ✅ P7: 选题库生成（读取P10反馈）
    ├── p8-rational.ts         # ✅ P8: 脚本创作中心（读取P10反馈）
    ├── p9-product.ts          # ✅ P9: 口语化优化（读取P10反馈）
    └── p10-emotion.ts         # ✅ P10: 迭代管理（输出反馈数据）
```

## 完成状态
### ✅ 已完成 (11/11)
- **P1**: 行业目标分析师 - 完整提示词
- **P2**: 行业认知深度分析助手 - 完整提示词
- **P3**: 情绪价值分析专家 - 完整提示词
- **IP传记**: 记者型操盘手 - 完整提示词
- **P4**: IP概念生成器 - 完整提示词
- **P5**: IP类型定位 - 7大IP画布分析
- **P6**: 4X4内容运营总监 - 60期规划
- **P7**: 选题库生成大师 - 热点+IP故事+行业情绪（读取P10反馈）
- **P8**: 脚本创作中心 - 6种智能体整合（读取P10反馈）
- **P9**: 口语化优化大师 - AI味检测+三次改写（读取P10反馈）
- **P10**: 迭代管理器 - 日志+版本+反馈输出

## 第三阶段闭环反馈系统

```
P7 选题库 ◀──── 已使用选题 + 选题建议 ────┐
    │                                   │
    ▼                                   │
P8 脚本创作 ◀── 创作偏好 + 迭代建议 ──────┤
    │                                   │
    ▼                                   │
P9 口语化 ◀──── 常见问题 + 改写案例 ──────┤
    │                                   │
    ▼                                   │
P10 迭代管理 ───────────────────────────┘
    (反馈数据中心)
```

### P10输出的反馈数据
- **选题使用记录**: 供P7参考，标记已使用选题
- **创作偏好记录**: 供P8参考，优化智能体推荐
- **口语化问题记录**: 供P9参考，个性化检测

## 使用方式

### 后端自动加载
后端 API 路由会自动根据 `stepId` 加载对应的提示词：
```typescript
// app/api/chat/route.ts
import { getStepPrompt } from '@/lib/prompts/step-prompts'

const prompt = getStepPrompt('P7')  // 自动加载 P7 的完整提示词
```

### P8 子智能体选择（agentId）
P8 默认使用 `getStepPrompt('P8')` 加载脚本创作中心提示词。

如果前端请求体额外传入 `agentId`（例如 `deep-resonance`），后端会从 `提示词/` 目录读取该智能体的 Markdown 提示词，并在 `stepId === 'P8'` 时覆盖系统提示词，从而让模型以所选智能体的能力直接开始工作。

- 前端 UI：`app/dashboard/workflow/[stepId]/WorkflowStepClient.tsx`（P8 输入区下拉选择，并透传 `agentId`）
- 后端路由：`app/api/chat/route.ts`（读取 `agentId` 并加载提示词）
- 提示词读取：`lib/agents/prompt.server.ts`

请求示例：
```json
{ "stepId": "P8", "agentId": "deep-resonance", "messages": [ { "role": "user", "content": "..." } ] }
```

## 步骤配置清单

### Phase 1: 研究定位
| 步骤 | 文件 | 功能 |
|------|------|------|
| P1 | `research/p1-industry.ts` | 行业目标分析 |
| P2 | `research/p2-cognition.ts` | 行业认知深度 |
| P3 | `research/p3-emotion.ts` | 情绪价值分析 |
| IP传记 | `research/ip-biography.ts` | 深度访谈 |

### Phase 2: 人设构建
| 步骤 | 文件 | 功能 |
|------|------|------|
| P4 | `persona/p4-concept.ts` | IP概念生成 |
| P5 | `persona/p5-type-positioning.ts` | IP类型定位（动态加载） |
| P6 | `persona/p6-content-director.ts` | 4X4内容运营规划 |

### Phase 3: 内容生产（闭环系统）
| 步骤 | 文件 | 功能 | 依赖 |
|------|------|------|------|
| P7 | `content/p7-attraction.ts` | 选题库生成 | P1,P3,P6,IP传记 |
| P8 | `content/p8-rational.ts` | 脚本创作中心 | P7 |
| P9 | `content/p9-product.ts` | 口语化优化 | P8 |
| P10 | `content/p10-emotion.ts` | 迭代管理 | P9 |

## 调试技巧
### 查看提示词是否加载成功
在 `app/api/chat/route.ts` 中已添加调试日志：
```typescript
console.log(`[Chat API] stepId: ${stepId}`)
console.log(`[Chat API] Found prompt: ${finalSystemPrompt ? 'YES' : 'NO'}`)
console.log(`[Chat API] Prompt length: ${finalSystemPrompt.length} chars`)
```

访问步骤并发送消息后，在 VSCode 终端查看日志。

### 验证导入是否正确

如果编译失败，检查：
1. 文件名和路径是否正确
2. export 导出是否匹配
3. `step-prompts.ts` 的 import 路径是否正确

## ✅ 架构优势

1. **模块化管理**: 每个步骤独立文件，易于维护和更新
2. **闭环反馈**: P10输出反馈数据供P7/P8/P9读取
3. **版本控制**: Git 可以追踪每个提示词的修改历史
4. **团队协作**: 多人可以同时编辑不同步骤的提示词
5. **代码复用**: 统一的加载机制，便于扩展
6. **类型安全**: TypeScript 提供类型检查和智能提示

---

**最后更新**: 2025-12-15
**维护者**: Claude Code
