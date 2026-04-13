# Voice Coach Real Device Execution

Date: 2026-03-22

## Executive Summary

1. 真机实测时，微信开发者工具 `appservice` Console 为空，当前前端调试链路缺少可用业务日志。
2. 本轮真机流量仍然表现为旧 HTTP 链路：`POST /api/voice-coach/sessions`、`POST .../beautician-turn/submit`、`GET .../events/stream?cursor=...`；没有证据表明真机在走 `wss://.../ws/voice-coach`。
3. 首句顾客话术固定，不是模型“随机性不足”，而是当前前后端组合本来就是固定场景 + 固定首句默认路径。
4. “识别时出现两个美容师语音泡泡”需要和之前的 `wx:key` 重复警告拆开看；这次真机重点是视觉层面的双泡泡竞态，不等于最终数组里还存在重复 key。
5. 录音按钮上浮和“转文字 / 改进建议 / 重录”按钮不对齐，属于前端交互与样式问题，应与语音后端链路拆分处理。

## Evidence Snapshot

| Source | Confirmed fact | Notes |
| --- | --- | --- |
| 用户提供的真机 Network 截图 | 出现一次 `sessions 401`，随后 `login 200`，再 `sessions 200` | 登录态建立后会话创建成功 |
| 用户提供的真机 Network 截图 | 多次 `submit 200` | 当前用户录音上行仍走 `POST /api/voice-coach/sessions/:sessionId/beautician-turn/submit` |
| 用户提供的真机 Network 截图 | 多次 `stream?cursor=...&timeout_ms=22000 200` | 当前回复获取链路仍走 `events/stream` |
| 用户提供的真机 Network 截图 | 没有可见的 WS 请求证据 | 本轮真机没有看到 `wss://.../ws/voice-coach` 握手或帧流 |
| 用户提供的 Console 截图 | `appservice` Console 为空 | 当前无法从 DevTools Console 直接观察语音页状态迁移 |
| 用户提供的 UI 截图 | 同一轮录音期间出现两个美容师绿色语音泡泡 | 视觉上出现“本地占位 turn + 服务端 turn”并存 |
| 用户提供的 UI 截图 | 录音态按钮切到“松开发送”时，按钮视觉上上浮 | 与录音态动画和文案切换共同出现 |
| 用户提供的 UI 截图 | “转文字 / 改进建议 / 重录”未对齐，尺寸和语义不统一 | 单个 action row 已显著失衡 |
| WeappLog 最新日志 | 只看到编译、`restart appservice compile`、`webview page ready` | 未看到可用业务日志 |
| WeappLog 路径 | `C:\Users\Administrator\AppData\Local\微信开发者工具\User Data\0093999d710c00d7d8055f8e610de85a\WeappLog\logs\...` | 当前真机排障的主要日志来源 |

### Latest WeappLog facts

- `2026-03-22-13-10-49-692-SEaVbKhzzm.log:33` 记录 `restart appservice compile`
- `2026-03-22-13-10-49-692-SEaVbKhzzm.log:144` 再次记录 `restart appservice compile`
- `2026-03-22-13-10-49-692-SEaVbKhzzm.log:154` 记录 `webview page ready`
- 最新日志没有出现 `Do not set same key`、`wx:key` 或其他可用业务级 voice-coach 日志

## Issue-by-Issue Findings

### 1. Console 没有日志

**现象**

- 真机调试时，微信开发者工具 `appservice` Console 为空。

**已证实事实**

- 用户提供的 Console 截图显示 `appservice` 面板为空。
- 在 `mini-program-ui/pages/voice-coach/` 当前页面代码中，没有面向真机排障的显式 `console.*` 日志埋点。
- 用户截图里能看到 `vConsole` 浮层，说明设备端可见与 DevTools Console 可见不是同一条调试通路。
- 最新 WeappLog 只显示编译和页面 ready，没有业务状态输出。

**根因假设**

