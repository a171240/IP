# Voice Coach Round 7 — 播放仲裁 + HTTP Fallback 加速 + 首句多样化

## Context

Round 5-6 已修通 WS 链路、短语音 HTTP 回退、duplicate key 等传输层问题。但真机反复暴露 5 个体验问题：

1. **P0-A 首轮顾客语音"日志显示在播但用户听不到"** — iOS 静音模式下 `InnerAudioContext` 无声播放，系统误以为已播完
2. **P0-B 多 turn autoplay 互相覆盖** — 不同 turn 的 playAudio 竞争同一 audioCtx，后发停先发
3. **P1-A HTTP fallback 19-36 秒** — 等 audio_ready 才算完成 + 短轮询间隔 + 后端 fast-path 预算不足
4. **P1-B 首句文案池语义雷同** — 5 句全是"安全担忧"类，用户感觉固定
5. **P2 hint 重复请求** — openHint 无全局 in-flight 门禁

---

## 6 线程任务（全部并行，无依赖）

```
W1: iOS 首句播放 → 用户手势触发 overlay     (P0-A)  chat.js + chat.wxml + chat.wxss
W2: playAudio generation counter 防竞争     (P0-B)  chat.js
W3: HTTP fallback 接受 text_ready + 长轮询   (P1-A)  chat.js
W4: 首句文案池多样化                         (P1-B)  scenarios.ts
W5: hint 单飞门禁                           (P2)    chat.js
W6: 后端 events 长轮询支持                   (P1-A)  events/route.ts
```

chat.js 中 W1/W2/W3/W5 修改的行号范围互不重叠，可并行 patch。

---

## W1（P0-A）：首句播放改为用户手势触发

### 问题
iOS 静音模式下 `audioCtx.play()` 无声但触发 `onEnded`，系统以为播完了。用户从未听到首句。

### 方案
新增"点击开始练习"全屏 overlay。session 创建后不自动播放，改为展示 overlay。用户点击 overlay = user gesture → iOS 解锁音频上下文 → 首句播放。

### 改动

**A. `chat.js`**

- **data 区域（~line 162）** 新增：`initialPromptOverlayVisible: false`

- **createSession 成功回调（~line 456-468）** 改为：
  - 不调 `playInitialCustomerPrompt()` 或 `requestTurnTts(..., { autoplay: ... })`
  - 改为：`this.setData({ initialPromptOverlayVisible: true })`
  - 存储 turnId 和 audioUrl 到实例变量备用

- **新方法 `onTapStartPractice()`**（插入到 ~line 697 附近）：
  ```javascript
  onTapStartPractice() {
    this.setData({ initialPromptOverlayVisible: false })
    const turnId = this._initialCustomerTurnId
    const url = this._initialCustomerAudioUrl
    if (turnId && url) {
      this.playAudio(turnId, url, { markInitialPromptComplete: true })
    } else if (turnId) {
      // 音频还没好，先标记完成让用户开始录音
      this._initialCustomerPromptCompleted = true
      wx.showToast({ title: "语音加载中，请先录音", icon: "none" })
    }
  }
  ```

- **录音门禁（~line 2271-2299）** — `record.start:blocked-initial-prompt` 分支改为：
  - 不再调 `playInitialCustomerPrompt()`
  - 改为 `this.setData({ initialPromptOverlayVisible: true })` + toast "请先听顾客问题"

**B. `chat.wxml`** — 末尾添加 overlay：
```xml
<view class="start-overlay-mask" wx:if="{{initialPromptOverlayVisible}}" bindtap="onTapStartPractice">
  <view class="start-overlay-box">
    <view class="start-overlay-icon">▶</view>
    <text class="start-overlay-title">点击开始练习</text>
    <text class="start-overlay-sub">先听一下顾客的问题</text>
  </view>
</view>
```

**C. `chat.wxss`** — 添加 overlay 样式（全屏半透明遮罩 + 居中卡片）

### 验收
1. iOS 静音模式：点击 overlay 后能听到首句语音
2. 不点 overlay 时录音按钮被拦截，重新弹出 overlay
3. Android 行为一致
4. `_initialCustomerPromptCompleted` 只在 overlay 触发的播放完成后置 true

### 不要动
autoPlayTurn / shouldAutoPlayTurn / WS 链路 / HTTP submit

---

## W2（P0-B）：playAudio generation counter

### 问题
多个 playAudio 调用竞争同一 audioCtx，旧调用的 onEnded/download 回调覆盖新调用。

### 方案
给每次 playAudio 调用分配递增的 generation number。下载回调和 onEnded 回调中检查 generation 是否过期，过期则跳过。

### 改动

**`chat.js`：**

