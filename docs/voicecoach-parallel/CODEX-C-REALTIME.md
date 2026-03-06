# Codex-C: Realtime Gateway

## Goal
Build the standalone Node realtime gateway, not an App Router websocket endpoint.

## Allowed Files
1. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/realtime-contract.ts`
2. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/speech/doubao.server.ts`
3. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/*`
4. `/Users/zhuan/IP项目/ip-content-factory/scripts/*`
5. New gateway files under `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/realtime/*`

## Required Behavior
1. Accept control frames plus binary audio chunks.
2. Emit `asr.partial`, `asr.final`, `customer.text_ready`, `customer.audio_chunk`, `customer.audio_ready`.
3. Buffer chunked audio server-side and upload a final replayable asset.
4. Support `interrupt` and cancel any unfinished streaming TTS.

## Guardrails
1. Final `customer.audio_ready` remains mandatory for replay and reconnection.
2. HTTP TTS fallback must remain available.
3. Gateway cannot break `VOICE_COACH_REALTIME_ENABLED=false`.

## Done When
1. Local smoke path reaches `session.start -> customer.audio_ready`.
2. Mid-stream failure falls back to final `audio_ready`.
3. Contract file remains unchanged except approved optional fields.
