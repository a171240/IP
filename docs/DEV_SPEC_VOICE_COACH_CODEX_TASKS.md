# 语音教练实时化 — Codex 多智能体任务手册

> 配套文档：DEV_SPEC_VOICE_COACH_REALTIME.md（技术 SPEC）
> 执行方式：1 个总指挥 Codex（Orchestrator）+ 6 个并行 Worker Codex

---

## 任务总览

```
+-----------------------------------------------------+
|              Orchestrator（总指挥 Codex）              |
|  1. 创建项目脚手架                                    |
|  2. 分发 Phase 1 四个并行任务                         |
|  3. Review + 集成                                    |
|  4. 分发 Phase 2 两个并行任务                         |
|  5. 最终组装 + 端到端验证                             |
+----------------------------+-------------------------+
|  Phase 1（并行，无依赖）    |  Phase 2（依赖Phase 1）  |
|  W1: 流式ASR客户端         |  W5: 管线编排+打断       |
|  W2: 流式LLM客户端         |  W6: 小程序端改造        |
|  W3: 流式TTS客户端         |                         |
|  W4: 协议层+基础设施        |                         |
+----------------------------+-------------------------+
```

---

## Worker 1：流式 ASR 客户端（Phase 1）

**输出文件：** `voice-coach-ws/src/pipeline/streaming-asr.ts`
**依赖：** 无（独立模块）
**预计行数：** ~200 行

### 任务描述

实现豆包流式ASR的 WebSocket 客户端。参考火山引擎 SAUC 大模型流式语音识别 API。

### 接口设计

```typescript
interface StreamingAsrOptions {
  appId: string
  accessToken: string
  resourceId?: string       // 默认 "volc.seedasr.auc"
  sampleRate?: number       // 默认 16000
  format?: "pcm" | "mp3"   // 默认 "pcm"
  onPartial: (text: string) => void
  onFinal: (result: { text: string; confidence: number; durationSeconds: number }) => void
  onError: (error: Error) => void
}

class StreamingAsr {
  constructor(options: StreamingAsrOptions)
  async connect(): Promise<void>
  sendAudio(chunk: Buffer): void
  async finish(): Promise<{ text: string; confidence: number; durationSeconds: number }>
  abort(): void
  get isConnected(): boolean
}
```

### 豆包 SAUC WebSocket 协议要点

- 连接地址：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`
- 握手 header：`X-Api-App-Key`, `X-Api-Access-Key`, `X-Api-Resource-Id`
- 首帧发送 JSON 配置（采样率、格式、是否返回中间结果）
- 后续帧发送 Binary 音频数据
- 最后发送结束标记
- 服务端返回：`{ type: "partial_result" | "final_result", text, confidence }`

### 参考现有代码

- `lib/voice-coach/speech/doubao.server.ts` 第 220-296 行（Flash ASR 认证方式）
- 认证 header：`X-Api-App-Key: {appId}`, `X-Api-Access-Key: {accessToken}`

### 验收标准

1. 能成功连接豆包 SAUC WebSocket
2. 发送 PCM 音频块后收��� partial 结果
3. finish() 后收到 final 结果（文本+置信度）
4. abort() 立即关闭连接，不抛异常
5. 连接超时/断开有明确错误回调
6. 编写单元测试：mock WebSocket 验证协议交互

---

## Worker 2：流式 LLM 客户端（Phase 1）

**输出文件：** `voice-coach-ws/src/pipeline/streaming-llm.ts` + `voice-coach-ws/src/shared/prompts.ts`
**依赖：** 无（独立模块）
**预计行数：** ~250 行

### 任务描述

实现 APIMART 的 SSE streaming 客户端 + 从现有 `llm.server.ts` 提取合并的 prompt 模板。

### 接口设计

```typescript
interface StreamingLlmOptions {
  apiKey: string
  baseUrl: string           // 默认 https://api.apimart.ai/v1
  model: string             // 默认 kimi-k2-thinking-turbo
  temperature?: number      // 默认 0.6
  timeoutMs?: number        // 默认 15000
  abortSignal?: AbortSignal
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

async function streamChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: StreamingLlmOptions
): Promise<void>

