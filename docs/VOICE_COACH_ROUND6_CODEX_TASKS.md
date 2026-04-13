# Voice Coach Round 6 — 部署对齐 + 播放仲裁 + turn_index 同步 + 收尾修复

## Context

Round 5 确认：短语音 HTTP 回退已通，duplicate key 已消失。但真机复测暴露 5 个遗留问题：

1. **部署端与仓库代码漂移**：本地代码已改了 firstTurnPool + 不用固定 seed audio，但线上仍返回固定首句音频（session.create hasAudio=true）。原因是线上部署未更新或环境变量未同步。
2. **客户 turn_index 未同步**：HTTP 回退后，`customer.text_ready / customer.audio_ready` 事件不包含 turn_index，导致 getNextTurnIndex() 返回过期值（2 而非 3）。
3. **播放仲裁不稳定**：单 audioCtx 共享，多个 turn autoplay 在同一时间窗竞争，后发覆盖先发。
4. **events.force:done 后 fallback 状态未清理**：正常完成时不调 clearHttpFallbackTurn()，留下脏状态。
5. **hint 重复请求**：openHint() 无 in-flight 门禁，快速点击触发多次请求。

---

## 6 线程任务

```
W1: 部署对齐验证 + 首句音频修复（P0）
W2: 客户 turn_index 同步（P0）
W3: 播放仲裁——只允许最新 customer turn 自动播放（P1）
W4: HTTP fallback 状态清理（P1）
W5: hint 单飞门禁（P2）
W6: 冒烟测试清单更新（P2）
```

全部并行，无依赖。

---

## W1（P0）：部署对齐 + 首句音频修复

### 问题
本地代码已实现 firstTurnPool + getSeedOpeningAudioPath() 在有 pool 时返回空。但线上 session.create 仍返回 hasAudio=true，说明线上代码/环境变量未同步。

### 根因
三种可能（排除法）：
1. 线上还跑着旧版 `sessions/route.ts`（最可能）
2. 线上 `VOICE_COACH_SEED_OPENING_AUDIO_PATH` 仍有值
3. 线上 `VOICE_COACH_FIRST_TTS_MODE=sync`

### 改动

**A. 确认线上部署状态**

检查 Vercel 部署：
```bash
# 查看最近部署
npx vercel ls --limit 5

# 或直接检查线上 API 行为
curl -s https://ip.ipgongchang.xin/api/voice-coach/sessions \
  -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test_token>" \
  -d '{"scenario_id":"objection_safety"}' | jq '.first_turn'
```

多次调用，检查 text 是否变化、audio_url 是否每次相同。

**B. 如果线上代码已更新但环境变量问题**

在 Vercel 环境变量中确认：
- `VOICE_COACH_SEED_OPENING_AUDIO_PATH` = 空或不设置
- `VOICE_COACH_FIRST_TTS_MODE` = `async`（或不设置，默认 async）
- `VOICE_COACH_FIRST_TURN_MODE` = `preset`

**C. 如果线上代码未更新**

重新部署：
```bash
cd d:/IP网站
npx vercel --prod
```

**D. 首句 async TTS 的前端处理**

当 `VOICE_COACH_FIRST_TTS_MODE=async` 且没有 seed audio 时，session 创建时 audioUrl 为空。前端需要：
1. 先显示首句文字
2. 异步等待 TTS 生成完成（通过事件轮询或 WS 事件拿到 customer.audio_ready）
3. 音频就绪后自动播放

检查 `chat.js` 的 `createSession` 成功回调和 `loadSession`：
- 当 `first_turn.audio_url` 为空时，是否有等待音频就绪的逻辑？
- 如果没有，需要在 session 创建后启动事件轮询/WS 监听，等待首句音频。

代码锚点：
- `app/api/voice-coach/sessions/route.ts:116-169` — 首句生成逻辑
- `mini-program-ui/pages/voice-coach/chat.js` — createSession 成功后的处理

### 验收标准
1. 多次创建会话，首句文字不相同
2. 首句音频与文字匹配（不再是固定 seed audio）
3. 如果首句 TTS 是异步的，前端能正确等待并播放

