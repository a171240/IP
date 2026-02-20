# WO-R3-SERVER Window5 Analysis

## Scope
- Target window: TTS main chain hardening.
- Target code: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts`

## Code changes (this patch)
- Stable `tts_source` tri-state normalization (`line_cache | text_cache | runtime`):
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:811`
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2143`
- Force no LLM rewrite on fixed script line (`line_id` hit path):
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:1584`
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:1588`
- Round metrics added/emitted:
  - `script_hit_rate`
  - `tts_line_cache_hit_rate`
  - `tts_source_distribution`
  - `llm_used_when_script_hit_count`
  - anchors: `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2148`, `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2150`, `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2152`, `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2153`
- Add `line_id` to `customer.audio_ready` event for per-round script hit attribution:
  - `/Users/zhuan/IP项目/ip-content-factory/lib/voice-coach/jobs.server.ts:2128`

## Evidence files
- bench_A: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-SERVER/window5/bench_A.json`
- bench_B: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-SERVER/window5/bench_B.json`
- bench_C: `/Users/zhuan/IP项目/ip-content-factory/docs/runbooks/WO-R3-SERVER/window5/bench_C.json`

## Gate notes
- G0: PASS
  - `bench_B.audit_samples` contains `trace_id/client_build/server_build/executor`.
- G1: FAIL
  - worker-only sample proven (`executor_worker_ratio_audio=1`), but `queue_wait_before_main_ms.p95=610` still above target 500.
- G2: PASS
  - `queue_wait_before_tts_ms.p95=622 (<10000)` with `tts_ms.p50=293 (<2000)`, no口径冲突。
- G3: BLOCKED
  - `bench_A.asr_flash_selfcheck.status=FAIL` (`asr_flash_permission_denied`, `api_status=45000030`), no Flash 权限，无法产出 `flash>=95%` 实证。
