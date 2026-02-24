# WO-R16-CLIENT Window6 Sampling

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R16-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R16-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R16-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (A/B/C audit four fields + submit_pump/events_pump/executor_worker_ratio)

## Audit Samples
- sample_1: 86d123f3-43e7-49ee-bf16-2075dd20d2e6|bench-1771911480226|dev|worker
- sample_2: 97997e8f-1be0-4b83-b025-8d285f610158|bench-1771911531269|dev|worker
