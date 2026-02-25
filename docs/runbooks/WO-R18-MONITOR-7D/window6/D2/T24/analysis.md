# WO-R18-MONITOR-7D D2/T24 CLIENT (window6)

## Gate
- G0: PASS (record_format=mp3, record_sample_rate=16000, ui_feedback_p95_ms=42<=80)
- G1: PASS (B usable=true and turn_error=0)
- G2: PASS (C usable=true, path_mode=slow_path_degraded, asr_provider_distribution={"auc":1})
- G3: PASS (A/B/C audit four fields complete, submit_pump_count=0, events_pump_count=0, executor_worker_ratio=1)

## Metrics
- A: asr_provider_distribution={"flash":1}, audio_ready_ms_p95=4607
- B: asr_provider_distribution={"flash":1}, audio_ready_ms_p95=4205
- C: asr_provider_distribution={"auc":1}, audio_ready_ms_p95=12111, path_mode=slow_path_degraded
