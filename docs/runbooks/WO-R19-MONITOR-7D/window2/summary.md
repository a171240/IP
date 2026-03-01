# WO-R19-MONITOR-7D Daily Summary (window2)

## Baseline
- code baseline: `511589168b622d827750dee3f1fd82dff99df193`
- summary baseline: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R18-MONITOR-7D/window2/summary.md`

## D1 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4227`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`c9ec941d-57f2-42bf-bb2f-c1a1b19cbfe2`, logid=`20260227110140F8CF89FEEEE6751E2138`)
  - startup_gate=`PASS` (request_id=`b2b45975-c7c9-4322-93b8-85e146bb9981`, logid=`20260227110141199A0829A61A1161A297`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4347`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS (oneclick fallback scope)
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4530`, audio_ready_ms_C_p95=`4517`
  - note: C attempt1 had submit_status=500, attempt2 recovered to PASS

## D1 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4457`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`632fce1f-06e0-48d8-a565-d95e4d21fdff`, logid=`20260227111300AEA05807386037AA4D6F`)
  - startup_gate=`PASS` (request_id=`452e2c7b-ab65-4f5c-8c29-b405b4cf5d25`, logid=`20260227111300DC86C5A1469F059FF15A`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4222`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D1 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4468`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`2c54c790-a93c-4384-8482-3d577688cdbe`, logid=`202602271120571502ADC3C9340CE3E7E2`)
  - startup_gate=`PASS` (request_id=`16f80515-c620-45b8-9921-9b5f12889f3f`, logid=`20260227112058B81B4B05B85E30A10B2B`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4375`
  - note: B attempt1 round_2_submit_status=400, attempt2 recovered to PASS
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D1 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4335`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`590c8f3f-4747-46c9-831d-35249e76fc90`, logid=`20260227113001EF3EC88129BD210FBB12`)
  - startup_gate=`PASS` (request_id=`495c20c3-7251-40ba-ba7b-43284bcb34e2`, logid=`20260227113001F210C1B4F2CE31346B07`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4516`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4647`, audio_ready_ms_C_p95=`9178`

## D2 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4245`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`c9e8c5d8-c1c6-4b35-aaa2-7b178a61ba12`, logid=`2026022711441488AAE3D2ECD0F13B2E0B`)
  - startup_gate=`PASS` (request_id=`1faae745-3de5-42b5-a5f7-3d96e9d914ca`, logid=`20260227114415F185796B6120107F6994`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4585`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4397`, audio_ready_ms_C_p95=`8866`

## D2 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4439`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`934d76eb-b6f5-4ff0-b4d3-9620c0d51316`, logid=`20260227115540FF6E0D715397880FEF3D`)
  - startup_gate=`PASS` (request_id=`7a0df4e6-aef0-4986-960f-6bea801e9b34`, logid=`20260227115541B81B4B05B85E30A349EA`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4286`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D2 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4545`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`2e451afb-4199-43e2-bc5e-7a52ab0c93dd`, logid=`2026022712033956DD45750DB9D6AE804D`)
  - startup_gate=`PASS` (request_id=`929a9a98-dd6e-41a6-a776-6129b014100d`, logid=`20260227120340E5398D3D063077F7BC61`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4310`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D2 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4527`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`4c6763ff-976c-49a1-bfaf-ea67e102daa8`, logid=`20260227121148A96177999C0C61EC2E20`)
  - startup_gate=`PASS` (request_id=`5aa981db-c569-482e-a27f-d9dfa70cd3db`, logid=`20260227121148D6EAAFBE0B7058812ACA`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4572`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4640`, audio_ready_ms_C_p95=`9649`

## D3 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4560`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`54e9ea09-49b3-4f2d-b94a-edd7c9929112`, logid=`202602271222211E20856444BF8E3BE32B`)
  - startup_gate=`PASS` (request_id=`fd87b0aa-94f0-4aeb-91dd-4a52df7f00ae`, logid=`20260227122222A116FA3839D864132141`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4483`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4460`, audio_ready_ms_C_p95=`4296`

## D3 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4597`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`436852b4-81da-495d-be75-f01046633722`, logid=`202602271233024F6021327C3F2A1106E0`)
  - startup_gate=`PASS` (request_id=`a3523c03-4321-416f-95c6-430e913c82df`, logid=`202602271233033496EEEE33A3F18542AD`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4711`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D3 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4176`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`7ccb8e8a-bcfe-4643-9fd9-81fd4ba9c2ae`, logid=`20260228102513BD8F55FEBC175CF3E8A8`)
  - startup_gate=`PASS` (request_id=`49cca7b2-6022-4eae-a937-c7f371f95e66`, logid=`202602281025137B2EDDA78CA536121452`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4338`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D3 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4636`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`a45d74d8-7853-4e1a-84fa-3f3506d5c442`, logid=`20260228102823E560939A77F97CEB32E5`)
  - startup_gate=`PASS` (request_id=`c820712d-fd4f-428c-9d7b-df9025ba484a`, logid=`202602281028242CAAD4190257D09429A0`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4543`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4463`, audio_ready_ms_C_p95=`8802`

## D4 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4465`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`753b26d6-8ee0-4b11-9a01-d890a2f3f1f6`, logid=`202602281043409122F62659ACFA52C08A`)
  - startup_gate=`PASS` (request_id=`d7633294-b6ad-47a5-82e3-19d6034280c7`, logid=`20260228104340358D13D33A1D2C667BD1`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4338`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4586`, audio_ready_ms_C_p95=`4235`

## D4 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4491`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`a0bd8f2c-9484-4061-9a06-059b097bb2d8`, logid=`202602281053541636CBEFC28F7FBC1CE0`)
  - startup_gate=`PASS` (request_id=`06652186-4b01-4ef1-b1de-1915545e3f67`, logid=`20260228105354B082FC854DE388817E9A`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4606`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D4 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4640`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`d7c955ab-3a32-40e2-b775-a15303d309d9`, logid=`20260228110138456FCEAC7EDB4EF50D6E`)
  - startup_gate=`PASS` (request_id=`2c7803a3-4312-403c-bab0-0fc69242f605`, logid=`20260228110138C2240CFA7FA55383769F`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`7041`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D4 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4295`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`552574d9-d4ae-48d3-a10a-e5d618429966`, logid=`202602281109208074505FE04DD7FDCB3B`)
  - startup_gate=`PASS` (request_id=`145ebf5d-cd4a-48aa-a3e4-f321dece3499`, logid=`20260228110920C0D1AC91089021C3D0B4`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4320`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4456`, audio_ready_ms_C_p95=`4587`

## D5 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5306`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`f128263b-527d-4834-994c-42a3a4419afb`, logid=`20260228113207274D3D150D3786BB8DB4`)
  - startup_gate=`PASS` (request_id=`1f8d794d-a5f8-4959-a5d0-38b74de1b179`, logid=`202602281132081FDFB557F37014532571`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4470`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4440`, audio_ready_ms_C_p95=`4725`

## D5 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4448`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`5690f609-2f69-467c-9e9c-61300c3b3a8e`, logid=`202602281142143B1CFD873736BD89299C`)
  - startup_gate=`PASS` (request_id=`2fef9683-dd1d-4bfa-9ff1-e87815d5246d`, logid=`2026022811421499C181A8F2627B26BE30`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4932`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D5 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4448`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`7b0b0e64-875d-4aca-8b0a-5bc3ba2e4f66`, logid=`202602281149586A81195F84E468FD1D94`)
  - startup_gate=`PASS` (request_id=`14a80050-0437-4acc-ad4d-5dd903e36208`, logid=`20260228114959BB2554FEA430AF982AD2`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4694`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D5 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5015`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`dc52a373-2e8d-483b-889e-10b0b1a59dcc`, logid=`202602281157521636CBEFC28F7FBF55B7`)
  - startup_gate=`PASS` (request_id=`f2efd5b0-80c7-4c75-ae74-0235cef33759`, logid=`202602281157529BA76AE251DF24B6972E`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4599`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4588`, audio_ready_ms_C_p95=`9548`

## D6 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4613`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`43ac3976-4602-4839-ab20-94528ffbbe8a`, logid=`2026022812111638C787CEBCCEDA232244`)
  - startup_gate=`PASS` (request_id=`0d20f982-c22e-4187-99ea-5448ee85ace8`, logid=`2026022812111615D3FDB77E5094FF796C`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4689`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4522`, audio_ready_ms_C_p95=`4274`

## D6 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4431`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`4e0e87d7-70c6-46ed-b257-6f97bc8b13ca`, logid=`20260228122138D4838C061686E28705D3`)
  - startup_gate=`PASS` (request_id=`c984184e-1a3a-4e19-80fd-528694ea4fd5`, logid=`20260228122138DE5FC5EEA05F275A6DD9`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4244`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D6 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5625`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`9fe970cc-52d7-4516-add3-f05a4dda78f9`, logid=`20260228122922DCBC0D5F0698BB646E2D`)
  - startup_gate=`PASS` (request_id=`a9452523-002c-4c69-b323-81a6ecc93f37`, logid=`202602281229237F58DCBC30C3B5685BA8`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4509`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D6 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4223`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`0c1e7a6b-a00d-4587-a9f7-4dd3a1fe3a78`, logid=`20260228123649678E019368A008583F63`)
  - startup_gate=`PASS` (request_id=`b18c0551-9add-48d0-b484-7f1701970072`, logid=`202602281236490D1A7F4C43FCD5FFA34B`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4507`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4407`, audio_ready_ms_C_p95=`9521`

## D7 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4618`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`ff3ea06a-6f80-40a6-884a-61cdb1f0eda6`, logid=`2026022813095362D9FB784AEAE29CC1A5`)
  - startup_gate=`PASS` (request_id=`5abff6f5-2097-45e0-9ed0-57e348ca2eff`, logid=`202602281309549D12109D9E882A510707`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4304`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4243`, audio_ready_ms_C_p95=`8833`

## D7 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4489`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`6ff321dd-1bc8-4ebb-9f01-393baf33aa0c`, logid=`20260228133301861F2B10B7C472F56FFB`)
  - startup_gate=`PASS` (request_id=`66cbbf2a-2b22-4d6b-9973-e92b14937fa6`, logid=`202602281333020DCAC3BC92586E6A78F8`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4626`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D7 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4738`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`0405a9a2-f0b5-46e9-b5b2-8b1b051ee47f`, logid=`202602281340305CC996D6658A6D35832A`)
  - startup_gate=`PASS` (request_id=`be464703-e850-455d-816f-c8ec47557bff`, logid=`20260228134031BF96C2ADD78B1F60BFCC`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4635`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D7 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4243`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`4fd9e30c-56d3-4813-a4be-df59b7411a1f`, logid=`202602281347567BE0BEEF24C9DDF96B73`)
  - startup_gate=`PASS` (request_id=`e513d75b-07ee-4ce2-a9d6-e410bf98dc8e`, logid=`202602281347576B1C0F62B2172C29AC35`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4616`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4843`, audio_ready_ms_C_p95=`9201`

## D8 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4495`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`1cd84d1e-b238-416c-9792-05111322bcda`, logid=`202603011047460D47331DEE8E1D442FE9`)
  - startup_gate=`PASS` (request_id=`f527cfb1-3126-4a3c-8cf5-2cdd545c152d`, logid=`2026030110474659DD67812EB69C3C255A`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4194`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4457`, audio_ready_ms_C_p95=`4584`

## Upcoming Checkpoints
- D12: SEALED (T0/T6/T12/T24 PASS); next checkpoint D13/T0

## Blockers
- none

## Daily Verdict
- PASS (D1/T0 all required windows PASS; D1 in progress, next checkpoint T6)
- PASS (D1/T6 required windows PASS; D1 in progress, next checkpoint T12)
- PASS (D1/T12 required windows PASS; D1 in progress, next checkpoint T24)
- PASS (D1/T24 required windows PASS; D1 sealed)
- PASS (D2/T0 required windows PASS; D2 in progress, next checkpoint T6)
- PASS (D2/T6 required windows PASS; D2 in progress, next checkpoint T12)
- PASS (D2/T12 required windows PASS; D2 in progress, next checkpoint T24)
- PASS (D2/T24 required windows PASS; D2 sealed)
- PASS (D3/T0 required windows PASS; D3 in progress, next checkpoint T6)
- PASS (D3/T6 required windows PASS; D3 in progress, next checkpoint T12)
- PASS (D3/T12 required windows PASS; D3 in progress, next checkpoint T24)
- PASS (D3/T24 required windows PASS; D3 sealed)
- PASS (D4/T0 required windows PASS; D4 in progress, next checkpoint T6)
- PASS (D4/T6 required windows PASS; D4 in progress, next checkpoint T12)
- PASS (D4/T12 required windows PASS; D4 in progress, next checkpoint T24)
- PASS (D4/T24 required windows PASS; D4 sealed)
- PASS (D5/T0 required windows PASS; D5 in progress, next checkpoint T6)
- PASS (D5/T6 required windows PASS; D5 in progress, next checkpoint T12)
- PASS (D5/T12 required windows PASS; D5 in progress, next checkpoint T24)
- PASS (D5/T24 required windows PASS; D5 sealed)
- PASS (D6/T0 required windows PASS; D6 in progress, next checkpoint T6)
- PASS (D6/T6 required windows PASS; D6 in progress, next checkpoint T12)
- PASS (D6/T12 required windows PASS; D6 in progress, next checkpoint T24)
- PASS (D6/T24 required windows PASS; D6 sealed)
- PASS (D7/T0 required windows PASS; D7 in progress, next checkpoint T6)
- PASS (D7/T6 required windows PASS; D7 in progress, next checkpoint T12)
- PASS (D7/T12 required windows PASS; D7 in progress, next checkpoint T24)
- PASS (D7/T24 required windows PASS; D7 sealed)
- PASS (D8/T0 required windows PASS; D8 in progress, next checkpoint T6)
- PASS (D8/T6 required windows PASS; D8 in progress, next checkpoint T12)
- PASS (D8/T12 required windows PASS; D8 in progress, next checkpoint T24)
- PASS (D8/T24 required windows PASS; D8 sealed)

## D8 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4222`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`d89836d1-a34a-4839-b7aa-7ab0e38cde74`, logid=`2026030111020577416C89782D37EEF6B4`)
  - startup_gate=`PASS` (request_id=`e4806e09-bafc-4fa4-9d6b-24fba8430961`, logid=`20260301110206E742F16A2EB0686C98BA`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4437`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D8 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4414`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`dde097a6-d0fc-420a-954b-b9cc3dc7cc43`, logid=`20260301110955B6F66A7F1B07519B84BC`)
  - startup_gate=`PASS` (request_id=`42dd67be-9b21-4f00-b2ef-f9f98c97d558`, logid=`2026030111095685B0813A5109F61A2258`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4494`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

## D8 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4459`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`55875305-934d-4736-8be4-d3c298e2e389`, logid=`202603011117581DC0AA78ABAC6464AC83`)
  - startup_gate=`PASS` (request_id=`ffc2e81f-ad26-4db5-b88d-26df3525701a`, logid=`20260301111758DAD26C6C1B92E5A128DB`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`7162`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4432`, audio_ready_ms_C_p95=`4259`


## D9 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4354`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`19af595d-a8a5-411b-b36c-539f19df9028`, logid=`20260301113056502EAD9DFDD561D8A383`)
  - startup_gate=`PASS` (request_id=`5e755f87-7baf-425b-ac16-f26fa8bde3f5`, logid=`20260301113057BB46017AA28067F8FA75`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4746`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4406`, audio_ready_ms_C_p95=`4176`

- PASS (D9/T0 required windows PASS; D9 in progress, next checkpoint T6)
## D9 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4407`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`a8fd54ab-60d0-48c2-b12d-954c82734f8d`, logid=`20260301114113E5398D3D0630776B4366`)
  - startup_gate=`PASS` (request_id=`f36d93f9-7f73-470f-9c35-9547064ceaf6`, logid=`20260301114113C83F3542667F676C3383`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4391`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D9/T6 required windows PASS; D9 in progress, next checkpoint T12)
## D9 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4262`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`0fd3b7d5-8e92-4862-a209-d88f17bce036`, logid=`202603011149247B2EDDA78CA536676B1C`)
  - startup_gate=`PASS` (request_id=`201e9e7a-5375-4ce5-a2e5-102482637f4a`, logid=`202603011149252A447452D0934960CE7B`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4239`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D9/T12 required windows PASS; D9 in progress, next checkpoint T24)
## D9 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4268`, audio_ready_ms_C_p95=`10021`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`7e85194e-5b3a-4284-b065-80d70e9d3aac`, logid=`202603011157126798810E67065746BEA8`)
  - startup_gate=`PASS` (request_id=`a55f0b40-d8f4-4642-b16a-c1c505185376`, logid=`2026030111571304132002E09A2B3B3AFE`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4266`, audio_ready_ms_C_p95=`8618`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4469`, audio_ready_ms_C_p95=`9295`

- PASS (D9/T24 required windows PASS; D9 sealed)

## D10 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4523`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`39a233d1-5139-4b2e-9b9d-32b02c932ced`, logid=`20260301121924EE5622C3DADB5576FC0E`)
  - startup_gate=`PASS` (request_id=`124f0eb1-18ba-485d-99ee-2ae3d6ff4698`, logid=`2026030112192463BE72298BA931AD5A14`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4518`, audio_ready_ms_C_p95=`9707`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4212`, audio_ready_ms_C_p95=`4276`

- PASS (D10/T0 required windows PASS; D10 in progress, next checkpoint T6)

## D10 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4423`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`1ba8c95e-d06b-4bea-b857-2c883f82176f`, logid=`20260301122817CF394548D8873BD84780`)
  - startup_gate=`PASS` (request_id=`f40af826-e62d-4888-8e0a-09241d2d8849`, logid=`202603011228186D23E654BE034B427A0F`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4220`, audio_ready_ms_C_p95=`10553`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D10/T6 required windows PASS; D10 in progress, next checkpoint T12)

## D10 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`5362`, audio_ready_ms_C_p95=`9298`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`2cc2a383-08a0-48e6-8c2d-66e47dbf9636`, logid=`2026030112361581308A7516CEF1D92C81`)
  - startup_gate=`PASS` (request_id=`ba1f7ecf-5f68-46fe-bd2f-9b86c56bcb86`, logid=`20260301123615678E019368A008A131D9`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4214`, audio_ready_ms_C_p95=`11818`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D10/T12 required windows PASS; D10 in progress, next checkpoint T24)

## D10 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4524`, audio_ready_ms_C_p95=`9899`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`4df2fc91-ac4a-4a57-ac87-7f69ad7293a3`, logid=`202603011244254C24F45EB3C7E7B15EC4`)
  - startup_gate=`PASS` (request_id=`6465faba-5a9d-4223-bd49-e6abe722d9aa`, logid=`20260301124425FF6E0D71539788A601CF`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4524`, audio_ready_ms_C_p95=`9173`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4173`, audio_ready_ms_C_p95=`4382`

- PASS (D10/T24 required windows PASS; D10 sealed)

## D11 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4615`, audio_ready_ms_C_p95=`4260`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`94ae264d-48c8-40f2-8bf3-5b63ddb3a4ae`, logid=`20260301125628A6C268E76BFDDAD813A9`)
  - startup_gate=`PASS` (request_id=`216fbcfb-3bdb-4a82-aea2-602b7b5bfad0`, logid=`2026030112562938726B46A15B6A23F711`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4502`, audio_ready_ms_C_p95=`9973`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4212`, audio_ready_ms_C_p95=`4296`

- PASS (D11/T0 required windows PASS; D11 in progress, next checkpoint T6)

## D11 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4388`, audio_ready_ms_C_p95=`9509`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`45c77615-377a-4564-8e13-6034681f3c45`, logid=`20260301131417787F83482082267269A2`)
  - startup_gate=`PASS` (request_id=`9c5a9f6b-4e30-456c-ae69-7be132f63647`, logid=`20260301131418787F83482082267269CB`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4190`, audio_ready_ms_C_p95=`10962`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D11/T6 required windows PASS; D11 in progress, next checkpoint T12)

## D11 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4411`, audio_ready_ms_C_p95=`10180`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`a78fecc1-572a-4690-9176-babcc3cf5c83`, logid=`20260301132227E3147DEE1CE8384E58B7`)
  - startup_gate=`PASS` (request_id=`62c05d39-8e5f-4fd3-ae71-62d7bda85fb7`, logid=`20260301132227B50982F12A4CD7656A8A`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4316`, audio_ready_ms_C_p95=`9334`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D11/T12 required windows PASS; D11 in progress, next checkpoint T24)

## D11 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4452`, audio_ready_ms_C_p95=`9399`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`4278e12a-9c0e-43c0-a4c9-cb9ac7cee3e2`, logid=`202603011330291CDAFB84EBE5F98FE70D`)
  - startup_gate=`PASS` (request_id=`f23de3bb-1066-4513-87cf-a09f78c4816d`, logid=`20260301133030BC332D0081B4D5A7A9E8`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4597`, audio_ready_ms_C_p95=`10642`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4244`, audio_ready_ms_C_p95=`4179`

- PASS (D11/T24 required windows PASS; D11 sealed)

## D12 / T0
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4536`, audio_ready_ms_C_p95=`10754`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`97f4e9cf-a4c9-46cf-ba50-a8dda24582d0`, logid=`2026030113404950281A6D50C3BDA5B4AE`)
  - startup_gate=`PASS` (request_id=`96949154-25df-492d-9d8c-cb46c7700467`, logid=`20260301134050890D3D6553A2A5CB424A`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4522`, audio_ready_ms_C_p95=`4336`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4621`, audio_ready_ms_C_p95=`4388`

- PASS (D12/T0 required windows PASS; D12 in progress, next checkpoint T6)

## D12 / T6
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4334`, audio_ready_ms_C_p95=`10527`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`70f6b99a-88ed-4a9c-ad8a-b2031869988d`, logid=`2026030114172687ACB7DBD5EBEC521FE1`)
  - startup_gate=`PASS` (request_id=`f739e84b-3863-447f-b5cf-ee18742f9938`, logid=`20260301141727ACB754AFF4C1624DB465`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4273`, audio_ready_ms_C_p95=`12049`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D12/T6 required windows PASS; D12 in progress, next checkpoint T12)

## D12 / T12
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4429`, audio_ready_ms_C_p95=`4198`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`52bbb2d9-499e-43fe-a905-c3c35b2f0417`, logid=`20260301142542BA023529A2EEFFAF22E1`)
  - startup_gate=`PASS` (request_id=`cec1b874-14bb-48a4-9f9c-db961ba040ba`, logid=`2026030114254298327A1F05093B4DBEEA`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4593`, audio_ready_ms_C_p95=`9057`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: N/A (R19 plan runs CLIENT at T0 + T24 only)

- PASS (D12/T12 required windows PASS; D12 in progress, next checkpoint T24)

## D12 / T24
- window2 OBS: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4310`, audio_ready_ms_C_p95=`11743`
- window3 ASR: PASS
  - selfcheck=`PASS` (request_id=`5518317f-5e2a-494b-9447-be8351f18329`, logid=`20260301143353D078E316FEC252F4672E`)
  - startup_gate=`PASS` (request_id=`cf9d12b0-3e16-4714-8ac2-4ad610f5ce11`, logid=`202603011433547FC01C83172D04668CD6`)
- window4 WORKER: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0` (threshold<=500)
  - audio_ready_ms_B_p95=`4882`, audio_ready_ms_C_p95=`4474`
- window5 TTS: PASS
  - G0/G1/G2/G3=PASS
  - B/C tts_cache_hit_rate=`1`/`1`, tts_ms_p95=`0`/`0`
  - B/C runtime=`0`/`0`, llm_used_when_script_hit_count=`0`/`0`
- window6 CLIENT: PASS
  - run_result.status=`PASS`, G0/G1/G2/G3=PASS
  - queue_wait_before_main_ms_p95=`0`, audio_ready_ms_B_p95=`4674`, audio_ready_ms_C_p95=`8761`

- PASS (D12/T24 required windows PASS; D12 sealed)
