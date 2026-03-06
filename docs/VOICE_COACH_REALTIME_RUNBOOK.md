# Voice Coach Realtime Runbook

## Local Startup

### 1. Start Next.js API server

If this worktree does not have a local `.env.local`, link the root env first:

```bash
ln -sfn /Users/zhuan/IP项目/ip-content-factory/.env.local /private/tmp/ip-vc-integration/.env.local
```

```bash
cd /private/tmp/ip-vc-integration
NODE_PATH="/Users/zhuan/IP项目/ip-content-factory/node_modules" \
"/Users/zhuan/IP项目/ip-content-factory/node_modules/.bin/next" dev -p 3000
```

### 2. Start realtime gateway

```bash
cd /private/tmp/ip-vc-integration
NODE_PATH="/Users/zhuan/IP项目/ip-content-factory/node_modules" \
"/Users/zhuan/IP项目/ip-content-factory/node_modules/.bin/tsx" scripts/voicecoach-realtime-gateway.ts
```

The gateway auto-loads `.env.local` / `.env` from the repo tree and falls back to `/Users/zhuan/IP项目/ip-content-factory/.env.local`.

### 3. Run realtime smoke test

```bash
cd /private/tmp/ip-vc-integration
NODE_PATH="/Users/zhuan/IP项目/ip-content-factory/node_modules" \
"/Users/zhuan/IP项目/ip-content-factory/node_modules/.bin/tsx" scripts/voicecoach-realtime-smoke.ts
```

The script writes a report to `/tmp/voicecoach_realtime_smoke_<timestamp>.json`.

## Runtime Config

- `VOICE_COACH_REALTIME_ENABLED=true` enables websocket-first mode.
- `VOICE_COACH_REALTIME_PORT=8787` controls the standalone gateway port.
- `VOICE_COACH_REALTIME_PATH=/api/voice-coach/realtime/ws` controls websocket path.
- `VOICE_COACH_REALTIME_URL=wss://your-domain.com/api/voice-coach/realtime/ws` overrides client-facing URL directly.
- If `VOICE_COACH_REALTIME_URL` is empty, the session API derives websocket URL from request origin and swaps in `VOICE_COACH_REALTIME_PORT`.

## Rollback

- Set `VOICE_COACH_REALTIME_ENABLED=false`.
- Session APIs will return `realtime.enabled=false`.
- The mini program falls back to legacy `uploadFile` submit mode automatically.

## Production Notes

- If the gateway is reverse proxied behind the same domain, prefer setting `VOICE_COACH_REALTIME_URL` explicitly.
- If the gateway is exposed on a dedicated port, keep `VOICE_COACH_REALTIME_URL` empty and ensure the public port matches `VOICE_COACH_REALTIME_PORT`.
- Full realtime still depends on the existing worker for analysis jobs after the live turn completes.
