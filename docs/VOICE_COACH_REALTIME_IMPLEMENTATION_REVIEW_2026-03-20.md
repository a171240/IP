# Voice Coach Realtime 实现与验证总结

日期：2026-03-20  
目的：给 Claude Code 做实现审查、协议复核和风险评估。

## 1. 范围

本次工作覆盖三块：

1. `voice-coach-ws/` 独立实时服务的实现与修正
2. 小程序 `mini-program-ui/pages/voice-coach/` 的 realtime 接入
3. 语音/模型供应商链路从“旧 HTTP 批处理 + APIMART”调整为“火山语音 + 豆包 Ark 直连”

参考输入文档：

- `docs/DEV_SPEC_VOICE_COACH_REALTIME.md`
- `docs/DEV_SPEC_VOICE_COACH_CODEX_TASKS.md`

## 2. 先给结论

当前状态：

- WebSocket realtime 主链路已跑通
- ASR / LLM / TTS 都已接到火山 / 豆包真实服务
- `voice-coach-ws` 单测与构建通过
- 真实端到端已验证到 `tts.done`，并确认 turn 已落库

本轮没有完成的只有两类：

- 还没有在真机小程序上重新回归一遍“Ark 切换后的 UI/打断表现”
- 延迟偏高，尤其是 LLM 首 token

## 3. 落地时与 SPEC 不完全一致的决定

这些点建议 Claude Code 重点看一下，确认是否接受。

### 3.1 没有把整个 voice-coach 全量搬进 WebSocket

保留 HTTP 接口：

- `POST /api/voice-coach/sessions`
- `POST /api/voice-coach/sessions/:sessionId/hint`
- `POST /api/voice-coach/sessions/:sessionId/rollback`
- `POST /api/voice-coach/sessions/:sessionId/end`

原因：

- 现有产品入口和报告态仍依赖这些 HTTP 路由
- 这与用户后来补充的 API Call Map 一致
- 因此 WebSocket 只替换中间回合：
  - 旧：`beautician-turn/submit + events/stream`
  - 新：`audio.start -> binary audio -> audio.end -> realtime events`

对应实现：

- `voice-coach-ws/src/ws-server.ts`
- 其中 `hint.request` / `session.end` 在 WS 里返回 recoverable error，而不是硬切断旧链路

### 3.2 ASR 上行先保留 MP3 分片，而不是硬切 PCM

原因：

- 微信小程序真机兼容性上，现阶段 MP3 更稳
- 现有前端也更接近 MP3 分片上传能力

结果：

- realtime WS 现在按 MP3 chunk 上行
- 服务端 streaming ASR 也按 MP3 处理

### 3.3 realtime customer turn 仍然只落文本，不落音频文件

当前持久化策略：

- 美容师 turn：保留文本、时长、置信度、analysis
- 顾客 turn：保留文本、情绪、标签
- realtime TTS 音频只做流式下发，不额外上传持久化

原因：

- 先把首条可用链路跑通
- 避免把“音频存储格式/命名/回放 URL”在 Phase 1 就耦死

### 3.4 Analysis 严重级别做了兼容归一化

兼容映射：

- `bad -> danger`
- `warn -> warning`
- `info -> info`

原因：

- 旧链路和新协议的 severity 枚举不一致
- 避免前端出现双分支解析

## 4. 关键实现内容

### 4.1 配置层改造

主要文件：

- `voice-coach-ws/src/config.ts`

新增/明确了三类配置：

- streaming ASR resource：`VOLC_STREAMING_ASR_RESOURCE_ID`
- TTS resource：`VOLC_TTS_RESOURCE_ID`
- Ark LLM：
  - `ARK_API_KEY`
  - `ARK_BASE_URL`
  - `ARK_MODEL`
  - `ARK_FALLBACK_MODELS`
  - `ARK_VOICE_COACH_TIMEOUT_MS`

当前默认模型策略：

- 主模型：`doubao-seed-1-6-flash-250828`
- 兜底模型：`doubao-seed-1-6-250615`

### 4.2 Streaming ASR 修正

主要文件：

