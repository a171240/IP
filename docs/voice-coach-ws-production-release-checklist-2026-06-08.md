# Voice Coach WS Production Release Checklist - 2026-06-08

## Purpose

This checklist prepares and records the realtime `voice-coach-ws` production release. It did not authorize the restart by itself; the user separately authorized this thread as the backend release thread.

The WebSocket service is separate from Vercel. A Vercel deployment does not update:

```text
wss://ip.ipgongchang.xin/ws/voice-coach
```

## Current Local Service Files

Release candidate files:

```text
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/pipeline/orchestrator.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
voice-coach-ws/src/__tests__/orchestrator.test.ts
```

Service scripts/config:

```text
voice-coach-ws/package.json
voice-coach-ws/ecosystem.config.cjs
voice-coach-ws/scripts/deploy.sh
```

## Known Runtime Topology

Recorded topology:

```text
Client: WeChat mini-program
Public WS: wss://ip.ipgongchang.xin/ws/voice-coach
Nginx/ECS upstream: 127.0.0.1:8080
PM2 app: voice-coach-ws
Local service health: http://127.0.0.1:8080/healthz
```

Known defaults from `voice-coach-ws/scripts/deploy.sh`:

```text
REPO_DIR=/opt/ip-site
APP_DIR=/opt/ip-site/voice-coach-ws
BRANCH=main
PM2_APP_NAME=voice-coach-ws
LOG_DIR=/var/log/voice-coach-ws
ENV_FILE=/opt/ip-site/voice-coach-ws/.env.production
WS_PORT=8080
```

These are defaults, not proof. Confirm them on the server before any deploy.

## Pre-Deploy Confirmation

Do not deploy until all fields are filled:

```text
Production server host: 106.14.241.129
Server type: Aliyun lightweight application server
Workbench user: admin
sudo: passwordless sudo confirmed
SSH user: local shell SSH remains unavailable; Workbench was used
Server repo path: /opt/ip-site is not a git repository
App path: /opt/ip-site/voice-coach-ws
Server branch: not applicable on server
Server current commit: not available on server
Target source: canonical local /Users/Admin/Documents/美业话镜APP/handoff/IP/voice-coach-ws
PM2 app name: voice-coach-ws
WS port: 8080
Env file path: expected /opt/ip-site/voice-coach-ws/.env.production, not modified
Log directory: expected /var/log/voice-coach-ws, not confirmed in this run
Nginx config path:
Rollback commit:
Rollback command:
Operator: Codex
User authorization timestamp: 2026-06-08 before 17:59 CST
```

## Pre-Deploy Local Checks

