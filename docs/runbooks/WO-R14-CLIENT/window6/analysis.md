# WO-R14-CLIENT Window6 Sampling

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R14-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R14-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R14-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (A/B/C audit four fields + submit_pump/events_pump/executor_worker_ratio)

## Audit Samples
- sample_1: 2815117b-75cd-449e-9636-6314bae3058d|bench-1771853673720|dev|worker
- sample_2: 97fb0617-75dd-4ce3-a75f-9f9502d82cc6|bench-1771853722972|dev|worker