- **onLoad（~line 195）** 新增：
  ```javascript
  this._playbackGeneration = 0
  this._activeAudioGeneration = 0
  ```

- **playAudio 方法顶部（~line 2926）**：
  ```javascript
  playAudio(turnId, url, opts = {}) {
    const gen = ++this._playbackGeneration
    // ... 原有逻辑 ...
  ```

- **doPlay 闭包内（~line 2938）** 开头加检查：
  ```javascript
  const doPlay = (src) => {
    if (gen !== this._playbackGeneration) {
      vcLog("audio.play:stale", { turnId, gen, current: this._playbackGeneration })
      return
    }
    // ... 原有播放逻辑 ...
    this._activeAudioGeneration = gen  // 在 audioCtx.play() 之前记录
    this.setData({ playingTurnId: turnId })
  }
  ```

- **audioCtx.onEnded 回调（~line 204-218）** 加 generation 检查：
  ```javascript
  if (this._activeAudioGeneration !== this._playbackGeneration) {
    vcLog("audio.ended:stale-gen", { gen: this._activeAudioGeneration })
    return
  }
  // ... 原有清理逻辑 ...
  ```

- **下载成功回调（~line 2989, ~line 3021）** 加检查：
  ```javascript
  success: (res) => {
    if (gen !== this._playbackGeneration) return
    doPlay(res.tempFilePath)
  }
  ```

### 验收
1. 快速触发 3 个不同 turn 的 autoplay，只有最后一个播放
2. 前两个的 doPlay 被 stale 检查跳过
3. onEnded 只清理当前 generation 的 playingTurnId
4. 手动 onPlay 正常工作（递增 generation 取消之前的 autoplay）

### 不要动
shouldAutoPlayTurn / autoPlayTurn 的过滤逻辑 / HTTP fallback / overlay / scenarios

---

## W3（P1-A）：HTTP fallback 接受 text_ready + 长轮询

### 问题
isHttpFallbackSatisfied 等 audio_ready（需要 TTS 完成），轮询间隔短导致多次往返。总延迟 19-36s。

### 方案
- text_ready 就算 satisfied，先显示文字，音频后续到达时 autoplay
- 轮询间隔从 1200ms 拉到 5000ms（长轮询模式）
- 总超时从 30s 拉到 45s

### 改动

**`chat.js`：**

- **isHttpFallbackSatisfied（~line 592-599）**：
  ```javascript
  isHttpFallbackSatisfied() {
    if (!this._httpFallbackTurnActive) return true
    if (!this._httpFallbackCustomerTurnId) return false
    const idx = this.findTurnIndex(this._httpFallbackCustomerTurnId)
    if (idx < 0) return false
    const turn = this.data.turns[idx] || {}
    // 改：接受 text 就绪即可，不必等 audio_url
    return Boolean(turn.audio_url || turn.ttsFailed || turn.text)
  }
  ```

- **forceEventsPollingOnce 中的 timeout_ms（~line 948）**：
  ```javascript
  const pollTimeout = this._httpFallbackTurnActive ? 5000 : 1200
  url: `...events?cursor=${cursor}&timeout_ms=${pollTimeout}`
  ```

- **forceEventsPollingLoop 总超时（~line 618）**：
  ```javascript
  if (Date.now() - startedAt >= 45000) break
  ```

- **backoff sleep（~line 620）**：
  ```javascript
  await sleep(200)  // 从 400 降到 200
  ```

- **forceEventsPollingLoop 正常完成后清理状态（~line 598）**：
  ```javascript
  const finalCustomerTurnId = this._httpFallbackCustomerTurnId || ""
  vcLog("events.force:done", { sessionId, waitedMs: Date.now() - startedAt, customerTurnId: finalCustomerTurnId })
  this.clearHttpFallbackTurn("success")  // 新增：正常完成也清理
  ```

### 验收
1. 短语音 HTTP fallback：客户文字在 6-11 秒内出现（ASR+LLM 时间）
2. 音频在文字后 1-3 秒自动播放
3. events.force:done 日志中 customerTurnId 非空
4. 正常完成后 _httpFallbackTurnActive = false
5. 总体感知延迟从 19-36s 降到 8-14s

### 不要动
WS 实时链路 / playAudio / overlay / scenarios

---

## W4（P1-B）：首句文案池多样化

### 问题
5 句全是"安全担忧"类，语义和语气过于接近。

### 改动

**`lib/voice-coach/scenarios.ts`（~line 38-64）** — 替换 firstTurnPool：

