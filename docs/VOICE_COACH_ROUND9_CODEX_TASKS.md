# Voice Coach — 话术库 8 场景接入 + 场景选择页

## Context

当前语音教练只有 1 个场景 (`objection_safety`)，用户一点"开始练习"就直接进入对话。现在有一份完整的美容院话术库（`提示词/美容院反对意见.md`），包含 8 大销售阶段 × 120 句真实顾客台词。需要将全部 8 个场景接入语音教练，并新增场景选择页面。

**话术库 → 场景映射：**

| # | 话术库章节 | scenario_id | 场景名 | 顾客人设概要 |
|---|-----------|------------|--------|------------|
| 1 | 一、启动破冰 | `icebreaker` | 破冰接待 | 路过观望/价格试探/时间焦虑/体验派 |
| 2 | 二、需求深挖 | `needs_deep_dive` | 需求挖掘 | 描述症状/期望目标/过往阴影/预算敏感 |
| 3 | 三、价值呈现 | `value_showcase` | 价值呈现 | 质疑技术原理/追问数据证据/竞品对比 |
| 4 | 四、异议预处理 | `objection_preempt` | 异议预判 | 价格/安全/痛感/怕被套路/生活冲突 |
| 5 | 五、现场异议应对 | `objection_battle` | 异议应对 | 太贵/再想想/效果存疑/家人反对/信任低 |
| 6 | 六、成交收单 | `closing` | 成交收单 | 最后犹豫/付款方式/要折扣/效果保障 |
| 7 | 七、复购裂变 | `retention` | 复购维护 | 效果追踪/升级意向/推荐朋友/积分 |
| 8 | 八、情绪急救 | `crisis` | 情绪急救 | 效果失望/过敏反应/费用争议/威胁差评 |

---

## 6 线程任务（Codex 并行）

```
W1: scenarios.ts 扩展 — 8 个场景定义 + firstTurnPool        后端
W2: 场景选择页 — index.js/wxml/wxss 改造                    小程序前端
W3: 合并 prompt 模板适配 — 每个场景的 system prompt          后端 prompts
W4: chat.js 场景参数传递 — 从选择页接收 scenario_id          小程序前端
W5: voice-coach-ws 共享场景同步                              WS 服务
W6: 测试 + 文档                                            测试
```

---

## W1（P0）：scenarios.ts 扩展

### 改动文件
- `lib/voice-coach/scenarios.ts`

### 任务

1. 扩展 `VoiceCoachScenarioId` 联合类型：
```typescript
export type VoiceCoachScenarioId =
  | "icebreaker"
  | "needs_deep_dive"
  | "value_showcase"
  | "objection_preempt"
  | "objection_battle"   // 原 objection_safety 改名
  | "closing"
  | "retention"
  | "crisis"
```

2. 为每个场景定义完整的 `VoiceCoachScenario`，包含：
   - `name`: 中文场景名
   - `goal`: 美容师在此场景的目标
   - `customerPersona`: 顾客人设描述
   - `businessContext`: 保持通用美容院背景
   - `safetyConstraints`: 每个场景特有的合规约束
   - `seedTopics`: 从话术库的分组标签提取
   - `firstTurnPool`: 从每个场景的 120 句中选 8-10 句代表性台词

3. `firstTurnPool` 选取原则：
   - 每个分组（12 组）选 1 句最典型的
   - 覆盖不同 emotion（worried/skeptical/impatient/neutral/pleased）
   - 每句 10-40 字，适合语音对话

4. 保持向后兼容：`objection_safety` 作为别名指向 `objection_battle`

### 示例（icebreaker 场景）：
```typescript
icebreaker: {
  id: "icebreaker",
  name: "破冰接待",
  goal: "让顾客放下戒备，了解需求，引导进入体验或咨询环节。不急于推销，先建立信任。",
  customerPersona: "第一次进美容院或只是路过，可能有预算敏感、时间焦虑、对美容院有偏见，也可能是被朋友带来的陪同者。",
  businessContext: "你是一家美容机构的美容师，顾客刚进店，你需要自然地破冰、了解需求。",
  safetyConstraints: [
    "不要急于推销卡项或高价项目",
    "不要对顾客的皮肤做负面评价",
    "不要承诺免费体验后再临时加价",
  ],
  seedTopics: ["纯路过观望", "价格敏感", "时间焦虑", "功效导向", "安全顾虑", "体验尝鲜"],
  firstTurnPool: [
    { text: "我就随便看看，先不一定办卡。", emotion: "neutral", tag: "纯路过观望" },
    { text: "价位不会很离谱吧？学生党钱包紧。", emotion: "worried", tag: "价格敏感" },
    { text: "做一次需要多久？我中午休息只有45分钟。", emotion: "impatient", tag: "时间焦虑" },
    { text: "毛孔粗大能搞定吗？", emotion: "skeptical", tag: "功效导向" },
    { text: "我是敏感肌，会不会过敏？", emotion: "worried", tag: "安全顾虑" },
    { text: "有黑科技项目吗？想尝鲜。", emotion: "pleased", tag: "体验尝鲜" },
    { text: "我朋友说你们家还行，效果真有那么神吗？", emotion: "skeptical", tag: "口碑探问" },
    { text: "有没有适合新手的小白项目？", emotion: "neutral", tag: "纯路过观望" },
  ],
}
```