function buildMergedPrompt(opts: {
  scenario: VoiceCoachScenario
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: string }>
  beauticianText: string
}): Array<{ role: "system" | "user"; content: string }>
```

### 合并 Prompt 设计

当前两次 LLM 调用合并为一次。输出格式：

```
[客户回复纯文本，30-80字]
---ANALYSIS---
{"emotion":"...","tag":"...","analysis":{"suggestions":[...],"polished":"...","highlights":[...],"risk_notes":[...]}}
```

服务端流式解析：
1. 遇到 `---ANALYSIS---` 之前 → 客户回复文本 → 送入 sentence-splitter → TTS
2. 之后 → 累积为 JSON，LLM 结束后解析

### 参考现有代码

- `lib/voice-coach/llm.server.ts` 第 83-210 行：prompt 模板、Zod schemas
- `lib/voice-coach/llm.server.ts` 第 33-80 行：`apimartChatJson` 函数（改为 SSE）
- 环境变量：`APIMART_API_KEY`, `APIMART_BASE_URL`, `APIMART_FAST_MODEL`

### 验收标准

1. SSE 流正确解析，onToken 逐 token 触发
2. AbortController.abort() 立即终止
3. buildMergedPrompt 包含场景、历史、安全约束
4. 编写单元测试：mock SSE 流验证解析

---

## Worker 3：流式 TTS 客户端（Phase 1）

**输出文件：** `voice-coach-ws/src/pipeline/streaming-tts.ts`
**依赖：** 无（独立模块）
**预计行数：** ~200 行

### 任务描述

实现豆包流式TTS的 WebSocket 客户端。

### 接口设计

```typescript
interface StreamingTtsOptions {
  appId: string
  accessToken: string
  cluster?: string          // 默认 "volcano_tts"
  voiceType?: string        // 默认 "zh_female_vv_uranus_bigtts"
  language?: string         // 默认 "cn"
  emotion?: "neutral" | "happy" | "sad" | "angry"
  onAudioChunk: (chunk: Buffer) => void
  onDone: () => void
  onError: (error: Error) => void
}

class StreamingTts {
  constructor(options: StreamingTtsOptions)
  async connect(): Promise<void>
  async synthesize(text: string): Promise<void>
  abort(): void
  get isConnected(): boolean
}
```

### 豆包 TTS WebSocket 协议要点

- 连接地址：`wss://openspeech.bytedance.com/api/v1/tts/ws_binary`
- 二进制协议：header(1 byte) + payload
- 首帧 JSON 配置（voice_type, cluster, format, sample_rate）
- 文本帧发送要合成的文字
- 服务端返回二进制音频块（MP3）
- 最后返回结束标记

### 参考现有代码

- `lib/voice-coach/speech/doubao.server.ts` 第 74-218 行（TTS 配置、认证、音色）
- 情绪映射：neutral→neutral, worried→sad, skeptical→neutral, impatient→angry, pleased→happy

### 验收标准

1. 成功连接豆包 TTS WebSocket
2. 发送文本后收到 MP3 音频块流
3. abort() 立即关闭
4. 支持 emotion 参数
5. 编写单元测试


---

## Worker 4：协议层 + 基础设施（Phase 1）

**输出文件：**
- `voice-coach-ws/src/protocol.ts`
- `voice-coach-ws/src/config.ts`
- `voice-coach-ws/src/auth.ts`
- `voice-coach-ws/src/session/session-state.ts`
- `voice-coach-ws/src/session/session-manager.ts`
- `voice-coach-ws/src/db/supabase.ts`
- `voice-coach-ws/src/db/turns.ts`
- `voice-coach-ws/src/db/sessions.ts`
- `voice-coach-ws/src/db/events.ts`
- `voice-coach-ws/src/shared/` 全部文件
- `voice-coach-ws/src/pipeline/sentence-splitter.ts`
- `voice-coach-ws/package.json`
- `voice-coach-ws/tsconfig.json`
- `voice-coach-ws/.env.example`

**依赖：** 无
**预计行数：** ~600 行

### 任务描述

搭建 WebSocket 服务的全部基础设施，包括：

**A. 项目脚手架**
- package.json：依赖 ws, @supabase/supabase-js, zod, jsonrepair, dotenv
- tsconfig.json：strict, ESM
- .env.example：所有环境变量模板

**B. protocol.ts — 消息协议定义**

