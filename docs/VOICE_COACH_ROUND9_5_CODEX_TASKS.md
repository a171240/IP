# Voice Coach Round 9.5 — Codex执行后Bug修复

## Context

Round 9 的 9 个 Worker 已全部由 Codex 完成。代码审查发现 2 个用户可见的Bug：
1. **改进建议卡片展开后对话气泡偏移** — `.row` 的 `align-items: flex-end` 导致内容展开时bubble位置跳动
2. **灯泡提示弹窗多项问题** — CSS重复定义、catch/finally嵌套错误（可能锁死按钮）、背景叠加、无loading反馈

---

## 2 线程任务

```
W10: suggest-card 展开气泡偏移修复      (P0)  chat.wxss + chat.js
W11: 灯泡提示弹窗多项修复              (P0)  chat.wxss + chat.js + chat.wxml
```

修改区域不重叠，可完全并行。

---

## W10（P0）：suggest-card 展开气泡偏移修复

### 问题
点击"改进建议"展开 suggest-card（高度约500-800rpx）后，voice-bubble 位置发生跳动。

### 根因
`.row`（chat.wxss ~line 87-97）使用 `align-items: flex-end`，当 suggest-card 展开使 `.msg` 容器变高时，头像锚定在行底部，voice-bubble 被推到行顶部，用户看到气泡"跳上去"。

同时 `toggleSuggest`（chat.js ~line 3381-3397）展开后没有 scrollIntoView 稳定视口。

### 改动

**`mini-program-ui/pages/voice-coach/chat.wxss`** — `.row` 改对齐：

找到（约 line 87-97）：
```css
.row {
  width: 100%;
  box-sizing: border-box;
  gap: 16rpx;
  display: flex;
  align-items: flex-end;
  margin-bottom: 24rpx;
  opacity: 0;
  transform: translateY(20rpx);
  animation: fadeSlideIn 0.28s ease-out forwards;
}
```

改为：
```css
.row {
  width: 100%;
  box-sizing: border-box;
  gap: 16rpx;
  display: flex;
  align-items: flex-start;
  margin-bottom: 24rpx;
  opacity: 0;
  transform: translateY(20rpx);
  animation: fadeSlideIn 0.28s ease-out forwards;
}
```

**`mini-program-ui/pages/voice-coach/chat.js`** — `toggleSuggest` 加滚动稳定：

找到（约 line 3381-3397）：
```javascript
toggleSuggest(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const idx = this.findTurnIndex(id)
    const current = idx >= 0 ? this.data.turns[idx] : null
    const willOpen = current ? !current.showSuggestions : false
    if (idx < 0) return
    this.setData({
      [`turns[${idx}].showSuggestions`]: willOpen,
    })
    if (willOpen) {
      track("voicecoach_suggestion_open", {
        sessionId: this.data.sessionId || "",
        turnId: id,
      })
    }
  },
```

改为：
```javascript
toggleSuggest(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const idx = this.findTurnIndex(id)
    const current = idx >= 0 ? this.data.turns[idx] : null
    const willOpen = current ? !current.showSuggestions : false
    if (idx < 0) return
    this.setData({
      [`turns[${idx}].showSuggestions`]: willOpen,
    })
    if (willOpen) {
      track("voicecoach_suggestion_open", {
        sessionId: this.data.sessionId || "",
        turnId: id,
      })
      // 展开后滚动到当前turn，防止内容展开导致视口偏移
      setTimeout(() => {
        this.setData({ scrollIntoView: "" })
        setTimeout(() => {
          this.setData({ scrollIntoView: `turn-${id}` })
        }, 30)
      }, 50)
    }
  },
```

注意：先置空再赋值是为了确保 scroll-into-view 在已经相同值时也能触发滚动。

### 验收
1. 在微信开发者工具中找到一个 beautician turn，点击"改进建议"
2. voice-bubble 不应跳动，suggest-card 应向下展开
3. 收起时同样不应跳动
4. 头像现在应在消息顶部（与微信/WhatsApp一致）

---

## W11（P0）：灯泡提示弹窗多项修复

### 问题列表

| # | 问题 | 严重度 |
|---|------|--------|
| 1 | CSS `.hint-point` 重复定义（L952 vs L965），老定义遗留 `color: var(--vc-text-muted)` | 低 |
| 2 | `openHint` 的 `.catch`/`.finally` 嵌套错误，catch内抛异常会导致 `_hintInFlight` 永远为 true，灯泡永远锁死 | **高** |
| 3 | `.hint-body` 和 `.hint-quote-card` 双层绿色背景叠加，引号卡片边界不可见 | 中 |
| 4 | 请求期间灯泡按钮无 loading 反馈，用户可能等 6 秒不知道在加载 | 中 |

### 改动

#### 修复1：清理CSS重复定义

