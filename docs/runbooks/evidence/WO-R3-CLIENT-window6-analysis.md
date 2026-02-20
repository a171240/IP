# WO-R3-CLIENT Window6 Analysis

## Scope
- client only
- target files:
  - `mini-program-ui/pages/voice-coach/chat.js`
  - `mini-program-ui/pages/voice-coach/chat.wxml`
  - `mini-program-ui/utils/build.js`

## What changed
- recorder start now uses explicit format fallback order: `mp3 -> wav -> aac`.
- recorder params fixed: `sampleRate=16000`, `numberOfChannels=1`.
- upload formData now includes `audio_format`, `sample_rate`, `channels`.
- `customer.text_ready` keeps text visible while audio is still pending.
- `ui_feedback_ms` output standardized and rolling `ui_feedback_p95_ms` is emitted.
- build id source consolidated to `getClientBuild()` from `utils/build.js`.

## Evidence linkage
- bench_A: `docs/runbooks/WO-R3-CLIENT/window6/bench_A.json` (client recorder/ui probe)
- bench_B: `docs/runbooks/WO-R3-CLIENT/window6/bench_B.json`
- bench_C: `docs/runbooks/WO-R3-CLIENT/window6/bench_C.json`

## Gate notes
- G0/G2 based on code-path and emitted fields are passable from client patch + bench evidence.
- G1 is worker-queue metric; client window marks it N/A.
- G3 requires integrated end-to-end runbook execution in full environment.