### 验收
1. TypeScript 编译通过
2. `getScenario("icebreaker")` 等 8 个 id 都能正确返回
3. `getScenario("objection_safety")` 仍然可用（向后兼容）
4. 每个场景的 firstTurnPool 有 8-10 句，覆盖多种 emotion

---

## W2（P0）：场景选择页改造

### 改动文件
- `mini-program-ui/pages/voice-coach/index.js`
- `mini-program-ui/pages/voice-coach/index.wxml`
- `mini-program-ui/pages/voice-coach/index.wxss`

### 任务

将当前的单按钮页面改为场景选择卡片列表：

**index.wxml：**
```xml
<view class="page page-voice-coach">
  <view class="container">
    <view class="hero fade-up">
      <text class="eyebrow">销售话术练习</text>
      <text class="title">练练：成交话术陪练</text>
      <text class="subtitle">选择一个场景开始练习</text>
    </view>

    <view class="scenario-list fade-up delay-1">
      <view
        wx:for="{{scenarios}}"
        wx:key="id"
        class="scenario-card"
        bindtap="onSelectScenario"
        data-id="{{item.id}}"
      >
        <view class="scenario-icon">{{item.icon}}</view>
        <view class="scenario-info">
          <text class="scenario-name">{{item.name}}</text>
          <text class="scenario-desc muted small">{{item.desc}}</text>
        </view>
        <view class="scenario-arrow">></view>
      </view>
    </view>
  </view>
</view>
```

**index.js：**
```javascript
Page({
  data: {
    scenarios: [
      { id: "icebreaker", name: "破冰接待", desc: "顾客刚进店，自然破冰建立信任", icon: "1" },
      { id: "needs_deep_dive", name: "需求挖掘", desc: "深入了解顾客真实需求和痛点", icon: "2" },
      { id: "value_showcase", name: "价值呈现", desc: "展示项目价值，用数据和案例说服", icon: "3" },
      { id: "objection_preempt", name: "异议预判", desc: "提前捕捉顾虑，主动拆弹", icon: "4" },
      { id: "objection_battle", name: "异议应对", desc: "正面回应拒绝和质疑", icon: "5" },
      { id: "closing", name: "成交收单", desc: "推动最后决策，完成签单", icon: "6" },
      { id: "retention", name: "复购维护", desc: "促进复购、升级和客户转介绍", icon: "7" },
      { id: "crisis", name: "情绪急救", desc: "应对投诉、过敏、差评威胁", icon: "8" },
    ],
  },

  onShow() {
    track("voice_coach_tab_view")
  },

  onSelectScenario(e) {
    const id = e.currentTarget.dataset.id
    track("voice_coach_start", { scenario_id: id })
    wx.navigateTo({ url: `/pages/voice-coach/chat?scenario_id=${id}` })
  },
})
```

**index.wxss：** 卡片列表样式（每个卡片：左侧编号圆圈 + 中间名称描述 + 右侧箭头）

### 验收
1. 页面展示 8 个场景卡片
2. 点击卡片跳转到 chat 页并传递 scenario_id
3. 样式美观，与现有主题一致

---

## W3（P0）：prompt 模板适配

### 改动文件
- `voice-coach-ws/src/shared/prompts.ts`
- `lib/voice-coach/llm.server.ts`

### 任务

当前 prompt 是针对"异议处理·安全性"硬编码的。需要改为根据 scenario 动态生成。

核心改动：prompt 中不再硬编码具体场景描述，而是从 scenario 对象中读取：

