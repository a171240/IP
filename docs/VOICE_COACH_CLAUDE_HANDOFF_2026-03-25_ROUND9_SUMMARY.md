# Voice Coach Claude Handoff 2026-03-25 Round 9 Summary

## Purpose

这份文档不是重复 `VOICE_COACH_ROUND9_CODEX_TASKS.md` 的任务拆分，而是总结 Round 9 在当前仓库里的实际落地状态，方便 Claude Code 后续继续接手时直接对准“已完成内容、偏差原因、验证结果、剩余边界”。

## Overall status

Round 9 的主目标已经落地：

1. AI 提示卡增强已经接入聊天页，包括高亮原文、风险提示、润色表达、每轮评分和提示弹窗视觉升级。
2. HTTP 和 WS 两条分析链路都已经生成并返回 `per_turn_scores`。
3. 报告页已经不再依赖固定 summary 或固定说服力/组织分，而是改为基于各轮数据聚合。
4. 报告页图表与 UI 已完成升级，但做了一个关键校准：只展示真实可计算曲线，不再伪造停顿率或语调趋势。

## What was actually implemented

## 1. 后端评分链路已经收口

### HTTP 路径

以下能力已在主后端落地：

- `lib/voice-coach/metrics.ts`
  - 已存在 `computePerTurnScores()`
  - 维度为 `persuasion / fluency / expression / pronunciation / organization`
- `lib/voice-coach/llm.server.ts`
  - `TurnAnalysisSchema` 已包含：
    - `per_turn_scores`
    - `risk_notes`
    - `persuasion_score`
    - `organization_score`
  - `llmAnalyzeBeauticianTurn()` prompt 已要求 LLM 输出 `persuasion_score` 和 `organization_score`
- `lib/voice-coach/jobs.server.ts`
  - `processAnalysisStage()` 已在落库前计算并写入 `analysis.per_turn_scores`

### WS 路径

以下能力已在 `voice-coach-ws` 落地：

- `voice-coach-ws/src/shared/metrics.ts`
  - 已复制评分相关函数
- `voice-coach-ws/src/pipeline/orchestrator.ts`
  - `runAsyncAnalysis()` 已计算 `analysis.per_turn_scores`
  - fallback analysis 也会带 `per_turn_scores`
- `voice-coach-ws/src/protocol.ts`
  - `ServerAnalysisSchema` 已包含 `per_turn_scores`
- `voice-coach-ws/src/shared/prompts.ts`
  - async analysis prompt 已要求输出 `persuasion_score` / `organization_score`

## 2. 聊天页建议卡增强已经落地

当前聊天页已具备：

- 原文 highlights 渲染
- `risk_notes` 展示
- 建议 / 润色 / 风险 三分区建议卡
- 每轮评分条
- hint sheet 视觉升级
- `openHint()` 触觉反馈

实际补充修复了两个文档里没完全展开的契约问题：

### A. highlights 严重级别兼容层

前端现在同时兼容：

- HTTP: `info | warn | bad`
- WS: `info | warning | danger`

聊天页内部会统一映射成现有样式类：

- `info -> hl-info`
- `warn / warning -> hl-warn`
- `bad / danger -> hl-bad`

### B. 评分解析不再吞掉合法低分

原实现会把 `0` 分错误回退成 `65`。  
现在前端 `parsePerTurnScores()` 只有在字段缺失或非法时才回退，合法 `0-100` 分会被保留。

### C. 建议卡补了加载态

`showSuggestions = true` 但 `analysis` 还没回来的时候，不再显示空白卡片，而是显示“建议生成中...”。

## 3. 报告页后端已经改成真实聚合

`lib/voice-coach/report.server.ts` 当前已经具备：

- 基于 `analysis_json.per_turn_scores` 的维度聚合
- 用模板生成 `summary_blocks`
- 优先使用真实的各轮数据计算说服力/组织等分数

### 当前真实曲线来源

报告页后端现在只输出这三类真实曲线：

1. `speech_rate_curve`
   - 来源：每轮 WPM
2. `filler_ratio_curve`
   - 来源：每轮 `filler_ratio`
3. `clarity_curve`
   - 来源：每轮 ASR confidence

## 4. 报告页前端已按“真实数据优先”收口

报告页前端已经保留并使用：

- 总分动画
- 高 DPI 画布
- 平滑曲线绘制
- 维度进度条
- 说服力对比卡
- 组织页音频示例

同时做了两个关键校准：

### A. 不再展示伪停顿/伪语调曲线

原 Round 9 文档要求升级图表，但当前代码链路没有真实停顿率或语调轨迹采集。  
因此没有继续保留：

- `pause_curve`
- `pitch_curve`

而是把表达页图表改为真实的 `filler_ratio_curve`。

### B. 数据不足时不再画平线假图

当某个图表不足 2 个点时，前端现在显示空态文案，而不是再画常数平线误导用户。

