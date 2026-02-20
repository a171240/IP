# WO-R6-CLIENT Window6 Closure Sampling

## Round
- Closure sampling only (no large rerun).
- A/B/C each executed once with `BENCH_ROUNDS=1`.

## Evidence Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-CLIENT/window6/bench_C.json`

## Hard Gate
- record_format=mp3: PASS
- record_sample_rate=16000: PASS
- ui_feedback_p95_ms<=80: PASS (actual=42)
- B/C usable=true: PASS (B=true, C=true)

## B/C Usability
- bench_B.turn_error=0, bench_C.turn_error=0
- bench_B.executor_distribution={"worker":3}
- bench_C.executor_distribution={"worker":3}
- bench_C.asr_provider_distribution={"flash":1}

## Audit Samples
- sample_1: 567a2dd8-3f2b-414a-a794-fcca4953e221|bench-1771605181289|0.1.0|worker
- sample_2: 3b46c4af-98fa-49b7-b9db-fed1f7151bc9|bench-1771605220061|0.1.0|worker
