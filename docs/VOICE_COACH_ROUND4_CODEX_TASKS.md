# Voice Coach Round 4 — UI Polish + 产品体验（6 线程）

> 日期：2026-03-22
> 前置：Round 3 WebSocket 实时链路已跑通，真机两轮对话+打断均验证通过
> 本轮目标：UI/交互打磨 + 产品体验优化 + 稳定性加固

---

## 背景

Round 3 Handoff 确认：
- 真机已走 WebSocket 实时链路（非 HTTP 轮询）
- 两轮连续对话 + barge_in 打断均成功
- turn_index 持久化和录音帧丢失问题已修复

**本轮不涉及传输架构。** 所有任务都是前端 UI/交互或产品逻辑。

已验证 session: `1969c65b-54b2-4ae8-9381-1202c221d33e`

---

## 6 线程任务分配

```
W1: 录音按钮交互修复          W4: 话术多样性（多开场白池）
W2: 操作按钮统一重构          W5: 客户语音占位态视觉确认+修复
W3: 真机多轮稳定性验证脚本    W6: 边缘 case 加固
```

全部并行，无依赖。

---

## W1：录音按钮交互修复

### 问题
真机上录音按钮可能粘在"松开发送"状态。按下后按钮有 scale(1.02) 脉冲动画导致视觉上浮感。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.wxss`
- `mini-program-ui/pages/voice-coach/chat.js`（仅验证状态重置逻辑）

### 具体改动

**A. 替换 recordPulse 动画（chat.wxss 约 638-641 行）**

当前：
```css
@keyframes recordPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(149, 236, 105, 0.3); }
  50% { transform: scale(1.02); box-shadow: 0 0 30rpx rgba(149, 236, 105, 0.2); }
}
```

改为（去掉 transform，只用 box-shadow 脉冲）：
```css
@keyframes recordPulse {
  0%, 100% { box-shadow: 0 0 0 4rpx rgba(149, 236, 105, 0.2); }
  50% { box-shadow: 0 0 0 8rpx rgba(149, 236, 105, 0.5); }
}
```

**B. 确认 .record-btn.is-recording 不使用 transform**

检查 chat.wxss 中 .record-btn.is-recording 的所有样式，确保没有 transform 属性。

**C. 验证状态重置**

检查 chat.js 中 recorder.onStop 回调（约 229-234 行），确认以下状态被正确重置：
- recording = false
- recordCanceling = false
- recordingPreviewText = ""

如果有任何情况下这些状态没被重置（比如录音异常中断），补充 recorder.onError 中的重置逻辑。

### 验收标准
1. 录音态按钮位置不变，无上浮/膨胀
2. 有明显的录音状态视觉反馈（发光脉冲）
3. 松开后按钮立即恢复原状，不粘在"松开发送"
4. 录音异常中断后按钮也能正确恢复

---

## W2：操作按钮统一重构

### 问题
"转文字"用 `<view class="trans-btn">`（固定 56rpx 高），"改进建议"/"重录"用 `<text class="meta-action">`（padding 驱动），高度/基线/风格不统一。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.wxml`（约 65-109 行）
- `mini-program-ui/pages/voice-coach/chat.wxss`（约 287-391 行）

### 具体改动

**A. wxml：统一组件结构**

当前混用 view.trans-btn 和 text.meta-action。改为统一用 view.action-chip：

```xml
<view class="op-actions">
  <!-- 转文字 -->
  <view wx:if="{{适当条件}}" class="action-chip" bindtap="对应handler">
    转文字
  </view>
  <!-- 改进建议 -->
  <view wx:if="{{适当条件}}" class="action-chip" bindtap="对应handler">
    改进建议
  </view>
  <!-- 重录 -->
  <view wx:if="{{适当条件}}" class="action-chip action-chip-muted" bindtap="对应handler">
    重录
  </view>
  <!-- 重试语音 -->
  <view wx:if="{{适当条件}}" class="action-chip action-chip-warn" bindtap="对应handler">
    重试语音
  </view>
</view>
```

注意：保持原有的 wx:if 条件和 bindtap handler 不变，只改标签结构和 class。

**B. wxss：统一样式**

