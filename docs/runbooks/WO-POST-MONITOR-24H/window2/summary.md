# WO-POST-MONITOR-24H-OBS Summary (window2)

## Monitor Scope
- Window: `window2`
- WO-ID: `WO-POST-MONITOR-24H-OBS`
- Baseline at start: `9ab91b4`
- Gate threshold for each checkpoint: `run_result.status=PASS` and `G0=PASS` and `G1=PASS`

## Window2 Oneclick Commands
- `T0`: `/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-POST-MONITOR-24H/window2/T0 --attempts 3 --port 3570`
- `T6`: `/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-POST-MONITOR-24H/window2/T6 --attempts 3 --port 3571`
- `T12`: `/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-POST-MONITOR-24H/window2/T12 --attempts 3 --port 3572`
- `T24`: `/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-POST-MONITOR-24H/window2/T24 --attempts 3 --port 3574`

## Checkpoint Ledger

### T0
- window2:
  - `run_result.status=PASS`
  - `G0=PASS` (`missing_required_count_total=0, submit_pump_count=0, events_pump_count=0`)
  - `G1=PASS` (`required_stage_metrics_complete=true, missing=none`)
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T0/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T0/analysis.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T0/run_result.md`
- window3: `PENDING` (await return)
- window4: `PENDING` (await return)
- window5: `PENDING` (await return)
- window6: `PENDING` (await return)

### T6
- seal_status: `SEALED`
- seal_scope: `OBS + ASR + WORKER + TTS`
- seal_result: `ALL PASS`

- window2 (OBS):
  - `run_result.status=PASS`
  - `G0=PASS` (`missing_required_count_total=0, submit_pump_count=0, events_pump_count=0`)
  - `G1=PASS` (`required_stage_metrics_complete=true, missing=none`)
  - key_threshold_actuals:
    - `audio_ready_ms_B_p50=4507`
    - `queue_wait_before_main_ms_p95=0`
    - `queue_wait_before_tts_ms_p95=2`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T6/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T6/analysis.json`

- window3 (ASR):
  - `selfcheck=PASS`
  - `startup_gate=PASS`
  - key_threshold_actuals:
    - `require_flash=true`
    - `gate_enabled=true`
    - `selfcheck_exit_code=0`
    - `http_status=200`
    - `api_status=20000003`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T6/selfcheck.log`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T6/startup_gate.log`

- window4 (WORKER):
  - `run_result.status=PASS`
  - `G0=PASS` (`missing_required_count_total=0, submit_pump_count=0, events_pump_count=0`)
  - `G1=PASS` (`required_stage_metrics_complete=true, missing=none`)
  - key_threshold_actuals:
    - `executor_worker_ratio=1`
    - `audio_ready_ms_B_p50=4406`
    - `queue_wait_before_main_ms_p95=0`
    - `queue_wait_before_tts_ms_p95=2`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T6/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T6/analysis.json`

- window5 (TTS):
  - checkpoint: `20260224T210000`
  - `G0=PASS`
  - `G1=PASS`
  - `G2=PASS`
  - `G3=PASS`
  - key_threshold_actuals:
    - `tts_cache_hit_rate(B)=1`
    - `tts_cache_hit_rate(C)=1`
    - `tts_ms_p95(B)=0`
    - `tts_ms_p95(C)=0`
    - `queue_wait_before_tts_invalid_rate(B)=0`
    - `queue_wait_before_tts_invalid_rate(C)=0`
    - `runtime(B/C)=0`
    - `llm_used_when_script_hit_count(B/C)=0`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260224T210000/analysis.md`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260224T210000/bench_B.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260224T210000/bench_C.json`

- window6: `PENDING` (not in T6 seal scope)

Note: `T7 (ASR) PASS, informational only`.

### T12
- seal_status: `SEALED`
- seal_scope: `OBS + ASR + WORKER + TTS`
- seal_result: `ALL PASS`
- window2 (OBS):
  - `run_result.status=PASS`
  - `G0=PASS` (`missing_required_count_total=0, submit_pump_count=0, events_pump_count=0`)
  - `G1=PASS` (`required_stage_metrics_complete=true, missing=none`)
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T12/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T12/analysis.json`
- window3 (ASR):
  - `selfcheck=PASS`
  - `startup_gate=PASS`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T12/selfcheck.log`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T12/startup_gate.log`
