# WO-R18-MONITOR-7D T0 CLIENT (window6)

## Gate
- G0: PASS (record_format=mp3, record_sample_rate=16000, ui_feedback_p95_ms=42)
- G1: PASS (B.usable=true, B.turn_error=0)
- G2: PASS (C.usable=true, C.path_mode=slow_path_degraded, C.asr_provider_distribution={"auc":1})
- G3: PASS (audit 4-fields complete, submit_pump_count=0, events_pump_count=0, executor_worker_ratio=1)

## Metrics
- B: asr_provider_distribution={"flash":1}, audio_ready_ms_p50=7181, audio_ready_ms_p95=7181, queue_wait_before_main_ms_p95=0, queue_wait_before_tts_invalid_rate=0
- C: asr_provider_distribution={"auc":1}, audio_ready_ms_p50=11470, audio_ready_ms_p95=11470, queue_wait_before_main_ms_p95=0, queue_wait_before_tts_invalid_rate=0
