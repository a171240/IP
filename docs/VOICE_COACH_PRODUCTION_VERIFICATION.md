# Voice Coach Production Verification

Date:
Environment:
Verifier:
Server:

## Scope

This checklist is for the deployed realtime stack:

- Main API base: `https://ip.ipgongchang.xin/api/*`
- Realtime websocket: `wss://ip.ipgongchang.xin/ws/voice-coach`
- Local upstream on server: `127.0.0.1:8080`

Current expected realtime model path:

- Reply provider: `deepseek`
- Analysis provider: `deepseek`
- Model identifier: `deepseek-chat`

## Preconditions

- [ ] `voice-coach-ws` deployed on the production server
- [ ] PM2 app `voice-coach-ws` is online
- [ ] Nginx websocket reverse proxy enabled
- [ ] WeChat backend legal domains configured
- [ ] At least one iOS device and one Android device available

## Server Checks

- [ ] `curl http://127.0.0.1:8080/healthz` returns `{"ok":true}`
- [ ] `pm2 status` shows `voice-coach-ws` online
- [ ] `pm2 logs voice-coach-ws` has no boot errors
- [ ] `sudo nginx -t` passes
- [ ] `wss://ip.ipgongchang.xin/ws/voice-coach` can complete websocket handshake

Notes:

## WeChat DevTools Checks

- [ ] Page enters voice coach session successfully
- [ ] `session.ready` is received
- [ ] `audio.start` is sent
- [ ] recorder chunks are sent over websocket
- [ ] `asr.partial` appears
- [ ] `asr.final` appears
- [ ] `llm.text_delta` appears
- [ ] TTS binary frames arrive
- [ ] customer audio plays
- [ ] `barge_in` interrupts playback correctly
- [ ] `session.end` / report flow works

Notes:

## Real Device Matrix

| Check | iOS WeChat | Android WeChat | Notes |
| --- | --- | --- | --- |
| WebSocket connect |  |  |  |
| Recorder start |  |  |  |
| Recorder chunk upload |  |  |  |
| ASR partial/final |  |  |  |
| LLM text stream |  |  |  |
| TTS playback |  |  |  |
| Barge-in |  |  |  |
| Network reconnect |  |  |  |
| Background/foreground recovery |  |  |  |

## Functional Verification

- [ ] First customer opening line plays
- [ ] Beautician voice input produces realtime ASR
- [ ] Customer reply text streams progressively
- [ ] Customer reply audio autoplay works
- [ ] Continuous dialogue runs for 5 turns without crash
- [ ] End session leads to report page
- [ ] Resume/history recovery works

Notes:

## Latency Sampling

Extract recent server latency logs:

```bash
grep "turn_latency" /var/log/voice-coach-ws/out.log | tail -20
```

Record observed values:

| Metric | Sample / P50 | P90 | Target | Status |
| --- | ---: | ---: | ---: | --- |
| asrMs |  |  | <= 1500ms |  |
| llmFirstTokenMs |  |  | <= 1500ms |  |
| ttsFirstChunkMs |  |  | <= 2500ms |  |

Notes:

## Stability and Fallback

- [ ] 30-minute runtime check passes
- [ ] memory usage remains stable
- [ ] disconnect / reconnect works
- [ ] fallback to HTTP polling works when WS is unavailable
- [ ] fallback mode remains usable

Notes:

## Findings

### Blocking Issues

-

### Non-blocking Issues

-

## Final Verdict

- [ ] Production ready
- [ ] Needs fixes before rollout

Summary:
