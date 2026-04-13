# 语音教练实时化 — Round 2 延迟优化方案（6 线程 Codex 任务）

## Context

Round 1 执行完毕，P0（prompt拆分）、P1（历史窗口）、P3（句子分割）、P4（超时拆分）全部落地。架构已正确，但 **LLM 首 token 仍然 4.5-5.7s**，远超 1.5s 目标。

### 实测数据（Round 1 之后）

| 指标 | 实测 A | 实测 B | 实测 C | 目标 |
|------|--------|--------|--------|------|
| ASR final | 1409ms | 1432ms | 1225ms | <500ms |
| LLM 首 token | 4556ms | 4650ms | 5680ms | <800ms |
| 首句就绪 | 4707ms | 4825ms | 5763ms | <1000ms |
| TTS 首音频块 | 5047ms | 5198ms | 6150ms | <1500ms |

### 根因判定

1. **LLM 模型推理慢（占 70%）**：`doubao-seed-1-6-flash-250828` 的 TTFT 天然在 3-5s 量级。Prompt 已精简到 ~600-800 tokens，无法再通过 prompt 优化大幅改善。这是**模型级别的问题**。
2. **ASR 也偏慢（占 20%）**：1.2-1.4s 而非预期的 200-400ms。原因是当前必须等 `audio.end` 后才调用 `asr.finish()`，而不是利用 partial 结果提前触发 LLM。
3. **客户端播放等 sealed（占 10%）**：`audio-stream-player.js:190` 必须等 `tts.sentence_end` 才开始播放，额外浪费 100-300ms。

---

## Round 2 优化方案（6 个 Codex Worker 并行）

### 总览

```
+--------------------------------------------------+
|            Orchestrator（总指挥）                   |
|  Phase 0: 准备多模型 API Key + benchmark 脚本     |
|  Phase 1: 分发 W1-W6 并行执行                     |
|  Phase 2: 集成测试 + 延迟对比                      |
+--------------------------------------------------+
|  W1: 多模型基准测试   |  W4: 客户端边收边播        |
|  W2: Prompt 极致精简  |  W5: ASR partial 提前触发  |
|  W3: 多模型适配层     |  W6: 连接预热+延迟仪表盘   |
+--------------------------------------------------+
```

---

### W1: 多模型 TTFT 基准测试脚本（Phase 1）

**输出文件：** `voice-coach-ws/scripts/llm-benchmark.ts`
**预计行数：** ~150 行

**任务描述：**

编写一个基准测试脚本，用真实的语音教练 prompt 测试多个 LLM 的首 token 延迟。

**测试矩阵：**

| 模型 | 提供商 | 预估 TTFT | 备注 |
|------|--------|-----------|------|
| doubao-seed-1-6-flash-250828 | 火山 Ark | 3-5s | 当前在用 |
| doubao-1-5-lite-32k | 火山 Ark | 0.5-1.5s | 轻量版，可能更快 |
| doubao-1-5-pro-32k | 火山 Ark | 1-2s | 中等版 |
| deepseek-v3 | DeepSeek | 0.3-0.8s | 业内最快之一 |
| deepseek-chat | DeepSeek | 0.5-1.2s | 性价比高 |
| glm-4-flash | 智谱 | 0.3-0.5s | 极快 TTFT |
| qwen-turbo | 阿里 | 0.5-1.0s | 快速版 |
| minimax-abab6.5s-chat | MiniMax | 0.5-1.0s | 快速版 |

**脚本逻辑：**
```typescript
// 1. 构建标准测试 prompt（用 buildFastReplyPrompt 生成）
// 2. 对每个模型发起 5 次 streaming 请求
// 3. 记录：TTFT (首token)、TPS (token/s)、总输出token数、总耗时
// 4. 输出 markdown 格式对比表
// 5. 支持通过环境变量传入各模型的 API Key 和 Base URL
```

**环境变量：**
```bash
# 火山 Ark（已有）
ARK_API_KEY=...
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# DeepSeek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 智谱 GLM
GLM_API_KEY=...
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# 阿里 Qwen
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# MiniMax
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.chat/v1
```

**验收标准：**
1. 脚本能跑通至少 3 种模型的 benchmark
2. 输出清晰的 TTFT / TPS / 总耗时对比表
3. 标注哪个模型最适合实时对话场景（TTFT < 1s 且回复质量可接受）

---

### W2: Prompt 极致精简 + Few-shot 预热（Phase 1）

**输出文件：**
- `voice-coach-ws/src/shared/prompts.ts`（修改）
- `voice-coach-ws/src/__tests__/prompts.test.ts`（新建/修改）

**预计行数：** ~80 行改动

**任务描述：**

当前 `buildFastReplyPrompt()` 的 system prompt 仍然有 ~900 字符，包含：场景名称、目标、背景、人设、约束、5 条任务指令。对于快速模型这可以进一步压缩。

**优化方向：**

A. **新增 `buildUltraFastReplyPrompt()` 函数**（~250 字符 system prompt）
```
你是美业模拟顾客。{persona}。回复30-80字自然中文。
结尾另起一行JSON：{"emotion":"...","tag":"..."}
```

B. **Few-shot 示例注入**（1 条示例放在 system prompt 末尾）
```
示例：
美容师：���最在意哪一点？
（回复）其实我主要担心效果能持续多久，毕竟之前做过一次没什么感觉。
{"emotion":"skeptical","tag":"效果持续性"}
```

C. **保留 `buildFastReplyPrompt` 作为降级**，`buildUltraFastReplyPrompt` 作为默认

D. **orchestrator.ts 中通过 config 选择 prompt 版本**
```typescript
const promptBuilder = config.ark.ultraFastPrompt
  ? buildUltraFastReplyPrompt
  : buildFastReplyPrompt
```

**验收标准：**
1. `buildUltraFastReplyPrompt` 的 system prompt ≤ 300 字符
2. 包含 few-shot 示例
3. 单元测试验证输出��式正确
4. 不改变 `buildAsyncAnalysisPrompt`（分析质量不降级）

---

### W3: 多模型适配层 + 动态切换（Phase 1）

**输出文件：**
- `voice-coach-ws/src/pipeline/streaming-llm.ts`（修改）
- `voice-coach-ws/src/config.ts`（修改）
- `voice-coach-ws/.env.example`（修改）

**预计行数：** ~100 行改动

**任务描述：**

当前 `streamChat()` 硬绑定火山 Ark 的 API 格式。需要支持多个 LLM 提供商的 streaming 接口，因为它们都兼容 OpenAI 格式。

**A. config.ts 新增多模型配置**
```typescript
ark: {
  // 现有配置保留...
  replyProvider: string        // "ark" | "deepseek" | "glm" | "qwen" | "minimax"
  analysisProvider: string     // 同上，分析可用不同provider
  providers: {
    [name: string]: {
      apiKey: string
      baseUrl: string
      model: string
      fallbackModels: string[]
    }
  }
}
```

**B. 读取环境变量**
```bash
# 选择哪个 provider 用于 reply / analysis
ARK_REPLY_PROVIDER=deepseek        # 默认 "ark"
ARK_ANALYSIS_PROVIDER=ark          # 分析可以用较慢但更强的模型

# DeepSeek 配置
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# GLM ��置
GLM_API_KEY=...
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODEL=glm-4-flash

# Qwen 配置
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-turbo
```

**C. orchestrator.ts 适配**

`streamChat()` 接口不变（已经是 OpenAI 兼容格式），只需要从 config 中读取正确 provider 的 apiKey/baseUrl/model 传入即可。

```typescript
// orchestrator.ts 中获取 reply 配置
const replyConfig = getProviderConfig(config.ark.replyProvider)
await this.deps.streamChat(prompt, {
  apiKey: replyConfig.apiKey,
  baseUrl: replyConfig.baseUrl,
  model: replyConfig.model,
  fallbackModels: replyConfig.fallbackModels,
  timeoutMs: config.ark.replyTimeoutMs,
  ...
})
```