### C. Tab 指示器已经改成真实滑动状态

报告页不再仅靠 `.tab.active::after` 的静态下划线，而是由 `activeTabIndex` 驱动滑动指示器。

## Intentional deviations from VOICE_COACH_ROUND9_CODEX_TASKS.md

下面这些不是漏做，而是有意偏离原任务文档：

### 1. 没有保留“停顿变化曲线”

原因：

- 当前持久化数据里没有真实 pause ratio
- 如果继续画图，只能使用常数值或伪推断

处理方式：

- fluency tab 只保留真实语速曲线
- 停顿维度不再单独画伪趋势图

### 2. 没有保留“语调变化曲线”

原因：

- 当前没有真实 pitch contour 或语调特征入库

处理方式：

- expression tab 改为展示真实的冗余词占比趋势

### 3. 没有把 `voice-coach-ws/src/shared/report-logic.ts` 一起同步到 Round 9 逻辑

原因：

- 当前主流程实际生效的是 `lib/voice-coach/report.server.ts`
- 仓库内没有证据表明 `voice-coach-ws/src/shared/report-logic.ts` 被线上主流程调用

结论：

- 该文件目前仍是陈旧实现
- 只有在后续确认它开始被接入时，才需要同步更新

## Validation completed

以下验证已经实际执行通过：

### Root tests

命令：

```bash
node --test tests/*.js mini-program-ui/pages/voice-coach/*.test.js mini-program-ui/utils/*.test.js
```

结果：

- 43 tests passed

新增的 Round 9 静态回归覆盖了：

- HTTP prompt / schema / jobs 中五维评分链路
- chat highlights 归一化
- per-turn score 保留 `0` 分
- 建议卡 loading state
- report 仅输出真实可计算曲线
- WS severity / per_turn_scores 契约

### WS tests

命令：

```bash
npm test
```

目录：

```text
voice-coach-ws
```

结果：

- 7 test files passed
- 33 tests passed

WS 侧额外确认：

- `llm.analysis` payload 允许原始 LLM severity 与归一化后的 severity 共存于解析层
- 发出的 `llm.analysis` 已带 `per_turn_scores`

### Lint

命令：

```bash
npm run lint
```

结果：

- 0 errors
- 有大量既有 warnings

这些 warning 主要是仓库原本就存在的：

- `no-explicit-any`
- `no-require-imports`
- 少量未使用变量

Round 9 本轮没有新增 lint error。

## Important files

- [VOICE_COACH_ROUND9_CODEX_TASKS.md](D:/IP网站/docs/VOICE_COACH_ROUND9_CODEX_TASKS.md)
- [metrics.ts](D:/IP网站/lib/voice-coach/metrics.ts)
- [llm.server.ts](D:/IP网站/lib/voice-coach/llm.server.ts)
- [jobs.server.ts](D:/IP网站/lib/voice-coach/jobs.server.ts)
- [report.server.ts](D:/IP网站/lib/voice-coach/report.server.ts)
- [chat.js](D:/IP网站/mini-program-ui/pages/voice-coach/chat.js)
- [chat.wxml](D:/IP网站/mini-program-ui/pages/voice-coach/chat.wxml)
- [chat.wxss](D:/IP网站/mini-program-ui/pages/voice-coach/chat.wxss)
- [report.js](D:/IP网站/mini-program-ui/pages/voice-coach/report.js)
- [report.wxml](D:/IP网站/mini-program-ui/pages/voice-coach/report.wxml)
- [report.wxss](D:/IP网站/mini-program-ui/pages/voice-coach/report.wxss)
- [protocol.ts](D:/IP网站/voice-coach-ws/src/protocol.ts)
- [prompts.ts](D:/IP网站/voice-coach-ws/src/shared/prompts.ts)
- [orchestrator.ts](D:/IP网站/voice-coach-ws/src/pipeline/orchestrator.ts)
- [voice-coach-round9.static.test.js](D:/IP网站/tests/voice-coach-round9.static.test.js)

## If Claude Code continues from here

Claude 后续如果继续接手，优先级应该是：

### 1. 先不要回头重做 Round 9 主体

Round 9 的核心目标已经完成。  
后续如果要改，应优先在现有实现上微调，而不是重写聊天卡片、评分链路或报告聚合。

### 2. 如果产品坚持要“停顿/语调趋势图”

这不再是前端任务，而是数据采集任务。  
需要先补真实特征来源，再谈 UI。

### 3. 如果 WS 报告逻辑开始被接入

需要同步更新：

- `voice-coach-ws/src/shared/report-logic.ts`

否则 HTTP 报告和 WS 报告会再次漂移。

### 4. 如果继续补强回归

下一步最值得加的是：

- 后端 `generateVoiceCoachReport()` 的单测
- 报告页 tab / chart 渲染的更细粒度静态断言
- 真机级别的 report screenshot/checklist

