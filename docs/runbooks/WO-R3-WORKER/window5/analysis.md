# WO-R3-WORKER Window5 Analysis

## Scope
- Target code:
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
- Evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_A.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_B.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-WORKER/window5/bench_C.json`

## Code updates in this round
- Main-stage queue anchor corrected for retry/requeue:
  - main claim now uses freshest timestamp among `stage_entered_at_ms / updated_at / created_at`.
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`
- Guard against missing heartbeat table causing hot retry cost:
  - disable DB heartbeat writes after detecting `voice_coach_worker_heartbeats` table-missing error.
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
- Stale recover path now avoids extra recover call after queue work has already been processed in the same round.
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/worker.ts`
- TTS seed-path fallback safety:
  - line seed path resolution now uses a safe wrapper to prevent stage crash if export mismatch occurs.
  - file: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`

## Current metrics
- cache coverage:
  - `library_items=50`
  - `tts_cache_rows=99` (`line=49`, `text=50`)
  - script line cover `32/32` (`1.0`)
- B group (latest):
  - `queue_wait_before_main_ms.p50=439`, `p95=439`
  - `script_hit_rate=1.0`
  - `tts_line_cache_hit_rate=1.0`
  - `tts_source_distribution={line_cache:3,text_cache:0,runtime:0}`
  - `llm_used_when_script_hit_count=0`
  - `asr_flash_ratio=1.0`

## Gate result
- G0: PASS
  - A/B/C all provide `audit_samples` with `trace_id/client_build/server_build/executor`.
- G1: PASS
  - `bench_B.queue_wait_before_main_ms.p95=439` (`<=500`).
- G2: PASS
  - `bench_B.queue_wait_before_tts_ms.p95=1776` (`<10000`) and `bench_B.tts_ms.p50=291` (`<2000`).
- G3: PASS
  - `bench_A.asr_flash_selfcheck.status=PASS`, startup gate `require_flash=true` PASS, and `bench_B.asr_flash_ratio=1.0`.

## Notes
- Latest B sample had `round_4:turn_limit_reached`, so queued rounds were `3`; all queued rounds completed and met gate metrics.
