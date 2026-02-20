# WO-R4-CLIENT Window6 Analysis

## Scope
- client window validation (`mini-program-ui/*`, `docs/runbooks/*`)
- no business logic refactor
- evidence generated from A/B/C bench reruns

## Input Raw Files
- A: /tmp/voicecoach_e2e_1771597400658.json
- B: /tmp/voicecoach_e2e_1771598069423.json
- C: /tmp/voicecoach_e2e_1771597697029.json

## Gate Result
- G0=PASS: A/B/C audit samples contain non-empty trace_id/client_build/server_build/executor.
- G1=FAIL: audio_ready_ms_B_p50=9614 (target <= 8000).
- G2=PASS: client probe record_format=mp3, sample_rate=16000, channels=1, ui_feedback_p95_ms=42.
- G3=FAIL: A/B flash ratio=1/1; C path=slow_path_degraded, usable=false, turn_error=1.

## Notes
- C run is confirmed degraded path (`asr_provider_distribution.auc`), but this sample includes timeout/error and is marked not usable.
- queue_wait_before_tts uses corrected rule: valid-only then fallback raw.
