# WO-R8-CLIENT Window6 Probe Guard

## Scope
- 1-round real-device probe guard check (A/B/C single sample).

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R8-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R8-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R8-CLIENT/window6/bench_C.json`

## Gate Check
- record_format=mp3: PASS
- record_sample_rate=16000: PASS
- ui_feedback_p95_ms<=80: PASS (actual=42)
- B/C usable=true: PASS (B=true, C=true)

## Audit Samples
- sample_1: 1c321028-e293-4f46-9d9c-745ea0537fb3|bench-1771645599938|dev|worker
- sample_2: e0a9489f-4a11-41da-be62-4b0028941abe|bench-1771645633574|dev|worker
