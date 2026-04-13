# Voice Coach Round 5 — 短语音回退修复 + 开场白音频 + 自动播放去重

> 日期：2026-03-22
> 前置：Round 4 确认 WS 实时链路已跑通，但短语音（<3s）走 HTTP 回退时状态不同步
> 本轮目标：修复混合模式回退的 3 个根因 bug + 开场白音频多样性

---

## 背景与根因

Round 4 Handoff 揭示了一个新回归：短语音走 HTTP 回退时，页面状态和事件消费断裂。

**根因链（已确认）：**

```
用户录了 <3 秒短语音
    |
    v
chat.js:2199 检测到 short utterance
    |
    v
cancelRealtimeAudio() + resetRealtimeAttemptState()
    |
    v
useRealtime = false，走 HTTP wx.uploadFile 提交
    |
    v  ❌ 问题 1：_realtimeMode 仍然是 true（没调 fallbackToHttp()）
    |
    v
HTTP submit 成功，调 ensureEventsPolling()
    |
    v  ❌ 问题 2：ensureEventsPolling() 第 726 行检查 _realtimeMode==true，直接 skip
    |
    v
事件轮询没启动，客户回复事件没被消费
    |
    v  ❌ 问题 3：HTTP 响应中 beautician turn 缺少 turn_index
    |
    v
getNextTurnIndex() 返回过期值
    |
    v
用户录第二轮 → HTTP submit 用了重复的 turn_index
    |
    v
DB 报错：duplicate key violates "voice_coach_turns_session_turn_index_key"
```

**另外两个独立问题：**
- 开场白音频固定（text 已多样化，但 seed audio 还是固定的 objection_safety_v1.mp3）
- 同一客户 turn 可能被重复自动播放

---

## 6 线程任务分配

```
W1: 修复 short-utterance HTTP 回退的状态同步（P0 核心 bug）
W2: 修复 ensureEventsPolling 的 realtimeMode 判断（P0 配套）
W3: HTTP 响应中补全 turn_index（P1 后端）
W4: 防止在回退 turn 未完成时开始下一轮录音（P1 前端）
W5: 开场白音频多样性（P2 产品）
W6: 自动播放去重 + 重复播放修复（P3 稳定性）
```

W1+W2 是核心 bug 修复，必须同时做。W3-W6 并行。

---

## W1（P0 核心）：短语音 HTTP 回退状态同步

### 根因
chat.js:2199-2207 检测到短语音后，调了 resetRealtimeAttemptState() 但没调 fallbackToHttp()，导致 _realtimeMode 仍为 true。

### 改动文件
`mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

**方案选择：不切换全局 _realtimeMode，而是让单轮 HTTP 回退能正确消费事件。**

理由：如果把 _realtimeMode 设为 false，WS 连接会被关闭（fallbackToHttp 会 disconnect），后续长语音就无法走 WS 了。短语音回退应该是"单轮降级"，不是"整个 session 降级"。

**具体改动：**

```javascript
// chat.js 约 2199-2210 行
// 当前：
//   cancelRealtimeAudio("short_utterance_http")
//   resetRealtimeAttemptState("short_utterance_http")
//   useRealtime = false

// 改为：
cancelRealtimeAudio("short_utterance_http")
resetRealtimeAttemptState("short_utterance_http")
useRealtime = false
this._httpFallbackTurnActive = true  // 新增：标记当前有一轮 HTTP 回退 turn 在进行
console.log("[vc]", "short-utterance:http-fallback", { audioSeconds: normalizedDurationSec })
```

```javascript
// HTTP submit 成功后（约 2340-2354 行）
// 当前：
//   ensureEventsPolling()

