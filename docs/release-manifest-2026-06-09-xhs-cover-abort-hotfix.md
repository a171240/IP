# Release Manifest: XHS Cover Abort/Fallback Hotfix Candidate

## Basic Info

- Release date: 2026-06-14
- Release thread: pending user confirmation; this document is a release candidate, not a completed production release record.
- Operator: Codex
- Version: backend XHS cover abort/timeout provider fallback hotfix
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production; no schema/data writes included.

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? No. Current scope is repository整理 and commit-candidate review only.
- Are all other threads frozen from production deploy/upload? Not globally confirmed.
- Is this release allowed to touch production data or schema? No. No Supabase write, schema change, or data migration is included.
- Is production deployment allowed now? No. A future Vercel production deploy requires explicit release-thread authorization.

## Current Context

This hotfix was tested and deployed during the historical 2026-06-09 XHS cover incident, but the current backend HEAD has since moved through later clean releases:

- `76aef92 release poster backend protocol fix`
- `8125c4c Add Manbeilian knowledge covers`
- `c21708b Cache Manbeilian knowledge images immutably`
- `74ccffe Document Manbeilian cache header release`

The later Manbeilian cache-header production deploy was built from a clean package and intentionally excluded the still-dirty XHS cover fallback files. Therefore the XHS cover fallback diff in this worktree must be treated as a current release candidate that needs a fresh commit and future production deploy before it is considered live again.

The poster backend protocol fix is a separate change and has already gone live through the later clean deploy. This manifest is only for `/api/mp/xhs/generate-cover-image` provider fallback and timeout handling.

## Workspace State

Backend status at review time:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 12]
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? tests/image-provider-fallback.runtime.test.js
```

Mini-program status at review time:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 37]
 M pages/service-record/detail/index.wxml
 M pages/service-record/detail/index.wxss
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/store-admin/service-records/detail/index.wxml
 M pages/store-admin/service-records/detail/index.wxss
 M pages/voice-coach/index.wxss
 M tools/check-voice-coach-remote-images.js
?? docs/manbeilian-knowledge-space-training-dev-doc-2026-06-10.md
?? docs/manbeilian-mini-program-asset-audit-2026-06-12.md
?? docs/manbeilian-project-card-knowledge-base-dev-doc-2026-06-10.md
?? docs/manbeilian-web-driven-knowledge-base-dev-doc-2026-06-13.md
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? docs/service-record-smart-minutes-product-design-blueprint-2026-06-14.md
?? docs/service-record-world-class-ui-framework-2026-06-14.md
?? manbeilian-current-html-after-card-refresh.png
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
```

## Included Changes

- Treat `AbortError`, `This operation was aborted`, request aborts, and timeout-like provider messages as image generation timeout errors.
- Map timeout-like provider failures to the existing public timeout message and HTTP 504.
- Let retryable abort/timeout/pending failures fall through to the next configured provider/model candidate.
- Add `APIMART_IMAGE_FALLBACK_AFTER_MS`; default APIMart fallback window is 150 seconds.
- Mark APIMart task `failed`, missing task id, request timeout, and long-pending task states as retryable when a fallback provider exists.
- Keep failed generation refund behavior unchanged.
- Add response and analytics telemetry: `model`, `fallbackUsed`, `providerFailureCount`, `providerElapsedMs`, `totalElapsedMs`.
- Add runtime coverage for APIMart aborted task fallback and pending-past-window fallback.

## Explicitly Not Included

- No mini-program upload.
- No Supabase schema or production data change.
- No auth, billing contract, Storage contract, or request payload schema change.
- No poster protocol change; that work is already separate.
- No Manbeilian static asset or cache-header change.

## Files To Commit

```text
app/api/mp/xhs/generate-cover-image/route.ts
lib/posters/gpt-image-2.server.ts
tests/xhs-cover-style.static.test.js
tests/image-provider-fallback.runtime.test.js
docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
```

## Files Intentionally Excluded

Mini-program dirty files are not part of this backend hotfix:

```text
pages/service-record/**
pages/store-admin/service-records/**
pages/voice-coach/index.wxss
tools/check-voice-coach-remote-images.js
docs/manbeilian*.md
docs/professional-learning*.md
docs/service-record*.md
manbeilian-current-html-after-card-refresh.png
tools/build-manbeilian-knowledge-*.js
```

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: not applicable; no database mutation.

