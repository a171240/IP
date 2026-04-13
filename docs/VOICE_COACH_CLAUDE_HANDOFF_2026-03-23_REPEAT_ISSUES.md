# Voice Coach Claude Handoff 2026-03-23 Repeat Issues

## Summary

这份文档只整理“反复卡住、已经多轮出现”的问题，方便 Claude Code 直接聚焦真正还没收口的点。

当前可以明确分成两类：

1. 已经确认修通、不该再重复排查的部分
2. 仍然反复出现、需要优先评估的部分

## Already Closed

以下问题已经不应该再作为主排查方向：

1. WebSocket 是否接上  
真机日志已经长期稳定出现：
`ws.connect:open`、`ws.audio.start`、`record.frame`、`session.ready`

2. 短语音是否还会先走 realtime 再报空识别  
最新日志已经变成直接：
`ws.short-utterance:http -> ws.audio.cancel -> turn.submit:start { mode: "http" }`

3. 短语音回退后是否还会直接撞 `duplicate key`  
这条主链已经从最新日志里消失，不再是当前第一优先级故障。

4. 前端 bundle / 运行时是否完全没更新  
最新真机日志已经出现新的行为：
- `session.create:ok` 带 `firstText / audioSource`
- `initial.prompt:ready`
- `record.start:blocked-initial-prompt`

这说明最新前端代码至少已经部分生效。

## Repeated Blockers

### 1. 首轮顾客语音“日志显示在播，但用户听不到”

这是当前最反复、最影响体验的问题。

### Latest evidence

最新 session：
- `sessionId = 925d9869-1921-4d3f-9148-7c66328de515`

日志顺序：
- `session.create:ok { firstText: "这种护理到底靠不靠谱？我怕做了以后反而不舒服。", hasAudio: true, audioSource: "tts" }`
- `initial.prompt:ready`
- `initial.prompt:play { reason: "session_create_ready" }`
- `audio.play:start`
- `audio.cache:ok`
- `audio.play:source`
- `audio.ctx.play`
- 随后第一次按录音被拦截：
  - `record.start:blocked-initial-prompt { playing: true }`
- 再之后：
  - `audio.ctx.ended { initialPromptCompleted: true }`

这说明系统判定“首轮顾客语音已经在播放”，但用户主观仍反馈“第一轮没有声音”。

### What is confirmed

已确认不是这些原因：
- 不是 session 创建时没拿到首句
- 不是首句没生成 TTS
- 不是前端完全没触发播放

### Most likely root cause

当前更像是“首句播放仲裁 / 自动播放时机”问题：
- 首句在用户第一次有效手势之前就触发自动播放
- iPhone 真机上，日志里的 `audio.ctx.play` 不等于用户真的听到了声音
- 一旦前端把 `_initialPromptPlaying` 或 `playingTurnId` 置成真，第一次录音又会被门禁拦住，形成“系统认为你听了，但用户实际上没听到”的死循环

### Claude should verify

1. 首句是否必须完全改成“只允许用户第一次按录音时，在手势链里显式播放”，而不是 session 创建后自动播放
2. 当前 `audio.ctx.play` / `audio.ctx.ended` 是否足够代表真实可听播放
3. 首句播放和后续普通 `autoPlayTurn()` 是否应该彻底拆成两条策略

### Relevant files

- [chat.js](d:/IP网站/mini-program-ui/pages/voice-coach/chat.js)

## 2. 同一 turn 存在重复播放/覆盖，导致用户感知异常

这条问题在最新日志里依然很明显，而且它和“第一轮没声音”高度相关。

### Latest evidence

在同一个首句 turn `98ffcdf7-96df-492e-94b1-6c3b2a0e8d09` 上，日志里出现了多次：
- `audio.play:start`
- `audio.play:source`
- `audio.ctx.play`

在首轮 HTTP fallback 之后的 beautician turn `db63a3b3-9345-40dc-8bdc-202578683678` 上，也出现了重复播放：
- 多次 `audio.play:start`
- 多次 `audio.play:source`
- 多次 `audio.ctx.play`

而且在 customer `audio_ready` 之后，还出现了旧 turn 再次播放：
- 首句 turn 又被重新 `audio.play:start`

### What is confirmed

不是“根本没去重”，因为代码里已经有：
- `turnId + cooldown` 的自动播放去重
- “最新 customer turn 才允许 autoplay”的门禁

### Most likely root cause

剩余问题更像是“非 autoplay 路径也在触发播放”，例如：
- 首句专用播放路径
- 手动播放路径
- fallback 后 beautician turn 播放路径
- `audio.cache:ok` 回调后二次触发

也就是说，当前问题不是单一的 autoplay 去重，而是“多个播放入口共用同一个 `audioCtx`，互相 stop / replay / 抢占”。

### Claude should verify

1. 现在到底有几条会走到 `playAudio()` 的入口
2. 哪些入口属于首句专用，哪些属于普通 customer autoplay，哪些属于手动点击
3. 是否需要对“首句 turn / beautician turn / customer turn”建立更强的播放优先级和抢占规则

### Relevant files

- [chat.js](d:/IP网站/mini-program-ui/pages/voice-coach/chat.js)

## 3. 短语音 HTTP fallback 虽然成功，但速度越来越慢

这条不是“功能没通”，而是新的用户感知问题。

### Latest evidence

