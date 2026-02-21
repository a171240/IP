# WO-R9-CLIENT Window6 Probe Guard

## Scope
- One-round real-device probe guard only.

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R9-CLIENT/window6/bench_A.json`

## Gate
- record_format=mp3: PASS (actual=mp3)
- record_sample_rate=16000: PASS (actual=16000)
- ui_feedback_p95_ms<=80: PASS (actual=42)
- overall_probe_gate: PASS

## Audit Sample
- sample_1: 561c7b7f-70b2-448d-ab35-4648080c654a|bench-1771646544501|dev|worker
- sample_2: 561c7b7f-70b2-448d-ab35-4648080c654a|bench-1771646544501|dev|worker
