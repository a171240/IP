# Voice Coach Realtime 延迟优化执行记录

日期：2026-03-21  
目的：给 Claude Code 审查本轮执行结果，包含主线改动、3 个并行子线程结论、验证结果和遗留问题。

## 1. 输入文档

本轮执行前先完整读取了以下 4 份文档：

- `docs/DEV_SPEC_VOICE_COACH_REALTIME.md`
- `docs/DEV_SPEC_VOICE_COACH_CODEX_TASKS.md`
- `docs/VOICE_COACH_REALTIME_IMPLEMENTATION_REVIEW_2026-03-20.md`
- `docs/VOICE_COACH_LATENCY_OPTIMIZATION.md`

执行目标按 `VOICE_COACH_LATENCY_OPTIMIZATION.md` 落地 P0 / P1 / P3 / P4，并并行评估 P2。

## 2. 并行执行方式

这轮不是单线程硬做，而是按“总指挥 + 3 个子线程”的方式推进：

### 主线（我本地直接实现）

负责真正改代码并集成验证：

1. 拆分 LLM reply / analysis 两条管线
2. 裁剪历史窗口
3. 调整句子切分参数
4. 拆 reply / analysis timeout
5. 修补客户端对异步 analysis 的绑定
6. 重新跑单测、构建、真实 E2E

### 子线程 1：客户端异步 analysis 风险审查

审查范围：

- `mini-program-ui/pages/voice-coach/chat.js`
- `voice-coach-ws/src/protocol.ts`

结论：

- 原实现里 `llm.analysis` 直接 patch 当前全局 `realtimeBeauticianTurnId`，如果 analysis 晚到，理论上存在错贴到下一轮 beautician turn 的风险。
- 更彻底的方案是给协议加 `turn_index` / `client_turn_id` 做稳定关联。
- 本轮采用的最小落地是：服务端 `llm.analysis` 补 `beautician_turn_id`，前端优先按这个 id patch，对当前实现已经足够把“异步 analysis 晚到”风险收住。

### 子线程 2：播放器“边收边播”可行性审查

审查范围：

- `mini-program-ui/utils/audio-stream-player.js`
- `mini-program-ui/pages/voice-coach/chat.js` 的 TTS 播放调用

结论：

- 当前播放器是 `InnerAudioContext + 临时 mp3 文件` 模式。
- 这套结构不能安全实现“首个音频 chunk 一到就开始播放同一句”的真正流式播放。
- 它能稳定做到的最早粒度是“句子封口后立即播放”，做不到“边收边播”。
- 如果强上 P2，会引入 `src` 指向增长中文件、mp3 帧不完整、播放器无法感知 append 等高风险问题。

因此本轮 **没有** 直接修改 `audio-stream-player.js`，P2 被明确延后到“播放器重构”阶段，不做危险补丁。

### 子线程 3：测试影响面审查

审查范围：

- `voice-coach-ws/src/__tests__/orchestrator.test.ts`
- `voice-coach-ws/src/__tests__/streaming-llm.test.ts`
- `voice-coach-ws/src/__tests__/sentence-splitter.test.ts`

结论：

- `orchestrator.test.ts` 需要从“单次 merged prompt”改成“两次 LLM 调用：reply + async analysis”。
- `streaming-llm.test.ts` 需要补 `buildFastReplyPrompt()` 和 `buildAsyncAnalysisPrompt()` 的新断言。
- `sentence-splitter.test.ts` 原有用例大多还能保留，但默认参数已经从旧节奏转成了 `min=4 / max=60` 的新节奏。

本轮已按这个结论改完测试。

## 3. 主线实际改动

### 3.1 prompt 拆分

文件：

- `voice-coach-ws/src/shared/prompts.ts`

改动：

