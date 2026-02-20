# WO-R3-XXX Window5 Analysis

## Code Anchors
- Stable tts source normalization and round metrics helper:
  - `lib/voice-coach/jobs.server.ts:811`
  - `lib/voice-coach/jobs.server.ts:831`
- Script line forces LLM rewrite OFF (`line_id` present):
  - `lib/voice-coach/jobs.server.ts:1584`
  - `lib/voice-coach/jobs.server.ts:1588`
- `customer.audio_ready` now always emits stable `tts_source` and round metrics:
  - `lib/voice-coach/jobs.server.ts:2143`
  - `lib/voice-coach/jobs.server.ts:2148`
  - `lib/voice-coach/jobs.server.ts:2150`
  - `lib/voice-coach/jobs.server.ts:2152`
  - `lib/voice-coach/jobs.server.ts:2153`

## Verification Commands
- `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- Bench outputs generated at:
  - `docs/runbooks/WO-R3-XXX/window5/bench_A.json`
  - `docs/runbooks/WO-R3-XXX/window5/bench_B.json`
  - `docs/runbooks/WO-R3-XXX/window5/bench_C.json`

## Gate Notes
- G0 build/type check passed.
- G1 source taxonomy stabilized to tri-state (`line_cache|text_cache|runtime`) in emitted event metrics.
- G2 script-hit path forces `llm_used=false` by construction (`line_id` path bypasses rewrite).
- G3 pregen coverage and line-cache coverage satisfy >=80% target in simulation bench.
