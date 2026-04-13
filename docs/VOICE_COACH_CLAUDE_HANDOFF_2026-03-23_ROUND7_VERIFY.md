# Voice Coach Claude Handoff 2026-03-23 Round 7 Verify

## Purpose

这份文档只基于 2026-03-23 最新真机日志整理“已经证实”的事实，避免继续把已经解决的问题和真正残留的问题混在一起。

## Latest verified facts

### 1. 首句已不再是固定 seed audio 路径

最新 session：

- `sessionId = 925d9869-1921-4d3f-9148-7c66328de515`

日志已明确显示：

- `session.create:ok { firstText: "这种护理到底靠不靠谱？我怕做了以后反而不舒服。", hasAudio: true, audioSource: "tts" }`
- `initial.prompt:ready`
- `initial.prompt:play { reason: "overlay_tap" }`

这说明：

1. 首句已经不是固定 `seed/opening/...` 路径
2. 首句音频来自动态 TTS
3. 首句播放已经切到“点击开始练习”后的手势链路

### 2. “首句话术还是一样”不再是代码只返回同一句

最近几轮日志里已经出现不同 `firstText`：

- “医生说美容院不能按胸，这真的安全吗？”
- “我最担心的就是安全问题，你们这个项目会不会有风险？”
- “这种护理到底靠不靠谱？我怕做了以后反而不舒服。”

结论：

- 文本池已经生效
- 现在剩下的是“5 条文案语义都属于同一类安全顾虑，用户体感仍然相似”

这已经不是“后端还是硬编码同一句”的问题。

### 3. 首轮录音前门禁已经生效

最新日志已出现：

- `record.start:blocked-initial-prompt { turnId: "...", playing: true }`
- 随后 `audio.ctx.ended { initialPromptCompleted: true }`
- 再之后才允许 `record.start`

结论：

- 前端已经不再允许用户在首句未完成前直接开始第一轮录音
- 这条链路现在是按设计运行的

### 4. 短语音单轮 HTTP fallback 已经跑通

最新日志已稳定表现为：

- `ws.short-utterance:http`
- `ws.audio.cancel`
- `turn.submit:start { mode: "http" }`
- `turn.submit:ok`
- `events.force:start`
- `ev.customer.audio_ready`
- `ws.http-fallback:clear { reason: "success" }`

结论：

- `asr_empty_result -> duplicate key` 不再是主问题
- “单轮降级、整场保留 WS”的策略已经工作

## Actual remaining blockers

### A. 首轮“日志显示在播，但用户仍反馈没声音”

这是当前最重要但也最容易被误判的问题。

最新日志已经能证明：

- 首句有音频
- 首句在用户手势后触发播放
- `audio.ctx.play` 与 `audio.ctx.ended` 都发生了

也就是说，这个问题已经不是：

- 没生成 TTS
- 没拿到 audio_url
- 没走到播放函数
- 还在自动播放旧 seed audio

当前更可能的方向只有两类：

1. **真机播放环境问题**
   - iOS 真机上，`audio.ctx.play`/`audio.ctx.ended` 不等于用户真实听到
   - 需要核对设备实际输出路由、静音/听筒/扬声器表现，或者 `InnerAudioContext` 在当前实现下的行为

2. **播放仲裁仍有残留问题**
   - 虽然首句入口已经收敛，但后续 turn 的播放仍可能在同一 `audioCtx` 上 stop/replay
   - 用户主观上可能听到的是后一个 turn，或者首句被过早打断

### B. 多 turn 播放覆盖仍然存在

最新日志里仍能看到旧问题的核心特征：

- fallback beautician turn `71421c31-d04e-4622-bd9d-644998999f66` 被播放
- 随后 customer turn `40778b21-beb4-45ea-8bab-fa285af3676a` 又触发 `audio.autoplay`
- 同一 turn 上还有多次 `audio.play:start` / `audio.ctx.play`

说明当前去重和 generation counter 还没有彻底消除“多个播放入口共用同一 audioCtx 的抢占”。

这也是“首轮听不到”和“第一轮第二轮声线感知混乱”的最大嫌疑点。

### C. HTTP fallback 成功了，但体感延迟仍然过长

最新日志：

- `events.force:done { waitedMs: 19294 }`

说明功能能通，但体验仍然慢。

这已经不是前端有没有轮询到事件的问题，而是：

- 轮询完成条件还是太保守
- `customer.audio_ready` 返回慢
- 或者轮询请求本身耗时太大

当前主观“越来越慢”的依据是成立的。

### D. 首句文案的“用户体感”仍然相似

虽然文本池生效，但现在 5 条句子都围绕“安全/担心/风险/不舒服”展开。

所以用户会继续觉得：

- 进入练习时“还是一样的话术”

这个问题现在属于“产品文案相似度”，不是代码路径问题。

## What is no longer worth re-debugging

以下方向不应该再作为第一优先级重复排查：

1. `ws` 是否接上
2. 首句是否仍走固定 seed audio
3. `firstTurnPool` 是否完全没生效
4. 短语音是否还会直接撞 `duplicate key`

这些在最新日志里都已经有反证。

## Recommended next questions for Claude

1. 对“首轮没声音”，Claude 应该先判断：
   - 这是 `InnerAudioContext` 的真机表现问题，还是播放仲裁问题
   - 不能再从 TTS 生成或会话创建链路入手

2. 对“第一轮和第二轮顾客不是一个人”，Claude 应该先排：
   - 是否是旧 turn 抢播导致用户听错了当前音频
   - 在排除播放覆盖之前，不要先改 voice 配置

3. 对“还是一样的话术”，Claude 应该按产品处理：
   - 重写 5 条首句文案的语义分布
   - 不要再花时间排查 `firstTurnPool` 是否工作

4. 对“越来越慢”，Claude 应该把焦点放在：
   - `events.force` 完成条件
   - 后端返回 `audio_ready` 的耗时
   - 以及是否允许前端先接受 `text_ready` 进入可交互态

## Relevant files

- [chat.js](d:/IP网站/mini-program-ui/pages/voice-coach/chat.js)
- [realtime-turn-policy.js](d:/IP网站/mini-program-ui/pages/voice-coach/realtime-turn-policy.js)
- [sessions route](d:/IP网站/app/api/voice-coach/sessions/route.ts)
- [submit route](d:/IP网站/app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts)