- 当前页面没有统一调试输出层；真机调试只能依赖 Network 面板和设备侧浮层，无法在 DevTools `appservice` Console 中看到业务状态迁移。
- Confidence: `high`

**影响**

- 无法快速区分“录音未发出 / submit 已成功 / 事件流没返回 / UI 状态没切换”。
- 下一轮任何真机排障都会继续依赖截图和人工推断。

**下一轮建议**

- 优先补一个可控的 voice-coach 前端调试层，至少覆盖 `createSession`、`uploadBeauticianTurn`、`applyServerEvents`、录音状态迁移。
- 调试层要同时兼容真机可见和 DevTools 可见，不再分裂成 `vConsole` 与空白 `appservice` Console 两套世界。

### 2. 每次话术固定

**现象**

- 每次进入练习，顾客开场话术固定。

**已证实事实**

- `mini-program-ui/pages/voice-coach/chat.js:249` 当前固定发送 `scenario_id: "objection_safety"`。
- `lib/voice-coach/scenarios.ts:3` 当前只有 `VoiceCoachScenarioId = "objection_safety"`。
- `lib/voice-coach/scenarios.ts:15` 默认场景也是 `objection_safety`。
- `app/api/voice-coach/sessions/route.ts:32` 存在固定 `fallbackFirstCustomerTurn()`。
- `app/api/voice-coach/sessions/route.ts:41` `VOICE_COACH_FIRST_TURN_MODE` 默认是 `"preset"`。
- `app/api/voice-coach/sessions/route.ts:106` 首句默认先取 `fallbackFirstCustomerTurn()`，只有 `VOICE_COACH_FIRST_TURN_MODE=llm` 时才尝试 LLM 首句。

**结论**

- 这是产品/实现固定，不是模型“随机失败”。

**根因假设**

- 当前产品只支持单场景固定开场白；“练习”页并没有真正的场景选择或开场白池机制。
- Confidence: `high`

**影响**

- 用户会直接感知“每次都一样”，降低练习真实感。
- 如果不先定产品目标，下一轮实现者可能在“多场景”和“单场景多开场白池”之间自行拍板，导致返工。

**下一轮建议**

- 先决定是做“单场景多开场白池”，还是“多 scenario 可选”。
- 这个问题先收成产品决策，再安排实现，不要让实现者自己决定。

### 3. 说完话识别时出现两个语音泡泡

**现象**

- 一轮录音结束后，在“识别中...”阶段，界面上会短暂出现两个美容师绿色语音泡泡。

**已证实事实**

- `mini-program-ui/pages/voice-coach/chat.js:1135` 会先创建本地占位 `localTurn`。
- `mini-program-ui/pages/voice-coach/chat.js:1139` 会立刻 `appendTurn(localTurn)`。
- `mini-program-ui/pages/voice-coach/chat.js:643`、`680`、`706` 分别在 `turn.accepted`、`beautician.asr_ready`、`customer.text_ready` 处理分支里先尝试 `patchTurn(...)`。
- `mini-program-ui/pages/voice-coach/chat.js:651`、`682`、`715` 在找不到服务端真实 `turn_id` 时会再次 `appendTurn(...)`。
- `mini-program-ui/pages/voice-coach/chat.js:1193` 在 `submit success` 之后才尝试 `replaceTurn(pendingId, accepted)`。
- 这说明视觉上存在一个“本地占位 turn”和“服务端真实 turn”并存的时间窗口。
- 最新 WeappLog 中没有新的 `wx:key` 警告证据；因此当前真机双泡泡问题不能直接等同于“数组最终仍然重复 key”。

**结论**

- 即使最终数组不再重复 key，视觉上仍可能短暂出现两个泡泡。

**根因假设**

- 当前状态机仍然是“先插本地占位，再等 submit success 收口”，而事件流可能在此之前已经生成并追加服务端 turn，导致 UI 在短时窗口内同时展示两份同义内容。
- Confidence: `high`

