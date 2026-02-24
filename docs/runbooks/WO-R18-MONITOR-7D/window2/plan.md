# WO-R18-MONITOR-7D Plan (window2)

## Goal
- Keep post-R17 stability under continuous load for 7 days.
- Enforce hard gate introduced in R17: `queue_wait_before_main_ms_p95<=500`.

## Baseline
- code baseline: `5bd2e99ae49cac87076a4a470ed305deb0f5d67e`
- release summary baseline: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-SUMMARY/window2/summary.md`

## Roles
- `window2`: OBS coordinator + summary sealing.
- `window3`: ASR health (`selfcheck + startup_gate`).
- `window4`: WORKER oneclick validation.
- `window5`: TTS cache/runtime validation.
- `window6`: CLIENT end-to-end validation (`T0` + `T24` only).

## Checkpoints (CST, daily)
- `T0`  09:00
- `T6`  15:00
- `T12` 21:00
- `T24` 09:00 (next day)

Run this cycle for 7 days (`D1..D7`).

## Gate Definitions
- OBS/WORKER/CLIENT oneclick:
  - `G0`: `missing_required_count_total=0`, `submit_pump_count=0`, `events_pump_count=0`
  - `G1`: 6-stage `p50/p95` complete
  - `G2`: `run_result.status=PASS && C.ok=true && queue_wait_before_main_ms_p95<=500`
  - `G3`: C long-tail buckets complete
- ASR:
  - `selfcheck PASS`
  - `startup_gate PASS`
  - B path flash stable (no permission denied)
  - C path auc-only (no flash attempt)
- TTS:
  - `tts_cache_hit_rate>=0.95`
  - `tts_ms_p95<=350`
  - `queue_wait_before_tts_invalid_rate=0`
  - `runtime=0`
  - `llm_used_when_script_hit_count=0`

## Standard Commands
### window2 (OBS)
`/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-R18-MONITOR-7D/window2/<checkpoint> --attempts 3 --port 3600`

### window3 (ASR)
1) `VOICE_COACH_REQUIRE_FLASH=true /usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/asr_selfcheck.mjs`
2) `VOICE_COACH_REQUIRE_FLASH=true VOICE_COACH_ASR_STARTUP_GATE=true /usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/with-asr-startup-gate.mjs /usr/bin/true`

### window4 (WORKER)
`/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-R18-MONITOR-7D/window4/<checkpoint> --out-dir /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R18-MONITOR-7D/window4/<checkpoint> --attempts 3 --bench-rounds 3 --port 3610 --bench-timeout-ms 120000 --wait-server-ms 120000`

### window5 (TTS)
- keep existing `.bench_r4_tts_tmp.mjs` flow for B/C and emit `analysis.md`.

### window6 (CLIENT)
- run A/B/C once at `T0` and `T24` only.

## Escalation Rule
- If any checkpoint has `G2 FAIL` due `queue_wait_before_main_ms_p95>500`, mark `SEV-2` and immediately trigger one rerun (`<checkpoint>-R1`).
- If rerun still fails, mark daily verdict `FAIL` and open blocker section in summary.

## Daily Output
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R18-MONITOR-7D/window2/summary.md`
- Must include:
  - per-checkpoint per-window PASS/FAIL
  - key metrics snapshot
  - blocker list
  - daily verdict

## Final Output (D7)
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R18-MONITOR-7D/window2/final.md`
- Include trend comparison vs R17 baseline.
