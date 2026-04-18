# Voice Coach Customer/Scene Optimization

更新时间：2026-04-18

## 文档定位

本文件是当前语音陪练「顾客档案 + 场景卡」专项优化的主开发文档。

放置位置：
- 主文件：`docs/VOICE_COACH_CUSTOMER_SCENE_OPTIMIZATION.md`
- 入口索引：`README.md`
- 进度入口：`docs/DEV_HANDOFF.md`

这样处理的原因：
- 这是持续演进的专项，不适合继续散落在聊天记录里
- 它不是一次性的 handoff，也不是历史 round task list
- 它需要和现有 `VOICE_COACH_*` 文档并列，成为后续开发、回归、交接的稳定入口

配套阅读顺序：
1. `docs/VOICE_COACH_CUSTOMER_SCENE_OPTIMIZATION.md`
2. `docs/VOICE_COACH_DOMAIN_TOPOLOGY.md`
3. `docs/DEV_SPEC_VOICE_COACH_REALTIME.md`
4. `docs/DEV_HANDOFF.md`

---

## 1. 背景

当前语音陪练已经支持在训练配置中选择：
- 顾客档案
- 场景卡
- 本次备注

这些信息也已经进入会话创建链路，并影响首轮开场与后续实时对话。

但从实际代码链路看，当前实现仍然处于：

`基础 scenario（objection_safety） + session snapshot 覆盖`

而不是：

`顾客档案/场景卡成为完整的一等训练驱动`

这会带来两个问题：
- 对话主链已经比较个性化，但部分兜底链路和报告链仍然泛化
- 训练结束后的复盘，不能明确判断“这位顾客”和“这张场景卡”是否真正被接住

本轮优化目标不是重写整套语音引擎，而是把现有顾客/场景能力真正打通到整条训练链。

---

## 2. 当前真实链路

### 2.1 配置与进入聊天

小程序在训练配置页选择顾客档案、场景卡、备注后，会构建 pending setup：
- `mini-program-ui/pages/voice-coach/setup-storage.js`
- `mini-program-ui/pages/voice-coach/setup/index.js`

当前 pending setup 固定包含：
- `scenario_id: "objection_safety"`
- `customer_profile_id`
- `scene_card_id`
- `live_notes`

### 2.2 会话创建

聊天页读取 pending setup 并创建 session：
- `mini-program-ui/pages/voice-coach/chat.js`
- `app/api/voice-coach/sessions/route.ts`

后端会：
1. 校验 payload
2. 读取 `voice_coach_customer_profiles`
3. 读取 `voice_coach_scene_cards`
4. 生成 `scenario_snapshot_json`
5. 生成 `prompt_context_text`
6. 写入 `voice_coach_sessions`

核心代码：
- `lib/voice-coach/session-context.ts`
- `app/api/voice-coach/sessions/route.ts`

### 2.3 首轮顾客开场

首轮顾客开场在 session 创建时生成：
- `app/api/voice-coach/sessions/route.ts`
- `lib/voice-coach/llm.server.ts`

当前已经会优先使用：
- `core_concerns`
- `trust_triggers`
- `past_experience`

### 2.4 实时对话

实时链分两套：
- HTTP/异步 job 链：`lib/voice-coach/jobs.server.ts`
- WS/实时链：`voice-coach-ws/src/ws-server.ts` + `voice-coach-ws/src/pipeline/orchestrator.ts`

这两套链都已经读取：
- `scenario_snapshot_json`
- `prompt_context_text`

因此顾客档案/场景卡已经进入：
- 后续顾客回复生成
- 实时 prompt
- 分析 prompt
- hint 的 LLM 路径

### 2.5 报告链

报告生成走：
- `app/api/voice-coach/sessions/[sessionId]/end/route.ts`
- `app/api/voice-coach/sessions/[sessionId]/report/route.ts`
- `lib/voice-coach/report-refresh.ts`
- `lib/voice-coach/report.server.ts`

当前问题是：
- 报告链主要读取 `scenario + turns`
- 基本不读取 `scenario_snapshot_json`

这意味着报告页虽然能给出五维评分，但对“这位顾客/这张场景卡”的命中情况反馈还不够。

---

## 3. 当前已确认的问题

### 3.1 已经做对的部分

以下链路已经接入顾客/场景上下文：
- 配置页选择
- session 创建
- snapshot 落库
- 首轮顾客开场
- WS 实时 prompt
- HTTP job prompt
- LLM hint
- 聊天页上下文展示