Run locally in canonical backend before copying/deploying:

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
git status --short --branch
git diff --check
cd voice-coach-ws
npm run typecheck
npm test
npm run build
```

Expected:

```text
typecheck PASS
tests PASS
build PASS
```

Latest local rerun by release-prep thread on 2026-06-08 17:36 CST:

```text
git diff --check: PASS
npm run typecheck: PASS
npm test: PASS, 8 files / 43 tests
backend build: PASS, with existing lint/runtime warnings only
WS deploy executed: no
PM2 restarted: no
```

Latest follow-up local rerun by release thread on 2026-06-08 23:10 CST:

```text
git diff --check: PASS
corepack pnpm release:preflight: PASS 4/4
npm run typecheck: PASS
npm test: PASS, 8 files / 45 tests
backend runtime test: PASS, 15/15
backend build: PASS, with existing ESLint any warnings and Next runtime re-export warnings only
```

Production WS attempt on 2026-06-08 17:59 CST:

```text
User authorized voice-coach-ws ECS/PM2 restart.
SSH host key for 106.14.241.129 was accepted.
SSH authentication failed for root/admin/ecs-user/ubuntu/debian/centos/alibaba/cloud-user/lighthouse/www-data.
Local ~/.ssh has no private key; ssh-agent has no identities.
Public health check https://ip.ipgongchang.xin/ws-health returned 200 {"ok":true}.
WS deploy executed: no.
PM2 restarted: no.
```

Production WS release on 2026-06-08 20:48 CST:

```text
User authorization: release thread may execute Vercel production deploy and voice-coach-ws ECS/PM2 restart.
Server access: Aliyun Workbench one-click login to lightweight application server as admin.
Server: AlibabaCloudLinux-xcya, public IP 106.14.241.129.
sudo: passwordless sudo confirmed.
Server app path: /opt/ip-site/voice-coach-ws.
/opt/ip-site git status: not a git repository, so voice-coach-ws/scripts/deploy.sh was not used.
Package deployed: canonical local voice-coach-ws/src, package.json, tsconfig.json.
Package SHA256: 16d040347f843b81c68cdd86a1275862537c7fcec478b76a07f1d3be7a8bb091.
Backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-204743/src-before-fullsrc.
Build: sudo npm run build -> PASS.
PM2 reload: sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env -> PASS.
PM2 save: PASS.
PM2 status: voice-coach-ws online, pid 2290677, user root.
Public /ws-health: PASS 200 {"ok":true}.
WS auth-gate smoke: PASS, wss://ip.ipgongchang.xin/ws/voice-coach without token returns 401.
Mini-program API contract after WS release: PASS 12/12.
Production Supabase read-only session check after follow-up release: cutoff 2026-06-08T15:15:00.000Z / 2026-06-08 23:15 CST, voice_coach_sessions count 0, rows [], no write.
Supabase write: none.
Mini-program upload: none.
```

Follow-up production WS release on 2026-06-08 23:15 CST:

```text
User authorization: release thread may execute Vercel production deploy and voice-coach-ws ECS/PM2 restart.
Server access: Aliyun Workbench one-click login to lightweight application server as admin.
Server: AlibabaCloudLinux-xcya, public IP 106.14.241.129.
sudo: passwordless sudo confirmed from the earlier release session.
Server app path: /opt/ip-site/voice-coach-ws.
/opt/ip-site git status: not a git repository, so voice-coach-ws/scripts/deploy.sh was not used.
Package deployed: canonical local voice-coach-ws/src, package.json, tsconfig.json.
Package SHA256: 786b97010cf472bfcafb172b3c2bf19b5a056e101308d345d0f8326cb4c5c944.
Backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124.
Build: sudo npm run build -> PASS.
PM2 reload: sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env -> PASS.
PM2 save: PASS.
PM2 status: voice-coach-ws online, pid 2295619, user root.
Local /healthz: PASS {"ok":true}.
PM2 logs: latest log includes [voice-coach-ws] listening on :8080 after reload; no startup error observed.
Public /ws-health: PASS 200 {"ok":true}.
WS auth-gate smoke: PASS, wss://ip.ipgongchang.xin/ws/voice-coach without token returns 401.
Mini-program API contract after WS release: PASS 12/12.
Supabase write: none.
Mini-program upload: none.
```

## Server Read-only Checks Before Deploy

Read-only commands to run on the server before deploy:

```bash
pwd
git -C /opt/ip-site status --short --branch
git -C /opt/ip-site rev-parse --abbrev-ref HEAD
git -C /opt/ip-site rev-parse HEAD
pm2 list
pm2 describe voice-coach-ws
curl --fail --silent http://127.0.0.1:8080/healthz
tail -n 80 /var/log/voice-coach-ws/error.log
tail -n 80 /var/log/voice-coach-ws/out.log
```

Do not continue if:

- Repo path is not `/opt/ip-site` or has unexpected dirty changes.
- PM2 app is not `voice-coach-ws`.
- Health check is already failing.
- Env file is missing.
- Rollback commit is unknown.

## Deploy Command Template

This template was not used because `/opt/ip-site` is not a git repository.

```bash
REPO_DIR=/opt/ip-site \
APP_DIR=/opt/ip-site/voice-coach-ws \
BRANCH=<confirmed-release-branch> \
PM2_APP_NAME=voice-coach-ws \
VOICE_COACH_WS_ENV_FILE=/opt/ip-site/voice-coach-ws/.env.production \
WS_PORT=8080 \
bash voice-coach-ws/scripts/deploy.sh
```

Important:

- The script runs `git fetch`, `git checkout`, `git pull --ff-only`, `npm ci`, `npm run build`, `pm2 startOrReload`, `pm2 save`, and local `/healthz`.
- Running it changes production state.
- This release-prep document does not authorize running it.

## Post-Deploy Checks

Immediately after deploy:

```bash
pm2 list
pm2 describe voice-coach-ws
curl --fail --silent http://127.0.0.1:8080/healthz
tail -n 120 /var/log/voice-coach-ws/error.log
tail -n 120 /var/log/voice-coach-ws/out.log
```

External WS check must confirm the public route:

```text
wss://ip.ipgongchang.xin/ws/voice-coach
```

If there is a safe authenticated WS probe, record:

```text
probe command:
session id:
result:
latency:
```

## Required True-device Smoke After WS + HTTP Release

Run only after both backend paths are live:

```text
1. Common knowledge-base flow, 5+ turns:
   PASS if no 胸部护理 / private-care drift.

2. Project/customer flow:
   customer name: 徐老师
   project: 胶原抗衰护理
   run 10+ turns.
   PASS if customer never addresses beautician as 徐老师.
   PASS if conversation rotates beyond safety into evidence/boundary/mechanism/expectation/process/value/trust.

3. End and report:
   PASS if report opens or failure state gives retry/back recovery.

Current post-follow-up data gate:

```text
Production read-only query found 0 voice_coach_sessions created after 2026-06-08 23:15 CST.
The next true-device smoke must create a new post-follow-up session before dialogue quality can be marked PASS.
```
```

## Rollback Plan

Rollback source from this release:

```text
Latest follow-up source backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124/src-before-advance-policy
Latest follow-up package.json backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124/package.json
Latest follow-up tsconfig.json backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124/tsconfig.json
Previous source backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-204743/src-before-fullsrc
Previous PM2 status before successful reload: app voice-coach-ws existed as root PM2 app
Rollback command: restore backup files, rebuild, PM2 reload, run /ws-health
Rollback health check: https://ip.ipgongchang.xin/ws-health returns 200 {"ok":true}
```

Minimum rollback shape for the direct-package release:

```bash
cd /opt/ip-site/voice-coach-ws
sudo rm -rf src
sudo cp -a .release-backups/20260608-advance-policy-231124/src-before-advance-policy src
sudo cp -a .release-backups/20260608-advance-policy-231124/package.json package.json
sudo cp -a .release-backups/20260608-advance-policy-231124/tsconfig.json tsconfig.json
sudo chown -R root:root src package.json tsconfig.json
sudo npm run build
sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env
sudo pm2 save
curl --fail --silent http://127.0.0.1:8080/healthz
```

## Final Decision

- WS deploy approved: yes.
- WS deploy executed: yes, latest follow-up through Aliyun Workbench direct package release.
- PM2 restarted: yes, `voice-coach-ws` online after reload, pid 2295619.
- Current status: LIVE with follow-up `推进决策` policy; requires true-device voice smoke for dialogue-quality PASS.
