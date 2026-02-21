# WO-R8-TTS Window5 Analysis

## Scope
- Work Order: `WO-R8-TTS`
- Goal: guard against regression only, no TTS strategy/protocol changes.

## Gate
- `tts_cache_hit_rate >= 0.95`
  - B: `1`
  - C: `1`
- `tts_ms_p95 <= 350`
  - B: `0`
  - C: `0`

## Audit
- B `tts_source_distribution`: `{"line_cache":8,"text_cache":0,"runtime":0}`
- C `tts_source_distribution`: `{"line_cache":8,"text_cache":0,"runtime":0}`
- `queue_wait_before_tts_invalid_rate`: B=`0`, C=`0`