```typescript
// Client -> Server
type ClientMsg =
  | { type: "audio.start"; turn_index: number; reply_to_turn_id?: string }
  | { type: "audio.end"; client_audio_seconds: number }
  | { type: "audio.cancel" }
  | { type: "barge_in" }
  | { type: "hint.request" }
  | { type: "session.end" }

// Server -> Client
type ServerMsg =
  | { type: "session.ready"; session_id: string; scenario: object }
  | { type: "asr.partial"; text: string }
  | { type: "asr.final"; text: string; confidence: number }
  | { type: "llm.text_delta"; delta: string; role: "customer" }
  | { type: "llm.sentence_ready"; sentence: string; index: number }
  | { type: "llm.analysis"; analysis: object }
  | { type: "llm.done"; customer_text: string; customer_emotion: string }
  | { type: "tts.sentence_start"; index: number }
  | { type: "tts.sentence_end"; index: number }
  | { type: "tts.done" }
  | { type: "turn.saved"; beautician_turn_id: string; customer_turn_id: string }
  | { type: "hint.result"; hint_text: string; hint_points: string[] }
  | { type: "report.ready"; report: object }
  | { type: "error"; code: string; message: string; recoverable: boolean }
```

为每个消息类型编写 Zod schema 用于运行时校验。

**C. config.ts — 环境变量**

```typescript
export const config = {
  port: Number(process.env.WS_PORT || 8080),
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  volc: {
    appId: process.env.VOLC_SPEECH_APP_ID!,
    accessToken: process.env.VOLC_SPEECH_ACCESS_TOKEN!,
    ttsCluster: process.env.VOLC_TTS_CLUSTER || "volcano_tts",
    ttsVoiceType: process.env.VOLC_TTS_VOICE_TYPE || "zh_female_vv_uranus_bigtts",
    ttsLanguage: process.env.VOLC_TTS_LANGUAGE || "cn",
    asrResourceId: process.env.VOLC_ASR_RESOURCE_ID || "volc.seedasr.auc",
  },
  apimart: {
    apiKey: process.env.APIMART_QUICK_API_KEY || process.env.APIMART_API_KEY!,
    baseUrl: process.env.APIMART_QUICK_BASE_URL || process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1",
    fastModel: process.env.APIMART_VOICE_COACH_FAST_MODEL || process.env.APIMART_QUICK_MODEL || "kimi-k2-thinking-turbo",
  },
  voiceCoach: {
    enabled: process.env.VOICE_COACH_ENABLED === "true",
    allowUserIds: (process.env.VOICE_COACH_ALLOW_USER_IDS || "").split(",").filter(Boolean),
    maxTurns: Number(process.env.VOICE_COACH_MAX_TURNS || 10),
  },
}
```

**D. auth.ts — JWT 验证**

从 WebSocket 握手 URL 的 query param 提取 `token`，用 Supabase `getUser(token)` 验证。

**E. session-state.ts + session-manager.ts**

```typescript
interface SessionState {
  sessionId: string
  userId: string
  scenario: VoiceCoachScenario
  turnHistory: Array<{ role: "customer"|"beautician"; text: string; emotion?: string }>
  currentPhase: "idle" | "recording" | "processing" | "playing"
  currentTurnIndex: number
  abortController: AbortController | null  // 用于 barge-in
  asrInstance: StreamingAsr | null
  ttsInstances: StreamingTts[]
  createdAt: number
}

class SessionManager {
  private sessions: Map<string, SessionState>
  create(sessionId, userId, scenario): SessionState
  get(sessionId): SessionState | undefined
  destroy(sessionId): void
  // 定时清理超时会话（30分钟无活动）
}
```

**F. db/ 层**

复用 Supabase admin client 模式（参考 `lib/supabase/admin.server.ts`）。
- turns.ts：insertBeauticianTurn, insertCustomerTurn, updateTurnAnalysis
- sessions.ts：createSession, endSession, updateReport
- events.ts：emitEvent（兼容现有报告系统）

**G. shared/ 复用文件**

直接从以下文件复制，去掉 `import "server-only"`：
- `lib/voice-coach/scenarios.ts` → `shared/scenarios.ts`
- `lib/voice-coach/metrics.ts` → `shared/metrics.ts`
- `lib/voice-coach/report.ts` → `shared/report.ts`
- `lib/voice-coach/report.server.ts` → `shared/report-logic.ts`（去掉 server-only）
- `lib/voice-coach/guard.server.ts` → `shared/guard.ts`（去掉 server-only）

