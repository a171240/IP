# Release Manifest: Voice Coach Job Idempotency Backend Fix

## Basic Info

- Release date: 2026-06-23
- Release thread: current Codex thread, explicitly authorized by user as backend release thread
- Operator: Codex
- Version: backend-voice-coach-job-idempotency-20260623
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: `topyedxzcdfswxdcucpl` production, read-only diagnostics only

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, backend release thread only.
- Are all other threads frozen from production deploy/upload? This thread will only deploy backend candidate package. No WeChat upload or git push.
- Is this release allowed to touch production data or schema? No. No Supabase schema/data write is included.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 143]
 M app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts
 M lib/voice-coach/jobs.server.ts
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
tests/voice-coach-job-idempotency.static.test.js
```

Dirty files intentionally excluded:

```text
Backend repo, intentionally excluded from clean candidate package:
- deploy/aliyun-production-cn.example.json
- package.json
- scripts/aliyun-predeploy-commands.mjs
- scripts/prepare-aliyun-release-artifacts.mjs
- scripts/generate-aliyun-evidence-writeback-checklist.mjs
- tests/aliyun-evidence-writeback.static.test.js

Mini-program repo:
- pages/voice-coach/chat.js
- pages/voice-coach/opening-prepare.static.test.js
- project.config.json
- canvas/
- docs/release-manifest-2026-06-23-voice-coach-http-polling-fix.md

Backend production deploy candidate will be built from a clean temp package containing only HEAD plus this voice-coach backend fix.
```

## Included Changes

- Prevent `/api/voice-coach/sessions/[sessionId]/beautician-turn/submit` from starting two concurrent job runners for the same job.
- Remove non-canceling `Promise.race` around job processing so the route does not leave abandoned background processing.
- Increase processing stale timeout to default 60 seconds and cap 120 seconds.
- Refresh processing job `updated_at` before long TTS/analysis stages.
- Make next customer turn creation idempotent when the same `session_id + turn_index` is already present.
- Convert raw duplicate-key database errors into user-safe Chinese turn error messages.
- Add static regression coverage for the duplicate-job/idempotency behavior.

## Explicitly Not Included

- No WeChat mini-program upload.
- No mini-program code deployment in this backend release.
- No Supabase production schema/data write.
- No git push.
- No unrelated app/API routes beyond voice coach job processing.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: redeploy previous Vercel production deployment `ip-8mys5ez96-a171240s-projects.vercel.app`; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Vercel org/team: `a171240s-projects`
- Previous production deployment: `ip-8mys5ez96-a171240s-projects.vercel.app`
- Candidate package: `/tmp/meiye-backend-voice-coach-job-idempotency-20260623.R2JjrC/pkg`
- Preview deployment URL: not used; production deploy from clean temp candidate package.
- Production deployment ID/URL: `dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF`, `https://ip-c2qtmvpfi-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes --scope a171240s-projects --meta actor=codex --meta release=voice-coach-job-idempotency-backend-20260623`

Backend release preflight:

```text
git diff --check: PASS
corepack pnpm release:preflight: PASS
corepack pnpm build: PASS
```

Backend smoke results:

```text
Vercel inspect:
- id dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF
- target production
- status Ready
- aliases include https://www.ipnrgc.com and https://ip.ipgongchang.xin

python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 400
- https://www.ipnrgc.com
  PASS GET /api/mp/profile -> 401 auth_required
  PASS GET /api/mp/virtual-pay/products -> 200 products JSON
  PASS GET /api/mp/service-records/sessions -> 401 auth_required
  PASS service-record auxiliary routes -> 401 auth_required
  PASS POST /api/voice-coach/sessions -> 401
  PASS POST /api/voice-coach/opening-prepare -> 400 invalid_payload route validation
- https://ip.ipgongchang.xin
  PASS same smoke set as above

Changed voice-coach route manual smoke:
- POST /api/voice-coach/sessions/test-session/beautician-turn/submit -> 401 on both aliases
- GET /api/voice-coach/sessions/test-session/events?cursor=0&timeout_ms=150 -> 401 on both aliases
```

Required backend checks:

- `/api/mp/profile`: PASS 401 auth boundary
- `/api/mp/virtual-pay/products`: PASS 200 products JSON
- `/api/mp/service-records/sessions`: PASS 401 auth boundary
- Changed voice-coach route: PASS 401 auth boundary on submit/events

Required static asset checks:

- Before deploy: `corepack pnpm release:preflight` PASS
- After deploy: professional image verification not required by this voice-coach job release, unless production static asset checks are run as global postdeploy evidence.

## Mini-program Upload

- WeChat AppID: not included
- DevTools CLI path: not used
- Upload version: not included
- Upload description: not included
- Upload command: not included
- Upload result: not included

Mini-program local checks:

```text
Not part of this backend production release.
```

## Risk Checklist

- Unknown dirty changes: backend candidate package excluded non-selected Aliyun/package files; mini-program dirty files excluded.
- Deleted files: none detected.
- Route conflicts: voice-coach submit/events/job path only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: route smoke pending after deploy.
- Test data visibility: no production test data writes planned.

## Rollback / Recovery

- Previous backend deployment ID/URL: `ip-8mys5ez96-a171240s-projects.vercel.app`
- Previous mini-program version: `1.0.20260623.1` development upload remains unchanged.
- Database rollback note: none required; no schema/data write.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-06-23 20:10 CST
- Follow-up items: true-device voice coach retest against current mini-program dev/experience version.
