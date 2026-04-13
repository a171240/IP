# Voice Coach Claude Handoff 2026-03-22 Round 5 Verify

## Summary

Round 5 已经把“短语音 `<3s` 直接 HTTP 回退、同时保留整场 WS 连接”这条主问题修通了，但这轮真机复测暴露出 3 个仍未收口的问题：

1. 第一轮和后续短语音 HTTP 回退轮，顾客回复虽然已经生成并返回 `audio_ready`，但用户主观上仍然反馈“第一轮没有声音”。
2. 首句话术与首句声音仍然表现为固定，和本地仓库当前 `firstTurnPool + 非固定 seed audio` 的代码预期不一致。
3. 第一轮与第二轮顾客声音不一致，说明首句和后续轮次仍然没有走同一条音频生成路径。

这份交接文档的重点不是重复“WS 是否接通”，而是把 Round 5 真正已修好的部分、剩余问题的证据链、以及推荐的下一轮任务顺序写清楚。

## Confirmed Fixed In Round 5

以下问题已经由最新真机日志确认收敛：

### 1. 短语音不再先走 realtime 再报空识别

最新日志已经变成：

- `ws.short-utterance:http`
- `ws.audio.cancel`
- `turn.submit:start {mode: "http"}`
- `events.force:start`
- `ev.beautician.asr_ready`
- `ev.customer.audio_ready`

没有再出现旧版的：

- `ws.audio.end -> asr.final(empty) -> asr_empty_result`

也就是说，短语音回退已经从“先失败再降级”变成“直接单轮降级”。

代码锚点：

- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:522`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L522)
- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:568`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L568)
- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:2362`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L2362)

### 2. HTTP 回退轮期间，下一轮录音已被阻止

日志里已经出现：

- `record.start:blocked-http-fallback`

说明“上一轮 HTTP 回退还没消费完时，用户不能立刻开始下一轮录音”这条门禁已经生效。

代码锚点：

- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:2154`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L2154)

### 3. 原来的 `duplicate key value violates "voice_coach_turns_session_turn_index_key"` 已经消失

Round 4/早期 Round 5 的关键问题是短语音回退后事件不消费，随后第二轮录音会带着错误的 `replyToTurnId / turnIndex` 继续往下走，最终撞 `voice_coach_turns_session_turn_index_key`。

这轮最新真机日志里，这个报错已经没有再出现。  
说明 `_httpFallbackTurnActive + force events polling` 这组改动已经把“回退轮不消费事件”这个主问题修掉了。

## Remaining Problems

## 1. 第一轮顾客回复“已经生成音频”，但用户仍然听不到

### 已证实事实

最新日志里，第一轮短语音回退的顾客回复已经完整走到：

- `ev.customer.text_ready`
- `ev.customer.audio_ready`
- `audio.autoplay { turnId: ..., source: "remote" }`
- `audio.play:source { turnId: ..., autoplay: true, local: false/empty }`

这说明：

1. 后端确实已经给出了顾客回复音频
2. 前端也确实触发了自动播放

换句话说，“第一轮没声音”不是因为第一轮没有生成音频，也不是因为没有触发播放逻辑。

### 仍未确认的根因

根因目前更像是“播放仲裁/时序问题”，而不是“生成失败”：

- 同一轮附近日志里仍然出现针对旧 turn 的额外 `audio.play:start`
- `playAudio()` 当前是单 `audioCtx`，后来的播放会直接 `stop()` 前一个播放
- 如果首句 turn、beautician turn、customer turn 在同一时间窗内被重复触发播放，后发的播放会覆盖先发的播放

当前还不能仅凭日志区分这是不是用户手动点击旧语音泡泡导致的覆盖，还是前端内部仍有自动播放重复触发。  
因此这条问题需要 Claude Code 下一轮重点复盘“同一时间窗内多个 turn 的播放仲裁”，而不是再回头怀疑 TTS 是否生成。

代码锚点：

- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:1335`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L1335)
- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:2714`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L2714)
- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:2730`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L2730)

### 结论

这条问题当前不能再归因给“短语音 HTTP 回退没通”。  
回退链路已经通了，剩下的是“第一轮顾客音频虽然 ready，但播放体验仍不稳定”。

## 2. 首句话术和首句声音仍然固定，说明运行时和当前仓库代码存在漂移

### 已证实事实

当前仓库里：

- `preset` 首句文本是从 `firstTurnPool` 随机选，而不是固定 fallback
- `VOICE_COACH_FIRST_TTS_MODE` 默认是 `"async"`
- `VOICE_COACH_SEED_OPENING_AUDIO_PATH` 在本地 `.vercel` env 中是空字符串
- `getSeedOpeningAudioPath()` 的新逻辑是：如果场景配置了 `firstTurnPool`，默认不再返回固定 seed audio

相关代码：

- [`/d:/IP网站/app/api/voice-coach/sessions/route.ts:40`](/d:/IP网站/app/api/voice-coach/sessions/route.ts#L40)
- [`/d:/IP网站/app/api/voice-coach/sessions/route.ts:56`](/d:/IP网站/app/api/voice-coach/sessions/route.ts#L56)
- [`/d:/IP网站/app/api/voice-coach/sessions/route.ts:62`](/d:/IP网站/app/api/voice-coach/sessions/route.ts#L62)
- [`/d:/IP网站/lib/voice-coach/scenarios.ts:38`](/d:/IP网站/lib/voice-coach/scenarios.ts#L38)

本地 `.vercel` 环境文件也支持这个判断：

- [`/d:/IP网站/.vercel/.env.preview.local`](/d:/IP网站/.vercel/.env.preview.local)
- [`/d:/IP网站/.vercel/.env.development.local`](/d:/IP网站/.vercel/.env.development.local)

其中能直接确认：

- `VOICE_COACH_FIRST_TTS_MODE="async"`
- `VOICE_COACH_FIRST_TURN_MODE="preset"`
- `VOICE_COACH_SEED_OPENING_AUDIO_PATH=""`

### 但真机运行日志显示的事实与上面不一致

在最新真机日志里，`session.create:ok` 仍然是：

- `hasAudio: true`

这意味着服务端在创建 session 时就已经直接返回了首句 `audio_url`。  
而按当前本地代码和 `.vercel` env 的组合，**如果首句池生效且 seed audio 未强制配置，首句默认不应该在 session 创建时就带固定音频**。

### 高置信度推论

运行中的后端至少有一条和当前仓库不一致：

1. 部署端还保留了 `VOICE_COACH_SEED_OPENING_AUDIO_PATH`
2. 部署端仍在运行旧版 `sessions/route.ts`
3. 部署端把 `VOICE_COACH_FIRST_TTS_MODE` 改成了 `sync`

其中最值得优先怀疑的是第 1 条和第 2 条，因为它们同时能解释：

- 为什么首句听起来像固定 seed audio
- 为什么第一轮和第二轮顾客声音不是一个人
- 为什么用户感知“首句文案还是固定”

### 结论

这条已经不是单纯的前端问题。  
Claude Code 下一轮必须先做“部署端 runtime 与本地仓库代码对齐”验证，否则继续调前端播放只会绕圈。

## 3. HTTP 回退轮之后，前端 `turnIndex` 仍然是 2，不是预期的 3

### 已证实事实

在最新日志里：

- 首轮短语音 HTTP 回退完成后
- 第二轮 `record.start` 变成了 `turnIndex: 2`

但按实际会话顺序：

1. 首句 customer：`turn_index = 0`
2. 第一轮 beautician：`turn_index = 1`
3. 第一轮 customer reply：`turn_index = 2`
4. 第二轮 beautician：理论上应该是 `turn_index = 3`

### 根因

前端的 `getNextTurnIndex()` 只扫描 `data.turns` 里已经带 `turn_index` 的 turn：

- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:492`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L492)

但 `applyServerEvents()` 在消费 `customer.text_ready / customer.audio_ready` 时，当前 append/patch 的 customer turn 没有把服务端的 `turn_index` 带进来：

- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:1299`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L1299)
- [`/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js:1335`](/d:/IP网站/mini-program-ui/pages/voice-coach/chat.js#L1335)

所以在 HTTP fallback 完成后，前端状态里的最大 `turn_index` 仍可能只到 beautician 的 `1`，下一轮就会错误算成 `2`。

### 现状

这轮日志里还没有再次撞唯一索引冲突，是因为当前测试继续走了短语音 HTTP fallback。  
但只要下一轮恢复成长语音 WS，或者服务端开始更严格依赖 client turn index，这里仍然是潜在炸点。

### 结论

这条是 Round 5 之后遗留的“下一轮高优先级修复项”，不是可以忽略的小问题。

## 4. `events.force:done` 的 `customerTurnId` 仍然是空字符串

### 已证实事实

日志里：

- `ws.http-fallback:clear { ..., customerTurnId: "..." }`
- 紧接着 `events.force:done { ..., customerTurnId: "" }`

这说明强制轮询本身实际上已经拿到了 customer turn，但在 `events.force:done` 打日志之前，`clearHttpFallbackTurn()` 已经把 `_httpFallbackCustomerTurnId` 清掉了。

### 结论

这是可观测性问题，不是当前主故障。  
但它会误导后续排查，所以建议顺手修掉：在 `events.force:done` 里改用局部变量记录最终 customer turn，而不是读已清空的实例状态。

## 5. `hint.open` 存在重复触发，且错误提示没有门禁

### 已证实事实

最新日志里，同一个 `customerTurnId` 上出现了多次：

- `hint.open:start`
- `hint.open:error { message: "voice_coach_error" }`

这表明至少存在两层问题：

1. 用户可以在前一次 hint 请求还没结束时继续点击
2. 前端没有用单次 in-flight 门禁防止重复请求

### 结论

这条不影响主链路，但已经构成明显 UX 问题。  
建议 Claude Code 下一轮顺手把 hint 请求做成单飞。

## Runtime Assessment

基于最新日志，当前真实运行状态可以概括成：

- WS 主链路本身已经是通的
- 短语音单轮 HTTP 回退也已经基本通了
- “回退轮事件不消费 -> duplicate key” 这条主问题已收敛
- 剩下的问题已经从“传输断裂”转成：
  - 运行时/部署环境与仓库代码不一致
  - 首句仍走固定音频路径
  - 播放仲裁不稳定
  - 回退后的 customer `turn_index` 未同步进前端状态

## Recommended Next Tasks For Claude Code

### P0 Runtime / Deploy Alignment

先核对运行中的 `sessions` route 和部署环境，确认：

- 生产/测试环境是否仍设置了 `VOICE_COACH_SEED_OPENING_AUDIO_PATH`
- 运行中的 `sessions/route.ts` 是否包含本地这轮 `firstTurnPool -> no fixed seed audio` 的改动
- `VOICE_COACH_FIRST_TTS_MODE` 在线上到底是 `async` 还是 `sync`

没有这一步，首句固定和首句声线不一致无法真正解释。

### P1 Customer Turn Index Sync After HTTP Fallback

修 `customer.text_ready / customer.audio_ready` 进入前端状态时的 `turn_index` 同步。  
建议不要再依赖猜测，直接让事件 payload 或 follow-up session read 把 customer `turn_index` 带回来。

### P2 First-Round Audio Playback Arbitration

重点检查第一轮 `customer.audio_ready -> audio.autoplay` 后，是否被旧 turn 的播放请求覆盖。  
如果需要，给自动播放增加更强的“只允许当前最新 customer turn 抢占播放”的门禁。

### P3 Hint Single-Flight Guard

给 `openHint()` 加 in-flight 门禁和按钮禁用，防止同一 customer turn 上重复发 hint 请求。

## Do Not Repeat

下一轮不应再重复做这些已经确认通过的工作：

- 不要再回头排查“WS 是否真的接上”
- 不要再把主问题归因到 `asr_empty_result`
- 不要再把短语音回退做成“整场断开 WS 的全局 fallback”
- 不要再把 `voice_coach_turns_session_turn_index_key` 当成当前唯一主故障，它在这轮已从主路径上消失，当前更关键的是 customer turn 的 `turn_index` 同步和部署端漂移