---

## W2（P0）：客户 turn_index 同步

### 问题
HTTP 回退后，`customer.text_ready / customer.audio_ready` 事件处理中，appendTurn/patchTurn 时不带 turn_index，导致 getNextTurnIndex() 只看到 beautician 的 turn_index=1，下一轮算出 turnIndex=2（应该是 3）。

### 根因
- `chat.js:1299-1329` — customer.text_ready 事件处理中，normalizeTurn 的入参不包含 turn_index
- `chat.js:1335-1389` — customer.audio_ready 同样不包含 turn_index
- 事件 payload 本身可能不含 turn_index（后端 voice_coach_events 表的 data_json 里可能没有 turn_index）

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`
- 可能需要改 `app/api/voice-coach/sessions/[sessionId]/events/route.ts` 或 `lib/voice-coach/jobs.server.ts`

### 修复方案

**方案 A（前端推算，不改后端）：**

在 customer.text_ready 处理中，根据对应的 beautician turn_index 推算：
```javascript
// chat.js customer.text_ready 处理（约 1322-1328 行）
// 找到 parent beautician turn 的 turn_index
const parentTurnId = String(data.beautician_turn_id || "")
const parentTurn = this.data.turns.find(t => t.id === parentTurnId)
const customerTurnIndex = parentTurn && Number.isFinite(parentTurn.turn_index)
  ? parentTurn.turn_index + 1
  : null

const updated = this.patchTurn(turnId, {
  status: "text_ready",
  turn_index: customerTurnIndex,  // 新增
  // ... 其他字段
})
if (!updated) {
  this.appendTurn(normalizeTurn({
    turn_id: turnId,
    role: "customer",
    turn_index: customerTurnIndex,  // 新增
    // ... 其他字段
  }))
}
```

同样在 customer.audio_ready 中也做相同处理。

**方案 B（后端补全，更可靠）：**

在后端事件 emit 时，把 turn_index 放进 data_json：
```typescript
// lib/voice-coach/jobs.server.ts 中 emit customer.text_ready 事件时
await emitEvent({
  session_id: sessionId,
  turn_id: customerTurnId,
  type: "customer.text_ready",
  data_json: {
    text: customerText,
    emotion: customerEmotion,
    beautician_turn_id: beauticianTurnId,
    turn_index: customerTurnIndex,  // 新增
  }
})
```

**建议两个都做**：后端补全是正确做法，前端推算是防御性兜底。

### 验收标准
1. HTTP 回退后，客户 turn 在前端状态中有正确的 turn_index
2. 第二轮录音的 turnIndex = 3（不是 2）
3. 无 duplicate key 错误

---

## W3（P1）：播放仲裁——只允许最新 customer turn 自动播放

### 问题
单 audioCtx 共享，旧 turn 和新 turn 的 autoplay 在同一时间窗竞争，后发覆盖先发，导致用户"听不到"回复。

### 根因
- `chat.js:2714-2722` — autoPlayTurn 只有 per-turnId cooldown（1500ms），没有"只播最新 customer turn"门禁
- `chat.js:2730-2751` — playAudio 直接 stop 前一个播放并替换

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

在 autoPlayTurn 中增加"最新 customer turn"检查：

```javascript
autoPlayTurn(turn) {
  if (!turn || !turn.audio_url || !turn.id) return
  if (!this.shouldAutoPlayTurn(turn.id)) return

  // 新增：只自动播放最新的 customer turn
  if (turn.role === "customer") {
    const latestCustomer = this.getLatestCustomerTurn()
    if (latestCustomer && latestCustomer.id !== turn.id) {
      vcLog("audio.autoplay:skip-not-latest", { turnId: turn.id, latestId: latestCustomer.id })
      return
    }
  }

  vcLog("audio.autoplay", { turnId: turn.id, source: ... })
  this.playAudio(turn.id, turn.audio_url, { autoplay: true })
}
```

新增辅助方法：
```javascript
getLatestCustomerTurn() {
  const turns = this.data.turns || []
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "customer" && turns[i].audio_url) return turns[i]
  }
  return null
}
```

### 验收标准
1. 首句 customer turn 和后续 customer turn 不互相覆盖
2. 只有最新的 customer turn 会被自动播放
3. 手动点击旧 turn 的播放按钮仍正常（不受自动播放限制）

---

## W4（P1）：HTTP fallback 状态清理

### 问题
`_forceEventsPollingLoop` 正常完成后，不调 `clearHttpFallbackTurn()`，留下脏状态（`_httpFallbackTurnActive` 等）。events.force:done 日志中 customerTurnId 可能为空。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

在 `forceEventsPollingLoop` 正常完成后（约第 598 行 events.force:done 之后）：

```javascript
// 当前：只 log，不清理
vcLog("events.force:done", {
  sessionId,
  waitedMs: Date.now() - startedAt,
  customerTurnId: this._httpFallbackCustomerTurnId || "",
})

