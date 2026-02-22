# WO-R11-WORKER/window4-r6 One-Click Result

- generated_at: 2026-02-22T14:43:46.117Z
- status: PASS
- head: 14e1ca7b9e57e24071c57315900e6fc9737dbb33

## Gates
- G0: PASS (missing_required_count_total=0, submit_pump_count=0, events_pump_count=0)
- G1: PASS (required_stage_metrics_complete=true, missing=none)
- G2: PASS (run_result_status=PASS, A_ok=true, B_ok=true, C_ok=true)
- G3: PASS (c_long_tail_buckets_complete=true, audio_ready_ms_C_p95=7679, queue_wait_before_main_ms_C_p95=0, queue_wait_before_tts_ms_C_p95=1, queue_wait_before_main_ms_p95=0, queue_wait_before_tts_ms_p95=1)

## Long Tail
- audio_ready_ms_C_p95: 7679
- queue_wait_before_main_ms_C_p95: 0
- queue_wait_before_tts_ms_C_p95: 1
- queue_wait_before_main_ms_p95: 0
- queue_wait_before_tts_ms_p95: 1
- c_timeout_round_count: 0
- c_success_round_count: 3

## C Long-Tail Buckets
- timeout_rounds.count: 0
- timeout_rounds.indexes: none
- timeout_rounds.audio_ready_ms_p95: null
- timeout_rounds.queue_wait_before_main_ms_p95: null
- timeout_rounds.queue_wait_before_tts_ms_p95: null
- timeout_rounds.timeout_signal_distribution: {}
- success_rounds.count: 3
- success_rounds.indexes: 1,2,3
- success_rounds.audio_ready_ms_p95: 7679
- success_rounds.queue_wait_before_main_ms_p95: 0
- success_rounds.queue_wait_before_tts_ms_p95: 1

## Outputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/bench_C.json`
- C.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/C.json`
- analysis.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/analysis.json`
- analysis.md: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-WORKER/window4-r6/analysis.md`