**影响**

- 真机用户会直观认为“我一句话被识别了两次”或“系统重复创建了消息”。
- 这会直接削弱实时感和稳定感，即便最终数据结构不再报 `wx:key`。

**下一轮建议**

- 这个问题要单列为“pending turn 状态机收敛”，不要再归入 `wx:key` 问题。
- 下一轮应明确设计本地占位 turn 与服务端 turn 的合并时机，而不是继续靠事后替换。

### 4. 按住说话，松开发送按钮会上飘

**现象**

- 用户按住录音后，按钮切到“松开发送”状态时，按钮视觉上上浮。

**已证实事实**

- `mini-program-ui/pages/voice-coach/chat.wxml:159-167` 使用 `.record-btn`，并在录音时切换 `is-recording` / `is-canceling` 状态类，同时文案从“按住说话”切到“松开发送 / 松开取消”。
- `mini-program-ui/pages/voice-coach/chat.js:1026` 录音开始时设置 `recording: true`。
- `mini-program-ui/pages/voice-coach/chat.js:1097` 录音过程中按上滑阈值切换 `recordCanceling`。
- `mini-program-ui/pages/voice-coach/chat.js:1108` 松开发送时立即切回非录音态并进入 `loading`。
- `mini-program-ui/pages/voice-coach/chat.wxss:624` `.record-btn.is-recording` 绑定 `recordPulse`。
- `mini-program-ui/pages/voice-coach/chat.wxss:638-640` `recordPulse` 使用了 `transform: scale(1.02)`。

**根因假设**

- iPhone 真机上，按钮整体 scale 动画会造成视觉上的上浮/膨胀感；录音态文案切换进一步放大了这个问题。
- Confidence: `high`

**影响**

- 录音主入口不稳，会破坏“按住说话”的肌肉记忆。
- 视觉动效和交互反馈混在一起，容易让用户误判是否触发取消。

**下一轮建议**

- 录音态按钮动画要改成不影响布局和视觉基线的实现，不要再用整体 scale 做主反馈。
- 录音态和取消态的文案、颜色、阴影、位置反馈要拆开设计，不要只靠一个 transform 统管。

### 5. 转文字 / 改进建议 / 重录 按钮太丑且不对齐

**现象**

- “转文字 / 改进建议 / 重录”按钮在真机上明显不对齐，视觉风格也不统一。

**已证实事实**

- `mini-program-ui/pages/voice-coach/chat.wxml:65-109` 当前 action row 中混用了不同元素。
- `mini-program-ui/pages/voice-coach/chat.wxml:71` “转文字”是 `<view class="trans-btn">`。
- `mini-program-ui/pages/voice-coach/chat.wxml:81`、`90`、`99` 其他操作是 `<text class="meta-action">`。
- `mini-program-ui/pages/voice-coach/chat.wxss:287-295` `.trans-btn` 是固定高度 `56rpx`、圆角 `28rpx` 的 pill。
- `mini-program-ui/pages/voice-coach/chat.wxss:297-304` `.meta-action` 是 padding 驱动的小 pill。
- `mini-program-ui/pages/voice-coach/chat.wxss:379-391` `.op-row` / `.op-actions` 使用 `flex` + `gap` + `flex-wrap: wrap`。
- 不同元素的高度、基线、内边距和标签语义不一致，导致行内对不齐且风格割裂。

**根因假设**

- 这是结构层面的 UI 不统一，不只是 CSS 微调问题；当前 action row 没有统一的组件语义和尺寸系统。
- Confidence: `high`

**影响**

- 真机视觉质量偏低，尤其在两条美容师消息连续出现时更明显。
- 如果下一轮只改颜色或间距，不统一结构，问题会继续反复出现。

**下一轮建议**

- 下一轮必须把这三类按钮统一成同一组件语义和同一尺寸系统，再做视觉 polish。
- 先统一结构，再调美观；不要先做零散 CSS 修补。

