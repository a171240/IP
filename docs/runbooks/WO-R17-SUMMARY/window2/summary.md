# WO-R17 Summary (window2)

## Objective
- Promote OBS queue main wait (`queue_wait_before_main_ms_p95`) from observation to hard gate and validate no regressions across OBS/WORKER/ASR/TTS/CLIENT.

## Commits
- gate hardening (code): `5bd2e99ae49cac87076a4a470ed305deb0f5d67e`
  - `/Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs`
- WO-R17-OBS evidence: `fd0b922d6e1f4051c78b38fc5fe1e06cd32d258d`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/`
- WO-R17-WORKER evidence: `b2f2daa`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-WORKER/window4/`
- WO-R17-ASR evidence: `98ee03c`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/`
- WO-R17-TTS evidence: `d947e5c`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/`
- WO-R17-CLIENT evidence: `e59bcd7`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-CLIENT/window6/`

## Gate Threshold Delta (R17)
- `G2` now requires: `run_result.status=PASS && C.ok=true && queue_wait_before_main_ms_p95<=500`
- Evidence path:
  - `/Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/run_result.json`

## Window Results

### OBS (window2)
- `status=PASS`
- `G0/G1/G2/G3 = PASS`
- key metrics:
  - `queue_wait_before_main_ms_p95=0`
  - `audio_ready_ms_B_p95=5485`
- evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/run_result.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/analysis.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-OBS/window2/summary.md`

### WORKER (window4)
- `status=PASS`
- `G0/G1/G2/G3 = PASS`
- key metrics:
  - `executor_worker_ratio=1`
  - `submit_pump_count=0`
  - `events_pump_count=0`
  - `queue_wait_before_main_ms_p95=0`
  - `audio_ready_ms_B_p95=4855`
  - `audio_ready_ms_C_p95=5202`
- evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-WORKER/window4/run_result.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-WORKER/window4/analysis.json`

### ASR (window3)
- `overall=PASS`
- `G0/G1/G2/G3 = PASS`
- key metrics:
  - `asr_provider_final_flash_ratio_B=1`
  - `asr_ms_B_p95=655`
  - `asr_provider_attempted_C=["auc"]`
  - `flash_attempt_rounds_C=[]`
- evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/analysis.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/bench_B.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/bench_C.json`
- note:
  - `selfcheck.log` and `startup_gate.log` were generated locally but are ignored by repo rules.

### TTS (window5)
- `overall=PASS`
- `G0/G1/G2/G3 = PASS`
- key metrics:
  - `B.tts_cache_hit_rate=1`, `C.tts_cache_hit_rate=1`
  - `B.tts_ms_p95=0`, `C.tts_ms_p95=0`
  - `queue_wait_before_tts_invalid_rate(B/C)=0`
  - `runtime(B/C)=0`
  - `llm_used_when_script_hit_count(B/C)=0`
- evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/bench_B.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/bench_C.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-TTS/window5/analysis.md`

### CLIENT (window6)
- `status=PASS`
- `G0/G1/G2/G3 = PASS` (oneclick gate set)
- key metrics:
  - `queue_wait_before_main_ms_p95=0`
  - `audio_ready_ms_B_p95=4982`
  - `audio_ready_ms_C_p95=4689`
- evidence:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-CLIENT/window6/run_result.json`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-CLIENT/window6/analysis.json`

## Final Verdict
- `R17 = PASS`
- hard gate is now explicit and enforced in code (`queue_wait_before_main_ms_p95<=500`).