**`mini-program-ui/pages/voice-coach/chat.wxss`** — 删除老的 `.hint-point` 和 `.hint-points` 定义

找到（约 line 948-956）：
```css
.hint-points {
  margin-top: 12rpx;
}

.hint-point {
  font-size: 28rpx;
  color: var(--vc-text-muted);
  line-height: 40rpx;
}
```

替换为：
```css
/* 老的 .hint-points / .hint-point 定义已移至 L964-967 的新版flex布局 */
```

即：直接删除这段，只保留后面 L964-967 处的新定义。

#### 修复2：修复 catch/finally 嵌套

**`mini-program-ui/pages/voice-coach/chat.js`** — openHint 方法中的 promise 链

找到（约 line 3490-3502）：
```javascript
      .catch((err) => {
        this.setData({ loading: false })
        vcWarn("hint.open:error", {
          sessionId,
          customerTurnId,
          message: err && err.message ? err.message : "",
        })
        wx.showToast({ title: err.message || "鑾峰彇鐏垫劅澶辫触", icon: "none" })
        })
        .finally(() => {
          this._hintInFlight = false
          this._hintInFlightTurnId = ""
        })
```

替换为（注意缩进对齐和括号配对）：
```javascript
      .catch((err) => {
        this.setData({ loading: false, hintLoading: false })
        vcWarn("hint.open:error", {
          sessionId,
          customerTurnId,
          message: err && err.message ? err.message : "",
        })
        wx.showToast({ title: err.message || "获取灵感失败", icon: "none" })
      })
      .finally(() => {
        this._hintInFlight = false
        this._hintInFlightTurnId = ""
        this.setData({ hintLoading: false })
      })
```

关键改动：
- `.catch` 闭合括号 `})` 与 `.finally` 同级
- 乱码 toast 文案修正为 "获取灵感失败"
- finally 中也重置 hintLoading

#### 修复3：hint-body 去掉背景，让 quote-card 边界清晰

**`mini-program-ui/pages/voice-coach/chat.wxss`** — 找到 `.hint-body`（约 line 934-939）：

```css
.hint-body {
  background: rgba(149, 236, 105, 0.05);
  border: 1rpx solid rgba(149, 236, 105, 0.15);
  padding: 24rpx;
  border-radius: 24rpx;
}
```

替换为：
```css
.hint-body {
  padding: 0;
}
```

这样 `.hint-quote-card` 的绿色背景+边框就有清晰的视觉边界了。

#### 修复4：灯泡按钮 loading 状态

**`mini-program-ui/pages/voice-coach/chat.wxml`** — 找到灯泡按钮（约 line 205）：

```wxml
    <button class="hint-btn-icon" bindtap="openHint">
```

替换为：
```wxml
    <button class="hint-btn-icon {{hintLoading ? 'hint-btn-loading' : ''}}" bindtap="openHint">
```

**`mini-program-ui/pages/voice-coach/chat.wxss`** — 在 `.hint-btn-icon::after` 之后（约 line 633）新增：

```css
.hint-btn-loading {
  opacity: 0.45;
  pointer-events: none;
  animation: hintBtnPulse 1.2s ease-in-out infinite;
}

@keyframes hintBtnPulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.7; }
}
```

**`mini-program-ui/pages/voice-coach/chat.js`** — openHint 方法开头（约 line 3466）：

找到：
```javascript
    this.setData({ loading: true })
```

替换为：
```javascript
    this.setData({ loading: true, hintLoading: true })
```

在 `.then` 回调中（约 line 3474）：

找到：
```javascript
        this.setData({
          loading: false,
          hintVisible: true,
```

替换为：
```javascript
        this.setData({
          loading: false,
          hintLoading: false,
          hintVisible: true,
```

**`mini-program-ui/pages/voice-coach/chat.js`** — data 初始值中（Page的data对象）新增：
```javascript
hintLoading: false,
```

### 验收
1. **连续点击灯泡**：快速点2次，第2次应被阻止（按钮变半透明+不可点击），请求完成后恢复
2. **请求失败后**：toast显示"获取灵感失败"（非乱码），灯泡按钮恢复可点击
3. **弹窗视觉**：引号卡片有清晰的绿色背景边界，与周围区域区分明显
4. **hint-point 列表**：✦ 图标金色 + 文本白色，无遗留的 muted 灰色
5. **关闭弹窗**：点击遮罩或关闭按钮均可关闭

---

## 集成注意

W10 和 W11 都修改 chat.js 和 chat.wxss，但修改区域不重叠：
- W10 修改：`.row` 样式（L87-97）+ `toggleSuggest` 方法（L3381-3397）
- W11 修改：`.hint-*` 样式（L934-967）+ `openHint` 方法（L3445-3502）+ data初始值 + wxml灯泡按钮

可安全并行执行，无合并冲突。
