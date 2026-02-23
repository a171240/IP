# WO-R13-TTS (window5) Analysis

## Scope
- Goal: TTS cache stability + expanded exception replay samples.
- Code changes: none in `jobs.server.ts` this round.

## B/C Baseline
- B (`bench_B.json`):
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`
- C (`bench_C.json`):
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`

## Exception Replay Expansion
- Exception source set: `replay_exception_source.json` (`sample_size=20` timeout cases).
- Replay aggregate: `replay_validation_aggregate.json`:
  - `replay_groups=23` (>=20)
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":23,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`

## Gate Mapping
- G0 PASS: B/C audit samples both include trace/client/server/executor.
- G1 PASS: B/C `tts_cache_hit_rate` both >= 0.95.
- G2 PASS: B/C `tts_ms.p95 <= 350` and invalid rate = 0.
- G3 PASS: B/C and replay aggregate all satisfy `runtime=0` and `llm_used_when_script_hit_count=0`.
