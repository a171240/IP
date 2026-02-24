# WO-R17-ASR Analysis (window3)

- generated_at: 2026-02-24T09:04:05.704Z
- overall: PASS

## Gates
- G0: PASS (selfcheck_status=PASS,startup_gate_status=PASS)
- G1: PASS (asr_ready_count_B=3,turn_error_count_B=0,submit_error_count_B=0)
- G2: PASS (asr_provider_final_flash_ratio_B=1,flash_permission_denied_count_B=0,asr_ms_B_p95=655)
- G3: PASS (asr_ready_count_C=3,turn_error_count_C=0,submit_error_count_C=0,asr_provider_attempted_C=["auc"],flash_attempt_rounds=[])

## Key Metrics
- asr_ms_B_p95: 655
- asr_provider_final_flash_ratio_B: 1
- asr_provider_attempted_C: ["auc"]
- flash_attempt_rounds_C: []

## Evidence
- selfcheck: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/selfcheck.log
- startup_gate: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/startup_gate.log
- bench_B: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/bench_B.json
- bench_C: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/bench_C.json
- analysis_json: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R17-ASR/window3/analysis.json