- window4 (WORKER):
  - `run_result.status=PASS`
  - key_threshold_actuals:
    - `executor_worker_ratio=1`
    - `submit_pump_count=0`
    - `events_pump_count=0`
    - `queue_wait_before_main_ms_p95=0`
    - `audio_ready_ms_B_p95=4831`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T12/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T12/analysis.json`
- window5 (TTS):
  - checkpoint: `20260225T030000`
  - `G0=PASS`
  - `G1=PASS`
  - `G2=PASS`
  - `G3=PASS`
  - key_threshold_actuals:
    - `tts_cache_hit_rate(B/C)=1`
    - `tts_ms_p95(B/C)=0`
    - `queue_wait_before_tts_invalid_rate(B/C)=0`
    - `runtime(B/C)=0`
    - `llm_used_when_script_hit_count(B/C)=0`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T030000/analysis.md`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T030000/bench_B.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T030000/bench_C.json`
- window6: `N/A` (not in T12 execution scope)

### T24
- seal_status: `SEALED`
- seal_scope: `OBS + ASR + WORKER + TTS + CLIENT`
- seal_result: `ALL PASS`
- window2 (OBS):
  - `run_result.status=PASS`
  - `G0=PASS` (`missing_required_count_total=0, submit_pump_count=0, events_pump_count=0`)
  - `G1=PASS` (`required_stage_metrics_complete=true, missing=none`)
  - key_threshold_actuals:
    - `audio_ready_ms_B_p50=7546`
    - `audio_ready_ms_C_p95=5705`
    - `queue_wait_before_main_ms_p95=6570` (observation only; not a fail condition for OBS monitor gate)
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T24/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window2/T24/analysis.json`
- window3 (ASR):
  - `selfcheck=PASS`
  - `startup_gate=PASS`
  - key_threshold_actuals:
    - `require_flash=true`
    - `gate_enabled=true`
    - `selfcheck_exit_code=0`
    - `http_status=200`
    - `api_status=20000003`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T24/selfcheck.log`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window3/T24/startup_gate.log`
- window4 (WORKER):
  - `run_result.status=PASS`
  - key_threshold_actuals:
    - `executor_worker_ratio=1`
    - `submit_pump_count=0`
    - `events_pump_count=0`
    - `queue_wait_before_main_ms_p95=0`
    - `audio_ready_ms_B_p95=5137`
    - `audio_ready_ms_C_p95=5103`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T24/run_result.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H/window4/T24/analysis.json`
- window5 (TTS):
  - checkpoint: `20260225T150000`
  - `G0=PASS`
  - `G1=PASS`
  - `G2=PASS`
  - `G3=PASS`
  - key_threshold_actuals:
    - `tts_cache_hit_rate(B/C)=1`
    - `tts_ms_p95(B/C)=0`
    - `queue_wait_before_tts_invalid_rate(B/C)=0`
    - `runtime(B/C)=0`
    - `llm_used_when_script_hit_count(B/C)=0`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T150000/analysis.md`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T150000/bench_B.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-TTS/window5/20260225T150000/bench_C.json`
- window6 (CLIENT):
  - `G0=PASS`
  - `G1=PASS`
  - `G2=PASS`
  - `G3=PASS`
  - key_threshold_actuals:
    - `B.usable=true`
    - `B.turn_error=0`
    - `B.audio_ready_ms_p95=5664`
    - `C.usable=true`
    - `C.turn_error=0`
    - `C.path_mode=slow_path_degraded`
    - `C.audio_ready_ms_p95=9945`
  - evidence:
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-CLIENT/window6/T24/analysis.md`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-CLIENT/window6/T24/bench_A.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-CLIENT/window6/T24/bench_B.json`
    - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-POST-MONITOR-24H-CLIENT/window6/T24/bench_C.json`

## 24H Overall Verdict
- verdict: `FINAL PASS` (24H monitor)
- basis:
  - `T6` sealed: `OBS + ASR + WORKER + TTS = ALL PASS`.
  - `T12` sealed: `OBS + ASR + WORKER + TTS = ALL PASS`.
  - `T24` sealed: `OBS + ASR + WORKER + TTS + CLIENT = ALL PASS`.
  - `T24` observation: `queue_wait_before_main_ms_p95=6570` on OBS track; this did not break configured monitor gates but should stay on watch.
