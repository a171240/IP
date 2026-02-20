# WO-R3-CLIENT Window6 Analysis

## Scope
- client only
- target files:
  - `mini-program-ui/pages/voice-coach/chat.js`
  - `mini-program-ui/pages/voice-coach/chat.wxml`
  - `mini-program-ui/utils/build.js`

## What changed
- recorder start uses explicit format fallback order: `mp3 -> wav -> aac`.
- recorder params fixed: `sampleRate=16000`, `numberOfChannels=1`.
- upload formData includes `audio_format`, `sample_rate`, `channels`.
- `customer.text_ready` keeps text visible while audio is pending.
- standardized `ui_feedback_ms` output and rolling `ui_feedback_p95_ms`.
- build id source consolidated to `getClientBuild()` from `utils/build.js`.

## Evidence linkage
- bench_A: `docs/runbooks/WO-R3-CLIENT/window6/bench_A.json`
- bench_B: `docs/runbooks/WO-R3-CLIENT/window6/bench_B.json`
- bench_C: `docs/runbooks/WO-R3-CLIENT/window6/bench_C.json`
- flash selfcheck: `docs/runbooks/WO-R3-CLIENT/window6/bench_flash_selfcheck.json`

## Metric-calculation note
- `queue_wait_before_tts_ms` in bench files uses corrected rule:
  - prefer events where `queue_wait_before_tts_valid=true`
  - fallback to raw values only when valid-flag samples are absent
- this avoids mixing stale/null queue timestamps into p95.

## Gate notes
- G0: bench A/B/C each contain event-level audit samples with non-empty `trace_id/client_build/server_build/executor`.
- G1: N/A for client-only window.
- G2: corrected `queue_wait_before_tts_ms` p95 from bench B is within threshold.
- G3: PASS.
  - selfcheck PASS (`http_status=200`, `api_status=20000003`): `bench_flash_selfcheck.json`
  - B组 `asr_flash_ratio=1.0` (`3/3`): `bench_B.json`