- 新增 `REPLY_META_DELIMITER`，位置在 `prompts.ts:37`
- 新增 `buildFastReplyPrompt()`，位置在 `prompts.ts:61`
- 新增 `buildAsyncAnalysisPrompt()`，位置在 `prompts.ts:94`
- 保留 `buildMergedPrompt()` 作为兼容与回归测试参考，位置在 `prompts.ts:139`

当前策略：

- reply prompt 只要求输出顾客回复 + 轻量 meta（emotion/tag）
- analysis prompt 独立跑，专门产出分析 JSON

### 3.2 Ark timeout / model 配置拆分

文件：

- `voice-coach-ws/src/config.ts`

改动：

- 增加 analysis model 读取逻辑，`config.ts:43`
- 增加 `replyTimeoutMs`，`config.ts:89`
- 增加 `analysisTimeoutMs`，`config.ts:92`

当前含义：

- reply 走快超时
- analysis 走单独超时，不再和 reply 共用一把超时尺子

### 3.3 orchestrator 拆成 reply 主链 + async analysis 侧链

文件：

- `voice-coach-ws/src/pipeline/orchestrator.ts`

关键改动：

- 历史窗口裁到最近 6 条 turn：`orchestrator.ts:55`
- reply meta 解析改成“最长前缀保留”，降低 delimiter 对首句切分的阻塞：`orchestrator.ts:199`
- 主链 `runLlmAndTtsPipeline()` 改成：
  - fast reply LLM
  - 句子级 TTS
  - 提前持久化 turn.saved
  - analysis 改为异步侧链
  位置：`orchestrator.ts:385`
- 新增 `runAsyncAnalysis()`：`orchestrator.ts:559`
- analysis 失败时补 fallback，并继续写回 beautician turn 为 `analysis_ready`：`orchestrator.ts:639`

当前行为变化：

1. `llm.done` 不再等待 analysis
2. `turn.saved` 提前到 TTS 播放阶段就可以下发
3. `llm.analysis` 变成“晚到但可落库”的异步事件

### 3.4 中断控制从单 controller 改成多 controller

文件：

- `voice-coach-ws/src/pipeline/barge-in.ts`
- `voice-coach-ws/src/session/session-state.ts`

改动：

- `barge-in.ts:5` 起，`abortController` 改成 `abortControllers`
- `barge-in.ts:12` / `barge-in.ts:25` 起，`register()` / `execute()` 都支持多 controller
- `session-state.ts:18` 起，session state 里也改成 `abortControllers`

目的：

- reply 和 analysis 现在是两条并行调用，barge-in 不能只中断其中一条

### 3.5 客户端异步 analysis 绑定修补

文件：

- `voice-coach-ws/src/protocol.ts`
- `mini-program-ui/pages/voice-coach/chat.js`

改动：

- `protocol.ts:96` 起，`ServerLlmAnalysisSchema` 增加可选 `beautician_turn_id`
- `chat.js:605` 起，`llm.analysis` 优先按 `message.beautician_turn_id` 去 patch 目标 turn

这是本轮吸收子线程 1 结论后的最小修复。

### 3.6 测试更新

文件：

- `voice-coach-ws/src/__tests__/orchestrator.test.ts`
- `voice-coach-ws/src/__tests__/streaming-llm.test.ts`

改动：

- `orchestrator.test.ts:67` 起，主回归用例改成 reply / analysis 两次 LLM 调用
- `streaming-llm.test.ts:59` 起，新增 `buildFastReplyPrompt()` 用例
- `streaming-llm.test.ts:76` 起，新增 `buildAsyncAnalysisPrompt()` 用例

## 4. 没做的事

### 4.1 P2 没有直接动播放器

这是有意为之，不是漏做。

原因：

- 当前 `audio-stream-player.js` 不是流播放器
- 它是“攒 chunk -> 写完整 mp3 -> InnerAudioContext 播放”的文件播放器
- 直接改成“收到第一个 chunk 后 80ms 就播”在这套结构里不可靠

如果后续一定要追 P2，需要单开一轮播放器重构，而不是在现有文件上打小补丁。

