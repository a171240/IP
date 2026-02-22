# WO-R10-OBS/window2 Analysis

## Scope
- Metrics-calibration and audit rollup only (`scripts/*`, `docs/runbooks/*`).

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R10-OBS/window2/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R10-OBS/window2/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R10-OBS/window2/bench_C.json`

## Hard Gate
- missing_required_count_total=0
- submit_pump_count=0
- events_pump_count=0
- stage_metrics_complete=true
- missing_stage_metrics=none

## Stage Metrics (P50/P95, overall)
- submit_ack_ms: 4453/5972
- asr_ready_ms: 5212/27692
- text_ready_ms: 6387/29369
- audio_ready_ms: 6968/30274
- queue_wait_before_main_ms: 292/22261
- queue_wait_before_tts_ms: 1/2

## Group Notes
- A: require_flash=true, pass=true
- B: flash_primary, audio_ready_ms_p50=6877
- C: slow_path_degraded, usable=true

## C Long-Tail Buckets
- timeout_rounds: count=0, indexes=none
- timeout_rounds(audio_ready_ms): null/null
- timeout_rounds(queue_wait_before_main_ms): null/null
- timeout_rounds(queue_wait_before_tts_ms): null/null
- timeout_signal_distribution: {}
- success_rounds: count=3, indexes=1,2,3
- success_rounds(audio_ready_ms): 6968/9077
- success_rounds(queue_wait_before_main_ms): 292/348
- success_rounds(queue_wait_before_tts_ms): 0/2
- other_rounds: count=0, indexes=none

## Gates
- G0: PASS: missing_required_count_total=0, submit_pump_count=0, events_pump_count=0, stage_metrics_complete=true, missing_stage_metrics=none
- G1: PASS: audio_ready_ms_B_p50=6877 target<=8000
- G2: PASS: stage_metric_fields_complete=true
- G3: PASS: A_require_flash_pass=true, C_usable=true, C_path_mode=slow_path_degraded
