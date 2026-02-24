# WO-R18-MONITOR-7D Daily Summary (window2)

## Baseline
- code baseline: `5bd2e99ae49cac87076a4a470ed305deb0f5d67e`
- summary baseline: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-SUMMARY/window2/summary.md`

## D1 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4775`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`5738c6f9-44de-4159-8609-4695cdb4d164`, logid=`20260224183039A1E5BAE22E16954195DE`)
  - startup_gate=`PASS` (request_id=`882c58a6-23ab-45be-9faa-4799fb470509`, logid=`202602241830390AAE5C65B39B1F743E63`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4393`
- window5 TTS: PASS
  - B/C tts_cache_hit_rate=`1`/`1`
  - B/C tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## Upcoming Checkpoints
- D1/T6: PENDING
- D1/T12: PENDING
- D1/T24: PENDING

## Blockers
- NONE

## Daily Verdict
- IN_PROGRESS (D1/T0 all windows PASS)
