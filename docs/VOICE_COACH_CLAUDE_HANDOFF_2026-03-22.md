# Voice Coach Claude Handoff

Date: 2026-03-22

## Executive Summary

This round moved the mini-program real-device path from "spec says realtime" to "runtime is actually realtime".

The highest-value outcome is no longer speculative:

1. The active real-device path now uses WebSocket realtime instead of the old HTTP `submit + events/stream` path.
2. The persisted-turn failure caused by wrong realtime `turn_index` has been fixed.
3. Realtime second-round send and `barge_in` now work in the latest real-device run.
4. The remaining work is no longer transport/debugging-first; it is mainly UI/interaction polish and repeated real-device verification.
5. Claude should not spend another round re-proving whether WS is wired in. That question is already settled.

## Runtime Truth

The current real-device runtime path is:

- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/utils/ws-client.js`
- `mini-program-ui/utils/audio-stream-player.js`
- `voice-coach-ws/src/pipeline/orchestrator.ts`

In the latest successful device run, the logs explicitly showed:

- `ws.connect:open`
- `ws.audio.start`
- `record.frame`
- `ws.audio.end`
- `ws.asr.final`
- `ws.turn.saved`
- `ws.tts.done`
- second round `ws.barge_in`

This means the real-device path is no longer the old HTTP fallback path for the tested session.

Latest verified session id:

- `1969c65b-54b2-4ae8-9381-1202c221d33e`

## What Was Confirmed Fixed

### 1. Real-device WS connection is active

Earlier rounds showed:

- `ws.connect:failed { message: "Can't find variable: URL" }`
- fallback to HTTP

That was fixed by removing reliance on the global `URL` object in:

- `mini-program-ui/utils/ws-client.js`

Result:

- real device now reaches `ws.connect:open`
- no longer depends on old `submit + stream` for the tested runs

### 2. `turn_persist_failed` root cause was found and fixed

This was not a vague frontend issue. The root cause was:

- realtime `audio.start` used a wrong `turn_index`
- DB uniqueness on `(session_id, turn_index)` then failed

The confirmed evidence path was:

- device logs originally repeated bad indexes
- production DB reproduced `voice_coach_turns_session_turn_index_key` conflict

Fixes applied:

- `mini-program-ui/pages/voice-coach/chat.js`
  - `normalizeTurn()` keeps `turn_index`
  - `getNextTurnIndex()` uses max persisted/rendered `turn_index`
  - realtime draft/customer/beautician turn updates preserve correct indexes
- `voice-coach-ws/src/pipeline/orchestrator.ts`
  - stale client turn indexes are clamped to the server session cursor

Result in latest run:

- first round `turnIndex: 1`
- second round `turnIndex: 3`
- no `turn_persist_failed`

### 3. Second-round realtime send now works in latest run

Earlier real-device runs had:

- second round often ending in `asr_empty_result`
- failed follow-up send after first round

A concrete client-side bug was found:

- `onRecordEnd()` set `recording=false` before recorder shutdown completed
- `onRecordFrame()` then ignored late tail frames
- short second-round utterances were more likely to lose the tail and finalize empty

Fix applied in:

- `mini-program-ui/pages/voice-coach/chat.js`

The recorder transport path now uses a dedicated `_recordTransportActive` flag rather than `data.recording` to decide whether post-stop frames should still be sent.

Result in latest run:

- second round successfully reached
  - `ws.asr.final`
  - `ws.llm.done`
  - `ws.turn.saved`
  - `ws.tts.done`

### 4. True realtime `barge_in` is now allowed

Earlier code still blocked `onRecordStart()` when `loading` or `waitingCustomer` was true, which meant "barge-in exists in code" but was not reliably usable from the UI.

Fix applied in:

- `mini-program-ui/pages/voice-coach/chat.js`

Realtime mode now allows recording start during AI playback/processing when WS is connected.

Result in latest run:

- second round log contains `ws.barge_in`

### 5. Customer reply no longer needs to render as text first by design

Earlier active UI path showed:

- pending customer text bubble first
- audio attached later on `tts.done`

This was changed so pending customer realtime reply shows a voice placeholder instead of a visible text bubble.

Changed file:

- `mini-program-ui/pages/voice-coach/chat.wxml`

Current intended path:

- pending: `语音生成中...`
- ready: direct voice bubble

Note:

- this was changed in code, but it still needs fresh screenshot confirmation on device after the latest compile

## Current Evidence From Latest Device Run

Latest user-provided logs confirm:

- `session.create:ok`
- `ws.connect:open`
- first round:
  - `turnIndex: 1`
  - `ws.asr.final { textLength: 9 }`
  - `ws.turn.saved`
  - `ws.tts.done`
- second round:
  - `record.start ... turnIndex: 3`
  - `ws.barge_in`
  - `ws.asr.final { textLength: 14 }`
  - `ws.turn.saved`
  - `ws.tts.done`
  - `ws.llm.analysis`

No longer present in that run:

- `turn_persist_failed`
- second-round `turnIndex: 5`
- fallback-to-HTTP behavior

## Files Touched In This Debugging Round

Primary files:

- `mini-program-ui/pages/voice-coach/chat.js`
- `mini-program-ui/pages/voice-coach/chat.wxml`
- `mini-program-ui/utils/ws-client.js`
- `mini-program-ui/utils/ws-client.test.js`
- `mini-program-ui/pages/voice-coach/turn-list.js`
- `mini-program-ui/pages/voice-coach/turn-list.test.js`
- `mini-program-ui/utils/audio-stream-player.js`
- `mini-program-ui/utils/audio-stream-player.test.js`
- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/src/__tests__/orchestrator.test.ts`

