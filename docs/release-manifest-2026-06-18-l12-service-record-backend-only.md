# Release Manifest: L12 Service Record Backend Only

## Basic Info

- Release date: 2026-06-18
- Release thread: current Codex thread; user said "好的，开始吧" after backend-only risk review
- Operator: Codex
- Version: backend-only `l12-service-record-backend-20260618`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend release candidate package: `/tmp/meiye-backend-l12-candidate-20260618155926`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production untouched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Backend-only release authorization inferred from "好的，开始吧" after backend-only deployment check.
- Are all other threads frozen from production deploy/upload? This release uses a clean temp backend candidate package only; no other dirty lanes are included.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend main workspace status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 15]
dirty main workspace includes service-record, voice-coach, poster, store-admin, ai-points, docs, and Supabase files.
```

Backend release candidate status:

```text
## HEAD (no branch)
 M app/api/mp/service-records/sessions/[sessionId]/oss-upload/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/segments/oss/route.ts
 M lib/service-records/processing.server.ts
 M lib/service-records/segments.server.ts
 M lib/service-records/server.ts
 M tests/service-record-minutes-v2.static.test.js
?? app/api/app/service-records/sessions/[sessionId]/audio/
?? app/api/mp/service-records/device-files/
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? app/api/mp/service-records/sessions/[sessionId]/device-files/
?? lib/service-records/audio-evidence.server.ts
?? tests/service-record-l12-recorder-card.static.test.js
```

Mini-program status:

```text
Main mini-program workspace is dirty and not part of this backend-only release. No WeChat upload is authorized.
```

## Included Changes

- L12/service-record upload credential and segment OSS registration routes.
- Service-record device-file duplicate/status check routes.
- Service-record audio playback evidence route.
- Service-record minutes V2 processing, quality gates, and audio evidence.
- Service-record backend tests for L12 recorder and minutes V2.

## Explicitly Not Included

- WeChat mini-program upload.
- Supabase migrations or production data changes.
- `voice-coach/opening-prepare`.
- Poster/XHS changes.
- Professional-learning changes.
- Store-admin invite QR changes.
- Account/AI points changes.
- Any dirty files outside the temp backend candidate package.

## Database Changes

- Supabase migration files: none included.
- Applied to production: no.
- Rollback/recovery plan: redeploy previous backend production deployment if smoke fails.

## Backend Deployment

- Vercel project: `ip` / production domain `https://www.ipnrgc.com`
- Preview deployment URL: not used; this was a backend production release
- Production deployment ID: `dpl_12iHYcNMYWpkn88PKS8NgtXgjAWE`
- Production deployment URL: `https://ip-ovm5dm70z-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes --meta actor=codex --meta release=l12-service-record-backend-20260618`

Backend release preflight:

```text
corepack pnpm release:preflight
PASS private-copy API routes are in the backend package
PASS voice-coach static assets are in the backend package
PASS professional-learning static assets are in the backend package
PASS backend app package is not a static-only deploy folder
backend release package check passed: 4/4
```

Pre-deploy backend checks:

```text
node --test tests/service-record-minutes-v2.static.test.js tests/service-record-l12-recorder-card.static.test.js
8/8 pass

corepack pnpm exec tsc --noEmit --pretty false
pass

corepack pnpm build
pass

candidate file whitelist
13/13 files are under service-record-only prefixes; forbidden_hits=0
```

Pre-deploy production smoke:

```text
/api/mp/profile -> 401 auth_required
/api/mp/virtual-pay/products -> 200
/api/mp/service-records/sessions -> 401 auth_required
/api/mp/service-records/device-files/check -> 401 auth_required
/api/mp/service-records/.../audio/... -> 401 auth_required
/api/voice-coach/sessions -> 401
/api/voice-coach/opening-prepare -> 404, intentionally excluded
```

Backend smoke results:

```text
Vercel inspect:
deployment dpl_12iHYcNMYWpkn88PKS8NgtXgjAWE
target production
status Ready
aliases www.ipnrgc.com, ip.ipgongchang.xin, ipnrgc.com

https://www.ipnrgc.com
PASS GET /api/mp/profile -> 401 auth_required
PASS GET /api/mp/virtual-pay/products -> 200 products JSON
PASS GET /api/mp/service-records/sessions -> 401 auth_required
PASS POST /api/mp/service-records/device-files/check -> 401 auth_required
PASS GET /api/mp/service-records/sessions/test-session/audio/test-segment -> 401 auth_required
PASS POST /api/mp/service-records/sessions/test-session/oss-upload -> 401 auth_required
PASS POST /api/mp/service-records/sessions/test-session/segments/oss -> 401 auth_required
PASS POST /api/voice-coach/sessions -> 401 auth boundary
PASS POST /api/voice-coach/opening-prepare -> 404, intentionally excluded

https://ip.ipgongchang.xin
PASS GET /api/mp/profile -> 401 auth_required
PASS GET /api/mp/virtual-pay/products -> 200 products JSON
PASS GET /api/mp/service-records/sessions -> 401 auth_required
PASS POST /api/mp/service-records/device-files/check -> 401 auth_required
PASS GET /api/mp/service-records/sessions/test-session/audio/test-segment -> 401 auth_required
PASS POST /api/mp/service-records/sessions/test-session/oss-upload -> 401 auth_required
PASS POST /api/mp/service-records/sessions/test-session/segments/oss -> 401 auth_required
PASS POST /api/voice-coach/sessions -> 401 auth boundary
PASS POST /api/voice-coach/opening-prepare -> 404, intentionally excluded

corepack pnpm release:verify:professional-images
PASS renderedUniqueUrls=819 ok=819 failureCount=0
```

## Mini-program Upload

- WeChat AppID: not used
- Upload version: none
- Upload command: not run
- Upload result: not run

## Risk Checklist

- Unknown dirty changes: present in main workspaces but excluded by temp package deployment.
- Deleted files: none known in candidate package.
- Route conflicts: checked; candidate changes are service-record scoped.
- Product/point display conflicts: not included.
- Store account permission conflicts: not included.
- Service-record backend availability: post-deploy smoke passed on both production domains.
- Test data visibility: no production data/schema changes.

## Rollback / Recovery

- Previous backend deployment URL before this release: `https://ip-7x375ul3m-a171240s-projects.vercel.app`
- Previous mini-program version: unchanged.
- Database rollback note: no DB change.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: yes, backend-only
- Released by: Codex
- Release time: 2026-06-18 16:13:48 CST
- Follow-up items: real-device L12 service-record test after backend deploy