**H. sentence-splitter.ts**

```typescript
class SentenceSplitter {
  private buffer = ""
  private index = 0

  // 喂入 LLM token，返回完整句子数组
  feed(delta: string): Array<{ sentence: string; index: number }>
  // 刷出缓冲区剩余（最后一句）
  flush(): { sentence: string; index: number } | null
}
```

分割规则：
- 触发字符：。！？…；\n
- 最小句长：8 字符
- 最大缓冲：80 字符（超过强制分割）
- 引号内句号不分割

### 验收标准

1. `npm install` + `npx tsc --noEmit` 零错误
2. protocol.ts 所有消息类型有 Zod schema
3. auth.ts 能验证有效/无效 JWT
4. session-manager 能创建/获取/销毁/超时清理
5. db 层能读写 Supabase 表
6. sentence-splitter 单元测试覆盖：正常分句、短句合并、长句强制分割、引号内句号
7. shared/ 文件与源文件逻辑一致

---

## Worker 5：管线编排 + 打断控制（Phase 2）

**输出文件���**
- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/src/pipeline/barge-in.ts`
- `voice-coach-ws/src/ws-server.ts`
- `voice-coach-ws/src/index.ts`

**依赖：** Worker 1-4 全部完成
**预计行数：** ~500 行

### 任务描述

将 ASR、LLM、TTS 三个流式客户端串联成完整管线，实现 WebSocket 服务入口。

**A. orchestrator.ts — 核心管线**

```typescript
class TurnOrchestrator {
  constructor(
    private session: SessionState,
    private sendJson: (msg: ServerMsg) => void,
    private sendBinary: (data: Buffer) => void,
  )

  // 用户开始录音
  async startRecording(turnIndex: number, replyToTurnId?: string): Promise<void>

  // 收到音频块
  handleAudioChunk(chunk: Buffer): void

  // 用户结束录音 → 触发 ASR final → LLM streaming → TTS streaming
  async finishRecording(clientAudioSeconds: number): Promise<void>

  // 打断
  async bargeIn(): Promise<void>

  // 取消录音
  async cancelRecording(): Promise<void>
}
```

核心流程（finishRecording）：
1. 调用 `asr.finish()` 获取最终文本
2. 发送 `asr.final` 给客户端
3. 构建 prompt，调用 `streamChat()`
4. LLM onToken → 喂入 SentenceSplitter
5. SentenceSplitter 输出句子 → 发送 `llm.sentence_ready` → 启动 StreamingTts
6. TTS onAudioChunk → 打包 Binary 帧（4字节 sentence_index + MP3 数据）→ 发送给客户端
7. LLM 遇到 `---ANALYSIS---` → 停止送 TTS，累积 JSON
8. LLM onDone → 解析分析 JSON → 发送 `llm.analysis` + `llm.done`
9. 所有 TTS 完成 → 发送 `tts.done`
10. 异步写入 Supabase → 发送 `turn.saved`

**B. barge-in.ts — 打断控制器**

```typescript
class BargeInController {
  private abortController: AbortController | null = null
  private ttsInstances: StreamingTts[] = []

  // 注册当前轮的 abort controller 和 TTS 实例
  register(abort: AbortController, ttsInstances: StreamingTts[]): void

  // 执行打断：abort LLM + 关闭所有 TTS
  execute(): { interruptedText: string }

  // 清理
  reset(): void
}
```

**C. ws-server.ts — WebSocket 服务**

```typescript
// 处理 WebSocket 连接生命周期
function handleConnection(ws: WebSocket, sessionId: string, userId: string): void {
  // 1. 验证 session 存在且属于该用户
  // 2. 创建 SessionState
  // 3. 创建 TurnOrchestrator
  // 4. 监听消息：
  //    - JSON 文本帧 → 解析 ClientMsg → 路由到对应处理函数
  //    - Binary 帧 → orchestrator.handleAudioChunk()
  // 5. 监听关闭/错误 → 清理资源
}
```

**D. index.ts — 入口**

```typescript
import http from "http"
import { WebSocketServer } from "ws"

