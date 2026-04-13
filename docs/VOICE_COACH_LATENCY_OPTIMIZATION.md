# 语音教练实时化 — 延迟优化方案

## Context

REVIEW 文档（VOICE_COACH_REALTIME_IMPLEMENTATION_REVIEW_2026-03-20.md）显示：
- WebSocket 实时链路已跑通（ASR/LLM/TTS 全部接到火山/豆包真实服务）
- **但端到端延迟远超 1.5s 目标**

实测数据（audio.end → 各环节耗时）：

| 环节 | 样例 A | 样例 B | 目标 |
|------|--------|--------|------|
| ASR final | 394ms | 325ms | < 500ms OK |
| LLM 首 token | **5877ms** | **12713ms** | < 600ms |
| 首句就绪 | 6081ms | 12822ms | < 1000ms |
| TTS 首音频块 | 6408ms | 13221ms | < 1500ms |
| TTS 全部完成 | 8817ms | 15635ms | - |

**结论：ASR 快（~350ms），TTS 快（首句后 ~300ms），LLM 是唯一瓶颈（5.8s-12.7s）。**

---

## 根因分析

审查 `orchestrator.ts` + `streaming-llm.ts` + `prompts.ts` 后，LLM 慢的 5 个原因：

### 1. 合并 prompt 让模型"想太多"（最大元凶）
`prompts.ts:50-96` — 一次调用要求模型同时生成：
- 客户回复文本（30-80 字）
- `---ANALYSIS---` 分隔符
- 完整 JSON 分析（suggestions、polished、highlights、risk_notes，约 200-400 字）

模型在输出第一个 token 之前需要"规划"整个输出结构（回复+分析），这导致首 token 延迟暴增。

### 2. 全量历史无裁剪
`orchestrator.ts:362-370` — 每轮把完整 `turnHistory` 塞进 prompt，10 轮对话 = 20 条历史，prompt token 数线性增长。

### 3. LLM 超时设置过长
`config.ts:111` — 默认 20s 超时。即使模型 5s 没响应也不会提前 fallback。

### 4. 句子分割器最小长度偏大
`sentence-splitter.ts:51` — `minSentenceLength = 8`，需要累积 8+ 字符才触发 TTS，加上 LLM 逐 token 输出速度，增加 200-400ms。

### 5. 客户端必须等 sealed 才播放
`audio-stream-player.js:190` — `sentence.sealed && !sentence.played && sentence.chunks.length`
必须等 `tts.sentence_end` 到达才开始播放该句，加上 disk I/O（writeFileSync），额外增加 100-300ms。

---

## 优化方案（按优先级排序）

### P0：拆分 LLM 调用 — 回复优先，分析异步（预估节省 3-8s）

**当前**：1 次 LLM 调用 = 回复 + 分析，模型需规划全部输出后才吐首 token
**改为**：2 次独立调用

```
调用 A（快速回复）：只生成客户回复文本（30-80字）
  - 精简 system prompt：去掉所有分析指令
  - 输出格式：纯文本 + 尾部 JSON { "emotion": "...", "tag": "..." }
  - 预期首 token：500-1500ms（prompt 更短，输出更简单）

调用 B（异步分析）：生成分析 JSON
  - 在调用 A 完成后异步触发，不阻塞 TTS 播放
  - 可用较慢的模型
  - 结果通过 llm.analysis 事件推送给客户端
```

**改动文件：**
- `voice-coach-ws/src/shared/prompts.ts` — 新增 `buildFastReplyPrompt()` 和 `buildAsyncAnalysisPrompt()`
- `voice-coach-ws/src/pipeline/orchestrator.ts` — `runLlmAndTtsPipeline()` 拆分为 reply 管线 + async analysis
- `voice-coach-ws/src/pipeline/streaming-llm.ts` — 无需改动（通用 streamChat）

**prompts.ts 新增函数：**
```typescript
// 快速回复 prompt（精简版）
function buildFastReplyPrompt(opts): ChatMessage[] {
  // system: 角色设定 + 场景 + 约束，不包含分析指令
  // 输出格式：先纯文本回复，最后一行 JSON {"emotion":"...","tag":"..."}
  // 约束：回复控制在 30-80 字
}

// 异步分析 prompt
function buildAsyncAnalysisPrompt(opts): ChatMessage[] {
  // 包含美容师原文 + 客户回复 + 分析指令
  // 输出格式：纯 JSON
}
```

**orchestrator.ts 改动：**
```typescript
// 当前（第 438-449 行）：
await this.deps.streamChat(prompt, { onToken: acceptToken, ... })
// 改为：
const replyPrompt = buildFastReplyPrompt({ scenario, history, beauticianText })
await this.deps.streamChat(replyPrompt, { onToken: acceptReplyToken, ... })
// reply 完成后，异步启动分析（不 await）
this.runAsyncAnalysis(beauticianText, customerText)
```

### P1：历史滑动窗口（预估节省 500-2000ms）

**改动文件：** `voice-coach-ws/src/pipeline/orchestrator.ts:362-370`

