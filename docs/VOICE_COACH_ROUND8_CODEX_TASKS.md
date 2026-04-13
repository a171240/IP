# Voice Coach Round 8 — 播放抢占终结 + 部署验证 + 文案上线

## Context

Round 7 的 6 项代码改动全部已落地（generation counter、text_ready 接受、长轮询、overlay、首句多样化、hint 门禁）。但真机日志仍显示 3 个运行时问题：

1. **播放覆盖仍存在**：generation counter 防住了 playAudio 内部竞争，但 beautician turn 的手动播放（onPlay）和 customer turn 的 autoplay 仍在抢占同一 audioCtx
2. **HTTP fallback 仍 19s**：代码已改（text_ready 接受 + 5s 长轮询），但线上可能未部署最新代码
3. **首句文案多样化已生效但未被感知**：5 条新文案已在代码里，需确认线上部署

### 关键发现：播放覆盖的真正根因

代码分析显示 `autoPlayTurn → shouldAutoPlayTurn → shouldAutoPlayLatestCustomerTurn` 的门禁逻辑是正确的：只允许最新 customer turn 自动播放，beautician turn 被过滤。

但日志中 beautician turn 的 `audio.play:start` 来自 **onPlay(e)**（line 2890）——用户手动点击气泡触发，完全绕过 autoplay 门禁。这说明：

- 用户点击了 beautician turn 的播放按钮（听自己的录音）
- 此时 customer turn 的 autoplay 或 download 回调也在进行
- 两者都调用 playAudio → 后者的 `audioCtx.stop()` 打断前者（或反之）

解决方案不是再加更多 autoplay 门禁，而是：**在 playAudio 的 doPlay 中，如果当前已有 autoplay 在播放且新请求也是 autoplay，则用 generation counter 自然淘汰旧的；如果新请求是手动播放，则允许抢占但标记 autoplay 暂停。**

---

## 6 线程任务

```
W1: playAudio 播放锁 — 手动播放期间暂停 autoplay  (P0)  chat.js
W2: 确认线上部署最新代码 + 触发重新部署          (P0)  部署操作
W3: InnerAudioContext 听筒/扬声器模式排查        (P0)  chat.js
W4: 首句播放后 autoplay 恢复时序优化             (P1)  chat.js
W5: HTTP fallback 后端 job 处理速度诊断          (P1)  jobs.server.ts
W6: 真机冒烟测试更新 + 验收文档                  (P2)  docs
```

---

## W1（P0）：playAudio 播放锁

### 问题
手动 onPlay（点击 beautician turn 听录音）和 autoplay（customer turn 自动播放）抢占同一 audioCtx。

### 方案
新增 `_manualPlayActive` 标志。手动播放期间，autoplay 请求被静默跳过（不调 playAudio）。手动播放结束后恢复 autoplay。

### 改动

**`chat.js`：**

- **onLoad（~line 200）** 新增：
  ```javascript
  this._manualPlayActive = false
  ```

- **onPlay (line 2890-2911)** 进入时设置标志：
  ```javascript
  onPlay(e) {
    // ... 原有 url/id 提取 ...
    this._manualPlayActive = true  // 新增
    this.playAudio(id, url, {
      markInitialPromptComplete: id === this._initialCustomerTurnId,
    })
  }
  ```

- **audioCtx.onEnded (line 208-230)** 清除标志：
  ```javascript
  this._manualPlayActive = false  // 新增，在现有清理逻辑末尾
  ```

- **audioCtx.onError** 也清除：
  ```javascript
  this._manualPlayActive = false
  ```

- **autoPlayTurn (line 2966-2977)** 开头加检查：
  ```javascript
  autoPlayTurn(turn) {
    if (!turn || !turn.audio_url || !turn.id) return
    // 新增：手动播放期间不触发 autoplay
    if (this._manualPlayActive) {
      vcLog("audio.autoplay:skip-manual-active", { turnId: turn.id })
      return
    }
    // ... 原有逻辑 ...
  }
  ```

### 验收
1. 用户点击 beautician turn 播放时，customer turn 的 autoplay 被跳过
2. beautician turn 播放结束后，新的 customer turn autoplay 正常触发
3. 不影响 overlay 首句播放（走 playAudio 而非 autoPlayTurn）

