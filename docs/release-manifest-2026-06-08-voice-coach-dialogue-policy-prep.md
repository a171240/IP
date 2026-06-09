# Release Manifest: voice-coach-dialogue-policy-prep-20260608

## Basic Info

- Release date: 2026-06-08 17:13 CST
- Last release-prep verification rerun: 2026-06-08 17:36 CST
- Production release update: 2026-06-08 17:59 CST
- Realtime WS release update: 2026-06-08 20:48 CST
- Follow-up production release update: 2026-06-08 23:15 CST
- Release thread: current release-prep thread; user authorized HTTP/Vercel production deploy and voice-coach-ws ECS/PM2 restart on 2026-06-08
- Operator: Codex
- Planned backend version/label: `voice-coach-dialogue-policy-20260608`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository checked: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch checked: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production read-only validation only; no schema/data write in this release plan

## Permission Confirmation

- Has the user explicitly authorized production backend deploy from this thread? Yes.
- Has the user authorized WS/ECS-PM2 restart from this thread? Yes, and it was executed through Aliyun Workbench on the production lightweight application server.
- Is WeChat mini-program upload allowed now? No.
- Is this release allowed to touch production data or schema? No.

This manifest is now a production backend release record: HTTP/Vercel and realtime WS/PM2 are deployed, including the follow-up `推进决策` policy release at 23:15 CST. No mini-program upload or Supabase write was performed.

## Workspace State

Backend status at 2026-06-08 17:13 CST, rechecked at 2026-06-08 17:36 CST:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521
 M app/api/voice-coach/sessions/route.ts
 M lib/voice-coach/llm.server.ts
 M lib/voice-coach/session-context.ts
 M package.json
 M tests/voice-coach-report.runtime.test.js
 M voice-coach-ws/src/__tests__/orchestrator.test.ts
 M voice-coach-ws/src/__tests__/streaming-llm.test.ts
 M voice-coach-ws/src/pipeline/orchestrator.ts
 M voice-coach-ws/src/shared/prompts.ts