Most relevant code anchors in current state:

- `mini-program-ui/pages/voice-coach/chat.js`
  - realtime connect/setup
  - draft turn management
  - `getNextTurnIndex()`
  - `_recordTransportActive`
  - realtime `barge_in`
- `mini-program-ui/pages/voice-coach/chat.wxml`
  - customer pending voice placeholder
- `voice-coach-ws/src/pipeline/orchestrator.ts`
  - server-side turn-index clamp

## Validation Completed

Local checks completed:

- `node --check d:\IP网站\mini-program-ui\pages\voice-coach\chat.js`
- `node --test d:\IP网站\mini-program-ui\utils\ws-client.test.js d:\IP网站\mini-program-ui\pages\voice-coach\turn-list.test.js d:\IP网站\mini-program-ui\utils\audio-stream-player.test.js`
- `npm test -- --run src/__tests__/orchestrator.test.ts` in `voice-coach-ws`

Latest known results:

- frontend node tests: `10/10` pass
- orchestrator targeted tests: pass
- real-device WS run: pass for two consecutive turns in the latest session

## What Is Still Open

The remaining items are now mostly UX/product-facing rather than transport correctness.

### A. Record button interaction polish

The user previously reported:

- after pressing once, the button visually stayed in `松开发送` too long

Part of the state reset issue was fixed by adding `recorder.onStop` UI reset, but this still needs a dedicated real-device UX check after the latest compile.

Claude should treat this as a frontend interaction refinement task, not a realtime transport task.

### B. Action row alignment and visual polish

Still open from the earlier device review:

- `转文字`
- `改进建议`
- `重录`

These controls still need structure/size/alignment cleanup in:

- `mini-program-ui/pages/voice-coach/chat.wxml`
- `mini-program-ui/pages/voice-coach/chat.wxss`

### C. First-turn variability

Still unchanged:

- opening scenario remains fixed to `objection_safety`
- opening customer line remains effectively fixed by current product/backend config

This is not a transport bug.
Claude should make a product choice first:

- single scenario with multiple openers
- or multiple scenarios

### D. Fresh visual confirmation for pending-customer path

The code now avoids showing customer text first, but this still needs device screenshot confirmation after the latest patch.

### E. Repeated-run confidence

The latest run succeeded for two turns, which is enough to confirm the main bug class is fixed, but not enough to declare the whole path stress-tested.

Claude should run repeated device checks rather than reopen protocol-level architecture work.

## Recommended Next-Round Task Breakdown

### P0. Device confirmation pass

Run one short focused real-device verification pass against the current compiled mini-program and confirm:

- customer pending state shows placeholder instead of text-first
- record button visual state resets correctly
- second-round and third-round turns remain stable

This is a verification-first task, not a refactor.

### P1. Record button polish

If the button still visually sticks in `松开发送`, refine only the recording-state UI path in:

- `chat.js`
- `chat.wxml`
- `chat.wxss`

Do not reopen the transport path unless logs show a real regression.

### P2. Action row redesign

Unify the structure and sizing of:

- `转文字`
- `改进建议`
- `重录`

This should be a pure frontend cleanup task.

### P3. First-turn variability decision + implementation

Do not let implementation guess the product shape.
Choose one:

- one scenario, multiple opening lines
- multiple scenarios with explicit selection

Then implement that path cleanly.

### P4. Realtime UX hardening

Only if fresh device verification still reveals edge cases:

- repeated `barge_in`
- very short utterances
- audio attach timing

At this stage, this should be incremental hardening, not another architecture rewrite.

## Important Do-Not-Repeat Guidance For Claude

1. Do not spend another round proving whether real device uses WS. It already does.
2. Do not reopen the old HTTP runtime-drift question unless fresh logs contradict the current state.
3. Do not mix product variability work with transport debugging.
4. Do not treat the remaining issues as backend-first unless new evidence shows backend failures.
5. Start from the current real-device success logs, not from the earlier failure-state assumptions.
