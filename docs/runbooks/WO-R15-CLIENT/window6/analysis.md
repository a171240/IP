# WO-R15-CLIENT Window6 Sampling

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (A/B/C audit four fields + submit_pump/events_pump/executor_worker_ratio)

## Audit Samples
- sample_1: 22c19ace-8758-41f8-b2ae-29a99186dab7|bench-1771908097520|dev|worker
- sample_2: 9cd9f6c3-2164-40b7-b896-061c7fc3f845|bench-1771908152686|dev|worker
