# WO-R16-TTS (window5) Analysis

## Scope
- Goal: keep TTS cache and replay behavior stable.
- Code changes: none (evidence files only).

## B/C Bench Summary
- B (`bench_B.json`)
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":7,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`
- C (`bench_C.json`)
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`

## Replay Aggregate
- Source (`replay_exception_source.json`): `sample_size=20`
- Aggregate (`replay_validation_aggregate.json`):
  - `replay_groups=24`
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
  - `tts_source_distribution={"line_cache":24,"text_cache":0,"runtime":0}`
  - `llm_used_when_script_hit_count=0`

## Gate Mapping
- G0 PASS: B/C `audit_samples` include `trace_id/client_build/server_build/executor`.
- G1 PASS: B/C `tts_cache_hit_rate >= 0.95`.
- G2 PASS: B/C `tts_ms.p95 <= 350` and `queue_wait_before_tts_invalid_rate=0`.
- G3 PASS: B/C and replay aggregate all satisfy `runtime=0` and `llm_used_when_script_hit_count=0`.