// 改为：先 log（用局部变量），再清理
const finalCustomerTurnId = this._httpFallbackCustomerTurnId || ""
vcLog("events.force:done", {
  sessionId,
  waitedMs: Date.now() - startedAt,
  customerTurnId: finalCustomerTurnId,
})
this.clearHttpFallbackTurn("success")
```

### 验收标准
1. events.force:done 日志中 customerTurnId 非空（正常完成时）
2. 正常完成后 _httpFallbackTurnActive = false
3. 下一轮录音不被错误阻止

---

## W5（P2）：hint 单飞门禁

### 问题
openHint() 无 in-flight 检查，快速点击触发多次请求。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 修复方案

```javascript
// chat.js openHint()（约 2622 行）
openHint() {
  // 新增：in-flight 门禁
  if (this._hintInFlight) {
    vcLog("hint.open:skip-inflight")
    return
  }
  this._hintInFlight = true

  const sessionId = this.data.sessionId
  if (!sessionId) { this._hintInFlight = false; return }
  // ... 原有逻辑 ...

  request({ ... })
    .then(res => {
      this._hintInFlight = false
      // ... 原有成功处理 ...
    })
    .catch(err => {
      this._hintInFlight = false
      // ... 原有错误处理 ...
    })
}
```

### 验收标准
1. 快速连续点击 hint 按钮，只触发一次请求
2. 请求完成后可以再次点击

---

## W6（P2）：冒烟测试清单更新

### 输出文件
- 更新 `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md`

### 任务描述

基于 Round 5 的新发现，更新测试清单，增加：

- [ ] 短语音（<3s）：HTTP 回退 → 客户回复到达并播放
- [ ] 短语音后长语音：第二轮走 WS，turnIndex 递增正确
- [ ] 首句多样性：多次创建会话，开场白文字+语音不同
- [ ] 播放不互相覆盖：首句播放不被后续 turn autoplay 打断
- [ ] hint 单飞：连续点击只触发一次
- [ ] events.force 状态清理：HTTP 回退后录音不被错误阻止

---

## Verification

1. **部署对齐**：
   - `curl` 多次调 sessions API，确认首句文字变化
   - 真机上多次进入练习，确认首句不同

2. **turn_index**：
   - 短语音 HTTP 回退后，日志中第二轮 turnIndex=3
   - 无 duplicate key 错误

3. **播放仲裁**：
   - 日志中不出现 `audio.autoplay:skip-not-latest`（正常时）
   - 首句客户语音不被覆盖

4. **fallback 状态**：
   - events.force:done 日志中 customerTurnId 非空
   - 下一轮录音不被 blocked

5. **hint**：
   - 快速点击 3 次，日志只有 1 次 hint.open:start

## Critical Files

**改动：**
- `mini-program-ui/pages/voice-coach/chat.js` — W2/W3/W4/W5
- `app/api/voice-coach/sessions/route.ts` — W1（部署验证）
- `lib/voice-coach/jobs.server.ts` — W2（后端 turn_index 补全）
- `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md` — W6

**只读参考：**
- `docs/VOICE_COACH_CLAUDE_HANDOFF_2026-03-22_ROUND5_VERIFY.md` — 当前状态基准
