# Codex-A: Contract And Observability

## Goal
Freeze the shared realtime contract before the implementation branches diverge.

## Allowed Files
1. `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/realtime-contract.ts`
2. `/Users/zhuan/IP项目/ip-content-factory/.env.example`
3. `/Users/zhuan/IP项目/ip-content-factory/scripts/bench_voicecoach.mjs`
4. `/Users/zhuan/IP项目/ip-content-factory/scripts/analyze_voicecoach_obs.mjs`
5. `/Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs`
6. `/Users/zhuan/IP项目/ip-content-factory/docs/voicecoach-parallel/*`

## Required Output
1. Realtime client/server message names frozen.
2. Telemetry keys frozen.
3. Feature flags documented.
4. Bench scripts accept optional `customer.audio_chunk` and first-audio metrics.

## Do Not Touch
1. Mini program runtime logic.
2. Worker locking logic.
3. Any gateway implementation.

## Must-Have Fields
1. `inline_audio_eligible`
2. `asr_input_source`
3. `submit_fastpath_hit`
4. `first_audio_chunk_ms`
5. `first_audio_play_ms`

## Done When
1. `pnpm build` passes.
2. Bench scripts remain backward compatible with legacy `customer.audio_ready`.
3. Other branches can import the same contract file without adding fields locally.
