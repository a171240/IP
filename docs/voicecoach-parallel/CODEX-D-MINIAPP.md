# Codex-D: Mini Program Realtime Client

## Goal
Switch voice-coach mini program to realtime socket streaming while keeping upload fallback behind a kill switch.

## Allowed Files
1. `/Users/zhuan/IP项目/ip-content-factory/mini-program-ui/pages/voice-coach/chat.js`
2. `/Users/zhuan/IP项目/ip-content-factory/mini-program-ui/pages/voice-coach/chat.json`
3. `/Users/zhuan/IP项目/ip-content-factory/mini-program-ui/pages/voice-coach/*`
4. `/Users/zhuan/IP项目/ip-content-factory/mini-program-ui/utils/*`

## Required Behavior
1. Press-to-talk opens socket immediately.
2. `onFrameRecorded` streams audio chunks while recording.
3. Release sends `audio.end`.
4. `asr.partial` updates transcript preview.
5. `customer.audio_chunk` is queued for progressive playback.
6. New user speech stops current playback before sending `interrupt`.

## Guardrails
1. Keep legacy `uploadBeauticianTurn` only as a kill-switch fallback.
2. Do not revive `/asr-preview`.
3. Realtime off must still allow the old flow to finish.

## Done When
1. Partial transcript is visible.
2. Chunk playback stays ordered and interruptible.
3. Weak-network fallback returns to legacy submit path without app restart.
