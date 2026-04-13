# 语音教练实时化改造 — Codex 多智能体开发文档

> 版本：v1.0 | 日期：2026-03-19
> 执行方式：1 个总指挥 Codex（Orchestrator）+ 6 个并行子任务 Codex（Worker）

---

## 目录

- [0. Context & Problem](#0-context--problem)
- [1. Proposed Solution](#1-proposed-solution)
- [2. Technical Constraints](#2-technical-constraints)
- [3. Non-goals](#3-non-goals)
- [4. Success Criteria](#4-success-criteria)
- [5. 项目结构](#5-项目结构)
- [6. WebSocket 消息协议](#6-websocket-消息协议)
- [7. 核心管线架构](#7-核心管线架构)
- [8. 数据库 Schema](#8-数据库-schema)
- [9. 现有代码复用清单](#9-现有代码复用清单)
- [10. Codex 多智能体任务分配](#10-codex-多智能体任务分配)
- [11. 总指挥 Orchestrator 职责](#11-总指挥-orchestrator-职责)
- [12. 验证方案](#12-验证方案)

---

## 0. Context & Problem

当前语音教练模块（`lib/voice-coach/` + `mini-program-ui/pages/voice-coach/`）采用批量串行架构：

```
录完音 → 上传S3 → 批量ASR(2-8s) → LLM生成(6-12s) → 批量TTS(1-3s) → 客户端轮询
```

端到端延迟 **10-25 秒**，目标是 **≤ 1.5 秒**（P90），达到微信豆包级别的实时对话体验。

**根因分析：**
1. ASR/LLM/TTS 全部串行，无流式处理
2. 客户端 HTTP 轮询额外增加 1-2s 延迟
3. LLM 分析和回复生成分两次调用（`llmAnalyzeBeauticianAndGenerateNext` + `llmAnalyzeBeauticianTurn`）
4. 音频完整录制→上传→下载，无法边录边传

## 1. Proposed Solution

构建全双工流式架构，独立部署 Node.js WebSocket 服务：

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│  微信小程序   │ ◄══════════════► │  voice-coach-ws   │
│  (录音+播放)  │   Binary+JSON    │  (Node.js 独立服务) │
└─────────────┘                    └────────┬─────────┘
                                            │
                          ┌──────────────���──┼─────────────────┐
                          ▼                 ▼                 ▼
                   ┌────────────┐   ┌────────────┐   ┌────────────┐
                   │ 豆包流式ASR  │   │ APIMART    │   │ 豆包流式TTS  │
                   │ (WebSocket) │   │ 流式LLM    │   │ (WebSocket) │
                   └────────────��   │ (SSE)      │   └────────────┘
                                    └────────────┘
```

**延迟预算：**

| 环节 | 目标延迟 |
|------|---------|
| 音频流传输 + 流式ASR final | ~200-400ms |
| LLM 首 token | ~300-600ms |
| 累积首句文字（~15-25字） | ~200-400ms |
| 流式TTS首音频块 | ~200-400ms |
| 网络开销 | ~50-100ms |
| **合计** | **~950-1900ms** |

关键优化：TTS 在第一句文字就绪时立即开始，不等 LLM 全部生成完。

## 2. Technical Constraints

1. **豆包流式API权限**：需在火山引擎控制台确认 `VOLC_SPEECH_APP_ID` 有流式ASR（SAUC）和流式TTS（WebSocket）的权限
2. **APIMART Streaming**：需确认 `kimi-k2-thinking-turbo` 支持 `stream: true`（OpenAI 兼容接口）
3. **小程序 WebSocket**：微信小程序同时只能有 **1 个** WebSocket 连接，必须复用
4. **小程序录音格式**：PCM 格式在部分低端机型可能不支持，需 MP3 fallback
5. **音频流式播放**：`InnerAudioContext` 不支持流式播放，需用 `WebAudioContext`（基础库 ≥ 2.19.0）或分片拼接方案
6. **Supabase**：WS 服务需要 `SUPABASE_SERVICE_ROLE_KEY` 直连
7. **现有环境变量**：复用 `VOLC_SPEECH_APP_ID`、`VOLC_SPEECH_ACCESS_TOKEN`、`APIMART_API_KEY` 等

## 3. Non-goals

- 不改动其他模块（内容管线、视频生成、分发）
- 不做多人实时对话
- 不做视频通话
- 不做离线支持
- 不改变业务逻辑（场景配置、角色设定、prompt、安全约束）
- 不改动现有 Next.js API 路由（保留作为降级方案）

## 4. Success Criteria

| 指标 | 目标 |
|------|------|
| 端到端延迟（录完音→听到回复） | ≤ 1.5s (P90) |
| 打断响应（按下录音→停止播放） | ≤ 200ms |
| 流式ASR识别准确率 | ≥ 当前批量ASR水平 |
| 合并LLM调用输出质量 | ≥ 当前两次调用水平 |
| WebSocket断线自动重连 | ≤ 3s |
| 异常降级到旧版HTTP流程 | 自动 |
| 小程序基础库兼容 | ≥ 2.19.0（覆盖95%+用户） |

## 5. 项目结构

在项目根目录新建 `voice-coach-ws/`，作为独立 Node.js 服务：

```
voice-coach-ws/
  package.json                  # 依赖：ws, @supabase/supabase-js, zod, jsonrepair, dotenv, typescript, tsx
  tsconfig.json                 # strict, ESM, paths alias
  .env.example                  # 环境变量模板
  src/
    index.ts                    # 入口：HTTP server + WebSocket upgrade
    config.ts                   # 所有环境变量集中管理
    auth.ts                     # Supabase JWT 验证（从 ws handshake 提取 token）
    ws-server.ts                # WebSocket 连接生命周期、消息路由
    protocol.ts                 # 消息类型枚举 + Zod schemas（client/server 双向）
    session/
      session-manager.ts        # Map<sessionId, SessionState>，连接/断线/超时清理
      session-state.ts          # 单会话状态：phase, turn history, abort controllers
    pipeline/
      orchestrator.ts           # 核心管线编排：ASR → LLM → TTS
      streaming-asr.ts          # 豆包流式ASR WebSocket 客户端
      streaming-llm.ts          # APIMART SSE streaming 客户端
      streaming-tts.ts          # 豆包流式TTS WebSocket 客户端
      sentence-splitter.ts      # 中文句子边界检测器
      barge-in.ts               # 打断控制器（abort signals + state transitions）
    db/
      supabase.ts               # createAdminSupabaseClient
      turns.ts                  # voice_coach_turns CRUD
      sessions.ts               # voice_coach_sessions CRUD
      events.ts                 # voice_coach_events 写入（兼容报告系统）
    shared/                     # 从 lib/voice-coach/ 复用的业务逻辑（去掉 "server-only" import）
      scenarios.ts              # 场景配置（直接复制）
      metrics.ts                # 语速/填充词/评分（直接复制）
      report.ts                 # 报告 Zod schema（直接复制）
      report-logic.ts           # 报告生成逻辑（从 report.server.ts 提取）
      prompts.ts                # prompt 模板（从 llm.server.ts 提取）
```

## 6. WebSocket 消息协议

### 6.1 连接握手

```
wss://<host>/ws/voice-coach?session_id=<uuid>&token=<supabase_jwt>
```

服务端验证 JWT → 加载/创建 session → 发送 `session.ready`。

### 6.2 Client → Server 消息

```typescript
// ===== JSON 文本帧 =====

// 开始录音，服务端打开流式ASR连接
{ type: "audio.start", turn_index: number, reply_to_turn_id?: string }

// 结束录音，服务端 finalize ASR → 触发 LLM
{ type: "audio.end", client_audio_seconds: number }

// 取消录音（上滑取消手势）
{ type: "audio.cancel" }

// 打断：用户在客户语音播放中按下录音键
// 服务端必须立即 abort 当前 LLM + TTS
{ type: "barge_in" }

// 请求话术提示
{ type: "hint.request" }

// 结束练习，触发报告生成
{ type: "session.end" }

// ===== Binary 帧 =====
// PCM 音频块：16kHz, 16-bit LE, mono
// 无包装，直接发送原始字节
```

### 6.3 Server → Client 消息

```typescript
// ===== JSON 文本帧 =====

// 连接就绪
{ type: "session.ready", session_id: string, scenario: { name, goal, customerPersona } }

// ASR 中间结果（实时显示用户正在说的话）
{ type: "asr.partial", text: string }

// ASR 最终结果
{ type: "asr.final", text: string, confidence: number }

// LLM 流式文字增量（客户回复）
{ type: "llm.text_delta", delta: string, role: "customer" }

// LLM 凑够一句话，即将开始该句 TTS
{ type: "llm.sentence_ready", sentence: string, index: number }

// LLM 分析结果（回复生成完毕后输出）
{ type: "llm.analysis", analysis: {
  suggestions: string[],      // 3条建议
  polished: string,           // 润色版本
  highlights: Array<{ text: string, severity: string }>,
  risk_notes: string[]
}}

// LLM 生成完毕
{ type: "llm.done", customer_text: string, customer_emotion: string }

// TTS 某句开始播放
{ type: "tts.sentence_start", index: number }

// TTS 某句播放完毕
{ type: "tts.sentence_end", index: number }

// 所有 TTS 播放完毕
{ type: "tts.done" }

// 本轮数据已持久化
{ type: "turn.saved", beautician_turn_id: string, customer_turn_id: string }

// 话术提示结果
{ type: "hint.result", hint_text: string, hint_points: string[] }

// 报告生成完毕
{ type: "report.ready", report: object }

// 错误
{ type: "error", code: string, message: string, recoverable: boolean }

// ===== Binary 帧 =====
// TTS 音频块：前 4 字节为 sentence_index (uint32 BE)，后续为 MP3 数据
// 客户端按 sentence_index 排队播放
```

## 7. 核心管线架构

### 7.1 单轮对话完整流程

```
用户按住录音键
    │
    ▼
[audio.start] ──► 服务端打开豆包流式ASR WebSocket
    │
    ▼
用户说话中... ──► PCM Binary帧 ──► 转发到豆包ASR ──► asr.partial 推送到客户端
    │
    ▼
用户松开录音键
    │
    ▼
[audio.end] ──► 发送ASR结束信号 ──► 等待 asr.final
    │
    ▼
asr.final 就绪 ──► 立即触发 APIMART 流式LLM
    │                  │
    │                  ├─ stream: true, SSE
    │                  ├─ 合并 prompt：同时生成客户回复 + 分析
    │                  ├─ 输出格式：先纯文本回���，再 JSON 分析块
    │                  │
    │                  ▼
    │            LLM token 流入 sentence-splitter
    │                  │
    │                  ├─ 检测句子边界（。！？…\n）
    │                  ├─ 每凑够一句 → llm.sentence_ready
    │                  │       │
    │                  │       ▼
    │                  │  立即打开豆包流式TTS WebSocket
    │                  │       │
    │                  │       ▼
    │                  │  TTS 音频块 → Binary帧推送到客户端
    │                  │       │
    │                  │       ▼
    │                  │  客户端 WebAudioContext 流式播放
    │                  │
    │                  ├─ 后续句子并行 TTS（前一句播放时后一句已在合成）
    │                  │
    │                  ▼
    │            LLM 输出完毕
    │                  │
    │                  ├─ 解析尾部 JSON → llm.analysis
    │                  ├─ llm.done
    │                  │
    │                  ▼
    │            所有 TTS 句子播放完毕 → tts.done
    │
    ▼
异步持久化到 Supabase → turn.saved
```

### 7.2 Barge-in（打断）流程

```
客户语音正在播放中...
    │
用户按下录音键
    │
    ▼
客户端：
  1. 立即停止 WebAudioContext 播放
  2. 发送 { type: "barge_in" }
  3. 发送 { type: "audio.start", ... }
  4. 开始录音
    │
    ▼
服务端收到 barge_in：
  1. abort 当前 LLM 请求（AbortController.abort()）
  2. 关闭当前所有 TTS WebSocket 连接
  3. 标记当前客户轮为 interrupted: true
  4. 保存已生成的部分文本
  5. 关闭 ASR 连接（如果还开着）
    │
    ▼
服务端收到 audio.start：
  1. 打开新的流式 ASR 连接
  2. 进入下一轮录音流程
```

### 7.3 sentence-splitter 逻辑

```typescript
// 中文句子边界检测
// 触发分割的字符：。！？…；\n
// 最小句子长度：8 个字符（避免过短的句子单独 TTS）
// 最大缓冲长度：80 个字符（超过强制分割，避免长句延迟）
// 特殊处理：引号内的句号不分割（"你好。"算一句）

class SentenceSplitter {
  private buffer: string = ""
  private sentenceIndex: number = 0

  feed(delta: string): string[] {
    this.buffer += delta
    const sentences: string[] = []
    // ... 检测边界，输出完整句子
    return sentences
  }

  flush(): string | null {
    // 返回缓冲区剩余内容（最后一句）
  }
}
```

### 7.4 合并 LLM Prompt 设计

当前是两次 LLM 调用，合并为一次。输出格式改为：

```
System Prompt:
  你是美业销售话术教练的模拟顾客。
  场景：{scenario.name}
  背景：{scenario.businessContext}
  顾客人设：{scenario.customerPersona}
  合规约束：{scenario.safetyConstraints.join('\n')}

  任务：
  1. 先以顾客身份回复美容师（纯文本，不要 JSON）
  2. 回复完毕后，输出一行 "---ANALYSIS---"
  3. 然后输出严格 JSON 分析：
  {
    "emotion": "neutral|worried|skeptical|impatient|pleased",
    "tag": "话题标签",
    "analysis": {
      "suggestions": ["建议1", "建议2", "建议3"],
      "polished": "润色后的美容师话术",
      "highlights": [{"text": "原文片段", "severity": "info|warning|danger"}],
      "risk_notes": ["风险提示"]
    }
  }

  约束：
  - 顾客回复控制在 30-80 字
  - 情绪要符合对话上下文
  - 建议要具体可执行
  - 不要在顾客回复部分包含任何 JSON 或标记

User Prompt:
  对话历史：
  {formatHistory(history)}

  美容师本轮说：{beautician_text}
```

服务端流式解析逻辑：
1. 在遇到 `---ANALYSIS---` 之前的所有 token → 作为客户回复文本，送入 sentence-splitter → TTS
2. 遇到 `---ANALYSIS---` 后的内容 → 累积为 JSON 字符串，LLM 结束后解析

## 8. 数据库 Schema

现有表结构完全复用，不需要新建表。WS 服务通过 `SUPABASE_SERVICE_ROLE_KEY` 直连。

### 8.1 现有表（直接使用）

**voice_coach_sessions**
```sql
id uuid PK, created_at, user_id uuid, scenario_id text,
status text ('active'|'ended'), started_at, ended_at,
report_json jsonb, total_score numeric, dimension_scores jsonb
```

**voice_coach_turns**
```sql
id uuid PK, created_at, session_id uuid FK, turn_index int,
role text ('customer'|'beautician'), text text, emotion text,
audio_path text, audio_seconds numeric, asr_confidence numeric,
analysis_json jsonb, features_json jsonb,
status text ('ready'|'accepted'|'processing'|'asr_ready'|'text_ready'|'audio_ready'|'analysis_ready'|'error')
```

**voice_coach_events**
```sql
id bigserial PK, created_at, session_id uuid FK, user_id uuid,
turn_id uuid FK, job_id uuid FK, type text, data_json jsonb
```

**voice_coach_jobs** — WS 模式下不再使用 job 队列，但保留表不删除。

### 8.2 WS 服务的数据写入策略

```
每轮对话结束后，异��写入：
1. INSERT voice_coach_turns (role='beautician') — 美容师轮次
   - text: ASR final 文本
   - audio_path: 上传到 S3 的录音路径（可选，降级时用）
   - audio_seconds: 客户端上报的录音时长
   - asr_confidence: ASR 返回的置信度
   - status: 'analysis_ready'

2. INSERT voice_coach_turns (role='customer') — 客户轮次
   - text: LLM 生成的客户回复全文
   - emotion: LLM 返回的情绪
   - audio_path: TTS 音频上传路径（可选）
   - analysis_json: LLM 返回的分析 JSON
   - status: 'analysis_ready'

3. INSERT voice_coach_events — 兼容报告系统
   - type: 'beautician.asr_ready' / 'customer.text_ready' / 'customer.audio_ready' / 'beautician.analysis_ready'

练习结束时：
4. UPDATE voice_coach_sessions SET status='ended', ended_at=now(), report_json=...
```

## 9. 现有代码复用清单

以下文件的业务逻辑直接复用到 `voice-coach-ws/src/shared/`：

| 源文件 | 复用方式 | 说明 |
|--------|---------|------|
| `lib/voice-coach/scenarios.ts` (38行) | 直接复制 | 场景配置，无外部依赖 |
| `lib/voice-coach/metrics.ts` (71行) | 直接复制 | calcWpm, calcFillerRatio, 评分函数，无外部依赖 |
| `lib/voice-coach/report.ts` (143行) | 直接复制 | Zod schema 定义，仅依赖 zod |
| `lib/voice-coach/report.server.ts` (265行) | 提取为 report-logic.ts | 去掉 `import "server-only"`，其余逻辑不变 |
| `lib/voice-coach/guard.server.ts` (32行) | 提取为 guard.ts | 去掉 `import "server-only"`，访问控制逻辑不变 |
| `lib/voice-coach/llm.server.ts` 中的 prompt 模板 | 提取为 prompts.ts | 提取 system/user prompt 构建函数、Zod schemas、formatHistory |

以下文件**不复用**（通信层全部重写）：

| 源文件 | 原因 |
|--------|------|
| `lib/voice-coach/jobs.server.ts` (1164行) | 批量 job 队列架构，完全替换为流式管线 |
| `lib/voice-coach/speech/doubao.server.ts` (425行) | 批量 REST API，替换为 WebSocket 流式客户端 |
| `app/api/voice-coach/**` 所有路由 | HTTP 轮询架构，保留但不修改（降级用） |
| `mini-program-ui/pages/voice-coach/chat.js` (1430行) | 需要大幅改造录音/播放/通信逻辑 |

### 9.1 从 llm.server.ts 提取的关键内容

**环境变量（保持一致）：**
```typescript
APIMART_API_KEY / APIMART_QUICK_API_KEY
APIMART_BASE_URL / APIMART_QUICK_BASE_URL  // 默认 https://api.apimart.ai/v1
APIMART_FAST_MODEL                          // 默认 kimi-k2-thinking-turbo
APIMART_ANALYSIS_MODEL                      // 默认 kimi-k2-thinking-turbo
```

**formatHistory 函数（直接复用）：**
```typescript
function formatHistory(
  history: Array<{ role: "customer" | "beautician"; text: string; emotion?: string }>
): string {
  if (!history.length) return "（无历史对话）"
  return history
    .map((t) => {
      const who = t.role === "customer" ? "顾客" : "美容师"
      const emo = t.role === "customer" && t.emotion ? \`（情绪：\${t.emotion}）\` : ""
      return \`\${who}\${emo}：\${t.text}\`
    })
    .join("\n")
}
```

**Zod Schemas（复用并扩展）：**
```typescript
const CustomerTurnSchema = z.object({
  text: z.string(),
  emotion: z.enum(["neutral", "worried", "skeptical", "impatient", "pleased"]).default("neutral"),
  tag: z.string().optional().default(""),
})

const TurnAnalysisSchema = z.object({
  suggestions: z.array(z.string()).default([]),
  polished: z.string().default(""),
  highlights: z.array(z.object({ text: z.string(), severity: z.string() })).default([]),
  risk_notes: z.array(z.string()).default([]),
})

// 合并后的完整输出 schema
const MergedLLMOutputSchema = z.object({
  emotion: z.enum(["neutral", "worried", "skeptical", "impatient", "pleased"]).default("neutral"),
  tag: z.string().optional().default(""),
  analysis: TurnAnalysisSchema,
})
```

### 9.2 从 doubao.server.ts 提取的关键配置

```typescript
// 认证信息
VOLC_SPEECH_APP_ID          // 火山引擎 App ID
VOLC_SPEECH_ACCESS_TOKEN    // Bearer token

// TTS 配置
VOLC_TTS_CLUSTER            // 默认 "volcano_tts"
VOLC_TTS_VOICE_TYPE         // 默认 "zh_female_vv_uranus_bigtts"
VOLC_TTS_LANGUAGE           // 默认 "cn"
VOLC_TTS_FALLBACK_VOICES    // 逗号分隔的备选音色

// ASR 配置
VOLC_ASR_RESOURCE_ID        // 默认 "volc.seedasr.auc"

// 情绪映射（VoiceCoachEmotion → DoubaoTtsEmotion）
const EMOTION_MAP = {
  neutral: "neutral",
  worried: "sad",
  skeptical: "neutral",
  impatient: "angry",
  pleased: "happy",
}
```