```typescript
function buildFastReplyPrompt(opts) {
  const { scenario, history, beauticianText } = opts
  const system = [
    `你正在扮演美容院的顾客，场景：${scenario.name}。`,
    `商家背景：${scenario.businessContext}`,
    `顾客人设：${scenario.customerPersona}`,
    `当前话题：${scenario.seedTopics.join(" / ")}`,
    // 安全约束从 scenario.safetyConstraints 读取
    ...scenario.safetyConstraints.map(c => `合规约束：${c}`),
    "...",
  ].join("\n")
  // ...
}
```

同样适配 `buildAsyncAnalysisPrompt` 和 `buildHintPrompt`，确保 goal 字段被用于评分：

```typescript
// analysis prompt 中加入场景目标
`美容师在此场景的目标是：${scenario.goal}`,
`请根据这个目标评估美容师的回复质量。`,
```

### 验收
1. 8 个不同场景的 prompt 都能正确生成
2. prompt 中包含对应场景的 name/goal/persona/constraints
3. 单元测试覆盖每个场景的 prompt 生成

---

## W4（P0）：chat.js 场景参数传递

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 任务

chat 页需要从 URL query 中接收 `scenario_id`，并在创建 session 时传递给后端。

```javascript
onLoad(options) {
  // 从 query 读取 scenario_id，默认 objection_battle
  this.scenarioId = options.scenario_id || "objection_battle"
  // ...
}

// createSession 调用时传递
createSession() {
  request({
    url: `/api/voice-coach/sessions`,
    method: "POST",
    data: { scenario_id: this.scenarioId },
  }).then(...)
}

// WS 连接时也传递
connectWebSocket() {
  const url = buildWsUrl(baseUrl, sessionId, token)
  // session 已包含 scenario_id，WS 服务从 DB 读取
}
```

### 验收
1. 从场景选择页进入 chat，session 创建时携带正确的 scenario_id
2. 默认 scenario_id 为 `objection_battle`（向后兼容）
3. 页面标题或顶部显示当前场景名

---

## W5（P1）：voice-coach-ws 共享场景同步

### 改动文件
- `voice-coach-ws/src/shared/scenarios.ts`

### 任务

WS 服务中的 `shared/scenarios.ts` 是从 `lib/voice-coach/scenarios.ts` 复制的。需要同步更新为 8 个场景。

**注意**：WS 服务运行时从 Supabase 读取 session 的 `scenario_id`，然后用 `getScenario(scenarioId)` 获取场景配置。只要 `shared/scenarios.ts` 与主项目的 `scenarios.ts` 保持一致即可。

### 验收
1. WS 服务的 `getScenario()` 能返回 8 个场景
2. TypeScript 编译通过
3. 与主项目的 scenarios.ts 内容一致

---

## W6（P2）：测试 + 文档

### 输出文件
- `tests/voice-coach-scenarios.test.ts`（新建）
- 更新 `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md`

### 任务

**测试：**
- getScenario 对所有 8 个 id 都返回正确结构
- objection_safety 别名兼容
- firstTurnPool 非空且 emotion 值合法
- prompt 生成覆盖所有场景

**文档更新：**
- [ ] 场景选择页：8 个卡片正确展示
- [ ] 每个场景可进入对话
- [ ] 破冰场景：开场白为观望/价格/时间类
- [ ] 异议场景：开场白为拒绝/质疑类
- [ ] 情绪急救：开场白为投诉/过敏/差评类
- [ ] 连续切换场景无崩溃

---

## Verification

1. `npx tsc --noEmit` — 全项目类型检查通过
2. `cd voice-coach-ws && npm test` — 单元测试通过
3. 微信开发者工具：
   - 场景选择页展示 8 个卡片
   - 点击任一场景 → 进入对话 → 首句台词匹配该场景
   - 对话中 AI 角色扮演符合场景人设
4. 多次进入同一场景，开场白不同

## Critical Files

**改动：**
- `lib/voice-coach/scenarios.ts` — W1 核心
- `mini-program-ui/pages/voice-coach/index.js` — W2
- `mini-program-ui/pages/voice-coach/index.wxml` — W2
- `mini-program-ui/pages/voice-coach/index.wxss` — W2
- `mini-program-ui/pages/voice-coach/chat.js` — W4
- `voice-coach-ws/src/shared/prompts.ts` — W3
- `voice-coach-ws/src/shared/scenarios.ts` — W5

**只读参考：**
- `提示词/美容院反对意见.md` — 话术库原文
- `lib/voice-coach/llm.server.ts` — 现有 prompt 模板
- `app/api/voice-coach/sessions/route.ts` — session 创建逻辑
