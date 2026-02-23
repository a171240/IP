# WO-R12-CLIENT Window6 Sampling (Formal)

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (audit four fields present in A/B/C samples)

## Audit Samples
- sample_1: 153f7ebf-a3e9-40d2-a1aa-6bace007f7fc|bench-1771818044463|dev|worker
- sample_2: 678ffc90-6a73-437d-b225-e1804f55e50e|bench-1771818099958|dev|worker