### 3.2 当前的主要断点

#### A. 报告链没有真正吃 snapshot

现状：
- 报告只围绕 `scenario + turns`
- 不能直接判断是否命中 `must_cover_points`
- 不能直接判断是否踩了 `do_not_say`
- 不能根据顾客画像评估“是否接住核心顾虑”

影响：
- 报告的专业度不够
- 训练完成后的复盘价值被削弱

#### B. fallback 路径会退回泛化

现状：
- `jobs.server.ts` 的 `fallbackCustomerTurn` 不读 session context
- `hint` 的 fallback 模板也不读 session context

影响：
- 一旦 LLM 超时、失败或降级，顾客回复/提示会突然变得很通用
- 用户体感上会觉得“前面像是真人，后面又变成模板机”

#### C. 部分场景卡字段只是存了，没有真正成为约束

现状：
- `communication_method_tags` 已建模
- 但没有进入核心 prompt 约束

现状：
- `must_cover_points` 和 `do_not_say` 已进入 `prompt_context_text`
- 但没有进入报告判断层

影响：
- 场景卡的结构化价值没有完全释放

#### D. 首轮开场更偏顾客画像，场景目标约束还不够强

现状：
- 首句明确优先了顾客的 `core_concerns`
- 但对场景卡的 `scene_goal / likely_questions / target_objections / must_cover_points` 使用还偏弱

影响：
- 顾客像“这个人”
- 但不一定足够像“这个时间点、这个项目、这个推广目的下的这个人”

#### E. 引擎层仍然只有一个基础 scenario

现状：
- 当前仍然只有 `objection_safety`
- 前端 pending setup 也固定写这个 id

影响：
- `customer_visit` 和 `offer_promo` 的差异主要依赖文本上下文覆盖
- 还没有形成真正的训练策略分型

---

## 4. 本轮优化目标

### 4.1 目标

把当前链路升级成：

`基础 scenario + scene kind 策略 + session snapshot + fallback 保真 + snapshot-aware report`

也就是说：
- 先不推翻当前引擎
- 但让顾客档案与场景卡在所有关键环节都不掉线

### 4.2 非目标

本轮不做：
- 重写整套 scenario 注册体系
- 彻底移除 `objection_safety`
- 改数据库表结构
- 大规模改小程序信息架构
- 新增新的训练模式类型

---

## 5. 分阶段计划

## Phase 1：补齐链路断点

目标：
- 报告链真正读取 snapshot
- fallback 路径不再退回通用模板

### 5.1 报告链 snapshot-aware

要做的事：
- 让 report/end 路由在 `fetchSession` 时读取：
  - `customer_profile_id`
  - `scene_card_id`
  - `session_context_json`
  - `scenario_snapshot_json`
- 扩展 `refreshVoiceCoachReport`
- 扩展 `generateVoiceCoachReport`

报告新增判断：
- 是否命中顾客核心顾虑
- 是否覆盖 `must_cover_points`
- 是否触发 `do_not_say`
- 本次训练背景摘要

涉及文件：
- `app/api/voice-coach/sessions/[sessionId]/report/route.ts`
- `app/api/voice-coach/sessions/[sessionId]/end/route.ts`
- `lib/voice-coach/report-refresh.ts`
- `lib/voice-coach/report.server.ts`
- `lib/voice-coach/report.ts`
- `mini-program-ui/pages/voice-coach/report.js`
- `mini-program-ui/pages/voice-coach/report.wxml`

验收标准：
- 报告中能看到具体顾客/场景背景
- 报告能明确指出是否命中场景重点
- 报告能指出是否踩禁忌表达

### 5.2 fallback 保真

要做的事：
- 让 `fallbackCustomerTurn` 支持读取 session context
- 让 `buildFallbackHint` 支持读取 session context

最低要求：
- fallback 仍然优先围绕当前顾客的 `core_concerns`
- fallback 仍然围绕当前场景卡的 `service_name / target_objections / likely_questions`
- fallback 不得回到纯泛化“安全/价格”模板

涉及文件：
- `lib/voice-coach/jobs.server.ts`
- `app/api/voice-coach/sessions/[sessionId]/hint/route.ts`

验收标准：
- 模拟 LLM 失败后，顾客回复和 hint 仍与当前训练背景一致

---

## Phase 2：强化场景卡的结构化约束

目标：
- 场景卡不只是“附加文本”
- 而是能真正影响顾客生成、hint、报告

