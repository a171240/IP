# WO-R4-OBS Window2 Analysis

## Scope
- Metrics-calibration and audit rollup only (`scripts/*`, `docs/runbooks/*`).

## Inputs
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-OBS/window2/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-OBS/window2/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-OBS/window2/bench_C.json`

## Stage Metrics (P50/P95, overall)
- submit_ack_ms: 4279/4863
- asr_ready_ms: 18273/130745
- text_ready_ms: 20044/23678
- audio_ready_ms: 21532/25128
- queue_wait_before_main_ms: 7006/120222
- queue_wait_before_tts_ms(valid-only): 594/609

## Group Notes
- A: require_flash=true, pass=false
- B: flash_primary, audio_ready_ms_p50=25128
- C: slow_path_degraded, usable=false

## Gates
- G0: PASS: missing_required_count_total=0, submit_pump_count=0
- G1: FAIL: audio_ready_ms_B_p50=25128 target<=8000
- G2: PASS: stage_metric_fields_complete=true
- G3: FAIL: A_require_flash_pass=false, C_usable=false, C_path_mode=slow_path_degraded
