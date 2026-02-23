# WO-R12-TTS Window5 Analysis

## Scope
- Work Order: `WO-R12-TTS`
- Goal: keep `line_cache=100%` and add exception-replay sample validation.
- Code changes: none required in `lib/voice-coach/jobs.server.ts` for this round.

## Main Validation (B/C)
- B (`/bench_B.json`)
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`
- C (`/bench_C.json`)
  - `tts_source_distribution={"line_cache":8,"text_cache":0,"runtime":0}`
  - `tts_cache_hit_rate=1`
  - `tts_ms.p95=0`
  - `queue_wait_before_tts_invalid_rate=0`

## Exception Replay Validation
- Exception source file: `replay_exception_source.json`
  - includes recent timeout error samples (`status=error`, `last_error` contains "超时") with trace metadata.
- Replay run file: `replay_validation.json`
  - replay bench tag: `wo-r12-tts-replay-1771812944757`
  - includes timeout in replay rounds (`round_2:job_timeout`) as abnormal-path signal.
  - successful replay outputs remain cache-only:
    - `tts_source_distribution={"line_cache":3,"text_cache":0,"runtime":0}`
    - `tts_cache_hit_rate=1`
    - `tts_ms.p95=0`
    - `queue_wait_before_tts_invalid_rate=0`

## Conclusion
- `line_cache` remained 100% for B/C and replay-success samples.
- TTS timing/counter metrics showed no regression on cache-hit path.
