# Voice Coach Round 3 — WebSocket 接通 + 调试 + 双泡泡修复

> 日期：2026-03-22
> 前置：Round 1-2 服务端延迟已优化到 P50=1696ms，WS 服务本地 E2E 全阈值 PASS
> 本轮目标：让真机真正走 WebSocket 实时链路，而非旧的 HTTP 轮询

---

## 背景：为什么需要这一轮

真机实测（VOICE_COACH_REAL_DEVICE_EXECUTION_2026-03-22.md）发现：

**真机根本没走 WebSocket，还在跑旧的 HTTP 轮询。**

根因已确认：`ws-client.js`（350行）和 `audio-stream-player.js`（283行）已实现完毕，但从未被 `chat.js` import 或调用。chat.js 中没有任何 WebSocket 初始化、连接、消息处理代码。

证据：
- Network 面板只看到 `POST submit` + `GET events/stream`，无 WS 握手
- chat.wxml 第 5-6 行引用的 `realtimeEnabled` / `realtimeConnected` 在 data 中未定义
- 页面始终显示"轮询模式"

这意味着 Round 1-2 所有服务端延迟优化（从 6.5s 降到 1.7s）完全没有到达用户。

---

## 3 个并行任务（W1 + W2 + W3 同时开工）

所有改动集中在 `chat.js` + `chat.wxml` 两个文件。

---

## W1（P0 核心）：chat.js WebSocket 接入

**这是本轮最重要的任务。**

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 参考文件（只读，已实现好的工具）
- `mini-program-ui/utils/ws-client.js` — VoiceCoachWsClient 类
- `mini-program-ui/utils/audio-stream-player.js` — AudioStreamPlayer 类
- `voice-coach-ws/src/protocol.ts` — 消息类型定义
- `docs/DEV_SPEC_VOICE_COACH_REALTIME.md` — 6.2/6.3 节消息协议

### 当前状态
- chat.js 第 1-11 行：只 import 了 config/request/auth/device/track/turn-list
- 没有 import ws-client 或 audio-stream-player
- 没有 WebSocket 相关的 data 属性
- uploadBeauticianTurn() 始终走 wx.uploadFile HTTP 上传
- ensureEventsPolling() 始终走 HTTP GET 轮询

### 需要做的改动（11 项）

**1. 新增 import（文件顶部，第 1-11 行之后）**
```javascript
const { VoiceCoachWsClient } = require("../../utils/ws-client")
const { AudioStreamPlayer } = require("../../utils/audio-stream-player")
```

**2. 新增 data 属性（data 对象中，约第 138 行）**
```javascript
realtimeEnabled: false,
realtimeConnected: false,
```

**3. 新增实例属性（在 onLoad 中初始化）**
```javascript
this._wsClient = null
this._audioPlayer = null
this._realtimeMode = false
```

**4. session 创建成功后尝试 WS 连接**

在 createSession() 成功回调中（约第 270 行），session 创建成功后：
```javascript
try {
  const token = await getAccessToken()
  this._wsClient = new VoiceCoachWsClient(API_BASE_URL, sessionId, token)
  this._audioPlayer = new AudioStreamPlayer()

  this._wsClient.onOpen(() => {
    this._realtimeMode = true
    this.setData({ realtimeEnabled: true, realtimeConnected: true })
  })

  this._wsClient.onClose(() => {
    this.setData({ realtimeConnected: false })
    if (this._realtimeMode) {
      this._realtimeMode = false
      this.setData({ realtimeEnabled: false })
      this.ensureEventsPolling()
    }
  })

  this._wsClient.onMessage((msg) => this._handleWsMessage(msg))
  this._wsClient.onBinary((data) => this._handleWsBinary(data))

  await this._wsClient.connect()
} catch (e) {
  console.warn("[vc] ws:connect failed, fallback HTTP", e)
  this._realtimeMode = false
  this.ensureEventsPolling()
}
```

注意：如果 WS 连接成功，不要调用 ensureEventsPolling()。只在 WS 失败或断开时才启动 HTTP 轮询。

**5. 新增 _handleWsMessage 方法**
```javascript
_handleWsMessage(msg) {
  switch (msg.type) {
    case "session.ready":
      break
    case "asr.partial":
      this.setData({ recordingPreviewText: msg.text })
      break
    case "asr.final":
      this._onAsrFinal(msg.text, msg.confidence)
      break
    case "llm.text_delta":
      this._appendCustomerTextDelta(msg.delta)
      break
    case "llm.done":
      this._finalizeCustomerTurn(msg.customer_text, msg.customer_emotion)
      break
    case "llm.analysis":
      this._applyAnalysis(msg)
      break
    case "tts.sentence_start":
      this._audioPlayer.markSentenceStart(msg.index)
      break
    case "tts.sentence_end":
      this._audioPlayer.markSentenceEnd(msg.index)
      this._audioPlayer.play()
      break
    case "tts.done":
      this._audioPlayer.finish()
      this.setData({ waitingCustomer: false })
      break
    case "turn.saved":
      break
    case "error":
      console.error("[vc] error:", msg.code, msg.message)
      if (!msg.recoverable) this._fallbackToHttp()
      break
  }
}
```

