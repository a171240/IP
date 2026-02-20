# WO-R4-CLIENT Window6 Analysis

## Scope
- client validation rerun (no business code change)
- worker-only clean run; submit_pump contamination removed

## Input Raw Files
- A: /tmp/voicecoach_e2e_1771597400658.json
- B(best of 8 retries, worker-only): /tmp/voicecoach_e2e_1771600616283.json
- C(pass sample, worker-only auc): /tmp/voicecoach_e2e_1771600266577.json

## Gate Result
- G0=PASS: audit four fields present in A/B/C samples.
- G1=FAIL: audio_ready_ms_B_p50=8626 (target <= 8000).
- G2=PASS: record_format=mp3, sample_rate=16000, channels=1, ui_feedback_p95_ms=42.
- G3=PASS: C slow path usable=true, turn_error=0, asr_provider={"auc":3}.

## Retry Evidence
- B worker-only retries p50(ms): 9885, 9996, 9333, 9185, 8760, 8626, 9230, 8931; best=8626 (>8000).
- C worker-only after restarting worker with flash=false: usable=true, turn_error=0, asr_provider=auc.

## Retry Evidence (2026-02-20, G1-only rerun)
- B worker-only retries p50(ms): 10055, 9833, 9283, 9800, 9659, 9052, 9483, 9742, 9485, 9234, 9247, 9109.
- B rerun best sample: `/tmp/voicecoach_e2e_1771601406706.json` (`p50=9052`, `p95=9318`, flash_ratio=1.0, executor=worker-only).
- B rerun logs:
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_1.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_2.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_3.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_4.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_5.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_6.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_7.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_8.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_9.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_10.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_11.run.log`
  - `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R4-CLIENT/window6/bench_B.rerun_12.run.log`

## Notes
- executor cleaned to worker-only for B/C (submit_pump_count=0, events_pump_count=0).
- Remaining fail item is G1 latency threshold.
