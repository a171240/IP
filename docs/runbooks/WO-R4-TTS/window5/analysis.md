# WO-R4-TTS Window5 Analysis

## Scope
- Work Order: `WO-R4-TTS`
- Focus: Improve TTS cache hit path and script-line direct output stability without protocol changes.

## Baseline Check
- Baseline commit pinned: `d08f1fee97138079f6a0080a77e8ae0aaa18f2b8`
- Verification:
  - `git cat-file -t d08f1fee97138079f6a0080a77e8ae0aaa18f2b8` => `commit`
  - `git merge-base --is-ancestor d08f1fee97138079f6a0080a77e8ae0aaa18f2b8 HEAD` => `0`

## A/B/C Evidence Summary
- A (`VOICE_COACH_REQUIRE_FLASH=true`): startup gate PASS + selfcheck PASS.
- B (Flash main path):
  - `tts_cache_hit_rate=1`
  - `tts_line_cache_hit_rate=1`
  - `tts_ms.p50=0`, `tts_ms.p95=319`
  - `llm_used_when_script_hit_count=0`
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
- C (degraded slow path, `VOICE_COACH_REQUIRE_FLASH=false` + Flash disabled):
  - `asr_provider_final={"auc":5}`
  - `tts_cache_hit_rate=1`
  - `tts_line_cache_hit_rate=1`
  - `tts_ms.p50=0`, `tts_ms.p95=0`
  - `llm_used_when_script_hit_count=0`
  - `tts_source_distribution={"line_cache":5,"text_cache":0,"runtime":0}`

## Gate Decision (WO-R4-TTS)
- Gate `tts_cache_hit_rate >= 0.95` on B/C: PASS (B=1, C=1)
- Gate `tts_ms_p50 <= 280`: PASS (B=0, C=0)
- Gate `tts_ms_p95 <= 450`: PASS (B=319, C=0)
- Gate `llm_used_when_script_hit_count = 0`: PASS (B=0, C=0)

## Notes
- `tts_source` is emitted as one of `line_cache | text_cache | runtime` only.
- When script line is hit, `llm_used=false` is enforced and validated by `llm_used_when_script_hit_count=0`.
- C group is intentionally a slow path; `audio_ready_ms` is significantly higher than B due to non-Flash ASR.