这些辅助方法需要实现：
- _onAsrFinal(text, confidence)：插入/更新美容师 turn 的文字
- _appendCustomerTextDelta(delta)：流式追加客户回复文字到当前客户 turn
- _finalizeCustomerTurn(text, emotion)：确认客户回复完成
- _applyAnalysis(msg)：将分析结果绑定到对应的美容师 turn（用 msg.beautician_turn_id）

**6. 新增 _handleWsBinary 方法**
```javascript
_handleWsBinary(data) {
  const view = new DataView(data)
  const sentenceIndex = view.getUint32(0, false)
  const audioChunk = data.slice(4)
  this._audioPlayer.feedChunk(sentenceIndex, audioChunk)
}
```

**7. 改造录音开始逻辑**

在录音开始处（约第 1026 行 recording: true 之后）：
```javascript
if (this._realtimeMode) {
  this._wsClient.sendJson({
    type: "audio.start",
    turn_index: this.data.turns.length
  })
}
```

**8. 改造 onFrameRecorded 回调**

如果当前 RecorderManager 配置了 frameSize，在 onFrameRecorded 中：
```javascript
if (this._realtimeMode && this._wsClient && this._wsClient.isConnected) {
  this._wsClient.sendBinary(frameBuffer)
}
```

注意：当前 RecorderManager 可能没有配置 frameSize。如果没有，需要在录音配置中添加：
```javascript
recorderManager.start({
  format: "mp3",      // 保持 mp3 兼容性
  sampleRate: 16000,
  frameSize: 1,        // 每 1KB 触发一次 onFrameRecorded
})
```

**9. 改造录音结束逻辑 uploadBeauticianTurn**

当前约第 1126-1226 行，始终用 wx.uploadFile。改为分支：
```javascript
if (this._realtimeMode) {
  this._wsClient.sendJson({
    type: "audio.end",
    client_audio_seconds: duration
  })
  // WS 模式不需要 wx.uploadFile
  // 服务端已在录音期间通过 binary 帧收到了音频
} else {
  // HTTP 降级模式：保持原有 wx.uploadFile 逻辑不变
  wx.uploadFile({ ... })
}
```

**10. 打断支持**

在录音按钮按下处理中（约第 1020 行），如果当前正在播放客户语音：
```javascript
if (this._realtimeMode && this._audioPlayer && this._audioPlayer.isPlaying) {
  this._audioPlayer.stop()
  this._wsClient.sendJson({ type: "barge_in" })
}
```

**11. onUnload 清理**

在现有 onUnload 中追加：
```javascript
if (this._wsClient) this._wsClient.disconnect()
if (this._audioPlayer) this._audioPlayer.stop()
```

**降级函数：**
```javascript
_fallbackToHttp() {
  this._realtimeMode = false
  this.setData({ realtimeEnabled: false, realtimeConnected: false })
  if (this._wsClient) this._wsClient.disconnect()
  this.ensureEventsPolling()
}
```

### 验收标准
1. 微信开发者工具中，页面加载后状态显示"实时已连"（不是"轮询模式"）
2. Network 面板可见 WebSocket 连接（wss://...）
3. 录音时 WS 帧面板显示 binary 帧流出
4. 松开后收到 asr.partial / asr.final / llm.text_delta / tts binary 帧
5. TTS 音频通过 AudioStreamPlayer 正常播放
6. WS 断开后自动降级到 HTTP 轮询模式，功能不中断
7. chat.wxml 中已有的 realtimeEnabled / realtimeConnected 条件渲染正常工作

---

## W2（P1）：前端调试日志层

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 任务描述

在 chat.js 关键路径中添加 `[vc]` 前缀的结构化日志。这些日志必须同时在：
- 真机 vConsole 浮层中可见
- 微信开发者工具 appservice Console 中可见

### 必须覆盖的日志点

```javascript
const TAG = "[vc]"

// 生命周期
console.log(TAG, "createSession", { scenarioId, sessionId })
console.log(TAG, "loadSession", { sessionId })

// WebSocket
console.log(TAG, "ws:connect", { url })
console.log(TAG, "ws:open")
console.log(TAG, "ws:close", { code, reason })
console.log(TAG, "ws:error", { message })
console.log(TAG, "ws:fallback-http")

// 录音
console.log(TAG, "record:start", { turnIndex })
console.log(TAG, "record:frame", { bytes })  // 仅首帧和每 10 帧打一次
console.log(TAG, "record:end", { duration })
console.log(TAG, "record:cancel")

// ASR
console.log(TAG, "asr:partial", { text: text.slice(0, 20) })
console.log(TAG, "asr:final", { text, confidence })

// LLM
console.log(TAG, "llm:firstToken", { elapsedMs: Date.now() - this._recordEndAt })
console.log(TAG, "llm:delta", { chars: delta.length })  // 每 5 次打一次
console.log(TAG, "llm:done", { text: text.slice(0, 30) })
console.log(TAG, "llm:analysis", { hasSuggestions: !!analysis.suggestions })

// TTS
console.log(TAG, "tts:firstChunk", { sentenceIndex, elapsedMs })
console.log(TAG, "tts:sentenceEnd", { sentenceIndex })
console.log(TAG, "tts:done")
console.log(TAG, "tts:play", { sentenceIndex })

// 其他
console.log(TAG, "barge_in")
console.log(TAG, "turn:saved", { turnId })
console.log(TAG, "error", { code, message })
```