// 改为：
if (this._httpFallbackTurnActive) {
  // 单轮 HTTP 回退：强制启动一次事件轮询，不管 _realtimeMode
  this._httpFallbackTurnActive = false
  console.log("[vc]", "http-fallback:start-polling")
  this._forceEventsPolling()  // 新方法，见下方
} else {
  this.ensureEventsPolling()
}
```

```javascript
// 新增方法 _forceEventsPolling()
_forceEventsPolling() {
  // 强制启动一次性事件轮询（不检查 _realtimeMode）
  // 轮询直到当前 beautician turn 的 customer 回复就绪
  const sessionId = this.data.sessionId
  const cursor = this.data.eventCursor
  let attempts = 0
  const maxAttempts = 30  // 最多轮询 30 次（约 36 秒）

  const poll = () => {
    if (attempts >= maxAttempts) {
      console.log("[vc]", "http-fallback:polling-timeout")
      return
    }
    attempts++
    request({
      url: \`/api/voice-coach/sessions/\${sessionId}/events?cursor=\${this.data.eventCursor}&timeout_ms=1200\`,
      method: "GET",
    }).then(res => {
      if (res.data && res.data.events && res.data.events.length > 0) {
        this.applyServerEvents(res.data.events)
        this.setData({ eventCursor: res.data.next_cursor || this.data.eventCursor })
      }
      // 检查是否已收到 customer 回复
      const lastTurn = this.data.turns[this.data.turns.length - 1]
      if (lastTurn && lastTurn.role === "customer" && lastTurn.audio_url) {
        console.log("[vc]", "http-fallback:customer-ready")
        return  // 客户回复已就绪，停止轮询
      }
      setTimeout(poll, 1200)
    }).catch(err => {
      console.error("[vc]", "http-fallback:poll-error", err)
      setTimeout(poll, 2000)
    })
  }
  poll()
}
```

### 验收标准
1. 短语音 HTTP 回退后，客户回复事件能被正确消费
2. 客户回复语音正常播放
3. _realtimeMode 不被修改，后续长语音仍走 WS
4. 轮询在客户回复就绪后自动停止

---

## W2（P0 配套）：ensureEventsPolling 的 realtimeMode 判断

### 根因
ensureEventsPolling() 第 726 行直接检查 _realtimeMode，短语音 HTTP 回退时 skip 了轮询。

### 改动文件
`mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

```javascript
// chat.js 约 726-732 行
// 当前：
//   if (this._realtimeMode || this.data.realtimeConnecting) {
//     console.log("[vc]", "events.ensure:skip", { realtimeMode: true })
//     return
//   }

// 改为：
if ((this._realtimeMode || this.data.realtimeConnecting) && !this._httpFallbackTurnActive) {
  console.log("[vc]", "events.ensure:skip", { realtimeMode: true })
  return
}
// 如果 _httpFallbackTurnActive 为 true，不 skip，正常启动轮询
```

### 验收标准
1. 正常 WS 模式下 ensureEventsPolling 仍然 skip（行为不变）
2. 短语音 HTTP 回退时 ensureEventsPolling 不再 skip

---

## W3（P1）：HTTP 响应补全 turn_index

### 根因
HTTP submit 成功后，beautician turn 响应中没有 turn_index，导致 getNextTurnIndex() 返回过期值。

### 改动文件
- `app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts`（约 324 行）
- `mini-program-ui/pages/voice-coach/chat.js`（normalizeTurn 或 HTTP 成功回调）

### 修复方案

**方案 A（后端补全，推荐）：**

在 submit/route.ts 的响应中，确保 beautician_turn 对象包含 turn_index：

```typescript
// submit/route.ts 成功响应
return NextResponse.json({
  beautician_turn: {
    turn_id: turn.id,
    turn_index: turn.turn_index,  // 确保这个字段存在
    status: turn.status,
    text: turn.text,
    audio_url: turn.audio_url,
    audio_seconds: turn.audio_seconds,
  },
  next_cursor: nextCursor,
  // ...
})
```

**方案 B（前端兜底）：**

在 chat.js 的 HTTP 成功回调中，如果 turn_index 缺失，手动赋值：

```javascript
// chat.js HTTP submit 成功回调（约 2323-2331 行）
const accepted = normalizeTurn({
  ...payload.beautician_turn,
  turn_index: payload.beautician_turn.turn_index || this.getNextTurnIndex(),
})
```

**两个方案都做**，后端补全是正解，前端兜底是防御。

### 验收标准
1. HTTP submit 响应中包含 turn_index
2. getNextTurnIndex() 不再返回过期值
3. 第二轮 HTTP submit 不再报 duplicate key

---

## W4（P1）：防止在回退 turn 未完成时录音

### 根因
短语音 HTTP 回退后，用户可以立即开始下一轮录音，此时上一轮的客户回复还没到。

### 改动文件
`mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

在 onRecordStart 中（约 1873 行）：

```javascript
// 如果当前有 HTTP 回退 turn 正在处理，阻止录音
if (this._httpFallbackTurnActive) {
  console.log("[vc]", "record:blocked-fallback-pending")
  wx.showToast({ title: "请等待上一轮回复", icon: "none" })
  return
}
```

### 验收标准
1. 短语音 HTTP 回退期间，按住录音按钮无反应，显示提示
2. 客户回复就绪后（_httpFallbackTurnActive = false），录音恢复正常
3. WS 模式下无影响

---

## W5（P2）：开场白音频多样性

### 根因
Round 4 已实现 firstTurnPool 文字多样化，但 seed audio 路径还是固定的 objection_safety_v1.mp3。用户听到的永远是同一段语音。

### 改动文件
- `app/api/voice-coach/sessions/route.ts`（约 62-73 行）

### 修复方案

**方案：不再使用固定 seed audio，让首轮客户也走 TTS 生成**

```typescript
// route.ts 约 62-66 行
// 当前：
//   function getSeedOpeningAudioPath(scenarioId: string): string {
//     if (scenarioId === "objection_safety") return "seed/opening/objection_safety_v1.mp3"
//     return ""
//   }

// 改为：当 firstTurnPool 被使用时，不返回固定 seed audio
function getSeedOpeningAudioPath(scenarioId: string): string {
  const fromEnv = (process.env.VOICE_COACH_SEED_OPENING_AUDIO_PATH || "").trim()
  if (fromEnv) return fromEnv
  // 如果场景有 firstTurnPool，不使用固定 seed audio，让 TTS 生成
  const scenario = VOICE_COACH_SCENARIOS[scenarioId]
  if (scenario?.firstTurnPool && scenario.firstTurnPool.length > 1) {
    return ""  // 不使用 seed audio
  }
  // 兜底：单一开场白仍可用固定 seed audio
  if (scenarioId === "objection_safety") return "seed/opening/objection_safety_v1.mp3"
  return ""
}
```

当 getSeedOpeningAudioPath 返回空字符串时，现有逻辑应该走 TTS 生成路径为首句客户话术合成语音。

如果现有逻辑不支持空 seed audio 时自动 TTS，需要在 sessions/route.ts 的首句处理逻辑中补充：

```typescript
// 如果没有 seed audio，触发 TTS 为首句文字生成语音
const seedAudioPath = getSeedOpeningAudioPath(scenarioId)
if (!seedAudioPath && firstTurnText) {
  // 异步触发 TTS 生成（可以用现有的 jobs 系统或直接调用 TTS API）
  // 生成完后更新 turn 的 audio_path
}
```

### 验收标准
1. 多次创建会话，开场白文字和语音都不相同
2. 首句语音正常播放（不管是 seed 还是 TTS 生成的）
3. 如果 TTS 生成失败，有 fallback（显示文字）

---

## W6（P3）：自动播放去重

### 根因
同一个客户 turn 可能被多次触发 autoPlayTurn()，导致重复播放。

### 改动文件
`mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

**A. 加强 autoplay 去重逻辑（约 1262-1267 行）：**

```javascript
// 当前：
//   if (this.lastAutoPlayedCustomerTurnId !== turnId) {
//     this.lastAutoPlayedCustomerTurnId = turnId
//     this.autoPlayTurn(...)
//   }

// 改为：加入时间戳防抖
if (this.lastAutoPlayedCustomerTurnId !== turnId) {
  this.lastAutoPlayedCustomerTurnId = turnId
  this._lastAutoPlayAt = Date.now()
  this.autoPlayTurn(...)
} else {
  // 同一个 turn 5 秒内不重复播放
  if (Date.now() - (this._lastAutoPlayAt || 0) < 5000) {
    console.log("[vc]", "autoplay:dedup", { turnId })
    return
  }
}
```

**B. 检查所有触发 autoPlayTurn 的调用点，确认都经过去重检查：**

搜索 chat.js 中所有 autoPlayTurn 调用，确保都走上面的去重逻辑。

### 验收标准
1. 同一客户 turn 不会被重复自动播放
2. 不同客户 turn 的自动播放不受影响
3. 手动点击播放不受去重限制

---

## 不要做的事

1. 不要把 _realtimeMode 在短语音回退时设为 false（会断开 WS）
2. 不要重新验证 WS 是否接通
3. 不要改动 voice-coach-ws 服务端代码
4. 不要改动 ws-client.js 或 audio-stream-player.js 核心逻辑
5. 不要删除 HTTP 回退路径（这是 WS 不可用时的安全网）

---

## 验证方案

### 短语音测试（验证 W1-W4）
1. 录一段 <3 秒的短语音
2. 确认走 HTTP 回退（日志显示 short-utterance:http-fallback）
3. 确认客户回复正常到达并播放（日志显示 http-fallback:customer-ready）
4. 立即录第二段短语音 → 应被阻止（显示"请等待上一轮回复"）
5. 等客户回复播放完，录第二段 → 正常提交，无 duplicate key 错误

### 长语音测试（验证无回归）
1. 录一段 >3 秒的正常语音
2. 确认走 WS 实时链路（日志显示 ws.audio.start / ws.asr.final / ws.tts.done）
3. 录第二轮 → 正常，turn_index 递增

### 开场白测试（验证 W5）
1. 创建 3 次新会话
2. 确认开场白文字不全相同
3. 确认开场白语音不全相同（或至少文字不同时语音也不同）

### 自动播放测试（验证 W6）
1. 正常对话一轮
2. 客户回复只播放一次，不重复
