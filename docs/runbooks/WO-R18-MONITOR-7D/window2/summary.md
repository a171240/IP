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


## D1 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4816`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`f7ea29f2-fc64-4d54-89fd-d508ae59146f`, logid=`20260224185633C5331F22E0E373532B98`)
  - startup_gate=`PASS` (request_id=`5ff27d6f-71de-4240-bab1-86b92e6deb0a`, logid=`202602241856345B75135AEDDEAD5193BF`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4539`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)


## D1 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4481`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`2d7002b9-d7a5-44ca-8999-397cdecd02e0`, logid=`20260224190451CBB1ECC6B7E21355DFF1`)
  - startup_gate=`PASS` (request_id=`8e160fe6-caa6-4355-877a-04e7f791a86d`, logid=`20260224190452A24E2AB364D67DD30AA7`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4422`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)


## D1 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4383`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`395fa042-00a9-4ed6-9ee1-5becf08197fb`, logid=`20260224191241B28965CDD6682167179E`)
  - startup_gate=`PASS` (request_id=`ce44ffda-0a61-4fb4-ba57-7fdb8ebc7864`, logid=`20260224191241B084A1B15EEBBA4FAFE0`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4702`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D2 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4458`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`ce9068d0-68ac-429c-bc2b-d0b180b73793`, logid=`202602241926289E0AE56404C712564476`)
  - startup_gate=`PASS` (request_id=`ab3599a8-365e-4cad-bc86-c92e60de92fd`, logid=`20260224192629A8C0736FAB2E44E75B4E`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4473`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D2 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4523`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`fdd9750f-92ca-4b46-adcf-a251a9cc7c56`, logid=`20260224195724A5C29172102EEBE3FA07`)
  - startup_gate=`PASS` (request_id=`1d557c75-7b1f-44d2-aff4-25f2af362687`, logid=`2026022419572508E1A66CCCDB4A76D1DD`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4560`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D2 / T12
- window2 OBS: PASS (after rerun)
  - T12 first run: `FAIL` on G2 (`queue_wait_before_main_ms_p95=913` > 500)
  - T12-R1 rerun: `PASS`, `queue_wait_before_main_ms_p95=0`, `run_result.status=PASS`
  - classification: `SEV-2 transient` (spike not reproduced on immediate rerun)
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`86985c8a-54ef-4eea-91dd-749fbff245b6`, logid=`20260225192850B25B8ED83A7EDDA22E58`)
  - startup_gate=`PASS` (request_id=`ea59acfa-203c-494e-8678-af26222c8bee`, logid=`202602251928502DDFE15BA1ADA3208B05`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4551`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D2 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4887`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`d141a270-07da-40ee-94dc-8e55493d6774`, logid=`20260225193721A58A227D55F9F1B7E4C1`)
  - startup_gate=`PASS` (request_id=`a7996d89-babd-41b4-83b0-b1afd3b8a745`, logid=`20260225193722691C521D384C3F9FB680`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4786`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D3 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5313`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`ae04dcfd-2cec-415d-9d00-839b6a7d28c8`, logid=`202602261815106C361059FE7CED823558`)
  - startup_gate=`PASS` (request_id=`293d7a7b-5718-46ce-9427-a9ff5158a9dc`, logid=`202602261815101D7B3CDD0B515FDC5777`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5146`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D3 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5571`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`f36eafc2-9b1d-45a5-ae4b-fb19ccc9bb5b`, logid=`202602261845233A595BC0C609D470B768`)
  - startup_gate=`PASS` (request_id=`7fa359b9-4ee7-4a61-a1bd-4f967201cc04`, logid=`202602261845256C396AE096D061D40B88`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5507`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D3 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5380`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`f5092106-2e16-4522-a581-07adc3bbebd9`, logid=`2026022618555243E9DDFBF0EF5BE384A7`)
  - startup_gate=`PASS` (request_id=`b90c11af-3e2c-4d73-809a-b31276bbbde2`, logid=`20260226185553C5AE703921E1CD762706`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5256`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D3 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5463`
  - note: A/B had transient retries (`A attempts=2`, `B attempts=3`) and converged
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`f9e70ef0-0010-4b5b-b29a-8f9cd9d148fb`, logid=`20260226190937F1F1638A7AD40B7F5FDE`)
  - startup_gate=`PASS` (request_id=`33b15f68-39ef-4560-864a-f76b7e356e63`, logid=`2026022619094019DF98159C000978BD48`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5599`
  - note: A had one transient `server_not_ready` and recovered on retry
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
  - note: C first run `fetch failed`, R1 rerun PASS
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D4 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4631`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`6c1833fb-70c6-4c8c-8594-979f2949a7be`, logid=`20260226192544DEE65811D09867EB2E7B`)
  - startup_gate=`PASS` (request_id=`990e44d2-d9c6-4fa1-b2ea-4596204d5055`, logid=`202602261925457E6516D9852AC06E573F`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5205`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - G0=PASS (record_format=`mp3`, record_sample_rate=`16000`, ui_feedback_p95_ms=`42`)
  - G1=PASS (B.usable=`true`, turn_error=`0`)
  - G2=PASS (C.path_mode=`slow_path_degraded`, asr_provider_distribution=`{"auc":1}`)
  - G3=PASS (submit_pump_count=`0`, events_pump_count=`0`, executor_worker_ratio=`1`)

## D4 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4826`
  - note: A/B had in-run retries (`A attempts=3`, `B attempts=2`) and converged
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`5678a1bb-12d0-4a5a-99da-c5347a8bf821`, logid=`20260226201402E742F16A2EB068A112DE`)
  - startup_gate=`PASS` (request_id=`f9575f31-3809-41a2-b391-f6fe736565df`, logid=`2026022620140322C9536369AF1CCEFB41`)