## Verification Completed For Commit Candidate

```text
node --test tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js
PASS, 8/8

corepack pnpm exec tsc --noEmit --pretty false
PASS

corepack pnpm exec eslint lib/posters/gpt-image-2.server.ts app/api/mp/xhs/generate-cover-image/route.ts tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js
PASS with 0 errors; test files have existing CommonJS require warnings.

git diff --check -- app/api/mp/xhs/generate-cover-image/route.ts lib/posters/gpt-image-2.server.ts tests/xhs-cover-style.static.test.js docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md tests/image-provider-fallback.runtime.test.js
PASS

POST https://www.ipnrgc.com/api/mp/xhs/generate-cover-image without auth
401 auth_required; x-matched-path=/api/mp/xhs/generate-cover-image
```

## Historical Evidence From 2026-06-09

These records explain why the fallback window and telemetry fields exist. They are not evidence that the current dirty diff is live.

- Production failures around 2026-06-09 18:27-18:31 CST showed `mp_xhs_cover_gpt_image_fail` / `xhs_cover_fail` with message `This operation was aborted`.
- APIMart direct timing check completed a real `gpt-image-2` task in `102806ms` after remaining `pending` before completion.
- A 90-second fallback window was too short for normal APIMart behavior; the intended production window is 150 seconds unless later release testing changes it.
- Historical authenticated smoke on 2026-06-09 returned `200`, `model=gpt-image-2`, `fallbackUsed=false`, `providerFailureCount=0`, with temporary test auth/profile data deleted.

Historical deployment ids from that incident included:

```text
dpl_HeLntjABEeg4c38qQwX1Hpofunj3
dpl_2AaXAYGbfWeH5G3tNXoxWTkp5A8S
dpl_AU1JNHLd46tkQo7Xojh4tDA4p6wB
dpl_BtEEbGS9CdVejJxWJtDiUbpfpCVE
dpl_CFhme2kMB3GyuT64cAyAATDS3uex
dpl_5zDVpKbc8yDDLC9sbd5KvKbnwWnS
```

Do not cite those ids as the current production deployment for this candidate. The current production baseline at this handoff is the later Manbeilian cache-header release.

## Required Before Production Deployment

- User explicitly names this thread as the backend release thread.
- Confirm no unrelated backend dirty files are staged.
- Fill production deployment fields below.
- Run or intentionally waive `corepack pnpm build`.
- Run API contract checks after deploy.
- Confirm unauthenticated `/api/mp/xhs/generate-cover-image` still returns `401 auth_required`.
- If doing an authenticated smoke, note that it burns one real image generation and must clean up test auth/profile data.

## Backend Deployment

- Vercel project: `a171240s-projects/ip`
- Preview deployment URL: not run for this candidate.
- Production deployment ID: not deployed in current整理 thread.
- Production deployment URL: not deployed in current整理 thread.
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: not run; production deploy requires explicit release-thread authorization.

## Mini-program Upload

- WeChat AppID: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: not run.
- Upload result: not uploaded.

## Risk Checklist

- Unknown dirty changes: no unknown backend files outside the listed 6 candidate files.
- Mini-program dirty changes: present, intentionally excluded.
- Deleted files: none observed in this candidate.
- Route conflicts: only `/api/mp/xhs/generate-cover-image` backend route is changed.
- Product/point display conflicts: no billing contract change; failure refund path remains.
- Store account permission conflicts: no account or permission logic changed.
- Supabase risk: no schema/data write included.

## Rollback / Recovery

- Previous backend deployment ID: use the production deployment immediately before the future release deploy.
- Previous mini-program version: unchanged; no upload.
- Database rollback note: no database rollback needed.
- Recovery path: if fallback timing is wrong, adjust `APIMART_IMAGE_FALLBACK_AFTER_MS` and redeploy; if provider path is unstable, temporarily set Evolink primary only with explicit release approval; otherwise promote/rollback to the prior backend deployment.

## Final Decision

- Release approved: no.
- Released by: not released.
- Release time: not released.
- Current decision: commit candidate after docs correction; production deployment pending explicit user authorization.
- Follow-up items after deploy: monitor `mp_xhs_cover_gpt_image_fail` and `mp_xhs_cover_success` for `message`, `model`, `fallbackUsed`, `providerFailureCount`, `providerElapsedMs`, and `totalElapsedMs`.
