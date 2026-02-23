# WO-R11-TTS Window5 Analysis

## Scope
- Work order: `WO-R11-TTS`
- Code changes: none required in `lib/voice-coach/jobs.server.ts` this round.
- Artifacts only under `docs/runbooks/WO-R11-TTS/window5/`.

## Gate Results
- G0 PASS: B/C `audit_samples` include `trace_id`, `client_build`, `server_build`, `executor`.
- G1 PASS: `tts_cache_hit_rate` B=`1`, C=`1`.
- G2 PASS: `tts_ms.p95` B=`0`, C=`0`; `queue_wait_before_tts_invalid_rate` B=`0`, C=`0`.
- G3 PASS: `llm_used_when_script_hit_count` B=`0`, C=`0`; `tts_source_distribution.runtime` B=`0`, C=`0`.

## Key Snapshot
- B `tts_source_distribution`: `{ "line_cache": 8, "text_cache": 0, "runtime": 0 }`
- C `tts_source_distribution`: `{ "line_cache": 8, "text_cache": 0, "runtime": 0 }`
