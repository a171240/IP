# WO-R18-MONITOR-7D T12 TTS (window5)

## Gate
- G0: PASS (B/C audit_samples include trace_id|client_build|server_build|executor)
- G1: PASS (B/C tts_cache_hit_rate >= 0.95)
- G2: PASS (B/C tts_ms_p95 <= 350 and queue_wait_before_tts_invalid_rate=0)
- G3: PASS (B/C runtime=0 and llm_used_when_script_hit_count=0)

## Metrics
- B: tts_cache_hit_rate=1, tts_ms_p95=0, queue_wait_before_tts_invalid_rate=0, runtime=0, llm_used_when_script_hit_count=0
- C: tts_cache_hit_rate=1, tts_ms_p95=0, queue_wait_before_tts_invalid_rate=0, runtime=0, llm_used_when_script_hit_count=0

## Bench Tags
- B: wo-r18-t12-tts-b-1771931242358
- C: wo-r18-t12-tts-c-1771931306669
