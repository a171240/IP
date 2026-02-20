# WO-R3-WORKER Window5 Re-run2 Analysis

## Scope
- Re-submit under fixed WO ID: `WO-R3-WORKER`
- Fix metric calibration: `queue_wait_before_main_ms` now computed from `beautician.asr_ready` events only.

## Evidence Files
- A (`require_flash=false`): `docs/runbooks/WO-R3-WORKER/window5-rerun2/bench_A.json`
- B (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun2/bench_B.json`
- C (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun2/bench_C.json`
- Selfcheck (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun2/selfcheck.log`
- Aggregation: `docs/runbooks/WO-R3-WORKER/window5-rerun2/analysis.json`

## Metric Calibration
- `queue_wait_before_main_ms`: source=`beautician.asr_ready`
- `queue_wait_before_tts_ms`: source=`customer.audio_ready` with `queue_wait_before_tts_valid=true`

## Gate Result
- G0: PASS
- G1: FAIL (`queue_wait_before_main_ms p95`: A=960, B=1191, C=951; threshold<=500)
- G2: PASS (`queue_wait_before_tts_invalid_rate=0`, valid-only `queue_wait_before_tts_p95_ms=595`)
- G3: PASS (`asr_provider_final_flash_ratio` B=1.0, C=1.0)