### 5.3 首轮开场强化

要做的事：
- 在首轮开场目标构造中显式纳入：
  - `scene_goal`
  - `likely_questions`
  - `target_objections`
  - `must_cover_points`
  - `do_not_say`

涉及文件：
- `app/api/voice-coach/sessions/route.ts`
- `lib/voice-coach/session-context.ts`

验收标准：
- 首句不仅像“这位顾客”
- 也像“这次训练任务下的这位顾客”

### 5.4 communication_method_tags 真正入链

要做的事：
- 把 `communication_method_tags` 纳入 `prompt_context_text`
- 让它影响：
  - 顾客追问风格
  - hint 生成
  - 报告评语

涉及文件：
- `lib/voice-coach/session-context.ts`
- `lib/voice-coach/llm.server.ts`
- `app/api/voice-coach/sessions/[sessionId]/hint/route.ts`
- `lib/voice-coach/report.server.ts`
- `mini-program-ui/pages/voice-coach/setup-storage.js`

验收标准：
- 场景卡中的沟通方法标签不再是死字段

---

## Phase 3：按 scene kind 分化训练策略

目标：
- 在不推翻现有引擎的前提下，让 `customer_visit` 和 `offer_promo` 形成不同训练策略

### 5.5 scene kind policy

要做的事：
- 增加一层 `scene kind policy`
- 依据 `scene_kind` 调整：
  - 首轮开场偏好
  - 顾客追问偏好
  - hint 输出重点
  - 报告解释口径

建议策略：
- `customer_visit`
  - 更强调顾客顾虑、到店决策、信任建立
- `offer_promo`
  - 更强调项目原理、适用边界、价值转化、推广阻力

涉及文件：
- `lib/voice-coach/session-context.ts`
- `lib/voice-coach/llm.server.ts`
- `lib/voice-coach/jobs.server.ts`
- `lib/voice-coach/report.server.ts`
- `voice-coach-ws/src/shared/prompts.ts`

验收标准：
- 两类场景在同一基础 scenario 下，输出明显不同

---

## Phase 4：测试与真机回归

目标：
- 防止这次优化再次丢上下文

### 5.6 测试补齐

需要新增或补强的测试：
- 报告链读取 snapshot
- fallback 读取 session context
- `communication_method_tags` 真正入 prompt
- `must_cover_points` / `do_not_say` 进入报告判断
- `customer_visit` 与 `offer_promo` 输出差异化

重点位置：
- `tests/`
- `voice-coach-ws/src/__tests__/`

### 5.7 真机回归场景

回归必须覆盖：
- 场景 A：真实顾客明天到店
- 场景 B：新项目推广训练
- 场景 C：LLM 降级/fallback
- 场景 D：结束训练看报告

---

## 6. 推荐执行顺序

推荐按下面顺序开发：
1. Phase 1.1 报告链 snapshot-aware
2. Phase 1.2 fallback 保真
3. Phase 2.1 首轮开场强化
4. Phase 2.2 communication_method_tags 入链
5. Phase 3 scene kind policy
6. Phase 4 测试与真机回归

原因：
- 先修报告链，才能判断前面训练到底有没有真的生效
- 先修 fallback，才能防止训练在异常条件下掉回模板态
- 再做结构化增强，性价比最高
- 最后再做策略分型，风险最小

---

## 7. 开发前决策结论

本轮开发按以下原则执行：

### 决策 1
继续保留 `objection_safety` 作为基础 scenario。

原因：
- 当前对话链已经大量依赖它
- 直接推翻风险太高
- 本轮目标是打通上下文，不是重写引擎

### 决策 2
优先把 snapshot 变成训练与报告的统一事实来源。

原因：
- 现在 snapshot 已经落库
- 最适合作为“训练时”和“复盘时”的共同上下文

### 决策 3
fallback 也必须遵守 snapshot。

原因：
- 用户不会区分“这轮是 LLM 成功还是 fallback”
- 只要一退回通用模板，训练沉浸感就会断

### 决策 4
场景卡字段优先做“结构化增强”，暂不做数据库重构。

原因：
- 现有字段已经够用
- 现在的问题主要是“没吃进去”，不是“字段不够”

---

## 8. 当前文档状态

当前状态：
- 计划已确认
- 文档已落盘
- 还未开始进入功能开发

功能开发启动条件：
- 以本文件为准
- 从 Phase 1 开始按顺序执行