- `voice-coach-ws/src/pipeline/streaming-asr.ts`
- `voice-coach-ws/src/__tests__/streaming-asr.test.ts`

这部分不是简单“接上接口”，而是根据真实抓包结果修正了解析器：

- WebSocket 地址为 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`
- 实际返回帧中：
  - message type 为 `0x09`
  - partial / final 由 flag 区分
  - bytes 4-7 是 sequence
  - bytes 8-11 是 payload length
  - payload 是明文 JSON，不是 gzip
- 真实 `result` 结构是对象，不是数组
- `audio_info.duration` 也补进了解析
- WebSocket upgrade 失败时，会把服务端 body 透出，方便定位 grant/resource 问题

### 4.3 Streaming LLM 从 APIMART 切到 Ark

主要文件：

- `voice-coach-ws/src/pipeline/streaming-llm.ts`
- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/src/__tests__/streaming-llm.test.ts`

调整点：

- 默认 base URL 改为 `https://ark.cn-beijing.volces.com/api/v3`
- 改走豆包 Ark `chat/completions` 流式 SSE
- 保留现有 orchestrator 的 token-delta 消费方式，不重写整套消费协议
- 加了模型 fallback：
  - 主模型不可用 / 无权限 / 限流 / 5xx 时自动回退

说明：

- 用户给的官方示例是 `responses.create(...)`
- 但当前 realtime 编排已经按 SSE token 消费设计
- 实测 `chat/completions` 对 `doubao-seed-1-6-flash-250828` 可用，因此先保留这条兼容实现

### 4.4 Streaming TTS 切到 V3 单向流接口

主要文件：

- `voice-coach-ws/src/pipeline/streaming-tts.ts`
- `voice-coach-ws/src/__tests__/streaming-tts.test.ts`

修正点：

- 旧实现使用的是旧版 V1 TTS WebSocket
- 当前已切到：
  - `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- header 使用：
  - `x-api-app-id`
  - `x-api-access-key`
  - `x-api-resource-id`
- `bigtts` 声线默认 resource 设为 `seed-tts-2.0`
- 解析服务端返回的 JSON line 流，并把 base64 MP3 chunk 解码后下发给前端

### 4.5 Orchestrator 与 WS 行为

主要文件：

- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/src/ws-server.ts`

当前行为：

1. `audio.start`
2. 打开 streaming ASR
3. 接收 binary MP3 chunk
4. `audio.end`
5. `asr.final`
6. 调用 Ark 流式 LLM
7. 分句
8. 并发 sentence-level TTS
9. `tts.done`
10. 持久化 turn pair

额外行为：

- 支持 `barge_in`
- 保留 `hint.request` / `session.end` 的 recoverable 错误提示
- 记录 ASR / LLM / TTS 延迟埋点

### 4.6 小程序接入

主要文件：

- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/pages/voice-coach/chat.wxml`
- `mini-program-ui/pages/voice-coach/chat.wxss`
- `mini-program-ui/utils/ws-client.js`
- `mini-program-ui/utils/audio-stream-player.js`

现状：

- 小程序已经接上 `/ws/voice-coach`
- 保留 HTTP fallback
- 增加了流式音频播放层

## 5. 实际排障路径

这一部分保留给 Claude Code 看，便于它判断本轮修正是否扎实。

### 5.1 ASR 曾经失败的原因

最初卡点不是代码，而是账号/资源：

- 旧 `VOLC_SPEECH_APP_ID` 对应的是别的 OpenSpeech 应用
- `volc.seedasr.auc` 是录音识别，不是流式识别
- streaming ASR 正确 resource 是：
  - `volc.bigasr.sauc.duration`

中间遇到过的真实报错包括：

- `streaming_asr_app_id_missing`
- `load grant: requested grant not found in SaaS storage`
- `resourceId ... is not allowed`

最终确认可用的 streaming ASR 组合是：

- 正确 AppID / Access Token
- `VOLC_STREAMING_ASR_RESOURCE_ID=volc.bigasr.sauc.duration`

### 5.2 TTS 曾经失败的原因

旧实现沿用了旧版 V1 协议，和当前账号的 `bigtts` 资源不匹配。  
改成 V3 后，`seed-tts-2.0` + `zh_female_xiaohe_uranus_bigtts` 能正常返回音频流。

### 5.3 LLM 曾经失败的原因

最初 realtime LLM 仍走 APIMART，出现过：

- quota 不足
- `llm_timeout:30000`

因此最终改成豆包 Ark 直连。

### 5.4 Ark 模型权限排查结果

直接实测结果：

- `doubao-seed-1-6-flash-250715`：`404`，当前账号不可用
- `doubao-seed-1-6-flash-250828`：`200`
- `doubao-seed-1-6-250615`：`200`

所以当前配置是：

- 主模型：`doubao-seed-1-6-flash-250828`
- fallback：`doubao-seed-1-6-250615`

### 5.5 “程序生成的 MP3 喂回 ASR” 不稳定

一条脚本化探测里，我用 TTS 生成了一段“美容师语音”再喂给 streaming ASR，结果是：

- `asr.final.text=""`
- `error.code="asr_empty_result"`

这说明“用当前 TTS 产物作为 ASR 输入样本”不稳定，至少不能作为唯一 E2E 验证样本。

最终成功的 E2E 采用的是：

- 直接调用真实 `/api/voice-coach/sessions`
- 取后端已经在生产路径里返回的 `first_customer_turn.audio_url`
- 用这段真实 seed 音频作为上行样本

## 6. 测试与验证结果

### 6.1 本地自动化测试

执行位置：

- `voice-coach-ws/`

结果：

- `npm test` 通过
- `npm run build` 通过
- 测试文件 `6` 个
- 测试用例 `22` 条

关键测试点：

- `streaming-asr.test.ts`
  - 验证 sequence-prefixed realtime 协议解析
  - 验证 upgrade failure body 透出
- `streaming-llm.test.ts`
  - 验证 Ark SSE token 解析
  - 验证主模型失败时 fallback 到下一个模型
- `streaming-tts.test.ts`
  - 验证 V3 endpoint
  - 验证 MP3 chunk 解码
- `orchestrator.test.ts`
  - 验证“每句只触发一次 TTS”
  - 验证 `tts.done`
  - 验证 turn pair 持久化

### 6.2 Provider 直连探测

#### ASR

- 正确组合下，streaming ASR WebSocket upgrade 成功

#### Ark

- `chat/completions`：
  - `doubao-seed-1-6-flash-250828` 返回 `200`
  - `doubao-seed-1-6-250615` 返回 `200`
- `responses`：
  - `doubao-seed-1-6-flash-250828` 返回 `200`

#### TTS

- V3 单向流接口返回音频 chunk，解码正常

### 6.3 真实端到端验证

验证方式：

1. 创建真实临时 Supabase 用户
2. 调真实 `POST /api/voice-coach/sessions`
3. 获取真实 `first_customer_turn.audio_url`
4. 拉起本地 `voice-coach-ws`
5. 建立本地 WS 连接
6. 发送 `audio.start`
7. 按 MP3 chunk 回放 seed 音频
8. 发送 `audio.end`
9. 观察事件流和数据库落库

成功样例中观测到的关键事件序列：

- `session.ready`
- 多次 `asr.partial`
- `asr.final`
- 多次 `llm.text_delta`
- 多次 `llm.sentence_ready`
- 多次 `tts.sentence_start`
- 多次 `tts.sentence_end`
- `llm.analysis`
- `llm.done`
- `tts.done`

成功样例中的关键结果：

- `binaryCount = 41`
- `llmDone = true`
- `ttsDone = true`

数据库验证结果：

- `turnCount = 3`
- `roles = ["customer", "beautician", "customer"]`
- `statuses = ["audio_ready", "analysis_ready", "text_ready"]`

说明：

- realtime 生成的 beautician/customer turn 已经持久化
- 顾客 turn 当前仍是 `text_ready`，因为本轮没有持久化 customer TTS 音频文件

### 6.4 延迟观测

成功样例里观察到两组代表值：

样例 A：

- `asrMs = 394`
- `llmFirstTokenMs = 5877`
- `firstSentenceMs = 6081`
- `ttsFirstChunkMs = 6408`
- `ttsDoneMs = 8817`

样例 B：

- `asrMs = 325`
- `llmFirstTokenMs = 12713`
- `firstSentenceMs = 12822`
- `ttsFirstChunkMs = 13221`
- `ttsDoneMs = 15635`

结论：

- 链路功能已通
- 当前瓶颈主要在 LLM 首 token 延迟，而不是 ASR / TTS 协议层

## 7. 当前配置基线

不写入密钥值，只列出变量名，便于 Claude 审查配置面。

语音：

- `VOLC_SPEECH_APP_ID`
- `VOLC_SPEECH_ACCESS_TOKEN`
- `VOLC_ASR_RESOURCE_ID`
- `VOLC_STREAMING_ASR_RESOURCE_ID`
- `VOLC_TTS_CLUSTER`
- `VOLC_TTS_RESOURCE_ID`
- `VOLC_TTS_VOICE_TYPE`
- `VOLC_TTS_LANGUAGE`

豆包 Ark：

- `ARK_API_KEY`
- `ARK_BASE_URL`
- `ARK_MODEL`
- `ARK_FALLBACK_MODELS`
- `ARK_VOICE_COACH_TIMEOUT_MS`

默认模型基线：

- `ARK_MODEL=doubao-seed-1-6-flash-250828`
- `ARK_FALLBACK_MODELS=doubao-seed-1-6-250615`

## 8. 建议 Claude Code 重点审查的点

### 8.1 协议层

- `streaming-asr.ts` 对火山 realtime 帧格式的解析是否足够稳
- `streaming-tts.ts` 对 V3 JSON line 流是否还缺边界处理
- `streaming-llm.ts` 的 SSE 解析是否已覆盖 Ark 的主要返回形态

### 8.2 编排层

- `orchestrator.ts` 中 sentence-level 并发 TTS 是否会造成句子结束顺序与索引错位
- `barge_in` 时中断与资源释放是否完整
- `turn.saved` 的触发时机是否合理

### 8.3 兼容边界

- 是否认同继续保留：
  - `sessions`
  - `hint`
  - `rollback`
  - `end`
  这些 HTTP 路由

### 8.4 数据层

- 顾客 realtime 音频是否应该在下一阶段补持久化
- `audio_path = null` 的当前策略是否接受

### 8.5 性能

- LLM 首 token 延迟是否需要进一步压缩
- 是否需要进一步瘦身 prompt / 历史窗口 / analysis envelope 生成方式

## 9. 当前剩余风险

1. 还没在真机小程序上重新回归“Ark 切换后”的完整交互
2. `streaming-llm.ts` 目前走的是 `chat/completions`，不是 `responses`
3. 用 TTS 生成的音频反喂 ASR 不稳定，脚本化验证应继续使用真实 seed 音频样本
4. LLM 延迟波动较大，影响首句可听见时间

## 10. 关键文件清单

实现文件：

- `voice-coach-ws/src/config.ts`
- `voice-coach-ws/src/pipeline/streaming-asr.ts`
- `voice-coach-ws/src/pipeline/streaming-llm.ts`
- `voice-coach-ws/src/pipeline/streaming-tts.ts`
- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/src/ws-server.ts`
- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/utils/ws-client.js`
- `mini-program-ui/utils/audio-stream-player.js`

测试文件：

- `voice-coach-ws/src/__tests__/streaming-asr.test.ts`
- `voice-coach-ws/src/__tests__/streaming-llm.test.ts`
- `voice-coach-ws/src/__tests__/streaming-tts.test.ts`
- `voice-coach-ws/src/__tests__/orchestrator.test.ts`

## 11. 建议 Claude Code 的审查输出格式

建议它按下面顺序输出，便于继续协作：

1. 先列 findings，按严重级别排序
2. 每条 finding 给到文件与行号
3. 再列 open questions
4. 最后再给 change summary

如果没有实质问题，也请它明确写：

- 无 blocking finding
- 剩余风险
- 建议下一步优化项
