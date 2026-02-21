# WO-R7-TTS Window5 Analysis

## Scope
- Work Order: `WO-R7-TTS`
- Objective: regression guard only, no TTS strategy/protocol changes.

## Gate Result
- `tts_cache_hit_rate >= 0.95`
  - B: `1`
  - C: `1`
- `tts_ms_p95 <= 350`
  - B: `0`
  - C: `0`
- `queue_wait_before_tts_invalid_rate = 0`
  - B: `0`
  - C: `0`

## Audit
- B `tts_source_distribution`: `{"line_cache":7,"text_cache":0,"runtime":0}`
- C `tts_source_distribution`: `{"line_cache":5,"text_cache":0,"runtime":0}`
- `llm_used_when_script_hit_count`: B=`0`, C=`0`
