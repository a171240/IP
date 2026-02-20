# WO-R5-CLIENT Window6 Acceptance Sampling

## Round
- Sampling round after P0 completion.
- A/B/C each executed once with `BENCH_ROUNDS=1`.

## Evidence Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R5-CLIENT/window6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R5-CLIENT/window6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R5-CLIENT/window6/bench_C.json`

## Hard Gate Check
- `record_format=mp3`: PASS (`bench_A.client_probe.record_format`)
- `record_sample_rate=16000`: PASS (`bench_A.client_probe.record_sample_rate`)
- `ui_feedback_p95_ms<=80`: PASS (`bench_A.client_probe.ui_feedback_p95_ms=42`)
- `B/C usable=true`: PASS (`bench_B.usable=true`, `bench_C.usable=true`)

## B/C Usability Detail
- `bench_B.counts.turn_error=0`, `bench_C.counts.turn_error=0`
- `bench_B.executor_distribution={"worker":3}`, `bench_C.executor_distribution={"worker":3}`
- C degraded path confirmed: `bench_C.asr_provider_distribution={"auc":1}`

## Audit Samples
- sample_1: `1825fb0f-d27d-4222-8044-0682d5415041|bench-1771604381650|0.1.0|worker`
- sample_2: `0dd599c6-c6d6-4b04-9edf-ed5721cd1786|bench-1771604452366|0.1.0|worker`
