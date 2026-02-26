# WO-R18-MONITOR-7D/window4/D4/T6 One-Click Result

- generated_at: 2026-02-26T12:17:49.665Z
- status: FAIL
- head: 94eea64f4a4ec95caa8434b307666759463ed52a
- reason: failed_after_retries

## Gates

## Gate Thresholds
- G0: {"missing_required_count_total":0,"submit_pump_count":0,"events_pump_count":0}
- G1: {"required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"required_quantiles":["p50","p95"]}
- G2: {"run_result_status":"PASS","c_ok":true,"queue_wait_before_main_ms_p95_max":500}
- G3: {"c_long_tail_required_buckets":["timeout_rounds","success_rounds"],"c_long_tail_bucket_required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"c_long_tail_bucket_required_quantiles":["p50","p95"]}

## Long Tail

## C Long-Tail Buckets
- timeout_rounds.count: null
- timeout_rounds.indexes: none
- timeout_rounds.audio_ready_ms_p95: null
- timeout_rounds.queue_wait_before_main_ms_p95: null
- timeout_rounds.queue_wait_before_tts_ms_p95: null
- timeout_rounds.timeout_signal_distribution: {}
- success_rounds.count: null
- success_rounds.indexes: none
- success_rounds.audio_ready_ms_p95: null
- success_rounds.queue_wait_before_main_ms_p95: null
- success_rounds.queue_wait_before_tts_ms_p95: null

## Outputs
- bench_A: ``
- bench_B: ``
- bench_C: ``
- C.json: ``
- analysis.json: ``
- analysis.md: ``