**验收标准：**
1. 设置 `ARK_REPLY_PROVIDER=deepseek` 后，reply 调用走 DeepSeek API
2. 设置 `ARK_ANALYSIS_PROVIDER=ark` 后，analysis 仍走火山 Ark
3. 不设置时默认行为不变（backward compatible）
4. `.env.example` 更新，包含所有 provider 的配置模板

---

### W4: 客户端边收边播 + 播放器改进（Phase 1）

**输出文件：**
- `mini-program-ui/utils/audio-stream-player.js`（修改）

**预计行数：** ~30 行改动

**任务描述：**

当前 `drainQueue()` 在 `audio-stream-player.js:190` 要求 `sentence.sealed === true` 才播放。这意味着必须等 `tts.sentence_end` 到达后才开始播放。改为"收到首个 chunk 后短暂延迟即播放"。

**改动：**

A. `ensureSentence()` 新增 `firstChunkAt` 字段：
```javascript
// line 80-86
this.sentences.set(index, {
  chunks: [],
  sealed: false,
  played: false,
  filePath: "",
  firstChunkAt: 0,   // 新增
})
```

B. `feedChunk()` 记录首 chunk 时间：
```javascript
// line 92-97
feedChunk(sentenceIndex, chunk) {
  if (this.stopped) return
  const sentence = this.ensureSentence(sentenceIndex)
  sentence.chunks.push(toArrayBuffer(chunk))
  if (!sentence.firstChunkAt) sentence.firstChunkAt = Date.now()  // 新增
  this.drainQueue()
}
```

C. `drainQueue()` 放宽播放条件：
```javascript
// line 188-191 改为
const nextIndex = this.order.find((index) => {
  const sentence = this.sentences.get(index)
  if (!sentence || sentence.played || !sentence.chunks.length) return false
  // 已 sealed 或 首个 chunk 到达超过 120ms 即可播放
  return sentence.sealed || (sentence.firstChunkAt && Date.now() - sentence.firstChunkAt > 120)
})
```

D. 对于"未 sealed 就播放"的句子，播放结束时如果有新 chunk 到达，需要追加播放。在 `onEnded` 回调中检查：
```javascript
// line 54-65 的 onEnded 回调中
this.audioCtx.onEnded(() => {
  const idx = this.currentIndex
  if (idx !== null) {
    const s = this.sentences.get(idx)
    // 如果播完后有新 chunk 且还没 sealed，重新播放拼接版
    if (s && !s.sealed && s.chunks.length > /* 上次播放时的 chunk 数 */) {
      s.filePath = ""  // 清除缓存，重新写文件
      s.played = false
      this.playing = false
      this.currentIndex = null
      this.drainQueue()
      return
    }
    try { this.options.onSentenceEnd && this.options.onSentenceEnd(idx) } catch (_err) {}
  }
  this.playing = false
  this.currentIndex = null
  this.currentFilePath = ""
  this.drainQueue()
})
```

**注意**：追加播放会造成句内停顿。一个更安全的方案是：只在 `sealed` 或 chunk 数 >= 3 时才播放（保证有足够音频缓冲）。根据实测 TTS 速度决定。

**验收标准：**
1. 正常场景（TTS 快速完成）：播放行为与之前一致
2. 首句提前播放：首个 chunk 到达 120ms 后即开始播放
3. 打断（stop）仍然立即停止
4. 不引入内存泄漏或无限循环

---

### W5: ASR Partial 提前触发 LLM（Phase 1）

**输出文件：**
- `voice-coach-ws/src/pipeline/orchestrator.ts`（修改）
- `voice-coach-ws/src/pipeline/streaming-asr.ts`（修改，如需）

**预计行数：** ~80 行改动

**任务描述：**

当前流程：用户说完 → `audio.end` → `asr.finish()` → 等 `asr.final` → 触发 LLM。ASR final 本身需要 1.2-1.4s。

优化为：**ASR partial 稳定后提前触发 LLM**，不等 final。

**稳定判定逻辑：**

