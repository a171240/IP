# WO-R13-OBS/window2 One-Click Result

- status: BLOCKED
- reason: oneclick_process_terminated_externally_before_run_result

## Gate Thresholds
- G0: {"missing_required_count_total":0,"submit_pump_count":0,"events_pump_count":0}
- G1: {"required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"required_quantiles":["p50","p95"]}
- G2: {"run_result_status":"PASS","c_ok":true}
- G3: {"c_long_tail_required_buckets":["timeout_rounds","success_rounds"],"c_long_tail_bucket_required_stage_metrics":["submit_ack_ms","asr_ready_ms","text_ready_ms","audio_ready_ms","queue_wait_before_main_ms","queue_wait_before_tts_ms"],"c_long_tail_bucket_required_quantiles":["p50","p95"]}

## Blocker
- owner: other
- detail: oneclick foreground sessions repeatedly terminated by concurrent external process; see logs/runner.log