### 不要动
shouldAutoPlayTurn / generation counter / HTTP fallback / overlay

---

## W2（P0）：确认线上部署 + 重新部署

### 问题
代码已改但线上 HTTP fallback 仍 19s，说明可能未部署。

### 步骤

1. **检查 Vercel 最新部署时间**：
   ```bash
   npx vercel ls --limit 3
   ```
   确认最新部署是否在 Round 7 代码提交之后。

2. **检查线上 events 路由行为**：
   ```bash
   # 测试长轮询是否生效
   time curl -s "https://ip.ipgongchang.xin/api/voice-coach/sessions/test/events?timeout_ms=5000" \
     -H "Authorization: Bearer <token>"
   ```
   如果 5 秒超时正常返回 → 已部署。如果 1-2 秒就返回 → 未部署。

3. **如果未部署，执行重新部署**：
   ```bash
   cd d:/IP网站
   git add -A && git commit -m "chore: round 7 fixes - playback gen counter, text_ready fallback, overlay, pool diversity"
   npx vercel --prod
   ```

4. **部署 voice-coach-ws 服务**（如果 WS 服务也需要更新）：
   ```bash
   cd d:/IP网站/voice-coach-ws
   npm run build
   # SSH 到服务器
   pm2 reload ecosystem.config.cjs
   ```

5. **部署后验证**：
   - 创建 session，确认首句文字在 5 条新文案中随机
   - 短语音 HTTP fallback，确认 events.force:done waitedMs < 15s

### 验收
1. Vercel 部署时间在最新 commit 之后
2. events?timeout_ms=5000 正确长轮询
3. 首句文案多样化在线上生效

### 不要动
任何代码文件

---

## W3（P0）：InnerAudioContext 输出路由排查

### 问题
iOS 上 audio.ctx.play 和 audio.ctx.ended 都触发了，但用户听不到。可能是：
1. 听筒模式（phone speaker 而非 loudspeaker）
2. 音量为 0
3. 音频文件实际为空或格式异常

### 改动

**`chat.js` audioCtx 初始化（~line 185-193）**：

```javascript
// 在 audioCtx 创建后，强制设置输出路由
try {
  this.audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: true })
} catch (_e) {
  this.audioCtx = wx.createInnerAudioContext()
}
try {
  this.audioCtx.obeyMuteSwitch = false
} catch (_e) {}

// 新增：强制使用扬声器播放（排除听筒模式）
try {
  wx.setInnerAudioOption({
    obeyMuteSwitch: false,
    speakerOn: true,           // 强制扬声器
    mixWithOther: false,       // 独占音频焦点
  })
} catch (_e) {
  vcWarn("audio.setOption:fail")
}
```

**在 doPlay (line 2998-3035) 中增加音频诊断日志**：

```javascript
// 在 audioCtx.play() 之后
vcLog("audio.ctx.play", {
  turnId,
  autoplay,
  src: src ? src.substring(0, 80) : "",
  volume: this.audioCtx.volume,
  duration: this.audioCtx.duration,
  paused: this.audioCtx.paused,
})
```

**在 audioCtx.onError 回调中增加详细错误**：

```javascript
this.audioCtx.onError((err) => {
  vcWarn("audio.ctx.error", {
    turnId: this._activeAudioTurnId || "",
    errMsg: err && err.errMsg || "",
    errCode: err && err.errCode || "",
  })
  this._manualPlayActive = false
})
```

### 验收
1. 日志中 `audio.ctx.play` 带 volume/duration/paused 信息
2. 如果 volume=0 或 duration=0，说明音频文件有问题
3. `wx.setInnerAudioOption({ speakerOn: true })` 排除听筒模式
4. 任何 audio.ctx.error 都能被捕获并记录

### 不要动
playAudio 核心逻辑 / autoplay 门禁 / HTTP fallback

---

## W4（P1）：首句播放后 autoplay 恢复时序

### 问题
首句通过 overlay 播放完毕后，`_initialCustomerPromptCompleted` 置 true，此时用户可以开始录音。但如果在首句播放期间有新的 customer turn 到达（比如 HTTP fallback 的结果），它的 autoplay 被初始化门禁拦住了。首句完成后需要检查是否有待播放的 customer turn。

### 改动

**`chat.js` audioCtx.onEnded (line 208-230)**：