### 注意事项
- 不要在日志中输出完整音频数据
- 不要输出 JWT token 或 API key
- record:frame 和 llm:delta 要限频（每 N 次打一次），避免刷屏
- 记录 _recordEndAt 时间戳，用于计算 llm:firstToken 和 tts:firstChunk 的延迟

### 验收标准
1. 真机 vConsole 可见全部 [vc] 前缀日志
2. 开发者工具 appservice Console 可见同样的日志
3. 一次完整对话（录音→识别→回复→播放）在日志中形成清晰的事件序列
4. 延迟数据（llm:firstToken elapsedMs, tts:firstChunk elapsedMs）正确输出

---

## W3（P2）：双泡泡竞态修复

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/pages/voice-coach/chat.wxml`

### 根因

录音结束时，chat.js 先插入本地占位 turn（line 1135-1139 appendTurn(localTurn)），然后 HTTP submit 成功后 replaceTurn。但事件流可能在 replace 之前就推来服务端 turn，导致同时存在两个同义泡泡。

即使最终数组不再重复 key，视觉上仍会短暂出现两个绿色美容师泡泡。

### 修复方案

**核心思路：不再插入本地占位 turn，改用状态标记**

chat.js 改动：
```javascript
// === 当前代码（约 line 1135-1139）===
// const localTurn = { id: pendingId, role: "beautician", text: "", status: "pending", ... }
// appendTurn(localTurn)

// === 改为 ===
// 不插入 turn 到列表
// 用 data 状态标记"正在处理"
this.setData({
  processingBeauticianTurn: true,
  processingText: "识别中..."
})

// 在 WS 模式的 _handleWsMessage 中：
// case "asr.partial":
//   this.setData({ processingText: msg.text })
//   break
// case "asr.final":
//   // 此时才真正插入美容师 turn（用服务端数据）
//   appendTurn({ role: "beautician", text: msg.text, ... })
//   this.setData({ processingBeauticianTurn: false })
//   break

// 在 HTTP 降级模式中：
// turn.accepted 事件到达时才插入美容师 turn
// this.setData({ processingBeauticianTurn: false })
```

chat.js 新增 data 属性：
```javascript
processingBeauticianTurn: false,
processingText: "",
```

chat.wxml 改动（在消息列表底部、录音区域上方）：
```xml
<view wx:if="{{processingBeauticianTurn}}" class="processing-indicator">
  <view class="processing-bubble beautician">
    <text class="processing-text">{{processingText || "识别中..."}}</text>
  </view>
</view>
```

chat.wxss 新增样式：
```css
.processing-indicator {
  padding: 16rpx 32rpx;
}
.processing-bubble {
  max-width: 70%;
  padding: 20rpx 28rpx;
  border-radius: 20rpx;
  background: #e8f5e9;
  margin-left: auto;
  font-size: 28rpx;
  color: #333;
}
.processing-text {
  opacity: 0.7;
}
```

### 验收标准
1. 录音结束后不再出现双泡泡
2. "识别中..."指示器在 ASR 完成后消失，被真正的美容师 turn 替代
3. HTTP 降级模式下同样无双泡泡
4. 美容师 turn 只在服务端确认后才插入 turns 列表

---

## 不要改动的文件

- `mini-program-ui/utils/ws-client.js` — 已实现，只 import 使用
- `mini-program-ui/utils/audio-stream-player.js` — 已实现，只 import 使用
- `voice-coach-ws/` 目录下所有文件 — 服务端已完成，本轮不改
- `app/api/voice-coach/` 目录下所有文件 — 保留作为降级后端
- `mini-program-ui/pages/voice-coach/chat.wxss` — 除 W3 新增的 processing 样式外不改动

---

## 验证方案

完成 W1+W2+W3 后，按以下顺序验证：

### Step 1：微信开发者工具
1. 编译小程序，进入语音教练页
2. 检查页面顶部显示"实时已连"（不是"轮询模式"）
3. 打开 Console，确认看到 [vc] ws:connect + [vc] ws:open
4. 按住录音说话，Console 看到 [vc] record:start + [vc] record:frame
5. 松开，Console 看到 [vc] asr:partial + [vc] asr:final
6. 等待回复，Console 看到 [vc] llm:firstToken + [vc] tts:firstChunk
7. 确认无双泡泡，只有一个美容师气泡
8. 确认客户语音正常播放

### Step 2：降级测试
1. 关闭 voice-coach-ws 服务
2. 刷新小程序
3. 页面应显示"轮询模式"
4. 录音→回复流程通过旧 HTTP 链路正常工作

### Step 3：真机测试
1. 用手机扫码预览
2. 打开 vConsole
3. 确认看到 [vc] 日志序列
4. 确认 Network 面板有 WebSocket 连接
5. 完整对话一轮，确认无双泡泡
