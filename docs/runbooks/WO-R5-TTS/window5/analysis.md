# WO-R5-TTS Window5 Analysis

## Scope
- Work Order: `WO-R5-TTS`
- Action boundary: only cache-hit path verification and `tts_source` audit; no strategy/protocol refactor.

## Hard Gate Check
- Gate `tts_cache_hit_rate >= 0.95`
  - B: `1`
  - C: `1`
- Gate `tts_ms_p95 <= 350`
  - B: `307`
  - C: `0`
- Gate `queue_wait_before_tts_invalid_rate = 0`
  - B: `0`
  - C: `0`

## TTS Source Audit
- B `tts_source_distribution`: `{"line_cache":8,"text_cache":0,"runtime":0}`
- C `tts_source_distribution`: `{"line_cache":7,"text_cache":0,"runtime":0}`
- `llm_used_when_script_hit_count`: B=`0`, C=`0`

## Notes
- C group includes mixed ASR provider in this environment (`flash` + `auc`) due concurrent worker interference, but does not affect R5-TTS hard gates which are TTS-cache/path metrics.
