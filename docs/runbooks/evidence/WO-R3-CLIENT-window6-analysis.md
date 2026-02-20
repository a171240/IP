# WO-R3-CLIENT Window6 Validation (Post WO-R3-WORKER)

## Scope
- validation-only round
- no business-code edits
- refreshed evidence files only:
  - `docs/runbooks/WO-R3-CLIENT/window6/bench_A.json`
  - `docs/runbooks/WO-R3-CLIENT/window6/bench_B.json`
  - `docs/runbooks/WO-R3-CLIENT/window6/bench_C.json`
  - `docs/runbooks/evidence/WO-R3-CLIENT-window6-analysis.md`

## Run Inputs
- A raw: `/tmp/voicecoach_e2e_1771589238278.json`
- B raw: `/tmp/voicecoach_e2e_1771589101041.json`
- C raw: `/tmp/voicecoach_e2e_1771589154765.json`

## Gate Result
- G0=PASS evidence=`bench_A/B/C` all include non-empty `trace_id/client_build/server_build/executor` in event audit samples.
- G3=PASS evidence=`docs/runbooks/WO-R3-CLIENT/window6/bench_B.json` has `asr_provider_distribution.flash=3` and `asr_flash_ratio=1.0` (>=95%).
- Client-Metrics=PASS evidence=latest real-device probe remains stable:
  - `record_format`: `mp3 -> mp3`
  - `record_sample_rate`: `16000 -> 16000`
  - `ui_feedback_p95_ms`: `42 -> 42`

## Metric Notes
- `queue_wait_before_tts_ms_corrected` uses `valid_only_then_fallback_raw`.
- A 组出现额外 1 条 `beautician.asr_ready`（sample_events=10），不影响 G0 与 flash 占比判定。
