# Release Manifest: Voice Coach Fast ACK Backend Fix

## Basic Info

- Release date: 2026-06-23
- Release thread: current Codex thread, explicitly authorized by user as backend release thread
- Operator: Codex
- Version: backend-voice-coach-fast-ack-20260623
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: `topyedxzcdfswxdcucpl` production, read-only diagnostics only

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, backend release thread only.
- Are all other threads frozen from production deploy/upload? This thread will only deploy a clean backend candidate package. No WeChat upload or git push.
- Is this release allowed to touch production data or schema? No. No Supabase schema/data write is included.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 144]
 M app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts
 M docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
 M lib/voice-coach/jobs.server.ts
 M scripts/prepare-aliyun-release-artifacts.mjs
 M scripts/run-aliyun-cli-inventory.mjs
 M tests/aliyun-cli-inventory-runner.static.test.js
?? docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
?? tests/voice-coach-job-idempotency.static.test.js
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 47]
 M pages/voice-coach/chat.js
 M pages/voice-coach/opening-prepare.static.test.js
 M project.config.json
?? canvas/
?? docs/release-manifest-2026-06-23-voice-coach-http-polling-fix.md
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
tests/voice-coach-job-idempotency.static.test.js
```

Dirty files intentionally excluded:

```text
Backend repo, intentionally excluded from clean candidate package:
- docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
- docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
- scripts/prepare-aliyun-release-artifacts.mjs
- scripts/run-aliyun-cli-inventory.mjs
- tests/aliyun-cli-inventory-runner.static.test.js

Mini-program repo, all excluded from this backend-only release:
- pages/voice-coach/chat.js
- pages/voice-coach/opening-prepare.static.test.js
- project.config.json
- canvas/
- docs/release-manifest-2026-06-23-voice-coach-http-polling-fix.md
```

## Included Changes

- `app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts`
  - Restore fast ACK behavior for HTTP submit: upload audio, insert turn/job, emit `turn.accepted`, then return immediately.
  - Do not run `processVoiceCoachJobById` or `pumpVoiceCoachQueuedJobs` inside the submit request.
  - Return `server_advanced=false` and `server_advanced_stage=main_pending` so the mini-program polling path drives queued stages.
- `lib/voice-coach/jobs.server.ts`
  - Keep the previous idempotency, duplicate-key protection, processing heartbeat, stale-timeout widening, and user-safe Chinese error messages.
- `tests/voice-coach-job-idempotency.static.test.js`
  - Guard the fast ACK contract and the retained idempotency protections.

## Explicitly Not Included

- No WeChat mini-program upload.
- No mini-program code deployment.
- No Supabase production schema/data write.
- No git push.
- No unrelated Aliyun production-cn scripts or manifest changes.
- No realtime WebSocket activation; this release only restores HTTP submit quick-return behavior while preserving duplicate-job protections.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: redeploy previous Vercel production deployment `dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF`; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Vercel org/team: `a171240s-projects`
- Previous production deployment: `dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF`, `https://ip-c2qtmvpfi-a171240s-projects.vercel.app`
- Candidate package: `/tmp/meiye-backend-voice-fast-ack-20260623.6FSX7k/pkg`
- Preview deployment URL: not used; production deploy from clean temp candidate package.
- Production deployment ID/URL: `dpl_4HNQhFu1fHmAxXCfkPYQuSr73bjV`, `https://ip-q9zfux2h8-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes --scope a171240s-projects --meta actor=codex --meta release=voice-coach-fast-ack-backend-20260623`

Backend release preflight before deploy:

```text
git diff --check selected files: PASS
node --test tests/voice-coach-job-idempotency.static.test.js: PASS, 4/4
corepack pnpm exec tsc --noEmit --pretty false: PASS
corepack pnpm release:preflight: PASS, 4/4
python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 400: PASS on https://www.ipnrgc.com and https://ip.ipgongchang.xin before deploy
candidate selected files match working tree: PASS
candidate corepack pnpm install --frozen-lockfile: PASS
candidate node --test tests/voice-coach-job-idempotency.static.test.js: PASS, 4/4
candidate corepack pnpm release:preflight: PASS, 4/4
candidate corepack pnpm build: PASS
```

Backend smoke results:

```text
corepack pnpm dlx vercel@latest inspect ip-q9zfux2h8-a171240s-projects.vercel.app --scope a171240s-projects:
PASS, deployment READY, target production, aliases include https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ipnrgc.com

python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 400:
PASS on https://www.ipnrgc.com
PASS on https://ip.ipgongchang.xin

Changed route auth smoke:
PASS POST https://www.ipnrgc.com/api/voice-coach/sessions/test-session/beautician-turn/submit -> 401 {"error":"请先登录"}
PASS GET https://www.ipnrgc.com/api/voice-coach/sessions/test-session/events?cursor=0&timeout_ms=150 -> 401 {"error":"请先登录"}
PASS POST https://ip.ipgongchang.xin/api/voice-coach/sessions/test-session/beautician-turn/submit -> 401 {"error":"请先登录"}
PASS GET https://ip.ipgongchang.xin/api/voice-coach/sessions/test-session/events?cursor=0&timeout_ms=150 -> 401 {"error":"请先登录"}
```

Required backend checks:

- `/api/mp/profile`: PASS, 401 auth_required on both production domains.
- `/api/mp/virtual-pay/products`: PASS, 200 product list on both production domains.
- `/api/mp/service-records/sessions`: PASS, 401 auth_required on both production domains.
- Changed voice-coach submit/events route: PASS, 401 unauthenticated boundary on both production domains.

Required static asset checks:

- Before deploy: `corepack pnpm release:preflight` PASS.
- After deploy: professional image verification not required by this voice-coach runtime release unless run as global evidence.

## Mini-program Upload

- WeChat AppID: not included.
- DevTools CLI path: not used.
- Upload version: not included.
- Upload description: not included.
- Upload command: not included.
- Upload result: not included.

Mini-program local checks:

```text
Not part of this backend production release.
```

## Final Workspace State After Release

Backend status after release, not staged and not pushed:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 145]
 M app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts
 M lib/voice-coach/jobs.server.ts
 M scripts/check-aliyun-cloud-access.mjs
 M scripts/generate-aliyun-operator-handoff.mjs
 M scripts/prepare-aliyun-release-artifacts.mjs
?? docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
?? docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
?? tests/voice-coach-job-idempotency.static.test.js
```

Mini-program status after release, all excluded from this backend-only release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 47]
 M pages/voice-coach/chat.js
 M pages/voice-coach/opening-prepare.static.test.js
 M project.config.json
?? canvas/
?? docs/release-manifest-2026-06-23-voice-coach-http-polling-fix.md
```

## Risk Checklist

- Unknown dirty changes: present, but clean candidate package includes only the selected voice-coach backend files and this manifest.
- Deleted files: none detected.
- Route conflicts: voice-coach submit/events/job path only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: must pass postdeploy smoke.
- Test data visibility: no production test data writes.

## Rollback / Recovery

- Previous backend deployment ID/URL: `dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF`, `https://ip-c2qtmvpfi-a171240s-projects.vercel.app`.
- Previous mini-program version: `1.0.20260623.1` development upload remains unchanged.
- Database rollback note: none required; no schema/data write.
- Recovery path: redeploy or re-alias previous Vercel deployment if postdeploy smoke or true-device test fails.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: Yes.
- Released by: Codex.
- Release time: 2026-06-23 20:38 CST.
- Follow-up items:
  - After backend deploy, run a true-device voice-coach smoke and compare submit ACK / customer text / customer audio timing against the latest Supabase event timeline.