```css
.action-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 52rpx;
  padding: 0 22rpx;
  border-radius: 26rpx;
  background: rgba(0, 0, 0, 0.05);
  font-size: 24rpx;
  color: #333;
  line-height: 1;
}
.action-chip-muted {
  background: transparent;
  border: 1rpx solid rgba(0, 0, 0, 0.1);
  color: #888;
}
.action-chip-warn {
  background: rgba(244, 67, 54, 0.08);
  color: #d32f2f;
}
```

**C. 删除旧的 .trans-btn 和 .meta-action 样式**（确认没有其他地方使用后）

### 验收标准
1. 三个操作按钮等高、对齐、风格统一
2. "重录"视觉上弱于"转文字"和"改进建议"（次要操作）
3. 真机上视觉整洁无错位

---

## W3：真机多轮稳定性验证脚本

### 问题
当前只验证了 2 轮对话。需要确认 3-5 轮连续对话、多次打断、极短/极长语音等场景的稳定性。

### 输出文件
- `docs/VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md`

### 任务描述

编写一份结构化的真机冒烟测试清单，包含：

**A. 基础流程（必测）**
- [ ] 场景选择 → 首轮开场白播放
- [ ] 第 1 轮：录音(5秒) → ASR → LLM 回复 → TTS 播放
- [ ] 第 2 轮：录音(3秒) → 完整流程
- [ ] 第 3 轮：录音(8秒) → 完整流程
- [ ] 结束练习 → 报告页

**B. 打断测试**
- [ ] 第 1 轮 TTS 播放中按下录音 → barge_in → 第 2 轮正常
- [ ] 连续打断：第 2 轮也在 TTS 中打断 → 第 3 轮正常

**C. 边缘 case**
- [ ] 极短语音：按下立即松开（<1秒）→ 不崩溃
- [ ] 上滑取消 → 不插入 turn
- [ ] 录音后断网 → 降级到 HTTP 或显示错误
- [ ] 后台切回前台 → WS 重连

**D. 日志验证**
- [ ] vConsole 中每轮都有完整 [vc] 日志序列
- [ ] 无 turn_persist_failed
- [ ] 无 asr_empty_result（除极短语音外）
- [ ] turn_index 递增无跳跃

**E. 延迟体感**
- [ ] 录完音到听到回复 ≤ 2 秒（体感）
- [ ] 打断后 ≤ 0.5 秒停止播放并开始录音

### 验收标准
1. 清单可直接用于人工测试
2. 覆盖所有已知风险场景
3. 每项有明确的通过/失败判定标准

---

## W4：话术多样性（多开场白池）

### 问题
每次进入练习，顾客开场白固定。这是产品设计问题，不是 bug。

### 方案：单场景多开场白池

### 改动文件
- `lib/voice-coach/scenarios.ts`
- `app/api/voice-coach/sessions/route.ts`

### 具体改动

**A. scenarios.ts：添加开场白池**

在现有 VOICE_COACH_SCENARIOS 配置中，给 objection_safety 场景添加 firstTurnPool：

```typescript
firstTurnPool: [
  "我想了解一下你们这个抗衰项目，具体是怎么做的？",
  "朋友推荐我来看看，说你们这边做抗衰还不错？",
  "我最近感觉皮肤状态下降了，你们有什么好的方案吗？",
  "我在网上看到你们的项目，想来咨询一下价格和效果。",
  "我之前在别家做过类似的，效果一般，你们这个有什么不同？",
]
```

**B. route.ts：从池中随机选取**

在 fallbackFirstCustomerTurn() 中（约 32 行）：

```typescript
function fallbackFirstCustomerTurn(scenarioId?: string): string {
  const scenario = VOICE_COACH_SCENARIOS[scenarioId || "objection_safety"]
  const pool = scenario?.firstTurnPool
  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)]
  }
  // 原有的固定 fallback
  return "我想了解一下你们这个抗衰项目..."
}
```

### 验收标准
1. 多次创建会话，开场白不再每次相同
2. 所有开场白符合"美业抗衰咨询"场景
3. 不影响 VOICE_COACH_FIRST_TURN_MODE=llm 模式

---

## W5：客户语音占位态视觉确认 + 修复

