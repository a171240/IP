# WO-R3-WORKER Window5 Re-run4 Analysis

## Scope
- Enforce worker-only execution on API routes: remove events/submit pump awaits and submit kickoff.
- Keep queue metrics and audit fields stable (trace/client_build/server_build/executor).

## Inputs
- A (`require_flash=false`): `docs/runbooks/WO-R3-WORKER/window5-rerun4/bench_A.json`
- B (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun4/bench_B.json`
- C (`require_flash=true`): `docs/runbooks/WO-R3-WORKER/window5-rerun4/bench_C.json`
- selfcheck: `docs/runbooks/WO-R3-WORKER/window5-rerun4/selfcheck.log`
- aggregate: `docs/runbooks/WO-R3-WORKER/window5-rerun4/analysis.json`

## Key Metrics
- executor_worker_ratio=1
- submit_pump_count=0
- queue_wait_before_main_ms_p95=424
- queue_wait_before_tts_invalid_rate=0
- queue_wait_before_tts_p95_ms(valid-only)=666
- asr_provider_final_flash_ratio=1

## Gates
- G0: PASS: missing_required_count_total=0
- G1: PASS: queue_wait_before_main_ms_p95=424
- G2: PASS: queue_wait_before_tts_invalid_rate=0, queue_wait_before_tts_p95_ms=666
- G3: PASS: selfcheck_pass=true, asr_provider_final_flash_ratio=1
- submit_pump_guard: PASS: submit_pump_count=0