const server = http.createServer()
const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", async (req, socket, head) => {
  // 1. 解析 URL query: session_id, token
  // 2. auth.verifyToken(token)
  // 3. wss.handleUpgrade → handleConnection
})

server.listen(config.port)
```

### 延迟埋点

在 orchestrator 中记录每个环节的时间戳：

```typescript
const metrics = {
  audioEndAt: number,        // 用户松开录音
  asrFinalAt: number,        // ASR 最终结果
  llmFirstTokenAt: number,   // LLM 首 token
  firstSentenceAt: number,   // 首句就绪
  ttsFirstChunkAt: number,   // TTS 首音频块
  ttsDoneAt: number,         // 所有 TTS 完成
}
// 每轮结束后 console.log ���出延迟报告
```

### 验收标准

1. 完整管线跑通：发送音频 → 收到 ASR → 收到 LLM 文字 → 收到 TTS 音频
2. barge-in 能在 200ms 内终止 LLM 和 TTS
3. 延迟埋点输出正确
4. WebSocket 断线后资源正确清理
5. 错误场景：ASR 失败、LLM 超时、TTS 失败 → 发送 error 消息，不崩溃

---

## Worker 6：小程序端改造（Phase 2）

**输出文件：**
- `mini-program-ui/utils/ws-client.js`（新建）
- `mini-program-ui/utils/audio-stream-player.js`（新建）
- `mini-program-ui/pages/voice-coach/chat.js`（改造）
- `mini-program-ui/pages/voice-coach/chat.wxml`（改造）
- `mini-program-ui/pages/voice-coach/chat.wxss`（改造）

**依赖：** Worker 4（协议定义）、Worker 5（服务端就绪）
**预计行数：** ~800 行改动

### 任务描述

**A. ws-client.js — WebSocket 通信封装**

```javascript
class VoiceCoachWsClient {
  constructor(baseUrl, sessionId, token)

  connect()           // wx.connectSocket
  disconnect()        // wx.closeSocket
  reconnect()         // 自动重连（最多3次，间隔1s/2s/4s）

  sendJson(msg)       // 发送 JSON 文本帧
  sendBinary(buffer)  // 发送 Binary 帧

  onMessage(handler)  // 注册消息回调
  onBinary(handler)   // 注册 Binary 帧回调
  onClose(handler)
  onError(handler)

  get isConnected()
}
```

**B. audio-stream-player.js — 流式音频播放**

```javascript
class AudioStreamPlayer {
  constructor()

  // 收�� TTS 音频块，按 sentence_index 排队
  feedChunk(sentenceIndex, mp3Chunk)

  // 开始播放（自动按顺序播放所有句子）
  play()

  // 立即停止（barge-in）
  stop()