```typescript
// 在 orchestrator 的 onPartial 回调中
let lastPartialText = ""
let stableCount = 0
let earlyLlmTriggered = false

onPartial: (text) => {
  if (earlyLlmTriggered) return  // 已经触发过，忽略后续 partial

  if (text === lastPartialText) {
    stableCount++
  } else {
    stableCount = 0
    lastPartialText = text
  }

  // 连续 2 次相同的 partial 且文本长度 >= 5 → 判定为稳定
  if (stableCount >= 2 && text.length >= 5) {
    earlyLlmTriggered = true
    // 提前触发 LLM，不等 final
    void this.runLlmAndTtsPipeline(runToken, {
      text,
      confidence: 0.8,  // partial 的置信度打折
      durationSeconds: 0,
    }, clientAudioSeconds)
  }
}
```

**与 final 的协调：**
- 如果 early LLM 已触发，`asr.final` 到达时：
  - 如果 final 文本与 partial 一致 → 忽略，LLM 继续
  - 如果 final 文本不同 → 不中断当前 LLM（已经在生成了），但记录 metrics 标记"partial-final mismatch"
- 如果 early LLM 未触发（partial 一直在变化），回退到原有流程：等 final 再触发 LLM

**Config 开关：**
```typescript
voiceCoach: {
  earlyLlmTrigger: boolean  // 默认 true，可通过 VOICE_COACH_EARLY_LLM=false 关闭
  earlyLlmStableCount: number  // 默认 2
  earlyLlmMinLength: number    // 默认 5
}
```

**预估收益：** 节省 200-600ms（ASR partial 通常在 final 前 200-600ms 就已稳定）

**验收标准：**
1. partial 稳定 2 次后提前触发 LLM
2. 如果 partial 一直变化，回退到等 final 触发
3. barge_in 仍能正确中断
4. `VOICE_COACH_EARLY_LLM=false` 时行为与之前完全一致
5. metrics 中记录 earlyTrigger: true/false 和 partialFinalMatch: true/false

---

### W6: 连接预热 + 延迟仪表盘 + E2E 测试脚本（Phase 1）

**输出文件：**
- `voice-coach-ws/src/pipeline/connection-warmer.ts`（新建）
- `voice-coach-ws/src/pipeline/orchestrator.ts`（修改，添加预热调用）
- `voice-coach-ws/scripts/e2e-latency-test.ts`（新建）

**预计行数：** ~250 行

**任务描述：**

**A. 连接预热（connection-warmer.ts）**

LLM 的首次请求比后续请求慢 200-500ms（TCP 握手 + TLS + DNS）。在 WebSocket 连接建立时预热 LLM 连接。

```typescript
class ConnectionWarmer {
  private warmUrls: Set<string> = new Set()

  // 在 session.ready 时调用，预热 LLM endpoint
  async warmLlm(baseUrl: string, apiKey: string): Promise<void> {
    if (this.warmUrls.has(baseUrl)) return
    // 发一个空的 chat completion（极短 prompt，max_tokens=1）
    // 目的是建立 TCP 连接并让 Node.js 的 HTTP agent 缓存
    try {
      await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "any",  // 会报错，但连接已建立
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {})
      this.warmUrls.add(baseUrl)
    } catch {}
  }

  // 预热 TTS WebSocket 端点（可选）
  async warmTts(appId: string, accessToken: string): Promise<void> { ... }
}
```

**B. 延迟仪表盘**

在 orchestrator 的 `logLatencyMetrics()` 中增加结构化输出：

```typescript
private logLatencyMetrics(): void {
  const m = this.activeMetrics
  const base = m.audioEndAt || 0
  const report = {
    sessionId: this.session.sessionId,
    turnIndex: this.activeTurnIndex,
    earlyTrigger: Boolean(/* P5 早期触发标记 */),
    asrFinalMs: (m.asrFinalAt || 0) - base,
    llmFirstTokenMs: (m.llmFirstTokenAt || 0) - base,
    firstSentenceMs: (m.firstSentenceAt || 0) - base,
    ttsFirstChunkMs: (m.ttsFirstChunkAt || 0) - base,
    ttsDoneMs: (m.ttsDoneAt || 0) - base,
    model: config.ark.replyModel,
    provider: config.ark.replyProvider || "ark",
    targetMet: ((m.ttsFirstChunkAt || 0) - base) <= 1500,
  }
  this.deps.logger.info("[voice-coach-ws] turn_latency", report)
}
```

