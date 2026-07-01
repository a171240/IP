# Release Manifest: App API online 404 restore (2026-07-01)

## Basic Info

- Release date: 2026-07-01
- Release thread: pending user authorization; current thread is preparing local manifest only
- Operator: Codex
- Version: `app-api-online-404-restore-2026-07-01`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend candidate HEAD before this manifest refresh commit: `6fb91a0`
- App planning repository: `/Users/Admin/Documents/美业话镜APP`
- App branch: `main`
- App evidence HEAD before this manifest refresh commit: `9ced9975`
- Production host: `https://api-cn.ipgongchang.xin`
- Data/schema scope: no production data or schema write in this manifest

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? No.
- Are production deploy/update actions authorized? No.
- Are all other threads frozen from production deploy/upload? Not established.
- Is this release allowed to touch production data or schema? No.
- Current allowed action: local documentation, local checks, and read-only online boundary probes.

## Workspace State Snapshot

This snapshot was refreshed after the local App evidence and backend
release-gate commits. Release execution must still use a clean release worktree
or an exact staged subset.

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 419]
?? scripts/deploy-aliyun-backend-image-hotfix.mjs
```

App planning status:

```text
## main
```

Untracked files that must be included:

```text
None.
```

Dirty files intentionally excluded:

```text
Backend: scripts/deploy-aliyun-backend-image-hotfix.mjs
App: none at snapshot time
Release execution must use an audited clean release worktree or an exact staged subset; the untracked backend hotfix script is excluded from this manifest.
```

## Current Online Baseline

Current online image evidence from `deploy/aliyun-production-cn.image-publish.local.json`:

- Online source commit recorded in current image evidence: `6a9faa5a3c7d949b5ffec8aa7ae81dcbce41a064`
- Current backend candidate HEAD before this manifest refresh commit: `6fb91a0`
- Current ACR remote digest: `sha256:ebc50349625891b26aa74f0f76bd6726c3f86f34aeff9f20b7741b1954bc0937`
- Current SAE app: `meiye-huajing-app-api-production-cn`
- Current SAE app id: `41b347a0-ae54-4215-9ee6-8dc82c427dd2`
- Current last image change order: `2339926a-4f12-49e0-9271-a205c1e4aaa4`
- Current rollback tag: `rollback-rds-smoke-20260629-1356`
- Current rollback digest: `sha256:6d834e53125cc6473f827b2decde127cf582fb9fa705ba09252908ca9c15997b`

Read-only online boundary on 2026-07-01:

```text
checked=20
200=2
401=11
404=7
ok=false
tokenSent=false
requestBodySent=false
```

The 7 current blockers:

```text
GET /api/app/posters/templates
GET /api/app/posters/history
GET /api/app/xhs/drafts
GET /api/app/private-copy/drafts
GET /api/app/learning/progress?modules=professional,speech&include_entities=true
GET /api/app/voice-coach/sessions?limit=5
GET /api/app/knowledge-spaces
```

## Included Changes For Candidate Release

This manifest is for a backend-only production-cn candidate that publishes the App-facing facade routes added after the currently recorded online source commit.

Relevant route commits after `6a9faa5`:

```text
6f59a0a app-api: close package two facades
16603a0 app-api: add content workflow facades
6787302 app-api: add voice coach app facade
e01b31c app-api: add online readonly boundary check
76a7fad app-api: refresh rds migration evidence counts
```

Related local release-gate commits after the route closure:

```text
f61815b release: require app api online boundary gate
e1a6d77 app-api: harden aliyun health smoke gates
273aa22 docs: add app api online restore manifest
6fb91a0 docs: refresh aliyun production evidence gates
```

Relevant route files added after the currently recorded online source commit include:

```text
app/api/app/content-drafts/route.ts
app/api/app/knowledge-spaces/route.ts
app/api/app/knowledge-spaces/[...path]/route.ts
app/api/app/learning/progress/route.ts
app/api/app/learning/progress/events/route.ts
app/api/app/learning/progress/sync/route.ts
app/api/app/posters/templates/route.ts
app/api/app/posters/history/route.ts
app/api/app/posters/generate/route.ts
app/api/app/private-copy/drafts/route.ts
app/api/app/private-copy/generate/route.ts
app/api/app/voice-coach/sessions/route.ts
app/api/app/voice-coach/sessions/[sessionId]/route.ts
app/api/app/voice-coach/sessions/[sessionId]/asr-preview/route.ts
app/api/app/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts
app/api/app/voice-coach/sessions/[sessionId]/end/route.ts
app/api/app/voice-coach/sessions/[sessionId]/events/route.ts
app/api/app/voice-coach/sessions/[sessionId]/report/route.ts
app/api/app/voice-coach/sessions/[sessionId]/turns/[turnId]/tts/route.ts
app/api/app/xhs/drafts/route.ts
app/api/app/xhs/generate-v4/route.ts
app/api/app/xhs/generate-cover-image/route.ts
app/api/app/xhs/content/danger-check/route.ts
```

## Explicitly Not Included

- Git push.
- WeChat mini-program upload.
- App Store or Android market submission.
- App native signing/install/launch.
- Production database/schema write.
- Production write smoke or test-data creation.
- Real token smoke until `APP_DEVICE_ID`, employee token, and manager token are supplied through shell env.
- The untracked backend script `scripts/deploy-aliyun-backend-image-hotfix.mjs`.
- Any App Store, Android market, WeChat mini-program, native signing, install, or launch action.

## Database Changes

- Supabase migration files: none.
- RDS schema/data write: not included.
- Applied to production: no.
- Rollback/recovery plan: no database rollback required for this candidate; route restore should be rolled back by SAE image rollback if needed.

## Backend Deployment

Target:

```text
Provider: Aliyun SAE custom container
App: meiye-huajing-app-api-production-cn
Region: cn-hangzhou
Domain: https://api-cn.ipgongchang.xin
```

Deploy command:

```text
Not authorized in the current thread.
```

Pre-release local checks to rerun before any deploy authorization is used:

```bash
git diff --check
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:routes:check
corepack pnpm aliyun:app-api:bridge-map
corepack pnpm aliyun:app-client:contract
corepack pnpm aliyun:app-api:coverage
corepack pnpm aliyun:predeploy
node scripts/check-app-api-online-readonly-boundary.mjs --base-url https://api-cn.ipgongchang.xin --timeout-ms 15000
```

Already rerun in this control round:

```text
aliyun:routes:check PASS, checkedRoutes=59, failures=[]
aliyun:app-api:bridge-map PASS, mappedRoutes=33, failures=[]
aliyun:app-client:contract PASS, clientApiCalls=70, matchedBackendRoutes=54, failures=[]
aliyun:app-api:coverage PASS, businessRoutes=57, coveredBusinessRoutes=57
aliyun:health:smoke PASS with expectedMissing=[aliyunRds]
aliyun:app-api:smoke PASS, checkedProbes=32, localRdsUnavailableExpected=2
online-readonly-boundary FAIL as expected, checked=20, 200=2, 401=11, 404=7
App status:all-pages:check PASS at HEAD 9ced9975
Native gap runbook PASS, status=LOCAL_PREFLIGHT_ONLY, nativeGapRoutes=8
```

Post-deploy smoke acceptance:

```text
online-readonly-boundary ok=true
routeBlockers=[]
404 text/html=0
health endpoints remain 200 application/json
auth-gated business GET routes return JSON 401/auth_required or expected JSON guard when unauthenticated
no 5xx
```

## App / Mini-program Upload

- App upload/build distribution: not included.
- Mini-program upload: not included.
- Native real-device verification: not included.

## Risk Checklist

- Unknown dirty changes: backend untracked hotfix script is excluded; App main was clean at snapshot time.
- Deleted files: none observed in this manifest round.
- Route conflicts: current online source commit predates the App-facing facade route commits listed above.
- Product/point display conflicts: not included.
- Store account permission conflicts: login/token success smoke pending test credentials.
- Service-record backend availability: local route/coverage passes; true write chain and native recording remain outside this release manifest.
- Test data visibility: no production write/test data action authorized.

## Rollback / Recovery

- Previous backend deployment ID/change order before candidate: current SAE image change order `2339926a-4f12-49e0-9271-a205c1e4aaa4`.
- Current rollback tag: `rollback-rds-smoke-20260629-1356`.
- Current rollback digest: `sha256:6d834e53125cc6473f827b2decde127cf582fb9fa705ba09252908ca9c15997b`.
- Database rollback note: no schema/data change in this candidate.
- Recovery path: if candidate deploy fails health or online boundary, revert SAE image to the recorded rollback tag/digest and rerun health plus online boundary probes.

## Final Decision

- Release approved: No.
- Released by: not released.
- Release time: not released.
- Follow-up items:
  - User must explicitly authorize a backend-only production-cn release thread before any image build/push/SAE deploy.
  - Release thread must rerun the pre-release checks above.
  - After deploy, `online-readonly-boundary` must show `404=0` before App all-pages online availability can advance.
  - After 404 clears, collect `APP_DEVICE_ID`, employee token, and manager token through shell env for login-state read-only smoke.
