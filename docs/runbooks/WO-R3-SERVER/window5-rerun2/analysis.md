# WO-R3-SERVER Window5 Re-run2 Analysis

## Scope
- Window2/OBS audit supplement: queue wait口径、ASR provider字段统一、bench evidence reproducibility.
- Code patch: `lib/voice-coach/jobs.server.ts`

## Grouping Evidence (`require_flash`)
- A (`require_flash=false`): `docs/runbooks/WO-R3-SERVER/window5-rerun2/bench_A.json`
- B (`require_flash=true`): `docs/runbooks/WO-R3-SERVER/window5-rerun2/bench_B.json`
- C (`require_flash=true`): `docs/runbooks/WO-R3-SERVER/window5-rerun2/bench_C.json`
- Selfcheck (`require_flash=true`): `docs/runbooks/WO-R3-SERVER/window5-rerun2/selfcheck.log`

## Gate Result
- G0: PASS (`trace_id/client_build/server_build/executor` present in audit samples)
- G1: PASS (`queue_wait_before_main_ms.p95=0 <= 500`)
- G2: PASS (`queue_wait_before_tts_p95_ms(valid-only)=595`, `queue_wait_before_tts_invalid_rate=0`)
- G3: PASS (`asr_provider_final_flash_ratio=1.0` for B/C)

## Key Metrics
- queue_wait_before_tts_invalid_rate: `0`
- queue_wait_before_tts_p95_ms(valid-only): `595`
- asr_provider_final_flash_ratio: `1`

Source aggregation: `docs/runbooks/WO-R3-SERVER/window5-rerun2/analysis.json`.
