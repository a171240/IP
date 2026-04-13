# Voice Coach Measurement Tooling

`voice-coach-ws` 现在有一组独立测量脚本，专门用于外部连接预热和端到端延迟采样，不改动运行时编排代码。

## Files

- `voice-coach-ws/scripts/warm-external-connections.mjs`
- `voice-coach-ws/scripts/e2e-latency-check.mjs`
- `voice-coach-ws/scripts/render-latency-report.mjs`

## 1. 连接预热 / 探活

在 `voice-coach-ws` 目录执行：

```bash
npm run probe:warm
```

默认会检查：

- Ark 流式聊天首 token
- 火山 TTS 首音频块
- 火山流式 ASR 握手
- 本地 `voice-coach-ws` 的 `/healthz`

可选参数：

```bash
node scripts/warm-external-connections.mjs \
  --timeout-ms 12000 \
  --health-url http://127.0.0.1:8080/healthz \
  --output .tmp/warm-check.json
```

## 2. E2E 延迟采样

### 方式 A：自动创建 session

需要一个可用的用户 bearer token。

```bash
node scripts/e2e-latency-check.mjs \
  --token <supabase-user-jwt> \
  --app-base-url http://127.0.0.1:3000 \
  --ws-url ws://127.0.0.1:8080/ws/voice-coach \
  --audio C:\path\to\sample.mp3 \
  --runs 3 \
  --client-audio-seconds 2.2 \
  --output .tmp/latency.json
```

### 方式 B：直接用已有 session

```bash
node scripts/e2e-latency-check.mjs \
  --token <supabase-user-jwt> \
  --session-id <session_uuid> \
  --reply-to-turn-id <customer_turn_uuid> \
  --ws-url ws://127.0.0.1:8080/ws/voice-coach \
  --audio C:\path\to\sample.mp3
```

### 没有音频文件时

脚本会在没传 `--audio` 时，用当前火山 TTS 配置先合成一段探针音频，再拿它跑完整链路：

```bash
node scripts/e2e-latency-check.mjs \
  --token <supabase-user-jwt> \
  --prompt-text "医生说美容院不能按胸，这样操作到底安不安全？"
```

### 输出指标

- `asrMs`
- `llmFirstTokenMs`
- `firstSentenceMs`
- `ttsFirstChunkMs`
- `ttsDoneMs`
- `analysisMs`
- `analysisAfterTtsMs`

默认阈值：

- `asrMs <= 1500`
- `llmFirstTokenMs <= 1500`
- `ttsFirstChunkMs <= 2000`

## 3. Markdown 报告

```bash
node scripts/render-latency-report.mjs \
  --input .tmp/latency.json \
  --output docs/VOICE_COACH_LATENCY_LATEST.md
```

报告会输出：

- 阈值是否达标
- 各延迟指标的 min / p50 / p90 / max / avg
- 每次 run 的明细
- 失败 run 的错误列表

## 4. 约定

- 脚本优先读取 `voice-coach-ws/.env`，也会回退读取仓库根目录 `.env` / `.env.local`
- `--token` 也可以用环境变量 `VOICE_COACH_AUTH_TOKEN`
- E2E 脚本默认把 MP3 按 `client_audio_seconds` 对应的节奏分块发送，尽量接近真实录音上传
