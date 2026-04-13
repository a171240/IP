# Voice Coach Deploy Execution

Date: 2026-03-21

## Summary

I reviewed `VOICE_COACH_DEPLOY_CODEX_TASKS.md` and split it into:

- Phase 1 items that can be completed inside the repo now
- Phase 2 items that require external server, Nginx reload, WeChat backend access, and real devices

Executed in this round:

- W1: PM2 config, deploy script, Dockerfile
- W2: Nginx websocket reverse-proxy snippet
- W3: production env template, backend deploy doc update
- Phase 2 preparation: production verification template

Not executable from the local repo alone:

- W4 real WeChat backend whitelist changes and DevTools live linking
- W5 iOS/Android real-device recording and playback verification
- W6 production rollout verification against the live server

## Parallel Work

Three worker threads were used for Phase 1:

1. W1 owned deploy runtime files under `voice-coach-ws`
2. W2 owned the Nginx include snippet
3. W3 owned `.env.production` and backend deployment documentation

Main thread responsibilities:

- reviewed worker output
- fixed integration details
- verified build and script sanity
- prepared Phase 2 verification material

## Delivered Files

### W1

- `voice-coach-ws/ecosystem.config.cjs`
- `voice-coach-ws/scripts/deploy.sh`
- `voice-coach-ws/Dockerfile`

### W2

- `voice-coach-ws/nginx/voice-coach-ws.conf`

### W3

- `voice-coach-ws/.env.production`
- `docs/DEPLOY_BACKEND.md`

### Phase 2 Preparation

- `docs/VOICE_COACH_PRODUCTION_VERIFICATION.md`

## Key Decisions

### 1. DeepSeek V3 remains the production default

Current deploy template uses:

- `VOICE_COACH_REPLY_PROVIDER=deepseek`
- `VOICE_COACH_ANALYSIS_PROVIDER=deepseek`
- `DEEPSEEK_MODEL=deepseek-chat`

This matches the validated fast-path runtime used in the previous latency round.

### 2. Deploy script intentionally does not use `npm ci --production`

The websocket service builds TypeScript on the target host, so a production-only install would drop `tsc` and fail the build.

Current script uses:

- `npm ci`
- `npm run build`
- `pm2 startOrReload ecosystem.config.cjs --update-env`

### 3. Nginx config is an include snippet, not a standalone server block

The deploy task doc suggested websocket config under the existing TLS server block for `ip.ipgongchang.xin`. The delivered file follows that safer shape and avoids creating a competing `server {}` block.

### 4. Phase 2 is documented, not faked

No claim is made that production or real-device validation has already been completed. Instead, the verification checklist was prepared so the next step can be executed against the real server and devices.

## Local Validation

Executed in this round:

- `cd voice-coach-ws && npm run build`
- `node -e "const cfg=require('./voice-coach-ws/ecosystem.config.cjs'); ..."`
- `bash -n scripts/deploy.sh` from `voice-coach-ws`

Result:

- websocket service build passed
- PM2 config is readable
- deploy shell script passes static bash parsing

## Production Rollout

Executed against the ECS host behind `ip.ipgongchang.xin`:

- verified SSH access to `106.14.241.129`
- confirmed existing Nginx topology: `ip.ipgongchang.xin` already terminates TLS on ECS and proxies `/` to the external main site
- installed Node.js `20.20.1` and PM2 `6.0.14`
- uploaded the current `voice-coach-ws` workspace snapshot to `/opt/ip-site/voice-coach-ws`
- wrote real production env to `.env.production` and `.env`
- enabled `/ws/voice-coach` and `/ws-health` through the existing TLS server block
- validated `nginx -t` and reloaded Nginx

Additional fixes discovered during the real rollout:

1. PM2 could not reliably start the service from `dist/index.js`
   - cause: `src/index.ts` only auto-started under direct `node dist/index.js`
   - fix: added `src/main.ts`, changed PM2/script entry to `dist/main.js`

2. Public websocket diagnostics using `Authorization: Bearer ...` failed at Nginx
   - cause: websocket proxy snippet did not forward the `Authorization` header
   - fix: added `proxy_set_header Authorization $http_authorization;`

Final ECS runtime state after fix:

- PM2 process `voice-coach-ws` is online
- `pm2 describe voice-coach-ws` shows script path `/opt/ip-site/voice-coach-ws/dist/main.js`
- `pm2-root` systemd unit is `active` and `enabled`
- `127.0.0.1:8080/healthz` returns `200 {"ok":true}`
- `https://ip.ipgongchang.xin/ws-health` returns `200 {"ok":true}`

## Public E2E Verification

Executed against the public hostname:

- created a fresh temporary Supabase user via admin API
- authenticated via password grant
- created a real session through `POST https://ip.ipgongchang.xin/api/voice-coach/sessions`
- connected through `wss://ip.ipgongchang.xin/ws/voice-coach`
- streamed probe audio through the public websocket path

Latest public result:

- `PASS run=1`
- `asr=519 ms`
- `llm=1440 ms`
- `tts=2347 ms`
- `done=3242 ms`
- `analysis=12578 ms`

Threshold status:

- ASR: pass (`519 ms <= 1500 ms`)
- LLM first token: pass (`1440 ms <= 1500 ms`)
- TTS first chunk: fail (`2347 ms > 2000 ms`)

Artifacts:

- latency JSON report: `voice-coach-ws/.tmp/voice-coach-latency-2026-03-21T06-01-33-050Z.json`

## Remaining External Steps

1. Confirm WeChat backend legal-domain whitelist includes `https://ip.ipgongchang.xin` and `wss://ip.ipgongchang.xin`
2. Run WeChat DevTools linkage against the live domain
3. Run iOS real-device recording/playback verification
4. Run Android real-device recording/playback verification
5. Record final device-side results in `docs/VOICE_COACH_PRODUCTION_VERIFICATION.md`

## Open Risks

1. TTS first chunk is still above the current 2000 ms target in the latest public run.
2. WeChat legal-domain configuration still needs confirmation in the actual mini-program backend.
3. Real-device audio compatibility still needs iOS and Android validation.
4. The main deployment docs in this repo have existing encoding noise in PowerShell output, even though file contents are still editable and usable.