```typescript
// 当前：发送全部历史
history: this.session.turnHistory.map(...)

// 改为：只发送最近 3 轮（6 条 turn）
const MAX_HISTORY_TURNS = 6
history: this.session.turnHistory.slice(-MAX_HISTORY_TURNS).map(...)
```

### P2：客户端"边收边播"（预估节省 150-400ms）

**改动文件：** `mini-program-ui/utils/audio-stream-player.js:185-230`

当前 `drainQueue()` 要求 `sentence.sealed === true` 才播放。改为：
```javascript
// 当前（第 190 行）：
return Boolean(sentence && sentence.sealed && !sentence.played && sentence.chunks.length)

// 改为：收到首个 chunk 后延迟 80ms 即开始播放（不等 sealed）
return Boolean(sentence && !sentence.played && sentence.chunks.length &&
  (sentence.sealed || Date.now() - sentence.firstChunkAt > 80))
```

同时在 `feedChunk()` 中记录首 chunk 时间：
```javascript
feedChunk(sentenceIndex, chunk) {
  const sentence = this.ensureSentence(sentenceIndex)
  sentence.chunks.push(toArrayBuffer(chunk))
  sentence.firstChunkAt = sentence.firstChunkAt || Date.now()  // 新增
  this.drainQueue()
}
```

### P3：降低句子分割最小长度（预估节省 100-300ms）

**改动文件：** `voice-coach-ws/src/pipeline/orchestrator.ts`（创建 SentenceSplitter 时）

```typescript
// 当前（第 360 行）：
const splitter = new SentenceSplitter()  // 默认 minSentenceLength=8

// 改为：
const splitter = new SentenceSplitter({ minSentenceLength: 4, maxBufferLength: 60 })
```

首句更快触发 TTS。

### P4：缩短 LLM 超时 + 更早 fallback（预估节省 0-3s）

**改动文件：** `voice-coach-ws/src/config.ts:111`

```typescript
// 当前：20s 超时
timeoutMs: Math.max(3000, Number(...) || 20000)

// 改为：快速回复 8s 超时（足够生成 80 字），分析 15s
replyTimeoutMs: 8000,
analysisTimeoutMs: 15000,
```

### P5（可选）：ASR partial 提前触发 LLM

更激进的优化——当 ASR partial 结果连续 2 次相同时，提前触发 LLM，不等 final。

**风险**：partial 不准导致 LLM 回复偏差，需要 abort 重试机制。
**收益**：节省 200-400ms（ASR final 等待时间）。
**建议**：作为 Phase 2 优化，先实现 P0-P4 看效果。

---

## 预期延迟对比

| 环节 | 优化前（样例 A） | 优化后预估 | 说明 |
|------|-----------------|-----------|------|
| ASR final | 394ms | 394ms | 不变 |
| LLM 首 token | 5877ms | **800-1500ms** | P0：精简 prompt |
| 首句就绪 | 6081ms | **1000-1700ms** | P3：minLength=4 |
| TTS 首音频块 | 6408ms | **1200-2000ms** | P2：边收边播 |
| TTS 全部完成 | 8817ms | ~4000-5000ms | 分析不阻塞 |

**最佳情况**：audio.end → 首音频播放 **~1.2s**
**P90 预估**：**~1.5-2.0s**

---

## 实现顺序

1. **P0 拆分 prompt**（prompts.ts 新增两个函数）
2. **P0 拆分 orchestrator 管线**（reply 管线 + async analysis）
3. **P1 历史裁剪**（一行改动）
4. **P3 句子分割参数**（一行改动）
5. **P4 超时参数**（config.ts 改动）
6. **P2 客户端边收边播**（audio-stream-player.js 改动）
7. **延迟测试**：运行 E2E 对比优化前后数据
8. **更新单元测试**：新增 prompt 函数的测试

## 关键文件清单

**改动：**
- `voice-coach-ws/src/shared/prompts.ts` — 新增 buildFastReplyPrompt / buildAsyncAnalysisPrompt
- `voice-coach-ws/src/pipeline/orchestrator.ts` — 拆分管线，reply→TTS 不等 analysis
- `voice-coach-ws/src/config.ts` — 拆分 replyTimeoutMs / analysisTimeoutMs
- `mini-program-ui/utils/audio-stream-player.js` — 边收边播

**微调：**
- `voice-coach-ws/src/__tests__/streaming-llm.test.ts` — 适配新 prompt
- `voice-coach-ws/src/__tests__/orchestrator.test.ts` — 适配拆分管线

## Verification

1. `cd voice-coach-ws && npm test` — 单元测试通过
2. `npm run build` — 编译通过
3. 启动 WS 服务，用真实 seed 音频跑 E2E，记录延迟：
   - `ttsFirstChunkMs` 应 ≤ 2000ms（优化前 6408ms / 13221ms）
   - `llmFirstTokenMs` 应 ≤ 1500ms（优化前 5877ms / 12713ms）
4. `llm.analysis` 事件仍正常到达（异步，不阻塞播放）
5. 打断测试：barge_in 时 reply + analysis 两个调用都能被 abort
