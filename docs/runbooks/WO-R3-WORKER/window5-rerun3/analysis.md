# WO-R3-WORKER Window5 Re-run3 Analysis

## Scope
- P0 only: worker claim/poll latency optimization for `queue_wait_before_main_ms`.
- Code changes:
  - `lib/voice-coach/worker.ts`
  - `lib/voice-coach/jobs.server.ts`

## Runtime Mode
- API server: `next start` with
  - `VOICE_COACH_REQUIRE_FLASH=true`
  - `VOICE_COACH_ASR_STARTUP_GATE=true`
  - `VOICE_COACH_SUBMIT_QUEUE_PUMP=force_off`
  - `VOICE_COACH_EVENTS_QUEUE_PUMP=force_off`
- Worker:
  - `executor=worker`
  - heartbeat file: `/tmp/voicecoach_worker_wo_r3_worker.json`
  - idle jitter: `200-500ms`

## Bench Evidence
- A: `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_A.json`
- B: `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_B.json`
- C: `docs/runbooks/WO-R3-WORKER/window5-rerun3/bench_C.json`
- startup selfcheck: `docs/runbooks/WO-R3-WORKER/window5-rerun3/selfcheck.log`
- aggregate: `docs/runbooks/WO-R3-WORKER/window5-rerun3/analysis.json`

## Key Metrics
- `executor_worker_ratio=1.0`
- `submit_pump_count=0`
- `queue_wait_before_main_p95_ms=470`
- `queue_wait_before_main_p50_ms=286`
- `queue_wait_before_tts_p95_ms=616`
- ASR final provider:
  - A: `{"flash":3}`
  - B: `{"flash":3}`
  - C: `{"flash":3}`

## Gates
- G0: PASS (`missing_required_count_total=0`)
- G1: PASS (`queue_wait_before_main_ms_p95=470 <= 500`)
- G2: PASS (`queue_wait_before_tts_ms_p95=616`, `tts_ms_p50=297`)
- G3: PASS (`flash_ratio_B=1`, `flash_ratio_C=1`)
- submit pump guard: PASS (`submit_pump_count=0`)
