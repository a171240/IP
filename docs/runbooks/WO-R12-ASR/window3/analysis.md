# WO-R12-ASR / window3

## Scope
- Flash path: 30 rounds (10x3 aggregated)
- AUC path: 30 rounds (10x3 aggregated)

## Gate Summary
- G0 selfcheck/startup_gate: PASS
- G_FLASH_30_STABLE: FAIL
- G_AUC_30_STABLE: PASS
- G_C_NO_FLASH_ATTEMPT_30: PASS

## Key Metrics
- asr_provider_final_flash_ratio_B=0.9667
- asr_ms_B_p50=588, asr_ms_B_p95=689
- asr_ready_ms_C_p50=5436, asr_ready_ms_C_p95=6036
- C flash attempt rounds=0 / 30

## Evidence
- bench_B: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-ASR/window3/bench_B.json
- bench_C: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-ASR/window3/bench_C.json
- analysis: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-ASR/window3/analysis.json
- selfcheck: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-ASR/window3/selfcheck.log
- startup_gate: /Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R12-ASR/window3/startup_gate.log
