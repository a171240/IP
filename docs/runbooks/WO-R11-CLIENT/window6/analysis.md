# WO-R11-CLIENT Window6 Sampling

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-CLIENT/window6/bench_C.json`

## Gates
- G0: PASS (record_format=mp3, sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded)
- G3: PASS (audit four fields present in A/B/C samples)

## Audit Samples
- sample_1: 8631d465-870c-4562-8138-65b07b26d2eb|bench-1771812101975|dev|worker
- sample_2: bf79f788-b455-4fde-a28a-b4800f4ed18b|bench-1771812117370|dev|worker
