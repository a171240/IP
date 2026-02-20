# WO-R6-TTS Window5 Analysis

## Scope
- Work Order: `WO-R6-TTS`
- Action: regression-proof evidence only (cache-hit path + tts_source audit), no strategy change.

## Hard Gate
- `tts_cache_hit_rate >= 0.95`
  - B: `1`
  - C: `1`
- `tts_ms_p95 <= 350`
  - B: `0`
  - C: `0`
- Guard metric: `queue_wait_before_tts_invalid_rate`
  - B: `0`
  - C: `0`

## Audit
- B `tts_source_distribution`: `{"line_cache":8,"text_cache":0,"runtime":0}`
- C `tts_source_distribution`: `{"line_cache":8,"text_cache":0,"runtime":0}`
- `llm_used_when_script_hit_count`: B=`0`, C=`0`
