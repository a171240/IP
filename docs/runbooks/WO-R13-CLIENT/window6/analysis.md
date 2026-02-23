# WO-R13-CLIENT Window6 Sampling

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R13-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R13-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R13-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (A/B/C audit four fields non-empty)

## Audit Samples
- sample_1: 2dfe9e0a-e459-4a10-9e4f-53921f2f8bf9|bench-1771846210549|dev|worker
- sample_2: 2f17d2c0-8a5c-40fb-9a27-93926270f9f1|bench-1771846259030|dev|worker
