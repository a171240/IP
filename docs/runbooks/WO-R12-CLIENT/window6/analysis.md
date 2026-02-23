# WO-R12-CLIENT Window6 Sampling

## Scope
- One-round real-device sampling + client probe non-regression check.

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-CLIENT/window6/bench_C.json`

## Probe Gate
- record_format=mp3: PASS (actual=mp3)
- record_sample_rate=16000: PASS (actual=16000)
- ui_feedback_p95_ms<=80: PASS (actual=42)
- probe_non_regression_gate: PASS

## Usability
- B usable=true, turn_error=0
- C usable=true, turn_error=0, path_mode=sampling_secondary
- usability_gate(B/C): PASS

## Audit Samples
- sample_1: a55c5e56-b6b5-4109-adb7-cceed27e2dc1|bench-1771812686363|0.1.0|worker
- sample_2: d0ce8d9a-8269-4c67-b563-e85cc9d001c6|bench-1771812703095|0.1.0|worker
