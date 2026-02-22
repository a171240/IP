# WO-R11-OBS/window2 One-Click Result

- generated_at: 2026-02-22T04:22:41.526Z
- status: PASS
- head: e0cda17b7dd34f2e2022d14f2bb74256efa5b99c

## Gates
- G0: PASS (missing_required_count_total=0, submit_pump_count=0, events_pump_count=0)
- G1: PASS (required_stage_metrics_complete=true, missing=none)
- G2: PASS (run_result_status=PASS, A_ok=true, B_ok=true, C_ok=true)
- G3: PASS (c_long_tail_buckets_complete=true, audio_ready_ms_C_p95=7401, queue_wait_before_main_ms_C_p95=55, queue_wait_before_tts_ms_C_p95=1, queue_wait_before_main_ms_p95=253, queue_wait_before_tts_ms_p95=1)

## Long Tail
- audio_ready_ms_C_p95: 7401
- queue_wait_before_main_ms_C_p95: 55
- queue_wait_before_tts_ms_C_p95: 1
- queue_wait_before_main_ms_p95: 253
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
- success_rounds.audio_ready_ms_p95: 7401
- success_rounds.queue_wait_before_main_ms_p95: 55
- success_rounds.queue_wait_before_tts_ms_p95: 1

## Outputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/bench_C.json`
- C.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/C.json`
- analysis.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/analysis.json`
- analysis.md: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R11-OBS/window2/analysis.md`
