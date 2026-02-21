# WO-R7-OBS Window2

一键执行 A/B/C 三组 bench 并自动产出统一口径 analysis + Gate 判定。

## Command

```bash
/usr/local/bin/node /Users/zhuan/IP项目/ip-content-factory/scripts/run_voicecoach_obs_oneclick.mjs --wo WO-R7-OBS/window2
```

## Outputs

- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/bench_A.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/bench_B.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/bench_C.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/analysis.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/analysis.md`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/run_result.json`
- `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R7-OBS/window2/run_result.md`

## Auto Gates

- `G0`: `missing_required_count_total=0`
- `G1`: 6 阶段 `submit_ack/asr_ready/text_ready/audio_ready/queue_wait_before_main/queue_wait_before_tts` 的 `P50/P95` 完整
- `G2`: 长尾门禁输出（`audio_ready_ms_C_p95`、`queue_wait_before_main_ms_C_p95`、`queue_wait_before_tts_ms_C_p95` 以及 overall queue p95）

## run_result 保底落盘

- 脚本在 `PASS/FAIL/BLOCKED` 以及未捕获异常场景都会写入：
  - `run_result.json`
  - `run_result.md`
