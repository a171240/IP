# WO-R17-OBS Summary (window2)

## Scope
- WO-ID: `WO-R17-OBS`
- Window: `window2`
- Base head: `5bd2e99`
- Command:
  - `/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-R17-OBS/window2 --attempts 6 --port 3562`

## Gate Thresholds (R17+)
- `G0`: `missing_required_count_total=0`, `submit_pump_count=0`, `events_pump_count=0`
- `G1`: 6-stage `p50/p95` complete
- `G2`: `run_result.status=PASS` and `C.ok=true` and `queue_wait_before_main_ms_p95<=500`
- `G3`: C long-tail buckets complete (`timeout_rounds/success_rounds` with required stage metrics)

## Result
- overall: `PASS`
- `G0=PASS`
- `G1=PASS`
- `G2=PASS` (`queue_wait_before_main_ms_p95=0`, threshold `<=500`)
- `G3=PASS`

## Key Metrics
- `audio_ready_ms_B_p50=5115`
- `audio_ready_ms_B_p95=5485`
- `audio_ready_ms_C_p50=4575`
- `audio_ready_ms_C_p95=5174`
- `queue_wait_before_main_ms_p95=0`
- `queue_wait_before_tts_ms_p95=2`
- `executor_worker_ratio=1`
- `submit_pump_count=0`
- `events_pump_count=0`

## Evidence Files
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/bench_A.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/bench_B.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/bench_C.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/C.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/analysis.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/analysis.md`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/run_result.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/run_result.md`