  // 当前是否在播放
  get isPlaying()
}
```

实现方案：
- 优先使用 `wx.createWebAudioContext()`（基础库 >= 2.19.0）解码 MP3 → PCM → 播放
- 降级方案：将每句 MP3 写入临时文件 → `InnerAudioContext` 顺序播放

**C. chat.js 改造要点**

1. **录音改造**（原 1032-1123 行）：
   - `format: "mp3"` → `format: "pcm"`（或保持 mp3，服务端转码）
   - 启用 `frameSize: 16`，`onFrameRecorded` 回调中通过 WebSocket 发送 Binary 帧
   - 按下录音 → `sendJson({ type: "audio.start", ... })`
   - 松开录音 → `sendJson({ type: "audio.end", ... })`

2. **通信改造**（原 318-540 行事件轮询）：
   - 删除 HTTP 轮询/SSE 逻辑
   - 替换为 WebSocket 消息回调：
     - `asr.partial` → 实时更新美容师气泡文字
     - `asr.final` → 确认美容师文字
     - `llm.text_delta` → 实时显示客户回复文字
     - `llm.analysis` → 更新分析/建议
     - Binary 帧 → `AudioStreamPlayer.feedChunk()`
     - `tts.sentence_start` → 播放动画
     - `tts.done` → 播放完毕，允许下一轮录音

3. **播放改造**（原 1370-1430 行）：
   - 删除 `wx.downloadFile` + `InnerAudioContext` 逻辑
   - 替换为 `AudioStreamPlayer`

4. **打断支持**：
   - 客户语音���放中按下录音键 → `AudioStreamPlayer.stop()` + `sendJson({ type: "barge_in" })`

5. **降级逻辑**：
   - WebSocket 连接失败 → 回退到原有 HTTP 上传 + 轮询模式
   - 在 `onLoad` 中尝试 WebSocket，失败则 fallback

### 验收标准

1. WebSocket 连接/断线重连正常
2. 录音帧实时发送，ASR partial 实时显示
3. LLM 文字流式显示
4. TTS 音频流式播放，句间无明显停顿
5. 打断：按下录音立即停止播放
6. 降级：WebSocket 不可用时自动回退 HTTP 模式
7. 在微信开发者工具 + 真机测试通过


---

## 总指挥 Orchestrator 职责

Orchestrator 是一个独立的 Codex 实例，负责全局协调。它不写业务代码，只做以下事情：

### Phase 0：项目初始化（Orchestrator 自己做）

1. 创建 `voice-coach-ws/` 目录结构
2. 初始化 `package.json`（依赖列表见 Worker 4）
3. 初始化 `tsconfig.json`
4. 创建空的占位文件，确保目录结构正确
5. 运行 `npm install` 确认依赖安装成功
6. 提交初始脚手架到 git 分支 `feat/voice-coach-realtime`

### Phase 1：分发并行任务

同时启动 Worker 1-4，每个 Worker 的 prompt 包含：
- 本文档中对应 Worker 的完整任务描述
- 技术 SPEC 文档（DEV_SPEC_VOICE_COACH_REALTIME.md）中的相关章节
- 明确的输出文件路径和接口设计
- 验收标准

**Orchestrator prompt 模板（给每个 Worker）：**

```
你是一个专注的开发者。你的任务是实现语音教练实时化改造中的一个独立模块。

## 你的任务
{粘贴对应 Worker 的完整任务描述}

## 项目上下文
- 项目根目录已有 voice-coach-ws/ 脚手架
- package.json 已安装好依赖
- 你只需要创建/修改你负责的文件
- 不要修改其他 Worker 负责的文件

## 技术约束
{粘贴 SPEC 中的 Technical Constraints}

## 编码规范
- TypeScript strict mode
- 使用 async/await，不用回调
- 所有公开接口有 JSDoc 注释
- 错误处理：不吞异常，通过 onError 回调或 throw
- 编写单元测试文件：__tests__/xxx.test.ts
```

### Phase 1 检查点（所有 Worker 完成后）

Orchestrator 执行以下检查：

```bash
cd voice-coach-ws
npm install
npx tsc --noEmit                    # 类型检查
npx vitest run --reporter=verbose   # 单元测试
```

如果有错误：
1. 识别是哪个 Worker 的代码导致的
2. 给该 Worker 发送修复指令，附上错误信息
3. 等待修复后重新检查

### Phase 2：分发集成任务

Worker 1-4 全部通过后，同时启动 Worker 5-6：
- Worker 5 拿到 Worker 1-4 的所有代码，组装管线
- Worker 6 拿到 protocol.ts 的消息类型定义，改造小程序

### Phase 2 检查点

```bash
# 类型检查
cd voice-coach-ws && npx tsc --noEmit

# 单元测试
npx vitest run

