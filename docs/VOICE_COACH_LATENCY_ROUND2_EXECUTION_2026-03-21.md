# Voice Coach Latency Round 2 Execution

Date: 2026-03-21

## Scope

This round executed the main actionable parts of [VOICE_COACH_LATENCY_ROUND2_CODEX_TASKS.md](./VOICE_COACH_LATENCY_ROUND2_CODEX_TASKS.md) with DeepSeek V3 selected as the reply and analysis model path.

Current runtime choice:

- Provider: `deepseek`
- Model identifier in API: `deepseek-chat`
- Product choice: DeepSeek V3 non-thinking path

## What Was Implemented

### 1. LLM provider path stayed on DeepSeek V3

Existing multi-provider wiring from Round 1 was kept and validated against the DeepSeek key.

Relevant files:

- `voice-coach-ws/src/config.ts`
- `voice-coach-ws/src/pipeline/orchestrator.ts`
- `voice-coach-ws/scripts/benchmark-llm-latency.ts`

DeepSeek benchmark result used in this round:

- TTFT: about `1319ms`
- Total latency: about `2244ms`
- API model identifier validated: `deepseek-chat`

### 2. Streaming ASR protocol handling was hardened

Two protocol-level fixes were applied in `voice-coach-ws/src/pipeline/streaming-asr.ts`:

- Realtime final frames using flag `0x02` are now accepted when they use the sequence-prefixed layout.
- MP3 ASR requests now advertise `codec: "mp3"` instead of incorrectly sending `codec: "opus"`.

Regression coverage was added in:

- `voice-coach-ws/src/__tests__/streaming-asr.test.ts`

New tests cover:

- Realtime final frame with `flag=0x02`
- MP3 request payload using the correct codec

### 3. E2E latency script was aligned with production input shape

`voice-coach-ws/scripts/e2e-latency-check.mjs` was tightened to reduce divergence from the real mini-program path:

- Generated probe audio now uses `16000 Hz` MP3 instead of `24000 Hz`
- Default chunk size changed from `4096` to `1024`
- Generated audio mode now uses a safer default simulated duration (`3.8s`)
- Generated prompt fallback was normalized so the script can run without an explicit `--prompt-text`

These changes were required because the earlier synthetic path could trigger `streaming_asr_truncated_frame`, while real recorder-produced MP3 passed.

### 4. Measurement tooling now includes P99

`voice-coach-ws/scripts/lib/tooling-utils.mjs` and `voice-coach-ws/scripts/render-latency-report.mjs` were updated so summary output includes:

- `P50`
- `P90`
- `P99`

Rendered report:

- `docs/VOICE_COACH_LATENCY_LATEST.md`

## Parallel Threads

Three parallel review threads were run during this execution.

### Thread A: ASR parser review

Conclusion:

- The parser was too narrow for some Volcengine realtime final frame variants.
- Minimal safe fix was to accept sequence-prefixed final frames with `flag=0x02` under the uncompressed realtime layout.

Status:

- Adopted.

### Thread B: E2E tooling review

Conclusion:

- The synthetic E2E path diverged too far from production.
- Main issues were `24000 Hz` probe audio and overly coarse `4096` byte chunking.

Status:

- Adopted.

### Thread C: Round 2 spec gap review

Conclusion:

- W4 original "play before sealed" acceptance is still not safe under the current `InnerAudioContext + temp mp3` architecture.
- W5 in current code still implements a conservative "less wait after audio.end" path, not the full "trigger LLM during recording" design from the document.
- W6 tooling is now stronger, but the original document and current filenames/acceptance text still drift.

Status:

- Findings recorded.
- No unsafe W4 rewrite was forced into this round.

## Validation

### Build and tests

Executed successfully:

- `cd voice-coach-ws && npm run typecheck`
- `cd voice-coach-ws && npm test`
- `cd voice-coach-ws && npm run build`
- `node --test d:\IP网站\mini-program-ui\utils\audio-stream-player.test.js`

Current result:

- `voice-coach-ws` test files: `7`
- `voice-coach-ws` tests: `30`
- `mini-program-ui` audio player tests: `3`

### Real E2E using stored production MP3

Audio source:

- Bucket: `voice-coach-audio`
- Sample file downloaded from a real beautician turn
- Bytes: `113280`
- Simulated stream length: `5664ms`
- Default chunk size used: `1024`

Command outcome:

- 3 / 3 runs passed

Summary from `voice-coach-ws/.tmp/latency-round2-real-mp3-3runs.json`:

| Metric | P50 | P90 | P99 |
| --- | ---: | ---: | ---: |
| ASR final | 211 ms | 383 ms | 422 ms |
| LLM first token | 1044 ms | 1252 ms | 1299 ms |
| First sentence ready | 1362 ms | 1544 ms | 1584 ms |
| TTS first chunk | 1696 ms | 1886 ms | 1929 ms |
| TTS done | 2581 ms | 2810 ms | 2861 ms |

Threshold status:

- `asrMs <= 1500ms`: PASS
- `llmFirstTokenMs <= 1500ms`: PASS
- `ttsFirstChunkMs <= 2000ms`: PASS

Rendered markdown report:

- `docs/VOICE_COACH_LATENCY_LATEST.md`

### Generated probe mode

Generated-probe mode now also passes with the updated defaults, but it remains less authoritative than the real-recording sample path.

## What Was Not Forced

### W4 unsafe early playback

The original Round 2 document suggested effectively playing sentence audio before `sealed`. That was not forced in this round.

Reason:

- Under the current mini-program playback architecture, that change has a high risk of duplicate playback, sentence tearing, and queue instability.

Current state:

- The safer pre-write / drain-path optimization from the earlier round remains in place.

### Full W5 "trigger during recording"

The current orchestrator still does not start reply generation while the user is actively recording.

Current behavior:

- It uses stable partials to reduce waiting after `audio.end`
- It does not yet run the full reply pipeline during the live recording window

This is a deliberate scope boundary for this round.

## Remaining Risks

1. The Round 2 task doc still overstates W4/W5 completion if judged literally against current code.
2. Generated-probe measurements are useful for smoke checks, but the real MP3 path should remain the source of truth for latency sign-off.
3. Async analysis still lands much later than reply/TTS and is not part of the fast-path latency win.
4. Some docs and script names still drift from the original Round 2 plan.

## Recommended Next Step

If a next optimization round is opened, the highest-value remaining work is:

1. Decide whether to truly implement W5 live partial-trigger semantics, or officially redefine the requirement to the current conservative post-`audio.end` approach.
2. Clean up doc drift so acceptance criteria match the safer implementation path actually being used.
3. If more latency needs to be removed, focus on TTS-first-chunk consistency and connection warming, not prompt micro-optimization.
