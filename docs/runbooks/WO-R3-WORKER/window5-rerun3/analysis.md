# WO-R3-WORKER Window5 Re-run3 Analysis

## Scope
- Real worker optimization patch for G1: submit kickoff re-enabled by default, submit kickoff unhandled rejection fix, events pump fallback, and worker `chain_main_to_tts` default false.
- Metric calibration fixed and explicit:
  - `queue_wait_before_main_ms` from `beautician.asr_ready`
  - `queue_wait_before_tts_ms` valid-only from `customer.audio_ready`

## Evidence
- A (`require_flash=false`): `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_A.json`
- B (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_B.json`
- C (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_C.json`
- selfcheck (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun3/selfcheck.log`
- aggregate: `docs/runbooks/WO-R3-WORKER/window5-rerun3/analysis.json`

## Gate Result
- G0: PASS
- G1: PASS (`queue_wait_before_main_ms p95`: A=36, B=22, C=26)
- G2: PASS (`queue_wait_before_tts_invalid_rate=0`, valid-only `queue_wait_before_tts_p95_ms`: B=733, C=605)
- G3: PASS (`asr_provider_final_flash_ratio`: B=1.0, C=1.0; selfcheck PASS)
