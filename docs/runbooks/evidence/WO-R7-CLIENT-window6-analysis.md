# WO-R7-CLIENT Window6 Probe Guard

## Scope
- Client closure validation only (single-sample A/B/C).

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-CLIENT/window6/bench_C.json`

## Gate Check
- record_format=mp3: PASS
- record_sample_rate=16000: PASS
- ui_feedback_p95_ms<=80: PASS (actual=42)
- B/C usable=true: PASS (B=true, C=true)

## Audit Samples
- sample_1: 567a2dd8-3f2b-414a-a794-fcca4953e221|bench-1771605181289|0.1.0|worker
- sample_2: 3b46c4af-98fa-49b7-b9db-fed1f7151bc9|bench-1771605220061|0.1.0|worker