- window4 WORKER: PASS (after rerun)
  - T6 first run: `FAIL` on group A (`failed_after_retries`, flash_required_not_met/missing_asr_ready)
  - T6-R1 rerun: `PASS`, run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5313`
  - classification: `transient`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D4 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5065`
  - note: A/B had in-run retries (`A attempts=2`, `B attempts=2`) and converged
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`22f88dce-f006-439a-a112-43a433ebea33`, logid=`202602262033125B513BFD341952C923CE`)
  - startup_gate=`PASS` (request_id=`ec1e2c9f-4bc6-488b-b4df-2561ccaced3d`, logid=`20260226203343678E019368A008E2C9C3`)
- window4 WORKER: PASS (after rerun)
  - T12 first run: `FAIL` on group B (`failed_after_retries`, missing_asr_ready)
  - T12-R1 rerun: `PASS`, run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5451`
  - classification: `transient`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R18 plan runs CLIENT at T0 + T24 only)

## D4 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5469`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`2193d898-45c9-4044-8255-8011c3791d8b`, logid=`20260226204927BC91FD4C4FA1F0DDC1A2`)
  - startup_gate=`PASS` (request_id=`a3507804-7dc0-436f-b7f4-e1dd35af6aff`, logid=`2026022620492738726B46A15B6A5C35BA`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4903`
  - note: B had one transient `ECONNRESET` and recovered on attempt 2
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: FAIL
  - G0=PASS, G1=PASS, G3=PASS
  - G2=FAIL (`C.path_mode=slow_path_degraded` but `asr_provider_distribution={"flash":1}`; expected auc)
  - note: C was rerun under isolated `require_flash=false` / `asr_enable_flash=false`, but provider remained `flash`

## Upcoming Checkpoints
- D5/T0: BLOCKED (wait for CLIENT C-path auc regression fix)

## Blockers
- D4/T24 CLIENT G2 fail: window6 C-path remains `flash` instead of expected `auc` under degraded-mode runbook conditions.

## Daily Verdict
- PASS (D1/T0,T6,T12,T24 all required windows PASS; D1 sealed)
- PASS (D2/T0,T6,T12,T24 all required windows PASS; D2 sealed, T12 transient recovered by T12-R1)
- PASS (D3/T0,T6,T12,T24 all required windows PASS; D3 sealed with transient retries recovered in-run)
- BLOCKED (D4/T0,T6,T12 PASS; D4/T24 blocked by CLIENT G2 fail on C-path provider)
