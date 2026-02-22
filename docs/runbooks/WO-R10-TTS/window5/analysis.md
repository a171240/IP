# WO-R10-TTS Window5 Analysis

## Scope
- Work Order: `WO-R10-TTS`
- Code changes: none (no `jobs.server.ts` TTS logic modification needed for this round)
- Evidence files generated under `docs/runbooks/WO-R10-TTS/window5/`

## Gate Check
- G0 (B/C audit samples have 4 fields): PASS
  - B sample fields: `trace_id/client_build/server_build/executor` all present
  - C sample fields: `trace_id/client_build/server_build/executor` all present
- G1 (`tts_cache_hit_rate >= 0.95`, B/C): PASS
  - B: `1`
  - C: `1`
- G2 (`tts_ms_p95 <= 350`, B/C and `queue_wait_before_tts_invalid_rate=0`): PASS
  - B: `tts_ms_p95=0`, `queue_wait_before_tts_invalid_rate=0`
  - C: `tts_ms_p95=0`, `queue_wait_before_tts_invalid_rate=0`
- G3 (`llm_used_when_script_hit_count=0` and `tts_source_distribution.runtime=0`): PASS
  - B: `llm_used_when_script_hit_count=0`, `runtime=0`
  - C: `llm_used_when_script_hit_count=0`, `runtime=0`

## Key Metrics Snapshot
- B `tts_source_distribution`: `{ "line_cache": 8, "text_cache": 0, "runtime": 0 }`
- C `tts_source_distribution`: `{ "line_cache": 7, "text_cache": 0, "runtime": 0 }`