**C. E2E 延迟测试脚本（e2e-latency-test.ts）**

```typescript
// 1. 启动 WS 服务（或连接已运行的服务）
// 2. 用 ws 库建立 WebSocket 连接
// 3. 发送 audio.start
// 4. 读取预录制的 PCM 测试音频，分片发送
// 5. 发送 audio.end
// 6. 记录各事件时间戳
// 7. 输出延迟报告（与目标对比）
// 8. 支持连续跑 N 轮，输出 P50/P90/P99
```

**验收标准：**
1. 连接预热在 session.ready 后 3s 内完成
2. 延迟日志包含所有关键时间点 + model/provider 信息
3. E2E 脚本能连接真实 WS 服务跑完完整流程
4. E2E 脚本输出包含 P50/P90/P99 延迟

---

## 预期效果

### 最佳情况（DeepSeek/GLM-4-Flash + P5 early trigger + P2 边收边播）

| 环节 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| ASR → LLM 触发 | 1400ms | 800ms | 600ms (P5) |
| LLM 首 token | 4600ms | 400ms | 4200ms (模型切换) |
| 首句就绪 | +150ms | +100ms | 50ms (P2精简prompt) |
| TTS 首音频块 | +340ms | +300ms | 40ms |
| 客户端开始播放 | +0ms(等sealed) | -120ms(提前) | 120ms (P4) |
| **端到端** | **~6500ms** | **~1480ms** | **~5000ms** |

### 保守估计（仅模型切换 + 连接预热）

| 环节 | 优化后 |
|------|--------|
| ASR final | ~1200ms |
| LLM 首 token | ~600-1000ms |
| TTS 首音频块 | ~300ms |
| **端到端** | **~2100-2500ms** |

---

## 总指挥 Orchestrator 流程

### Phase 0（准备工作）
1. 确认用户已有 DeepSeek / 智谱 / 阿里 / MiniMax 至少一个 API Key
2. 将 API Key 写入 `voice-coach-ws/.env`

### Phase 1（6 Worker 并行分发）
- W1-W6 同时开工，互不依赖
- 每个 Worker 独立提交到各自分支

### Phase 2（集成检查）
```bash
cd voice-coach-ws
npm install
npx tsc --noEmit           # 类型检查
npm test                    # 单元测试
npx tsx scripts/llm-benchmark.ts   # 多模型 benchmark
npx tsx scripts/e2e-latency-test.ts  # E2E 延迟测试
```

### Phase 3（结果分析）
- 根据 W1 benchmark 结果，选择最快的模型
- 设置对应环境变量
- 重新跑 E2E 测试
- 输出最终延迟报告

---

## Verification

1. `npm test` 全部通过
2. `npm run build` 编译通过
3. `llm-benchmark.ts` 输出至少 3 种模型的 TTFT 对比
4. `e2e-latency-test.ts` 输出 P50/P90 延迟
5. 使用最快模型后，`ttsFirstChunkMs` ≤ 2000ms（P90）
6. `VOICE_COACH_EARLY_LLM=false` 时行为与 Round 1 完全一致
7. 客户端边收边播正常工作，打断不受影响

## 关键文件清单

**改动：**
- `voice-coach-ws/src/shared/prompts.ts` — 新增 `buildUltraFastReplyPrompt()`
- `voice-coach-ws/src/pipeline/orchestrator.ts` — P5 early trigger + 预热 + provider 选择
- `voice-coach-ws/src/pipeline/streaming-llm.ts` — 多 provider 适配（如需）
- `voice-coach-ws/src/config.ts` — 多 provider 配置 + 开关
- `mini-program-ui/utils/audio-stream-player.js` — 边收边播

**新建：**
- `voice-coach-ws/scripts/llm-benchmark.ts` — 多模型基准测试
- `voice-coach-ws/scripts/e2e-latency-test.ts` — E2E 延迟测试
- `voice-coach-ws/src/pipeline/connection-warmer.ts` — 连接预热