# 启动服务（验证能跑起来）
node dist/index.js &
sleep 2
# 用 wscat 测试连接
npx wscat -c "ws://localhost:8080/ws/voice-coach?session_id=test&token=test"
kill %1
```

### Phase 3：集成测试

Orchestrator 自己编写并运行端到端测试脚本：

```typescript
// scripts/voice-coach-e2e.ts
// 1. 启动 WS 服务
// 2. 用 ws 库连接
// 3. 发送 audio.start
// 4. 发送预录制的 PCM 音频块
// 5. 发送 audio.end
// 6. 验证收到 asr.final
// 7. 验证收到 llm.text_delta 流
// 8. 验证收到 tts binary 帧
// 9. 验证收到 turn.saved
// 10. 测量端到端延迟
```

### Phase 3 检查点

| 检查项 | 通过标准 |
|--------|---------|
| 类型检查 | `tsc --noEmit` 零错误 |
| 单元测试 | 全部通过 |
| 服务启动 | 无崩溃，监听端口成功 |
| WebSocket 连接 | 能建立连接，收到 session.ready |
| ASR 流程 | 发送音频后收到 asr.partial + asr.final |
| LLM 流程 | 收到 llm.text_delta 流 + llm.done |
| TTS 流程 | 收到 binary 音频帧 + tts.done |
| 打断测试 | 发送 barge_in 后 LLM/TTS 立即停止 |
| 延迟测量 | audio.end → 首个 tts binary 帧 ≤ 1.5s |
| 数据持久化 | Supabase 中有对应的 turns 和 events 记录 |
| 小程序编译 | 微信开发者工具编译无错误 |

### 反馈循环

如果某个检查项不通过：

1. Orchestrator 分析错误原因
2. 定位到具体 Worker 的代码
3. 创建修复任务，包含：
   - 错误信息全文
   - 相关文件路径和行号
   - 期望的行为
4. 分发给对应 Worker 修复
5. 修复后重新运行检查

最多 3 轮修复循环。如果 3 轮后仍不通过，Orchestrator 自己介入修复。

---

## 验证方案

### 单元测试（每个 Worker 自己写）

| 模块 | 测试文件 | 关键用例 |
|------|---------|---------|
| streaming-asr | __tests__/streaming-asr.test.ts | 连接、partial、final、abort、超时 |
| streaming-llm | __tests__/streaming-llm.test.ts | SSE解析、token回调、abort、prompt构建 |
| streaming-tts | __tests__/streaming-tts.test.ts | 连接、音频块、abort、emotion映射 |
| sentence-splitter | __tests__/sentence-splitter.test.ts | 正常分句、短句合并、长句强制、引号 |
| protocol | __tests__/protocol.test.ts | 所有消息类型 Zod 校验 |
| orchestrator | __tests__/orchestrator.test.ts | 完整管线 mock、打断流程 |

### 集成测试（Orchestrator 写）

```bash
# 1. 启动服务
WS_PORT=8090 node dist/index.js &

# 2. 运行 e2e 脚本
npx tsx scripts/voice-coach-e2e.ts

# 3. 检查延迟报告
cat /tmp/voice-coach-latency-report.json
```

### 延迟埋点

在 orchestrator.ts 中记录每个环节的时间戳：

```typescript
interface TurnLatencyMetrics {
  audioEndAt: number          // 收到 audio.end 的时间
  asrFinalAt: number          // ASR final 结果时间
  llmFirstTokenAt: number     // LLM 首个 token 时间
  llmFirstSentenceAt: number  // 首句文字就绪时间
  ttsFirstChunkAt: number     // TTS 首个音频块时间
  ttsAllDoneAt: number        // 所有 TTS 完成时间
  turnSavedAt: number         // 数据持久化完成时间
}

// 关键指标：ttsFirstChunkAt - audioEndAt ≤ 1500ms
```

### 真机测试清单

- [ ] iOS 微信（基础库 2.19.0+）：录音→播放完整流程
- [ ] Android 微信（基础库 2.19.0+）：录音→播放完整流程
- [ ] 弱网环境（3G）：WebSocket 重连 + 降级
- [ ] 打断测试：播放中按录音键
- [ ] 长对话测试：连续 10 轮对话无内存泄漏
- [ ] 并发测试：2 个用户同时练习

---

## 附录：环境变量完整清单

```bash
# === WebSocket 服务 ===
WS_PORT=8080

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# === 火山引擎语音 ===
VOLC_SPEECH_APP_ID=
VOLC_SPEECH_ACCESS_TOKEN=
VOLC_TTS_CLUSTER=volcano_tts
VOLC_TTS_VOICE_TYPE=zh_female_vv_uranus_bigtts
VOLC_TTS_LANGUAGE=cn
VOLC_TTS_FALLBACK_VOICES=
VOLC_ASR_RESOURCE_ID=volc.seedasr.auc

# === APIMART LLM ===
APIMART_API_KEY=
APIMART_QUICK_API_KEY=
APIMART_BASE_URL=https://api.evolink.ai/v1
APIMART_QUICK_BASE_URL=
APIMART_QUICK_MODEL=kimi-k2-thinking-turbo
APIMART_VOICE_COACH_FAST_MODEL=

# === 语音教练 ===
VOICE_COACH_ENABLED=true
VOICE_COACH_ALLOW_USER_IDS=
VOICE_COACH_MAX_TURNS=10
```
