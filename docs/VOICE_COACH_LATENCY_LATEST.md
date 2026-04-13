# Voice Coach Latency Report

Generated: 2026-03-21T03:09:03.978Z
Source: `D:\IP网站\voice-coach-ws\.tmp\latency-round2-real-mp3-3runs.json`

## Config

- Runs: 3
- WS URL: ws://127.0.0.1:8080/ws/voice-coach
- App URL: https://ip.ipgongchang.xin
- Scenario: objection_safety
- Audio source: D:\IP网站\voice-coach-ws\.tmp\aa0f1f33-dd7e-4b44-a473-a530dede5d08.mp3
- Audio bytes: 113280
- Simulated stream: 5664 ms

## Thresholds

| Metric | P90 | Limit | Status |
| --- | ---: | ---: | --- |
| asrMs | 383 ms | 1500 ms | PASS |
| llmFirstTokenMs | 1252 ms | 1500 ms | PASS |
| ttsFirstChunkMs | 1886 ms | 2000 ms | PASS |

## Summary

| Metric | Samples | Min | P50 | P90 | P99 | Max | Avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| asrMs | 3 | 146 ms | 211 ms | 383 ms | 422 ms | 426 ms | 261 ms |
| llmFirstTokenMs | 3 | 775 ms | 1044 ms | 1252 ms | 1299 ms | 1304 ms | 1041 ms |
| firstSentenceMs | 3 | 1159 ms | 1362 ms | 1544 ms | 1584 ms | 1589 ms | 1370 ms |
| ttsFirstChunkMs | 3 | 1547 ms | 1696 ms | 1886 ms | 1929 ms | 1934 ms | 1726 ms |
| ttsDoneMs | 3 | 2385 ms | 2581 ms | 2810 ms | 2861 ms | 2867 ms | 2611 ms |
| analysisMs | 3 | 11957 ms | 12065 ms | 12779 ms | 12940 ms | 12958 ms | 12327 ms |
| analysisAfterTtsMs | 3 | 9089 ms | 9484 ms | 10355 ms | 10551 ms | 10573 ms | 9715 ms |

## Runs

| Run | Session | ASR | LLM first token | TTS first chunk | TTS done | Analysis | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 22095213 | 211 ms | 775 ms | 1547 ms | 2385 ms | 12958 ms | PASS |
| 2 | a1bd38ee | 426 ms | 1304 ms | 1934 ms | 2867 ms | 11957 ms | PASS |
| 3 | 364ed601 | 146 ms | 1044 ms | 1696 ms | 2581 ms | 12065 ms | PASS |

## Errors

None.
