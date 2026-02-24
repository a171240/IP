# WO-R15-WORKER/window4 One-Click Result

- generated_at: 2026-02-24T04:14:32.456Z
- status: PASS
- head: 66872f1db53605919e9e047160f2e3b95f9d78c5

## Gates
- G0: PASS (missing_required_count_total=0, submit_pump_count=0, events_pump_count=0)
- G1: PASS (required_stage_metrics_complete=true, missing=none)
- G2: PASS (run_result_status=PASS, C_ok=true)
- G3: PASS (c_long_tail_buckets_complete=true, audio_ready_ms_C_p95=4201, queue_wait_before_main_ms_C_p95=0, queue_wait_before_tts_ms_C_p95=1, queue_wait_before_main_ms_p95=0, queue_wait_before_tts_ms_p95=2)

## Gate Thresholds
- G0: {"missing_required_count_total":0,"submit_pump_count":0,"events_pump_count":0}
- G1: {"required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"required_quantiles":["p50","p95"]}
- G2: {"run_result_status":"PASS","c_ok":true}
- G3: {"c_long_tail_required_buckets":["timeout_rounds","success_rounds"],"c_long_tail_bucket_required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"c_long_tail_bucket_required_quantiles":["p50","p95"]}

## Long Tail
- audio_ready_ms_C_p95: 4201
- queue_wait_before_main_ms_C_p95: 0
- queue_wait_before_tts_ms_C_p95: 1
- queue_wait_before_main_ms_p95: 0
- queue_wait_before_tts_ms_p95: 2
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
- success_rounds.audio_ready_ms_p95: 4201
- success_rounds.queue_wait_before_main_ms_p95: 0
- success_rounds.queue_wait_before_tts_ms_p95: 1

## Outputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/bench_C.json`
- C.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/C.json`
- analysis.json: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/analysis.json`
- analysis.md: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R15-WORKER/window4/analysis.md`
