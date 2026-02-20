# WO-R3-ASR Window3 Analysis

- generated_at: 2026-02-20T11:22:37.942Z
- selfcheck_status: FAIL
- selfcheck_error_code: asr_flash_permission_denied
- selfcheck_flash_request_id: 71ea84b4-8994-4bd8-aecf-6da7b6b50918
- selfcheck_flash_logid: 202602201921278F8C5E022192C28F560F

## Metrics
- asr_provider_A: {"auc":3}
- asr_provider_B: {"auc":3,"unknown":2}
- asr_provider_C: {"auc":3,"unknown":4}
- audio_ready_ms_B: p50=14763 p95=14763
- audio_ready_ms_C: p50=15473 p95=25146
- llm_ms: p50=0 p95=0
- tts_ms: p50=0 p95=320
- queue_wait_before_main_ms: p50=1515 p95=12585
- queue_wait_before_tts_ms: p50=592 p95=598
- executor_worker_ratio: 1
- tts_cache_hit_rate: 1
- uploaded_audio_format_distribution: {"mp3":9}
- flash_permission_denied_count: 1

## Audit Samples
- sample_1: 47b87f2a-28eb-4dae-baca-8ff212d94937|bench-1771586273216|0.1.0|worker
- sample_2: f7eaab2b-132b-4cf6-929d-01ea28439a6e|bench-1771586273216|0.1.0|worker

## Gate Notes
- G0: PASS: bench events include trace_id/client_build/server_build/executor; uploaded_audio_format captured in turn.accepted rows.
- G1: PASS: queue_wait_before_main_ms count=4
- G2: PASS: queue_wait_before_tts_ms count=2, tts_ms count=2
- G3: BLOCKED: selfcheck remains FAIL with 403/45000030 (asr_flash_permission_denied), no flash>=95% proof possible before permission grant.

## Evidence Files
- docs/runbooks/WO-R3-ASR/window3/bench_A.json
- docs/runbooks/WO-R3-ASR/window3/bench_B.json
- docs/runbooks/WO-R3-ASR/window3/bench_C.json
- docs/runbooks/WO-R3-ASR/window3/analysis.json
