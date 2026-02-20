# WO-R3-WORKER Window5 Analysis

## Scope
- Target code:
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
- Evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_A.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_B.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_C.json`

## Changes in this patch
- Stabilized `queue_wait_before_main_ms` queue anchor for requeue/retry paths:
  - use freshest of `stage_entered_at_ms / updated_at / created_at` when claiming main stage.
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`
- Reduced worker heartbeat-failure hot-loop impact (failed heartbeat now also updates throttle timestamp):
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
- TTS source + script-hit metrics remain tri-state and enforced:
  - `tts_source_distribution`: `line_cache|text_cache|runtime`
  - `llm_used_when_script_hit_count`

## Current metrics snapshot
- `tts_cache_rows=99`, `tts_cache_line_rows=49`, `tts_cache_text_rows=50`.
- pregen library rows: `library_items=50`.
- script line cover: `32/32`, ratio `1.0`.
- B group main-chain:
  - `script_hit_rate=1.0`
  - `tts_line_cache_hit_rate=1.0`
  - `tts_source_distribution={line_cache:4,text_cache:0,runtime:0}`
  - `llm_used_when_script_hit_count=0`

## Gate result
- G0: PASS
  - A/B/C all include audit samples with `trace_id/client_build/server_build/executor`.
- G1: FAIL
  - `queue_wait_before_main_ms.p95=823` (target `<=500`).
- G2: PASS
  - `queue_wait_before_tts_ms.p95=610` (<10000) and `tts_ms.p50=301` (<2000).
- G3: PASS
  - `bench_A.asr_flash_selfcheck.status=PASS` and startup gate `require_flash=true` PASS.
  - `bench_B.asr_provider.flash=4/4`, `asr_flash_ratio=1.0`.

## Notes
- Flash evidence is now based on latest run (selfcheck + B-group events).
- G1 remains the only hard gate not yet met in this run.
