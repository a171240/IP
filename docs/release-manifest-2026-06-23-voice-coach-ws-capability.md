# Release Manifest: Voice Coach WS Capability Handshake

## Basic Info

- Release date: 2026-06-23
- Release thread: current Codex thread; user previously authorized this thread as backend release thread and later asked to continue the WS/backend fix.
- Operator: Codex
- Version: `voice-coach-ws-capability-20260623`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production read-only checks only; no schema/data writes.

## Permission Confirmation

- Has the user explicitly named this thread as the backend release thread? Yes, earlier in this thread.
- Is this release allowed to touch production data or schema? No.
- Does this release include WeChat mini-program upload? No; mini-program upload remains a separate step after WS production smoke.

## Workspace State

Backend status before production action:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 149]
 M voice-coach-ws/src/__tests__/protocol.test.ts
 M voice-coach-ws/src/protocol.ts
 M voice-coach-ws/src/ws-server.ts
?? docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
?? docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
?? docs/release-manifest-2026-06-23-voice-coach-rollback-20260619-baseline.md
?? docs/release-manifest-2026-06-23-voice-coach-ws-capability.md
```

Mini-program status, excluded from this backend-only release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 47]
 M pages/voice-coach/chat.js
 M pages/voice-coach/chat.wxml
 M project.config.json
?? canvas/
?? docs/release-manifest-2026-06-23-voice-coach-http-polling-fix.md
?? docs/release-manifest-2026-06-23-voice-coach-realtime-capability-miniapp.md
?? docs/release-manifest-2026-06-23-voice-coach-restore-20260619-baseline.md
?? pages/voice-coach/realtime-audio-persistence.static.test.js
```

Dirty files intentionally excluded:

```text
Backend:
- docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
- docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
- docs/release-manifest-2026-06-23-voice-coach-rollback-20260619-baseline.md

Mini-program:
- all current mini-program dirty files; no WeChat upload in this backend release
```

## Included Changes

- `voice-coach-ws/src/protocol.ts`
  - Extend `session.ready` schema with optional `capabilities`.
- `voice-coach-ws/src/ws-server.ts`
  - Send `session.ready.capabilities` with:
    - `protocol_version: 2`
    - `streaming_tts: true`
    - `audio_persistence: true`
- `voice-coach-ws/src/__tests__/protocol.test.ts`
  - Guard the new `session.ready.capabilities` payload.

## Explicitly Not Included

- No Vercel/Next.js HTTP API deploy.
- No WeChat mini-program upload.
- No Supabase schema/data write.
- No git push.
- No unrelated Aliyun production-cn app/API migration.

## Candidate Package

- Local package root: `/tmp/voice-coach-ws-capability-20260623.W8qpsG`
- Tarball: `/tmp/voice-coach-ws-capability-20260623.W8qpsG/voice-coach-ws-capability-20260623.tar.gz`
- SHA256: `c36e962653f7864b3e8d10e6b1aedf5c500c998e2e11169b40c9616d40b57ffe`
- Package file count: 55
- Package excludes: `node_modules`, `dist`, `.env`, `.env.production`, `.env.local`

Included package families:

```text
voice-coach-ws/src/**
voice-coach-ws/scripts/**
voice-coach-ws/package.json
voice-coach-ws/package-lock.json
voice-coach-ws/tsconfig.json
voice-coach-ws/ecosystem.config.cjs
```

## Local Checks

```text
git diff --check selected WS files: PASS
npm --prefix voice-coach-ws run typecheck: PASS
npm --prefix voice-coach-ws test: PASS, 8 files / 45 tests
npm --prefix voice-coach-ws run build: PASS
tarball safety check for node_modules/.env: PASS
```

Pre-release public health:

```text
GET https://ip.ipgongchang.xin/ws-health -> 200 {"ok":true}
```

## Production Topology

Recorded existing topology:

```text
Public WS: wss://ip.ipgongchang.xin/ws/voice-coach
Public health: https://ip.ipgongchang.xin/ws-health
Server: Aliyun lightweight application server, public IP 106.14.241.129
Server app path: /opt/ip-site/voice-coach-ws
PM2 app: voice-coach-ws
Local port: 8080
```

Current local access status:

```text
TCP 22 to 106.14.241.129: open
ssh admin@106.14.241.129: Permission denied
aliyun CLI: installed, version 3.3.23
aliyun configure list: blocked, /Users/Admin/.aliyun/config.json not found
```

## Planned Server Commands

These commands are intended for Aliyun Workbench after uploading the tarball to:

```text
/tmp/voice-coach-ws-capability-20260623.tar.gz
```

Server command plan:

```bash
set -euo pipefail
release_id="20260623-ws-capability"
app_dir="/opt/ip-site/voice-coach-ws"
pkg="/tmp/voice-coach-ws-capability-20260623.tar.gz"
work="/tmp/voice-coach-ws-capability-20260623"
backup="$app_dir/.release-backups/$release_id"

test -f "$pkg"
sudo mkdir -p "$backup" "$work"
sudo cp -a "$app_dir/src" "$backup/src-before"
sudo cp -a "$app_dir/package.json" "$backup/package.json-before"
sudo cp -a "$app_dir/package-lock.json" "$backup/package-lock.json-before"
sudo cp -a "$app_dir/tsconfig.json" "$backup/tsconfig.json-before"
sudo cp -a "$app_dir/ecosystem.config.cjs" "$backup/ecosystem.config.cjs-before"

sudo tar -xzf "$pkg" -C "$work"
sudo cp -a "$work/voice-coach-ws/src/." "$app_dir/src/"
sudo cp -a "$work/voice-coach-ws/scripts/." "$app_dir/scripts/"
sudo cp -a "$work/voice-coach-ws/package.json" "$app_dir/package.json"
sudo cp -a "$work/voice-coach-ws/package-lock.json" "$app_dir/package-lock.json"
sudo cp -a "$work/voice-coach-ws/tsconfig.json" "$app_dir/tsconfig.json"
sudo cp -a "$work/voice-coach-ws/ecosystem.config.cjs" "$app_dir/ecosystem.config.cjs"

cd "$app_dir"
sudo npm ci
sudo npm run build
sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env
sudo pm2 save
sudo pm2 describe voice-coach-ws
curl --fail --silent http://127.0.0.1:8080/healthz
```

Post-release public smokes:

```bash
curl --fail --silent https://ip.ipgongchang.xin/ws-health
node voice-coach-ws/scripts/e2e-latency-check.mjs
```

The `e2e-latency-check` may require a valid authenticated session/token; if not available, use auth-gate smoke plus true-device mini-program smoke.

## Rollback / Recovery

Server rollback command plan:

```bash
set -euo pipefail
app_dir="/opt/ip-site/voice-coach-ws"
backup="$app_dir/.release-backups/20260623-ws-capability"
sudo rm -rf "$app_dir/src"
sudo cp -a "$backup/src-before" "$app_dir/src"
sudo cp -a "$backup/package.json-before" "$app_dir/package.json"
sudo cp -a "$backup/package-lock.json-before" "$app_dir/package-lock.json"
sudo cp -a "$backup/tsconfig.json-before" "$app_dir/tsconfig.json"
sudo cp -a "$backup/ecosystem.config.cjs-before" "$app_dir/ecosystem.config.cjs"
cd "$app_dir"
sudo npm ci
sudo npm run build
sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env
sudo pm2 save
curl --fail --silent http://127.0.0.1:8080/healthz
```

No database rollback is required.

## Final Decision

- Local release candidate: READY.
- Production deployed: no.
- Blocking condition before production: no local SSH or Aliyun CLI credential; deployment must use Aliyun Workbench or another authorized server channel.
- Follow-up after WS production deploy: upload the verified mini-program candidate `1.0.20260623.3`.
