# WO-R17-TTS Analysis (window5)

- overall: PASS

## Gate Result
- G0: PASS (B/C audit samples include trace_id|client_build|server_build|executor)
- G1: PASS (tts_cache_hit_rate B=1, C=1)
- G2: PASS (tts_ms_p95 B=0, C=0; invalid_rate B=0, C=0)
- G3: PASS (runtime B=0, C=0; llm_used_when_script_hit_count B=0, C=0)

## Metrics
- B.tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}
- C.tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}
- B.asr_provider={"flash":8}
- C.asr_provider={"auc":7,"flash":1}

## Evidence
- /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/bench_B.json
- /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/bench_C.json