在 `_initialCustomerPromptCompleted = true` 之后，新增：

```javascript
if (this._initialCustomerPromptCompleted) {
  // 首句播完后，检查是否有待播放的 customer turn
  const latestCustomer = this.getLatestCustomerTurn()
  if (latestCustomer && latestCustomer.audio_url && latestCustomer.id !== this._initialCustomerTurnId) {
    vcLog("audio.autoplay:deferred-after-initial", { turnId: latestCustomer.id })
    setTimeout(() => {
      this.autoPlayTurn(latestCustomer)
    }, 300)  // 短延迟避免 audioCtx 状态竞争
  }
}
```

新增辅助方法：
```javascript
getLatestCustomerTurn() {
  const turns = this.data.turns || []
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "customer" && turns[i].id !== this._initialCustomerTurnId) return turns[i]
  }
  return null
}
```

### 验收
1. 首句播完后，如果已有新 customer turn 的音频就绪，自动播放
2. 如果没有新 turn，无副作用
3. 不会触发重复播放（autoPlayTurn 内部有 cooldown 保护）

### 不要动
overlay 逻辑 / generation counter / HTTP fallback

---

## W5（P1）：HTTP fallback 后端 job 处理诊断

### 问题
即使客户端长轮询生效，如果后端 job 处理本身就需要 15-20s，体感仍然慢。需要诊断后端处理速度。

### 改动

**`lib/voice-coach/jobs.server.ts`** — 在 processMainStage 中增加分段耗时日志：

```typescript
// processMainStage 入口
const stageStart = Date.now()
console.log(`[voice-coach-job] main_stage:start job=${jobId}`)

// ASR 完成后
console.log(`[voice-coach-job] main_stage:asr_done job=${jobId} elapsed=${Date.now()-stageStart}ms`)

// LLM 完成后
console.log(`[voice-coach-job] main_stage:llm_done job=${jobId} elapsed=${Date.now()-stageStart}ms`)

// processTtsStage 入口和出口同理
const ttsStart = Date.now()
console.log(`[voice-coach-job] tts_stage:start job=${jobId}`)
// TTS 完成后
console.log(`[voice-coach-job] tts_stage:done job=${jobId} elapsed=${Date.now()-ttsStart}ms`)
```

**`app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts`** — 增加 fast-path 耗时日志：

```typescript
const advanceStart = Date.now()
const advanced = await advanceJobWithinBudget({ ... })
console.log(`[voice-coach-submit] fast_path elapsed=${Date.now()-advanceStart}ms stage=${advanced.stage}`)
```

### 验收
1. 服务端日志能看到每个 stage 的耗时
2. 能定位 19s 中哪个阶段最慢
3. 为下一轮优化提供数据依据

### 不要动
job 处理逻辑本身 / 前端代码

---

## W6（P2）：真机冒烟测试清单 + 验收文档

### 输出文件
- 更新 `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md`
- 新建 `docs/VOICE_COACH_ROUND8_VERIFICATION.md`（空模板）

### 新增测试项

- [ ] iOS：overlay 点击后首句音频从扬声器播出（非听筒）
- [ ] iOS：静音模式下 overlay 点击后仍能听到声音
- [ ] 点击 beautician 气泡播放时，customer autoplay 被跳过
- [ ] beautician 播放结束后，新 customer turn 自动播放
- [ ] 首句播完后，已就绪的 customer turn 自动补播
- [ ] HTTP fallback：text 在 10s 内出现，audio 随后自动播放
- [ ] 5 次进入练习，至少 3 种不同开场白
- [ ] 日志中 audio.ctx.play 包含 volume/duration 信息
- [ ] 服务端日志中 main_stage/tts_stage 耗时可读

---

## Verification

**合并后真机测试：**

1. **iOS 静音模式 + 扬声器**：overlay → 首句从扬声器播出
2. **播放锁**：点击 beautician 播放 → 期间 customer autoplay 被 skip-manual-active
3. **HTTP fallback 速度**：text < 10s 出现
4. **首句多样性**：线上 5 条新文案确认生效
5. **后端日志**：每个 stage 耗时可读

## Critical Files

- `mini-program-ui/pages/voice-coach/chat.js` — W1/W3/W4
- `lib/voice-coach/jobs.server.ts` — W5
- `app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts` — W5
- `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md` — W6