```typescript
firstTurnPool: [
  {
    text: "医生说美容院不能按胸，这真的安全吗？",
    emotion: "worried",
    tag: "胸部安全",
  },
  {
    text: "你们这个胸部护理价格也太贵了吧，值这个钱吗？",
    emotion: "skeptical",
    tag: "价格贵",
  },
  {
    text: "我朋友做完说效果一般，你们有没有真实的成功案例给我看看？",
    emotion: "impatient",
    tag: "真实案例",
  },
  {
    text: "你们用的是什么产品啊？我皮肤比较敏感，怕过敏。",
    emotion: "worried",
    tag: "产品信任",
  },
  {
    text: "我对这种项目一直挺犹豫的，能不能先体验一下再决定？",
    emotion: "neutral",
    tag: "胸部安全",
  },
],
```

5 种不同客户类型：安全担忧 / 价格质疑 / 要求案例 / 产品敏感 / 犹豫体验。

### 验收
1. 创建 10 次会话，至少出现 3 种不同开场白
2. TypeScript 编译通过（emotion 值合法）
3. 每种开场白引导不同对话方向

### 不要动
getScenario / 其他场景字段 / 小程序代码 / 后端路由

---

## W5（P2）：hint 单飞门禁加固

### 问题
openHint 的 _hintInFlight 检查是按 turnId 匹配，不同 turnId 可以穿透。

### 改动

**`chat.js` openHint 方法（~line 2766）**：

```javascript
// 改前：if (this._hintInFlight === customerTurnId)
// 改后：
if (this._hintInFlight) {
  vcLog("hint.open:skip-inflight")
  return
}
this._hintInFlight = true
```

`.finally()` 块（~line 2814）：
```javascript
.finally(() => {
  this._hintInFlight = false  // 改为布尔值，无条件清理
})
```

### 验收
1. 快速点击 hint 5 次，日志只有 1 次 hint.open:start
2. 请求完成后再次点击正常
3. 不同 customerTurnId 切换时也只允许一个 in-flight

### 不要动
hint API 路由 / hint UI / 其他方法

---

## W6（P1-A backend）：后端 events 长轮询优化

### 问题
配合 W3 的客户端长轮询，后端也需要优化。

### 改动

**`app/api/voice-coach/sessions/[sessionId]/events/route.ts`：**

- **timeout_ms 上限（~line 45）**：从 15000 拉到 25000
  ```typescript
  const timeoutMs = clamp(Number(search.get("timeout_ms") || 10000), 1000, 25000)
  ```

- **轮询间隔（~line 87）**：长轮询时缩短到 150ms
  ```typescript
  const pollInterval = timeoutMs >= 3000 ? 150 : 220
  await sleep(pollInterval)
  ```

- **pumpVoiceCoachQueuedJobs maxJobs（~line 50）**：从 3 提到 5
  ```typescript
  await pumpVoiceCoachQueuedJobs({ sessionId, userId: user.id, maxJobs: 5 })
  ```

### 验收
1. 客户端 timeout_ms=5000 正常被接受
2. 事件到达后更快返回（150ms vs 220ms 检查间隔）
3. Vercel function 不超时（总执行 < 25s，远在 60s 限制内）
4. 更多 queued job 被一次性处理

### 不要动
stream events 路由 / submit 路由 / WS 服务 / session 创建

---

## Worker 改动文件互斥矩阵

| Worker | 文件 | chat.js 行号范围 |
|--------|------|-----------------|
| W1 | chat.js, chat.wxml, chat.wxss | ~162, ~456-468, ~685-697, ~2271-2299 |
| W2 | chat.js | ~195, ~198-218, ~2926-3049 |
| W3 | chat.js | ~592-620, ~948 |
| W4 | scenarios.ts | 不涉及 chat.js |
| W5 | chat.js | ~2761-2818 |
| W6 | events/route.ts | 不涉及 chat.js |

**无重叠，可安全并行。**

---

## Verification

**真机测试（W1-W6 全部合并后）：**

1. **iOS 静音模式**：进入练习 → overlay 出现 → 点击 → 听到首句 → 录音正常
2. **多 turn 播放**：连续 3 轮对话，每轮只播放最新客户回复，不互相覆盖
3. **短语音 HTTP fallback**：客户文字 <10s 出现，音频随后自动播放
4. **首句多样性**：5 次进入看到至少 3 种不同开场
5. **hint**：快速连点只触发 1 次请求
6. **后端**：`curl` 测试 events?timeout_ms=5000 正常长轮询

## Critical Files

- `mini-program-ui/pages/voice-coach/chat.js` — W1/W2/W3/W5（互不重叠）
- `mini-program-ui/pages/voice-coach/chat.wxml` — W1
- `mini-program-ui/pages/voice-coach/chat.wxss` — W1
- `lib/voice-coach/scenarios.ts` — W4
- `app/api/voice-coach/sessions/[sessionId]/events/route.ts` — W6
