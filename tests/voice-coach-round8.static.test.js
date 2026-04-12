const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const chatSource = read("mini-program-ui", "pages", "voice-coach", "chat.js")
const chatWxmlSource = read("mini-program-ui", "pages", "voice-coach", "chat.wxml")
const chatWxssSource = read("mini-program-ui", "pages", "voice-coach", "chat.wxss")
const jobsSource = read("lib", "voice-coach", "jobs.server.ts")
const llmSource = read("lib", "voice-coach", "llm.server.ts")
const scenariosSource = read("lib", "voice-coach", "scenarios.ts")
const eventsRouteSource = read(
  "app",
  "api",
  "voice-coach",
  "sessions",
  "[sessionId]",
  "events",
  "route.ts",
)
const sessionRouteSource = read("app", "api", "voice-coach", "sessions", "route.ts")
const ttsRouteSource = read(
  "app",
  "api",
  "voice-coach",
  "sessions",
  "[sessionId]",
  "turns",
  "[turnId]",
  "tts",
  "route.ts",
)
const checklistSource = read("docs", "VOICE_COACH_REAL_DEVICE_SMOKE_CHECKLIST.md")

test("audio output is configured for speaker playback with diagnostics", () => {
  assert.match(chatSource, /wx\.setInnerAudioOption\(\{/)
  assert.match(chatSource, /speakerOn:\s*true/)
  assert.match(chatSource, /audio\.option:ok/)
  assert.match(chatSource, /audio\.ctx\.play/)
  assert.match(chatSource, /speakerOnRequested:\s*true/)
})

test("record interaction triggers haptic feedback only after a successful start", () => {
  assert.match(chatSource, /triggerRecordHaptic\(\)/)
  assert.match(chatSource, /wx\.vibrateShort\(\{ type: "light" \}\)/)
  assert.match(chatSource, /record\.haptic:ok/)
  assert.match(chatSource, /record\.haptic:error/)
})

test("send effect uses a dedicated ui fx audio context instead of the main voice player", () => {
  assert.match(chatSource, /const UI_FX_SEND_SRC = "\/assets\/audio\/voicecoach-send\.wav"/)
  assert.match(chatSource, /this\.uiFxAudioCtx = wx\.createInnerAudioContext\(\)/)
  assert.match(chatSource, /this\.uiFxAudioCtx\.obeyMuteSwitch = true/)
  assert.match(chatSource, /this\.playSendEffect\("record_send"\)/)
  assert.match(chatSource, /uifx\.send:play/)
  assert.match(chatSource, /uifx\.send:skip/)
  assert.match(chatSource, /uifx\.send:error/)
})

test("initial prompt starts directly without the tap-to-start overlay", () => {
  assert.ok(!chatWxmlSource.includes('catchtap="onTapStartPractice"'))
  assert.match(chatSource, /reason:\s*"session_create_ready"/)
  assert.match(chatSource, /reason:\s*"tts_ready"/)
  assert.match(chatSource, /reason:\s*"initial_prompt_active"/)
  assert.match(chatSource, /record\.start:blocked-initial-prompt/)
  assert.doesNotMatch(chatSource, /reason:\s*"record_gate"/)
  assert.match(
    chatSource,
    /requestTurnTts\(first\.id,\s*\{\s*autoplay:\s*false,\s*initialPrompt:\s*true,\s*\}\)/,
  )
})

test("manual playback temporarily suppresses autoplay without replaying the active initial prompt", () => {
  assert.match(chatSource, /_manualPlayActive\s*=\s*false/)
  assert.match(chatSource, /audio\.manual:lock/)
  assert.match(chatSource, /audio\.manual:clear/)
  assert.match(chatSource, /audio\.autoplay:defer/)
  assert.match(chatSource, /audio\.autoplay:resume/)
  assert.match(chatSource, /audio\.play:ignored/)
  assert.match(chatSource, /reason:\s*"initial_prompt_active"/)
})

test("force polling can complete once customer text is ready and continue polling audio in background", () => {
  assert.match(chatSource, /events\.force:done/)
  assert.match(chatSource, /customerTurnId:\s*finalCustomerTurnId/)
  assert.match(
    chatSource,
    /return Boolean\(\(turn\.text && String\(turn\.text\)\.trim\(\)\) \|\| turn\.audio_url \|\| turn\.ttsFailed\)/,
  )
  assert.match(chatSource, /return this\.pollEventsOnce\(5000\)/)
  assert.match(chatSource, /ws\.http-fallback:text-ready/)
  assert.match(chatSource, /ensureEventsPolling\(true\)/)
})

test("beautician pending hint only appears before text arrives and the realtime status pill stays removed", () => {
  assert.match(
    chatWxmlSource,
    /item\.pending && item\.role === 'beautician' && !item\.text && !item\.audio_seconds_text/,
  )
  assert.doesNotMatch(chatWxmlSource, /实时已连|实时重连中/)
  assert.match(chatSource, /pending:\s*false,\s*\n\s*audio_url: filePath \|\| null/)
})

test("job processing includes stage timing logs", () => {
  assert.match(jobsSource, /voice-coach-job/)
  assert.match(jobsSource, /pump\.job/)
  assert.match(jobsSource, /pump\.done/)
})

test("events route pumps one job per tick and rechecks events after each pump", () => {
  assert.match(eventsRouteSource, /const MAX_JOBS_PER_TICK = 1/)
  assert.match(eventsRouteSource, /const MIN_TIMEOUT_MS = 150/)
  assert.match(eventsRouteSource, /const initialFetch = await fetchEventsAfterCursor/)
  assert.match(
    eventsRouteSource,
    /const processed = await pumpVoiceCoachQueuedJobs\(\{\s*sessionId,\s*userId: user\.id,\s*maxJobs: MAX_JOBS_PER_TICK,\s*\}\)/,
  )
  assert.match(eventsRouteSource, /const postPumpFetch = await fetchEventsAfterCursor/)
})

test("customer turn generation prompt stays on the same objection thread", () => {
  assert.match(llmSource, /Stay on the SAME objection thread as the latest customer concern\./)
  assert.match(llmSource, /Directly react to the beautician's most recent reply/)
  assert.match(llmSource, /Your next utterance must feel like a direct follow-up/)
  assert.match(llmSource, /Latest customer concern to continue:/)
})

test("first-turn copy keeps a diverse preset pool", () => {
  assert.match(scenariosSource, /firstTurnPool:\s*\[/)
  assert.ok((scenariosSource.match(/tag:\s*"/g) || []).length >= 5)
  assert.ok((scenariosSource.match(/emotion:\s*"/g) || []).length >= 5)
  assert.match(sessionRouteSource, /getPresetFirstTurnPool/)
  assert.match(sessionRouteSource, /pickPresetFirstTurn/)
})

test("session creation avoids blocking first-turn TTS for preset pools", () => {
  assert.match(sessionRouteSource, /import \{ after, NextRequest, NextResponse \} from "next\/server"/)
  assert.match(sessionRouteSource, /async function warmFirstTurnTts/)
  assert.match(
    sessionRouteSource,
    /function shouldGenerateFirstTurnTtsSynchronously\(scenarioId\?: string \| null\): boolean/,
  )
  assert.match(sessionRouteSource, /if \(getPresetFirstTurnPool\(scenarioId\)\.length\) return false/)
  assert.match(sessionRouteSource, /tts_pending:\s*!audioUrl/)
  assert.match(sessionRouteSource, /audio_source:\s*audioSource/)
})

test("tts route reuses shared opening audio before falling back to a fresh generation", () => {
  assert.match(ttsRouteSource, /function getGeneratedOpeningAudioPath/)
  assert.match(ttsRouteSource, /createHash\("sha1"\)/)
  assert.match(ttsRouteSource, /async function trySignVoiceCoachAudio/)
  assert.match(ttsRouteSource, /async function waitForOpeningAudio/)
  assert.match(ttsRouteSource, /async function resolveOpeningAudioSecondsFromText/)
  assert.match(ttsRouteSource, /async function resolveHistoricalOpeningAudio/)
  assert.match(ttsRouteSource, /const OPENING_WARM_WAIT_MS = 5200/)
  assert.match(ttsRouteSource, /const sharedOpeningAudioPath =/)
  assert.match(ttsRouteSource, /const cachedSharedUrl = await trySignVoiceCoachAudio\(sharedOpeningAudioPath\)/)
  assert.match(
    ttsRouteSource,
    /const warmed = await waitForOpeningAudio\(supabase, sessionId, turnId, sharedOpeningAudioPath\)/,
  )
  assert.match(ttsRouteSource, /const historical = await resolveHistoricalOpeningAudio\(supabase, turnId, text\)/)
  assert.match(
    ttsRouteSource,
    /audioPath = sharedOpeningAudioPath \|\| `\$\{user\.id\}\/\$\{sessionId\}\/\$\{turnId\}\.mp3`/,
  )
  assert.match(ttsRouteSource, /if \(!audioUrl\) \{\s*const tts = await doubaoTts\(/)
})

test("chat rows use image avatars instead of text avatar pills", () => {
  assert.match(chatWxmlSource, /<view class="chat-inner">/)
  assert.match(chatWxmlSource, /avatar-rail avatar-rail-left/)
  assert.match(chatWxmlSource, /avatar-rail avatar-rail-right/)
  assert.match(chatWxmlSource, /avatar-customer\.png/)
  assert.match(chatWxmlSource, /avatar-self\.png/)
  assert.match(
    chatWxmlSource,
    /<view wx:if="\{\{item\.role === 'customer'\}\}" id="turn-\{\{item\.id\}\}" class="row row-left">/,
  )
  assert.match(chatWxmlSource, /<view wx:else id="turn-\{\{item\.id\}\}" class="row row-right">/)
  assert.match(
    chatWxmlSource,
    /<template is="turn-content" data="\{\{item: item, playingTurnId: playingTurnId\}\}" \/>/,
  )
  assert.match(chatWxmlSource, /<view class="row-main row-main-left">/)
  assert.match(chatWxmlSource, /<view class="row-main row-main-right">/)
  assert.ok(!chatWxmlSource.includes("avatar-spacer"))
  assert.ok(!chatWxmlSource.includes('class="avatar avatar-customer"'))
  assert.ok(!chatWxmlSource.includes('class="avatar avatar-beautician"'))
})

test("chat layout keeps fixed rails and tightened avatar alignment", () => {
  assert.match(
    chatWxssSource,
    /\.row\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*flex-start;[\s\S]*gap:\s*16rpx;[\s\S]*min-height:\s*72rpx;[\s\S]*overflow:\s*visible;/s,
  )
  assert.match(chatWxssSource, /\.row-left\s*\{[\s\S]*justify-content:\s*flex-start;/s)
  assert.match(chatWxssSource, /\.row-right\s*\{[\s\S]*justify-content:\s*flex-end;/s)
  assert.match(
    chatWxssSource,
    /\.row-main-left\s*\{[\s\S]*justify-content:\s*flex-start;[\s\S]*max-width:\s*calc\(100% - 100rpx\);[\s\S]*margin-right:\s*auto;/s,
  )
  assert.match(
    chatWxssSource,
    /\.row-main-right\s*\{[\s\S]*justify-content:\s*flex-end;[\s\S]*max-width:\s*calc\(100% - 100rpx\);[\s\S]*margin-left:\s*auto;/s,
  )
  assert.match(
    chatWxssSource,
    /\.chat-inner\s*\{[\s\S]*padding:\s*22rpx calc\(28rpx \+ env\(safe-area-inset-right\)\) 10rpx calc\(28rpx \+ env\(safe-area-inset-left\)\);/s,
  )
  assert.match(
    chatWxssSource,
    /\.avatar-rail\s*\{[\s\S]*flex:\s*0 0 84rpx;[\s\S]*width:\s*84rpx;[\s\S]*min-width:\s*84rpx;[\s\S]*height:\s*72rpx;[\s\S]*overflow:\s*visible;[\s\S]*align-self:\s*flex-start;/s,
  )
  assert.match(chatWxssSource, /\.avatar-rail-left\s*\{[\s\S]*justify-content:\s*flex-end;/s)
  assert.match(
    chatWxssSource,
    /\.avatar-rail-right\s*\{[\s\S]*width:\s*84rpx;[\s\S]*min-width:\s*84rpx;[\s\S]*justify-content:\s*flex-start;[\s\S]*padding-left:\s*8rpx;[\s\S]*padding-right:\s*0;/s,
  )
})

test("chat wxml visible copy stays readable instead of mojibake", () => {
  assert.ok(chatWxmlSource.includes("结束"))
  assert.ok(chatWxmlSource.includes("按住说话"))
  assert.ok(chatWxmlSource.includes("回答建议") || chatWxmlSource.includes("对话灵感"))
  assert.ok(chatWxmlSource.includes("关闭"))
  assert.ok(chatWxmlSource.includes("重试语音"))
  assert.ok(chatWxmlSource.includes("识别中..."))
  assert.ok(chatWxmlSource.includes("原文标注"))
  assert.ok(chatWxmlSource.includes("改进建议"))
  assert.ok(chatWxmlSource.includes("润色表达"))
  assert.ok(chatWxmlSource.includes("注意事项"))
  assert.ok(chatWxmlSource.includes("本轮评分"))
  assert.doesNotMatch(chatWxmlSource, /[�]/)
})

test("real-device smoke checklist covers first prompt, fallback, autoplay and hint", () => {
  assert.match(checklistSource, /Scenario 1: First Prompt Playback/)
  assert.match(checklistSource, /Scenario 2: Short Utterance HTTP Fallback/)
  assert.match(checklistSource, /Scenario 4: Autoplay Arbitration/)
  assert.match(checklistSource, /Scenario 6: Hint Single Flight/)
  assert.match(checklistSource, /\[vc\]/)
})

test("customer turns use voice bubbles instead of generation placeholders while audio is pending", () => {
  assert.match(chatSource, /function buildPendingCustomerVoiceUi/)
  assert.match(chatSource, /function buildPendingBeauticianVoiceUi/)
  assert.match(chatSource, /ensureLocalBeauticianTurn\(res\.tempFilePath, durationSec/)
  assert.match(chatSource, /buildPendingCustomerVoiceUi\(String\(data\.text \|\| ""\)\)/)
  assert.match(chatSource, /buildPendingCustomerVoiceUi\(this\._realtimeCustomerText\)/)
  assert.match(
    chatWxmlSource,
    /class="voice-bubble voice-customer voice-pending \{\{playingTurnId === item\.id \? 'voice-playing' : ''\}\}"/,
  )
  assert.ok(!chatWxmlSource.includes("语音生成中..."))
  assert.ok(!chatWxmlSource.includes("对方正在回复"))
  assert.ok(!chatWxmlSource.includes("处理中..."))
})
