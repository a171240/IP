# WO-R6-OBS/window2 Analysis

## Scope
- Metrics-calibration and audit rollup only (`scripts/*`, `docs/runbooks/*`).

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-OBS/window2/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-OBS/window2/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R6-OBS/window2/bench_C.json`

## Hard Gate
- missing_required_count_total=0
- submit_pump_count=0
- events_pump_count=0
- stage_metrics_complete=true
- missing_stage_metrics=none

## Stage Metrics (P50/P95, overall)
- submit_ack_ms: 4691/5208
- asr_ready_ms: 5137/5490
- text_ready_ms: 6365/6769
- audio_ready_ms: 7276/7558
- queue_wait_before_main_ms: 235/371
- queue_wait_before_tts_ms: 1/1

## Group Notes
- A: require_flash=true, pass=true
- B: flash_primary, audio_ready_ms_p50=6949
- C: slow_path_degraded, usable=true

## Gates
- G0: PASS: missing_required_count_total=0, submit_pump_count=0, events_pump_count=0, stage_metrics_complete=true, missing_stage_metrics=none
- G1: PASS: audio_ready_ms_B_p50=6949 target<=8000
- G2: PASS: stage_metric_fields_complete=true
- G3: PASS: A_require_flash_pass=true, C_usable=true, C_path_mode=slow_path_degraded