?? docs/release-handoff-2026-06-08-voice-coach-policy-integration.md
?? docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
?? docs/release-manifest-2026-06-08-voice-coach-dialogue-policy-prep.md
?? docs/voice-coach-dialogue-repair-handoff-2026-06-08.md
?? docs/voice-coach-ws-production-release-checklist-2026-06-08.md
?? public/professional-learning-assets/
?? scripts/check-backend-release-package.mjs
?? scripts/required-professional-learning-rendered-assets.json
?? voice-coach-ws/src/__tests__/topic-guard.test.ts
?? voice-coach-ws/src/shared/topic-guard.ts
```

Mini-program status note:

```text
The mini-program worktree is dirty and now contains additional WXSS/font-related changes
such as app.wxss, many page *.wxss files, docs/font-assets/, and utils/source-han-serif-font.js.
Those are not part of this backend voice release and must be classified separately before mini-program upload.
```

Staged files:

```text
none
```

## Included Changes

HTTP/Vercel voice repair candidate:

```text
app/api/voice-coach/sessions/route.ts
lib/voice-coach/llm.server.ts
lib/voice-coach/session-context.ts
tests/voice-coach-report.runtime.test.js
```

Realtime WS voice repair candidate:

```text
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/pipeline/orchestrator.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
voice-coach-ws/src/__tests__/orchestrator.test.ts
```

Handoff / release docs:

```text
docs/release-handoff-2026-06-08-voice-coach-policy-integration.md
docs/voice-coach-dialogue-repair-handoff-2026-06-08.md
docs/release-manifest-2026-06-08-voice-coach-dialogue-policy-prep.md
docs/voice-coach-ws-production-release-checklist-2026-06-08.md
```

Behavioral scope:

- Training-task sessions now carry `training_context` into `scenario_snapshot_json.prompt_context_text` and `session_context_json.training_context`.
- Common knowledge-base training can get a current training project/topic even without a user-created scene card.
- Customer display name such as `徐老师` is metadata only and must not be used as the beautician addressee.
- `胶原抗衰护理` remains locked against unrelated chest/private-care drift.
- Long conversations rotate away from repeated safety-axis questions into evidence, boundary, mechanism, expectation, process, value, or trust.
- WS streaming text is normalized before TTS and before persistence.

## Explicitly Not Included

These dirty backend files/folders were intentionally outside the voice policy logic scope, but were carried forward in the Vercel deployment package to avoid regressing the already-restored static/API package:

```text
package.json
docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
public/professional-learning-assets/
scripts/check-backend-release-package.mjs
scripts/required-professional-learning-rendered-assets.json
```

Reason:

- `package.json` contains the pre-existing static/API release preflight script change.
- `public/professional-learning-assets/` and the release-package checker belong to the static/API asset restore package.
- They must remain in the full Vercel package so professional-learning and voice-coach remote images do not disappear after a new deployment.
- They are not part of the voice policy behavior change.

Also not included:

```text
supabase/migrations/*
vercel.json
app/api/mp/store-admin/*
app/api/mp/service-records/*
lib/voice-coach/training.server.ts
lib/voice-coach/training-packs/*.json
```

## Database Changes

- Supabase migration files: none.
- Production data/schema writes: none.
- Optional post-deploy validation: read-only query of voice sessions/turns/events for the new true-device smoke session.

## Verification

Reported by the voice repair thread:

```text
git diff --check: PASS
corepack pnpm release:preflight: PASS 4/4
cd voice-coach-ws && npm run typecheck: PASS
cd voice-coach-ws && npm test: PASS, 8 files / 43 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm build: PASS, with existing ESLint any warning and Next runtime re-export warning
```

Release-prep spot-check:

```text
git diff --check: PASS
backend staged files: none
mini-program staged files: none
```

Release-prep rerun by this thread on 2026-06-08 17:36 CST:

```text
mini-program git diff --check: PASS
backend git diff --check: PASS
corepack pnpm release:preflight: PASS 4/4
voice-coach-ws npm run typecheck: PASS
voice-coach-ws npm test: PASS, 8 files / 43 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm build: PASS, with existing ESLint any warnings and Next runtime re-export warnings
mini-program production API contract against https://ip.ipgongchang.xin: PASS 12/12
backend staged files: none
mini-program staged files: none
production deploy/upload/Supabase write: not executed
```

Required to rerun immediately before production deploy:

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
git status --short --branch
git diff --check
corepack pnpm release:preflight
cd voice-coach-ws && npm run typecheck
cd voice-coach-ws && npm test
cd ..
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js
corepack pnpm build
```

## HTTP / Vercel Release Plan

Production action was authorized and executed.

When authorized, HTTP/Vercel release must:

1. Confirm staged/committed scope includes only the HTTP voice repair plus approved release docs, or intentionally includes the static/API preflight package as a separate commit.
2. Confirm no Supabase migration is staged.
3. Deploy the canonical backend repository from `/Users/Admin/Documents/美业话镜APP/handoff/IP`.
4. Record the new Vercel deployment ID and production aliases.
5. Rerun production API contract from the mini-program repo:

```bash
cd /Users/Admin/Documents/美业话镜小程序
node tools/check-mp-api-contract-before-asset-release.js
```

Expected:

```text
12/12 PASS
auth-gated routes return 401 auth_required, not 404 HTML
```

## Realtime WS / Aliyun-PM2 Release Record

Production action was authorized and executed through Aliyun Workbench because the local shell still had no usable SSH identity.

WS release must not be assumed covered by Vercel. The production WS path is:

```text
wss://ip.ipgongchang.xin/ws/voice-coach
```

Known local deploy script:

```text
voice-coach-ws/scripts/deploy.sh
```

Known defaults from the script/config:

```text
REPO_DIR=/opt/ip-site
APP_DIR=/opt/ip-site/voice-coach-ws
BRANCH=main
PM2_APP_NAME=voice-coach-ws
WS_PORT=8080
ENV_FILE=/opt/ip-site/voice-coach-ws/.env.production
health check: http://127.0.0.1:8080/healthz
```

Server facts confirmed during release:

```text
Server type: Aliyun lightweight application server
Server name: AlibabaCloudLinux-xcya
Public IP: 106.14.241.129
Workbench user: admin
sudo: passwordless sudo confirmed
App path: /opt/ip-site/voice-coach-ws
Repo status: /opt/ip-site is not a git repository
PM2 app: voice-coach-ws
PM2 user: root
WS port: 8080
Public health: https://ip.ipgongchang.xin/ws-health
Public WS path: wss://ip.ipgongchang.xin/ws/voice-coach
```

Deployment method:

```text
Did not run voice-coach-ws/scripts/deploy.sh because /opt/ip-site is not a git repository.
Uploaded a direct tar package containing canonical local voice-coach-ws/src, package.json, and tsconfig.json.
Package SHA256: 16d040347f843b81c68cdd86a1275862537c7fcec478b76a07f1d3be7a8bb091
Server backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-204743/src-before-fullsrc
Build: sudo npm run build -> PASS
Restart: sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env -> PASS
PM2 save: PASS, saved to /root/.pm2/dump.pm2
PM2 result: voice-coach-ws online, pid 2290677, version 0.1.0, user root
```

Release notes:

- The first limited six-file WS package was not sufficient because the server source baseline was older than canonical local source; `sudo npm run build` failed before PM2 reload.
- Because the failed limited build happened before PM2 reload, the running production process was not restarted by that failed attempt.
- The successful release used a full WS source package to align the standalone WS service with canonical local `voice-coach-ws`.
- Direct public `http://106.14.241.129:8080/healthz` returned an empty reply from outside the server and is not the production gate; production traffic goes through nginx and the domain.

Post-release checks:

```text
curl -i --max-time 15 https://ip.ipgongchang.xin/ws-health
  HTTP/1.1 200 OK
  {"ok":true}

WebSocket auth-gate smoke:
  wss://ip.ipgongchang.xin/ws/voice-coach?session_id=release-smoke-no-token
  PASS: 401 auth gate, route reachable and protected

Mini-program API contract:
  node tools/check-mp-api-contract-before-asset-release.js
  PASS 12/12 against https://ip.ipgongchang.xin

Production Supabase read-only session check from the remote WS server:
  cutoff: 2026-06-08T15:15:00.000Z, which is 2026-06-08 23:15 CST
  query: voice_coach_sessions created_at >= cutoff
  result: count 0, rows []
  write: none
  interpretation: no true-device voice session has been created after the 23:15 follow-up release yet
```

## Post-Deploy True-device Smoke

Only after both HTTP/Vercel and WS/ECS-PM2 are released:

1. Generate a new mini-program preview QR.
2. Use a logged-in test account.
3. Common knowledge-base flow: run at least 5 turns; fail if it drifts to `胸部护理`.
4. Project/customer flow with customer `徐老师` and project `胶原抗衰护理`: run at least 10 turns.
5. Fail if customer speech addresses the beautician as `徐老师`.
6. Fail if the dialogue keeps asking safety questions without rotating to evidence/boundary/mechanism/expectation/process/value/trust.
7. End and view report; confirm report recovery still works.

## Post-release Local Follow-up Patch

Added after the production release, based on user true-device testing. This patch is local only and is not part of the production release recorded above.

Observed production result after the release:

```text
Customer-name addressing: fixed in the inspected latest production session.
Chest/private-care drift: fixed in the inspected latest production session.
Remaining issue: long conversations can still feel stuck around sensitive-skin/safety/boundary when the beautician keeps replying vaguely.
```

Local patch scope:

```text
lib/voice-coach/llm.server.ts
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
docs/release-handoff-2026-06-08-voice-coach-policy-integration.md
docs/release-manifest-2026-06-08-voice-coach-dialogue-policy-prep.md
```

Behavior:

- Adds the `推进决策` axis.
- If recent customer turns already covered sensitive/safety/boundary/evidence and the beautician reply is still low-information, the next customer question switches to concrete arrangement: skin detection first, repair first, trial arrangement, pause condition, or price-cycle value.
- Keeps HTTP/Vercel and realtime WS policy logic aligned.

Local verification:

```text
git diff --check: PASS
cd voice-coach-ws && npm run typecheck: PASS
cd voice-coach-ws && npm test: PASS, 8 files / 45 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm release:preflight: PASS 4/4
corepack pnpm build: PASS, with existing ESLint any warnings and Next runtime re-export warnings only
```

Release status for this follow-up:

```text
Vercel production deploy: executed for this follow-up patch.
Aliyun/PM2 voice-coach-ws restart: executed for this follow-up patch.
Supabase write: none.
Mini-program upload: none.
```

## Follow-up Production Release Record - 2026-06-08 23:15 CST

Scope:

```text
Deploy the local follow-up dialogue policy patch that adds the 推进决策 axis and reduces repeated safety-loop behavior after vague beautician replies.
```

Pre-deploy verification rerun by this release thread:

```text
git diff --check: PASS
corepack pnpm release:preflight: PASS 4/4
cd voice-coach-ws && npm run typecheck: PASS
cd voice-coach-ws && npm test: PASS, 8 files / 45 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm build: PASS, with existing ESLint any warnings and Next runtime re-export warnings only
```

HTTP/Vercel production deployment:

```text
Deploy command: npx --yes vercel deploy --prod --yes --project ip
Production deployment ID: dpl_AouC2kNKB7hEMvXTYoYiYMkdbiGU
Production URL: https://ip-p24q1pb1y-a171240s-projects.vercel.app
Production aliases confirmed:
  https://www.ipnrgc.com
  https://ip.ipgongchang.xin
  https://ip-a171240s-projects.vercel.app
  https://ip-a171240-a171240s-projects.vercel.app
  https://ipnrgc.com
Status: READY
```

Realtime WS / Aliyun-PM2 deployment:

```text
Method: Aliyun Workbench direct package release because local SSH auth remains unavailable and /opt/ip-site is not a git repository.
Package deployed: canonical local voice-coach-ws/src, package.json, tsconfig.json.
Package SHA256: 786b97010cf472bfcafb172b3c2bf19b5a056e101308d345d0f8326cb4c5c944
Backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124
Build: sudo npm run build -> PASS
PM2 reload: sudo pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env -> PASS
PM2 save: PASS, saved to /root/.pm2/dump.pm2
PM2 result: voice-coach-ws online, pid 2295619, version 0.1.0, user root
Local health: curl --fail --silent http://127.0.0.1:8080/healthz -> {"ok":true}
PM2 logs: latest log includes [voice-coach-ws] listening on :8080 after reload; no startup error observed.
```

Post-release production smoke:

```text
curl -i --max-time 15 https://ip.ipgongchang.xin/ws-health
  HTTP/1.1 200 OK
  {"ok":true}

WebSocket auth-gate smoke:
  wss://ip.ipgongchang.xin/ws/voice-coach?session_id=release-smoke-no-token
  PASS: 401 auth gate, route reachable and protected

Mini-program API contract:
  node tools/check-mp-api-contract-before-asset-release.js
  PASS 12/12 against https://ip.ipgongchang.xin
```

Release boundary:

```text
Supabase write: none.
Mini-program upload: none.
Git stage/commit/reset/clean: none.
```

## Rollback / Recovery

HTTP/Vercel:

```text
Rollback target for the 23:15 follow-up release, if needed:
dpl_H9ujes4eqDbjmiv3tcMqNjRV7H7F
```

WS/ECS-PM2:

```text
Rollback source for the 23:15 follow-up release:
/opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124

Previous full-source release backup remains:
/opt/ip-site/voice-coach-ws/.release-backups/20260608-204743/src-before-fullsrc

Minimum rollback plan: restore backup src/package.json/tsconfig.json, rebuild voice-coach-ws, pm2 startOrReload ecosystem.config.cjs --only voice-coach-ws --update-env, pm2 save, health check /healthz and /ws-health.
```

Supabase:

```text
No migration or data write expected, so rollback is not needed for database state.
```

## Current Decision

- Release approved: partial.
- HTTP/Vercel deploy allowed now: yes.
- HTTP/Vercel deploy executed: yes.
- HTTP/Vercel latest production deployment ID: `dpl_AouC2kNKB7hEMvXTYoYiYMkdbiGU`.
- HTTP/Vercel latest production URL: `https://ip-p24q1pb1y-a171240s-projects.vercel.app`.
- HTTP/Vercel production aliases confirmed: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ip-a171240s-projects.vercel.app`, `https://ip-a171240-a171240s-projects.vercel.app`, `https://ipnrgc.com`.
- WS/ECS-PM2 deploy allowed now: yes.
- WS/ECS-PM2 deploy executed: yes; latest follow-up release executed through Aliyun Workbench direct package release.
- WeChat upload allowed now: no.
- Supabase write executed: no.
- Current status: HTTP LIVE, WS LIVE with follow-up `推进决策` policy, waiting for new true-device voice smoke.

HTTP/Vercel production verification after deployment:

```text
Vercel inspect: dpl_AouC2kNKB7hEMvXTYoYiYMkdbiGU, target production, status Ready.
Mini-program API contract against https://ip.ipgongchang.xin: PASS 12/12.
Voice-coach remote images: PASS 120/120.
Professional-learning remote images: PASS 397/397.
```

WS/ECS-PM2 release:

```text
Server: Aliyun lightweight application server AlibabaCloudLinux-xcya, 106.14.241.129.
Method: Workbench direct package release because /opt/ip-site is not a git repository.
Package SHA256: 16d040347f843b81c68cdd86a1275862537c7fcec478b76a07f1d3be7a8bb091.
Backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124.
Build: sudo npm run build PASS.
PM2: voice-coach-ws online, pid 2295619, user root.
Public WS health: https://ip.ipgongchang.xin/ws-health -> 200 {"ok":true}.
Unauthenticated WS smoke: expected 401 auth gate PASS.
```

Blocking items before upload:

- New true-device smoke PASS after both backend paths are live and after the 23:15 follow-up release.
- Separate classification of mini-program WXSS/font dirty changes before upload.
