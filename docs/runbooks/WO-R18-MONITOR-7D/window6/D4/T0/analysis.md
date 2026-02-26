# WO-R18-MONITOR-7D D4/T0 CLIENT (window6)

## Gate
- G0: PASS (record_format=mp3, record_sample_rate=16000, ui_feedback_p95_ms<=80)
- G1: PASS (B.usable=true and turn_error=0)
- G2: PASS (C.usable=true, path_mode=slow_path_degraded, asr_provider_distribution includes auc)
- G3: PASS (A/B/C audit four fields complete, submit_pump=0, events_pump=0, executor_worker_ratio=1)

## Metrics
- B: audio_ready_ms_p95=5410, asr_provider_distribution={"flash":1}, submit_pump_count=0, events_pump_count=0, executor_worker_ratio=1
- C: audio_ready_ms_p95=9461, asr_provider_distribution={"auc":1}, path_mode=slow_path_degraded