### 4.2 没有把 turn 级稳定键升级成 `turn_index + client_turn_id`

子线程 1 建议这是更彻底的方案。

本轮没有继续把协议扩成这一版，原因是：

- 目前 `turn.saved` 已经被前移
- `llm.analysis` 也已有 `beautician_turn_id`
- 现阶段足够解决“analysis 晚到贴错 turn”的主风险

这仍然是后续可以继续加强的点。

## 5. 验证结果

### 5.1 单测与构建

执行结果：

- `cd voice-coach-ws && npm test`
- `cd voice-coach-ws && npm run build`

结果：

- 6 个测试文件
- 24 条测试
- 全部通过
- TypeScript build 通过

### 5.2 真实 E2E（本地 WS + 现网 sessions API + 火山 ASR/TTS + 豆包 Ark）

验证方式：

1. 本地启动 `voice-coach-ws`
2. 用 Supabase admin 创建临时测试用户
3. 走现网 `POST /api/voice-coach/sessions`
4. 取首个 customer turn 的真实音频做输入
5. 连本地 `/ws/voice-coach`
6. 完整跑到 `tts.done`
7. 再等待 `llm.analysis`

### 实测 A（拆流后，未加 analysis fallback 前）

- `asrFinalMs = 1409`
- `llmFirstTokenMs = 4556`
- `firstSentenceMs = 4707`
- `ttsFirstChunkMs = 5047`
- `ttsDoneMs = 6713`
- `llm.analysis` 在 `tts.done + 6s` 内未到

### 实测 B（analysis timeout=15s，确认失败形态）

- `asrFinalMs = 1432`
- `llmFirstTokenMs = 4650`
- `firstSentenceMs = 4825`
- `ttsFirstChunkMs = 5198`
- `ttsDoneMs = 6560`
- 之后日志出现：`async_analysis_failed -> llm_timeout:15000`

### 实测 C（加上 analysis fallback / 补写 analysis_ready 后）

- `asrFinalMs = 1225`
- `llmFirstTokenMs = 5680`
- `firstSentenceMs = 5763`
- `ttsFirstChunkMs = 6150`
- `ttsDoneMs = 7022`
- `llm.analysis` 到达
- `analysisAfterTtsMs = 12961`

持久化状态：

- turn 数量 = 3
- role 顺序：
  - `customer`
  - `beautician`
  - `customer`
- status：
  - `customer -> audio_ready`
  - `beautician -> analysis_ready`
  - `customer -> text_ready`

## 6. 这轮的实际收益

### 已解决

- reply 不再被 analysis 阻塞
- `turn.saved` 不再卡到 analysis 之后
- analysis 现在即使超时，也有 fallback，不会整轮丢失建议
- `barge_in` 能同时处理中断 reply / analysis
- 客户端不再只依赖“当前 beautician ref”接 analysis

### 仍未达标

目标文档里希望：

- `llmFirstToken <= 1500ms`
- `ttsFirstChunk <= 2000ms`

当前真实链路依然在：

- `llmFirstToken ≈ 4.5s - 5.7s`
- `ttsFirstChunk ≈ 5.0s - 6.1s`

所以结论很明确：

- 这轮主架构已经切到正确方向
- 但 reply 首 token 仍然是第一瓶颈
- P2 不动播放器的情况下，短期内提升主要还得继续从 Ark 模型选择和 reply prompt 再瘦身上挖

## 7. 建议 Claude Code 重点审查的点

1. `orchestrator.ts` 里 reply / analysis 拆流后的事件顺序是否合理
2. `turn.saved` 前移是否会影响现有小程序状态机
3. `beautician_turn_id` 作为 analysis 目标键是否足够，还是应升级到 `turn_index`
4. analysis 失败后直接 fallback 是否符合产品预期
5. 在不重写播放器的前提下，是否还有更安全的 P2 替代方案

