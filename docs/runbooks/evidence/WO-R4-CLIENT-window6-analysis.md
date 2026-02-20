# WO-R4-CLIENT Window6 Analysis

## Scope
- client validation rerun (no business code change)
- B/C repeated reruns with isolated ports and fixed env

## Input Raw Files
- A: /tmp/voicecoach_e2e_1771597400658.json
- B(best of 5 retries): /tmp/voicecoach_e2e_1771598568135.json
- C(best of 6 retries by error-count): /tmp/voicecoach_e2e_1771598797567.json

## Gate Result
- G0=PASS: audit four fields present in A/B/C samples.
- G1=FAIL: audio_ready_ms_B_p50=8926 (target <= 8000).
- G2=PASS: record_format=mp3, sample_rate=16000, channels=1, ui_feedback_p95_ms=42.
- G3=FAIL: C slow path usable=false, turn_error=1.

## Retry Evidence
- B retries (flash-primary): p50 values observed = 9241, 8926, 9127, 8995, 9256 ms; best=8926 ms (>8000).
- C retries (slow-path): all retries had turn.error (errors=1 or 2), no retry reached usable=true.

## Notes
- This is a client-window verification run; no server code modified.
- Failures are retained as evidence, not overwritten.