### 问题
Round 3 改了代码让客户回复显示"语音生成中..."占位符而非文字，但还没有真机截图确认效果。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.wxml`（如需微调）
- `mini-program-ui/pages/voice-coach/chat.wxss`（如需微调）

### 任务描述

**A. 确认当前 pending 客户回复的显示逻辑**

在 chat.wxml 中（约 45-51 行），检查客户 pending 状态的条件渲染：
- 当 customer turn 的 pending=true 且有 text 时，应显示"语音生成中..."占位
- 不应该先显示纯文字再切换到语音气泡

**B. 确认语音气泡 vs 文字气泡的切换时机**

检查以下状态转换是否平滑：
1. LLM 流式文字到达 → 显示"语音生成中..."（不显示文字）
2. TTS 音频到达 → 切换为语音气泡（显示播放按钮 + 时长）
3. 播放完毕 → 语音气泡保持

**C. 如果发现视觉闪烁或状态跳变**

微调 wxml 条件或添加过渡样式，确保用户不会看到：
- 文字闪现后消失
- 空白气泡
- 两个客户气泡同时存在

### 验收标准
1. 客户回复始终显示为语音气泡形态（不显示原始文字）
2. "语音生成中..."到语音就绪的过渡平滑
3. 无闪烁或跳变

---

## W6：边缘 case 加固

### 问题
当前只验证了正常流程的 2 轮对话，需要加固边缘 case。

### 改动文件
- `mini-program-ui/pages/voice-coach/chat.js`

### 具体加固点

**A. 极短语音保护**

在 onRecordEnd 中，如果录音时长 < 1 秒：
```javascript
if (duration < 1) {
  console.log(TAG, "record:too-short", { duration })
  // 发送 audio.cancel 而不是 audio.end
  if (this._realtimeMode) {
    this._wsClient.sendJson({ type: "audio.cancel" })
  }
  wx.showToast({ title: "说话时间太短", icon: "none" })
  this.setData({ processingBeauticianTurn: false })
  return
}
```

**B. WS 重连后状态恢复**

在 ws-client 的 onReconnect 回调中：
```javascript
this._wsClient.onOpen(() => {
  if (this._reconnecting) {
    // 重连成功，恢复状态
    console.log(TAG, "ws:reconnected")
    this.setData({ realtimeConnected: true })
    this._reconnecting = false
  }
})
```

**C. 连续 barge_in 保护**

如果用户在 ASR 阶段就再次打断（极快连续操作），确保不会：
- 发送多个 barge_in
- 打开多个 ASR 连接

加一个简单的节流：
```javascript
if (this._lastBargeInAt && Date.now() - this._lastBargeInAt < 500) {
  return  // 500ms 内不重复打断
}
this._lastBargeInAt = Date.now()
```

**D. onHide/onShow 处理**

小程序切到后台再回来时：
```javascript
onHide() {
  // 如果正在录音，停止录音
  if (this.data.recording) {
    this.recorder.stop()
  }
}

onShow() {
  // 检查 WS 连接状态
  if (this._realtimeMode && this._wsClient && !this._wsClient.isConnected) {
    console.log(TAG, "ws:reconnect-on-show")
    this._wsClient.reconnect()
  }
}
```

### 验收标准
1. 极短语音不崩溃，显示友好提示
2. 断网重连后 WS 恢复正常
3. 连续快速操作不产生重复消息
4. 后台切换不丢失连接

---

## 不要做的事

1. **不要重新验证 WS 是否接通** — 已确认在走实时链路
2. **不要改动 voice-coach-ws/ 服务端代码** — 服务端已稳定
3. **不要改动 ws-client.js 或 audio-stream-player.js 的核心逻辑** — 已验证可用
4. **不要重开传输层架构讨论** — 当前架构已验证

---

## 验证方案

完成 W1-W6 后，按 W3 生成的冒烟测试清单在真机上跑一遍。

重点关注：
1. 视觉：按钮不上浮、操作按钮对齐、客户回复是语音气泡
2. 功能：3 轮连续对话、打断、极短语音、开场白多样性
3. 稳定性：无崩溃、无 turn_persist_failed、日志完整
