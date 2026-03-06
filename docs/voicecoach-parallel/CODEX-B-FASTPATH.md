# Codex-B: Legacy Fast-Path

## Goal
Speed up the existing submit -> worker pipeline without reintroducing `/asr-preview`.

## Allowed Files
1. `/Users/zhuan/IP项目/ip-content-factory/app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts`
2. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`
3. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
4. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/realtime-contract.ts`
5. `/Users/zhuan/IP项目/ip-content-factory/.env.example`

## Guardrails
1. Fast-path may stop at `customer.text_ready` only.
2. Never synthesize TTS inside submit request.
3. Reuse existing claim/lock semantics. No duplicate customer turn generation.
4. Leave worker as the owner of `tts_pending`.

## Required Metrics
1. `submit_fastpath_hit`
2. `inline_audio_eligible`
3. `asr_input_source`
4. `first_audio_play_ms`

## Done When
1. Legacy path p50 `customer.text_ready` improves.
2. No duplicate `customer.text_ready` events are emitted.
3. Realtime-off fallback still completes a full round.
