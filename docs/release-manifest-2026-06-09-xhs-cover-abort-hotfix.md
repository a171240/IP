# Release Manifest: XHS Cover Abort/Fallback Hotfix

## Basic Info

- Release date: 2026-06-14
- Release thread: this Codex thread; user authorized this thread as the backend release thread on 2026-06-14.
- Operator: Codex
- Version: backend XHS cover abort/timeout provider fallback hotfix
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production; no schema/data writes included.

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `授权本线程作为这次后端 release thread`.
- Are all other threads frozen from production deploy/upload? Not globally confirmed; this release was scoped to backend Vercel production deploy only.
- Is this release allowed to touch production data or schema? No. No Supabase write, schema change, or data migration is included.
- Is production deployment allowed now? Yes, backend Vercel production deploy only.

## Current Context

This hotfix was tested and deployed during the historical 2026-06-09 XHS cover incident, but the current backend HEAD has since moved through later clean releases:

- `76aef92 release poster backend protocol fix`
- `8125c4c Add Manbeilian knowledge covers`
- `c21708b Cache Manbeilian knowledge images immutably`
- `74ccffe Document Manbeilian cache header release`

The later Manbeilian cache-header production deploy was built from a clean package and intentionally excluded the still-dirty XHS cover fallback files. This release recommitted and redeployed that XHS cover fallback diff so it is live again on the production aliases listed below.

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

## Verification Completed Before Deploy

```text
node --test tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js
PASS, 8/8

corepack pnpm exec tsc --noEmit --pretty false
PASS

corepack pnpm exec eslint lib/posters/gpt-image-2.server.ts app/api/mp/xhs/generate-cover-image/route.ts tests/image-provider-fallback.runtime.test.js tests/xhs-cover-style.static.test.js
PASS with 0 errors; test files have existing CommonJS require warnings.

git diff --check -- app/api/mp/xhs/generate-cover-image/route.ts lib/posters/gpt-image-2.server.ts tests/xhs-cover-style.static.test.js docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md tests/image-provider-fallback.runtime.test.js
PASS

corepack pnpm build
PASS. Build completed with existing lint/runtime warnings.

node tools/check-mp-api-contract-before-asset-release.js https://www.ipnrgc.com
PASS, 12/12

node tools/check-mp-api-contract-before-asset-release.js https://ip.ipgongchang.xin
PASS, 12/12

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

Do not cite those ids as the current production deployment for this release. The current production deployment is `dpl_Aouj9rTAtFgppCKVrHUMzN8XtVxL`.

## Backend Deployment

- Vercel project: `a171240s-projects/ip`
- Preview deployment URL: not run for this release.
- Production deployment ID: `dpl_Aouj9rTAtFgppCKVrHUMzN8XtVxL`
- Production deployment URL: `https://ip-5xu8bj2hw-a171240s-projects.vercel.app`
- Production inspector URL: `https://vercel.com/a171240s-projects/ip/Aouj9rTAtFgppCKVrHUMzN8XtVxL`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: `npx --yes vercel@latest deploy --prod --yes --project ip --scope a171240s-projects`

Post-deploy smoke:

```text
node tools/check-mp-api-contract-before-asset-release.js https://www.ipnrgc.com
PASS, 12/12

node tools/check-mp-api-contract-before-asset-release.js https://ip.ipgongchang.xin
PASS, 12/12

POST https://www.ipnrgc.com/api/mp/xhs/generate-cover-image without auth
401 auth_required; x-matched-path=/api/mp/xhs/generate-cover-image

POST https://ip.ipgongchang.xin/api/mp/xhs/generate-cover-image without auth
401 auth_required; x-matched-path=/api/mp/xhs/generate-cover-image

GET https://www.ipnrgc.com/api/mp/posters/templates
200; templates=13; layoutPresets=10; visualStylePresets=7

GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg
200 image/jpeg; cache-control=public, max-age=31536000, immutable
```

## Mini-program Upload

- WeChat AppID: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: not run.
- Upload result: not uploaded.

## Risk Checklist

- Unknown dirty changes: none after the XHS fallback commit; backend worktree only has this release-manifest update pending.
- Mini-program dirty changes: present, intentionally excluded.
- Deleted files: none observed in this release.
- Route conflicts: only `/api/mp/xhs/generate-cover-image` backend route is changed.
- Product/point display conflicts: no billing contract change; failure refund path remains.
- Store account permission conflicts: no account or permission logic changed.
- Supabase risk: no schema/data write included.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_F9vCQJKnkiimJnWXHAio9KkeFsws`
- Previous mini-program version: unchanged; no upload.
- Database rollback note: no database rollback needed.
- Recovery path: if fallback timing is wrong, adjust `APIMART_IMAGE_FALLBACK_AFTER_MS` and redeploy; if provider path is unstable, temporarily set Evolink primary only with explicit release approval; otherwise promote/rollback to the prior backend deployment.

## Final Decision

- Release approved: yes, backend production deploy only.
- Released by: Codex
- Release time: 2026-06-14 23:39 CST
- Current decision: released to Vercel production; no mini-program upload and no Supabase write.
- Follow-up items after deploy: monitor `mp_xhs_cover_gpt_image_fail` and `mp_xhs_cover_success` for `message`, `model`, `fallbackUsed`, `providerFailureCount`, `providerElapsedMs`, and `totalElapsedMs`.