在最新日志里：
- `ws.short-utterance:http`
- `turn.submit:start { mode: "http" }`
- `turn.submit:ok`
- `events.force:start`
- `events.force:done { waitedMs: 19294, ... }`

在另一轮里甚至达到：
- `events.force:done { waitedMs: 35972, ... }`

这说明：
- fallback 后功能能通
- 但事件强制轮询等待时间已经长到 19s-36s，用户自然会觉得“越来越慢”

### What is confirmed

不是“submit 失败”，也不是“event 根本没回来”。  
真正的问题是 fallback 成功后的消费时间太长。

### Most likely root cause

当前 `events.force` 轮询策略过于保守：
- 固定 `1200ms` 轮询
- 依赖多次 `/events?cursor=...`
- 直到看到 `customer.audio_ready` 才完成

在现网这个事件生成速度下，用户感知已经无法接受。

### Claude should verify

1. 是否可以在 HTTP submit 响应中直接补更多信息，减少必须轮询到 `audio_ready` 才能继续的时间
2. 是否应该在 `text_ready` 阶段先更新 UI，再等 `audio_ready`
3. 是否需要缩短轮询间隔或补一个更轻量的即时查询接口

### Relevant files

- [chat.js](d:/IP网站/mini-program-ui/pages/voice-coach/chat.js)
- [submit route](d:/IP网站/app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts)

## 4. “首句话术还是一样”本质上是产品相似度问题，不再是单句硬编码

这条需要和之前的判断分开。

### Latest evidence

近几轮日志里，`firstText` 已经出现过不同文案，例如：
- “医生说美容院不能按胸，这真的安全吗？”
- “这种护理到底靠不靠谱？我怕做了以后反而不舒服。”
- “我最担心的就是安全问题，你们这个项目会不会有风险？”

最新一轮又是：
- “这种护理到底靠不靠谱？我怕做了以后反而不舒服。”

### What is confirmed

这说明现在已经不是“代码只会返回唯一一句”。  
`firstTurnPool` 至少部分生效了。

### Real remaining problem

用户感知上仍觉得“还是一样”，原因是：
- 这 5 句都属于同一类安全担忧
- 语义和语气过于接近
- 如果首句声线、节奏也接近，体感上仍然像一条模板反复出现

所以这是“开场白池质量不足”，不是“池没生效”。

### Claude should verify

1. 是否需要重写 `firstTurnPool`，让 5 句在语义、情绪、表达方式上明显拉开
2. 是否要按“谨慎型 / 质疑型 / 医疗权威型 / 价格顾虑型 / 体验恐惧型”重做开场

### Relevant files

- [scenarios.ts](d:/IP网站/lib/voice-coach/scenarios.ts)
- [sessions route](d:/IP网站/app/api/voice-coach/sessions/route.ts)

## 5. “第一轮和第二轮顾客不是一个人”还没有真正验证清楚

### What is known

用户多次主观反馈：
- 第一轮和第二轮顾客声线不一致

但在最新日志里，能确认的是：
- 首句已经是 `audioSource: "tts"`
- 后续 customer 也有 `audio_ready`

### What is still unclear

还不够确定这是：
1. 真的 TTS voice/cluster 不一致
2. 还是不同 turn 之间被旧播放覆盖，用户听到的其实不是当前那条 customer 语音

### Claude should verify

这条不要先从“改 voice 配置”入手。  
先和“播放仲裁”一起看，排除旧音频覆盖之后，再判断是不是声线配置不一致。

## 6. hint 重复请求仍然存在

这条不是主链路问题，但已经反复出现。

### Latest evidence

同一 `customerTurnId = 28c1fb80-2d7c-41d6-a91e-7b472ad11b2c` 上，多次出现：
- `hint.open:start`
- `hint.open:error { message: "voice_coach_error" }`

### What is confirmed

说明当前仍然没有有效的单飞门禁：
- 用户可以连续点
- 前端会重复发
- 同一个失败会重复 toast / 重复日志

### Claude should verify

这条可以作为次优先级 UX 修正，补 `_hintInFlight` 即可。

## Recommended Priority For Claude

1. `P0` 首轮顾客播放仲裁  
把首句播放路径收成单入口，并证明“系统认为在播”和“用户真能听到”是一回事。

2. `P0` 多入口重复播放 / 抢占  
梳理所有会触发 `playAudio()` 的路径，消灭旧 turn 抢占新 turn。

3. `P1` 短语音 HTTP fallback 速度  
功能已通，但 19s-36s 的 `events.force` 太慢，必须降。

4. `P1` 首句文案池重写  
不是继续改机制，而是改 5 句的内容质量。

5. `P2` hint 单飞  
修体验，不影响主链。

## Do Not Repeat

下一轮不要再重复投入时间在这些方向：

- 不要再重新证明 WS 有没有接上
- 不要再回头把主问题归因到 `asr_empty_result`
- 不要再把“首句固定”简单等同于“firstTurnPool 没生效”
- 不要再把“声线不一致”直接归因给 voice 配置，先排除播放覆盖

## Suggested Deliverable

如果 Claude Code 要继续接手，建议它输出：

1. 一份播放入口梳理表  
列出所有会触发 `playAudio()` 的路径、触发条件、优先级、是否会抢占

2. 一份首句播放策略方案  
明确“首句该不该自动播、什么时候播、如何与第一次录音门禁配合”

3. 一份短语音 fallback 性能收敛方案  
不是修通，而是把 `events.force` 的体感延迟降下来
