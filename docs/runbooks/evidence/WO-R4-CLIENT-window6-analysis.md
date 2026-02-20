# WO-R4-CLIENT Window6 Analysis

## Scope
- client validation rerun (no business code change)
- worker-only clean run; submit_pump contamination removed

## Input Raw Files
- A: /tmp/voicecoach_e2e_1771597400658.json
- B(best of 8 retries, worker-only): /tmp/voicecoach_e2e_1771600616283.json
- C(pass sample, worker-only auc): /tmp/voicecoach_e2e_1771600266577.json

## Gate Result
- G0=PASS: audit four fields present in A/B/C samples.
- G1=FAIL: audio_ready_ms_B_p50=8626 (target <= 8000).
- G2=PASS: record_format=mp3, sample_rate=16000, channels=1, ui_feedback_p95_ms=42.
- G3=PASS: C slow path usable=true, turn_error=0, asr_provider={"auc":3}.

## Retry Evidence
- B worker-only retries p50(ms): 9885, 9996, 9333, 9185, 8760, 8626, 9230, 8931; best=8626 (>8000).
- C worker-only after restarting worker with flash=false: usable=true, turn_error=0, asr_provider=auc.

## Notes
- executor cleaned to worker-only for B/C (submit_pump_count=0, events_pump_count=0).
- Remaining fail item is G1 latency threshold.