## Runtime Drift / Current Execution Path

这部分是本轮最高优先级事实，必须先确认，再分配下一轮任务。

- 真机运行证据显示，当前前端路径仍是旧 HTTP 批量提交 + 事件流 `stream`。
- 这与之前“已接入 realtime websocket”的文档叙述存在明显漂移。
- Claude 下一轮任务分配前，必须先确认“当前真机实际在跑哪一条前端代码路径”，否则会继续把改动打到错误实现上。

### Confirmed runtime facts

- `mini-program-ui/pages/voice-coach/chat.js:324-329` 当前通过 `ensureEventsPolling()` 启动事件轮询/流。
- `mini-program-ui/pages/voice-coach/chat.js:374-420` 当前通过 `wx.request(... enableChunked: true)` 请求 `GET /api/voice-coach/sessions/:sessionId/events/stream?...`。
- `mini-program-ui/pages/voice-coach/chat.js:1150-1155` 当前通过 `wx.uploadFile(...)` 提交 `POST /api/voice-coach/sessions/:sessionId/beautician-turn/submit`。
- `mini-program-ui/pages/voice-coach/chat.js:249` 当前 `createSession()` 固定以 `scenario_id: "objection_safety"` 创建会话。
- `app/api/voice-coach/sessions/route.ts:32-44` 与 `app/api/voice-coach/sessions/route.ts:106-109` 当前首句生成仍以固定 fallback + 可选 LLM 模式为主。
- 本轮真机 Network 截图里没有可见的 websocket 握手或帧流证据，反而明确出现了 `submit` 和 `events/stream`。

### Paths to treat as source of truth for the next round

- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/pages/voice-coach/chat.wxml`
- `mini-program-ui/pages/voice-coach/chat.wxss`
- `app/api/voice-coach/sessions/route.ts`

## Recommended Next-Round Task Breakdown

1. `P0 Runtime truth alignment`
   - 先确认真机当前到底走 HTTP 版 `chat.js` 还是 websocket 版接线。
   - 修正 repo、文档、真机路径三者漂移，避免继续把改动打到错误分支。

2. `P1 Frontend observability`
   - 给 `voice-coach` 页补真机可见且 DevTools 可见的调试日志。
   - 覆盖 `createSession`、录音开始/结束、`submit`、`applyServerEvents`、UI 状态迁移。

3. `P2 First-turn variability`
   - 先决定是“单场景多开场白池”还是“多 scenario 可选”。
   - 再按产品结论改 `createSession` 入参和后端首句生成路径。

4. `P3 Pending-turn state machine`
   - 收敛 `localTurn` 与服务端 turn 的竞态。
   - 目标是消除识别期间双泡泡，而不是只消除最终重复 key。

5. `P4 Record button interaction polish`
   - 去掉导致上浮的整体 scale 动画。
   - 重做录音态与取消态反馈，让位置、尺寸、文案切换更稳。

6. `P5 Action row redesign`
   - 统一“转文字 / 改进建议 / 重录”的结构、尺寸、对齐和视觉风格。
   - 先统一组件语义，再做视觉 polish。

## Acceptance Criteria For This Log

- Claude 不回看聊天记录，也能理解这次真机实测结论。
- 文档清楚区分“已证实事实”和“根因假设”。
- 文档明确把“视觉双泡泡”与历史 `wx:key` 问题拆开。
- 文档把“当前真机实际上仍是 HTTP 路径”的事实放在高优先级位置。
- 文档不伪造未验证日志，不记录未发生的代码改动，只引用本轮截图、代码和 WeappLog 事实。

## Defaults Used

- 本文档为新的执行日志，不覆盖已有 Round 1 / Round 2 / Deploy 文档。
- 文档语言使用中文，保留必要英文路径、接口、文件名和日志文件名。
- 默认 Claude 的目标是基于该日志安排下一轮任务，而不是直接开始修复。
