# Voice Coach Claude Handoff: Round 4 Update

Date: 2026-03-22

## Executive Summary

This round did not fail at the transport layer. The active mini-program path is confirmed to use WebSocket realtime, and the previously blocking realtime issues were partially fixed. The new main problem is now a mixed-mode regression introduced by the short-utterance HTTP fallback path.

Current bottom line:

1. WebSocket realtime is truly active on real device.
2. Pure realtime turn indexing now works: first beautician turn uses `turn_index=1`, second uses `turn_index=3`.
3. `barge_in` works in the successful realtime runs.
4. A new regression exists when a short utterance is routed to HTTP while `_realtimeMode` stays `true`.
5. The user’s latest complaints are now concentrated in three areas:
   - customer audio missing or delayed in fallback sessions
   - duplicate key failure on the second short-utterance HTTP submit
   - opening line still feels fixed in product experience

## What Was Changed This Round

### Frontend realtime path

Files:

- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.js`
- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.wxml`
- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.wxss`
- `d:\IP网站\mini-program-ui\utils\ws-client.js`
- `d:\IP网站\mini-program-ui\utils\ws-client.test.js`

Delivered changes:

1. Wired the active real-device page to `VoiceCoachWsClient` and realtime message handling.
2. Added `[vc]` logging for session creation, WS connect, recorder lifecycle, frame upload, ASR, LLM, TTS, persistence, fallback, and playback.
3. Fixed the old realtime `turn_index` bug by preserving `turn_index` in rendered turns and computing the next index from the current turn list.
4. Added server-side send ordering in `ws-client.js`:
   - single outbound queue
   - ordered JSON/binary sends
   - `drain()` before `audio.end`
5. Added recorder tail-frame handling in `chat.js` so post-stop MP3 frames can still be uploaded before turn finalization.
6. Added short-utterance stopgap:
   - if `audioSeconds < 3`, do not use realtime ASR
   - cancel current WS audio attempt
   - submit the same file through the stable HTTP path
7. Removed the visible `重录` button from the active UI.
8. Unified action buttons to `action-chip` structure.
9. Kept customer pending reply as a voice placeholder instead of “full text first, audio later”.
10. Made the record button label static (`按住说话`) and moved record-status copy to the preview layer above the button.

### First-turn variability

Files:

- `d:\IP网站\lib\voice-coach\scenarios.ts`
- `d:\IP网站\app\api\voice-coach\sessions\route.ts`

Delivered changes:

1. Added `firstTurnPool` to `objection_safety`.
2. Added `pickPresetFirstTurn()` in `sessions/route.ts`.
3. `preset` mode now chooses from the scenario pool instead of always using the old fixed fallback text.

Important caveat:

- The route still uses a fixed seed opening audio path:
  - `d:\IP网站\app\api\voice-coach\sessions\route.ts:62-66`
  - `seed/opening/objection_safety_v1.mp3`
- This means text may vary in code, but the first customer audio can still sound identical every time. Product-wise, the user will perceive this as “opening line still fixed”.

## What Was Verified Working

### A. WebSocket realtime is active on real device

Confirmed from device logs:

- `ws.connect:open`
- `ws.audio.start`
- `record.frame`
- `ws.audio.end`
- `ws.asr.final`
- `ws.turn.saved`
- `ws.tts.done`

This question should be treated as closed. Claude should not spend another round proving whether WS is connected.

### B. Pure realtime turn indexing works

Confirmed from successful device session:

- first beautician realtime turn:
  - `turnIndex: 1`
- second beautician realtime turn:
  - `turnIndex: 3`

This means the earlier realtime `turn_persist_failed` caused by wrong `turn_index` was actually fixed for the pure WS path.

### C. `barge_in` works

Confirmed from successful device logs:

- `ws.barge_in { replyToTurnId: ... }`

### D. Real-time two-turn success was observed

In the successful session previously provided by the user:

- round 1 reached:
  - `ws.asr.final`
  - `ws.turn.saved`
  - `ws.tts.done`
- round 2 reached:
  - `ws.asr.final`
  - `ws.turn.saved`
  - `ws.tts.done`
  - `ws.llm.analysis`

So the whole chain is not fundamentally broken.

## New Main Regression

The current blocking regression is not “WS is broken”. It is this:

### Per-turn short-utterance HTTP fallback leaves the page in realtime mode

Relevant code:

- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.js:2197-2207`
- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.js:2341-2354`
- `d:\IP网站\mini-program-ui\pages\voice-coach\chat.js:725-731`

What happens now:

1. User records a short utterance, around 1-2 seconds.
2. Client logs:
   - `ws.short-utterance:http`
   - `ws.audio.cancel`
   - `ws.turn:reset`
   - `turn.submit:start { mode: "http" }`
3. But `_realtimeMode` remains `true`.
4. When HTTP submit returns success, `ensureEventsPolling()` is called.
5. `ensureEventsPolling()` immediately skips because `_realtimeMode` is still true:
   - `events.ensure:skip { realtimeMode: true }`
6. The page therefore does not promptly consume the HTTP-generated follow-up events for that turn.
7. The user can start the next recording against stale state:
   - stale `replyToTurnId`
   - stale next turn index
8. The second HTTP submit then collides with the DB uniqueness constraint:
   - `duplicate key value violates unique constraint "voice_coach_turns_session_turn_index_key"`

This is the newest real blocker.

## Latest Evidence From User Logs

### Latest short-utterance session

Session id:

- `b3e76c15-63d6-4663-818e-05a92ba354ee`

Observed sequence:

1. Session created and WS connected.
2. First short utterance:
   - `ws.short-utterance:http { audioSeconds: 2, minRealtimeSeconds: 3 }`
   - `ws.audio.cancel`
   - `ws.turn:reset`
   - `turn.submit:start { mode: "http" }`
3. User starts recording again before the first HTTP follow-up is fully reflected in local UI state.
4. First HTTP submit succeeds:
   - `turn.submit:ok { mode: "http", turnId: "7fc92cfb-..." }`
5. But immediately after:
   - `events.ensure:skip { realtimeMode: true }`
6. Second short utterance again falls back to HTTP.
7. Second HTTP submit fails:
   - `duplicate key value violates unique constraint "voice_coach_turns_session_turn_index_key"`

This is why the user reports:

- first-round customer voice missing
- second-round customer voice bubble missing
- short utterances feel broken even though recording itself works

### Audio/autoplay oddity

The same log also shows repeated playback attempts for the original first customer turn:

- repeated `audio.play:start`
- repeated `audio.play:source`

for turn id:

- `36d1da01-0666-4ab3-b0be-9105a3ac9ac5`

This suggests there is still an autoplay/cache replay issue that can confuse real-device perception of whether customer voice actually arrived.

## User-Visible Problems Still Open

### 1. First-round customer voice may appear missing

Most likely current explanation:

- on short utterances, the page switches transport for that turn but does not correctly switch state handling for the follow-up event consumption
- this delays or suppresses the expected customer reply/audio in UI timing

### 2. Second-round customer voice bubble may not appear

Most likely current explanation:

- the second short utterance can hit the duplicate turn-index HTTP regression before the previous fallback turn has advanced the local cursor and parent turn state

### 3. Opening line still feels fixed

Code fact:

- `firstTurnPool` is implemented
- `pickPresetFirstTurn()` is implemented

But product fact:

- first opening seed audio path is still fixed
- if UI leads with audio, the user hears the same opening every time

So from the user’s perspective, this issue is still open.

### 4. Record button movement

The user later clarified that the button no longer jumps. This issue can now be treated as tentatively closed unless a fresh real-device screenshot disproves it.

## Current Best Root-Cause Assessment

### Root cause A: fallback transport split is incomplete

The client now supports:

- full realtime turn
- full HTTP turn

But short-utterance fallback is currently a hybrid:

- transport for the turn becomes HTTP
- session/page mode still remains realtime

That hybrid path is incomplete and is the main reason the latest short-utterance runs regress.

### Root cause B: first-turn variability is only partial

Text variability was added, but opening audio variability was not.

Therefore:

- implementation changed
- product perception did not meaningfully change

## Recommended Next Tasks For Claude

### P0. Fix per-turn short-utterance HTTP fallback state sync

Claude should first decide one of these two approaches and implement it cleanly:

1. when a turn falls back to HTTP, temporarily switch the page to HTTP event-consumption mode for that turn
2. or keep realtime mode, but explicitly consume the resulting HTTP turn and customer reply without relying on `ensureEventsPolling()`

The current half-fallback mode should not remain as-is.

### P1. Prevent next recording until fallback turn state is committed

If a short utterance is routed to HTTP, the page should not allow the next recording to start against stale:

- `replyToTurnId`
- `turnIndex`

Either gate the next record until the accepted beautician turn is visible, or explicitly advance the local state from the HTTP response path.

### P2. Fix first-turn product variability, not just text variability

Claude should inspect whether the opening audio should also vary.

Current blocker to real perceived diversity:

- `d:\IP网站\app\api\voice-coach\sessions\route.ts:62-66`

Possible resolution:

- disable fixed seed audio for preset openings
- or provide a matched pool of seed audio files
- or surface opening text before autoplay audio if audio remains fixed

### P3. Investigate repeated autoplay for existing customer turns

Claude should inspect why the same customer turn can trigger repeated:

- `audio.play:start`
- `audio.play:source`

This is likely in the interaction between:

- cache hit playback
- autoplay path
- local-vs-remote playback source selection

### P4. Re-validate customer pending voice path after fallback fix

Once P0 is fixed, Claude should confirm that customer reply rendering is still:

- placeholder first
- voice bubble after audio ready

and not silently regressing into:

- missing customer bubble
- delayed or repeated autoplay

## Do-Not-Repeat Notes For Claude

Do not spend time re-proving these already-settled questions:

1. WS is already wired in on real device.
2. Pure realtime `turn_index` progression already works.
3. `barge_in` already works.
4. The latest main problem is not the old realtime persistence bug.

The next round should focus on:

- short-utterance HTTP fallback state synchronization
- customer audio rendering/playback after fallback
- opening-line product variability

## Validation Completed In This Round

Local checks completed:

- `node --check d:\IP网站\mini-program-ui\pages\voice-coach\chat.js`
- `node --check d:\IP网站\mini-program-ui\utils\ws-client.js`
- `node --test d:\IP网站\mini-program-ui\utils\ws-client.test.js d:\IP网站\mini-program-ui\pages\voice-coach\turn-list.test.js d:\IP网站\mini-program-ui\utils\audio-stream-player.test.js`

Latest local result:

- frontend tests `12/12` passed

This confirms the current problem is not basic syntax or unit-test breakage. It is a real-device runtime behavior problem at the fallback boundary.
