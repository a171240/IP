# Release Manifest - Evolink Image Fallback

## Basic Info

- Release date: 2026-05-19
- Release thread: yes, user requested deploying the new image API fallback for today's mini-program availability
- Operator: Codex
- Version: backend production hotfix for image generation fallback
- Backend repository: `D:\IP网站`
- Backend branch: `codex/backend-main-checkpoint-20260514`
- Mini-program repository: `E:\美业话镜`
- Mini-program branch: `main`
- Supabase project/environment: production, no schema changes; CLI smoke created and deleted a temporary auth/profile test user

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, for backend deployment of the new image API fallback.
- Are all other threads frozen from production deploy/upload? Not independently verified.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status:

```text
## codex/backend-main-checkpoint-20260514
 M app/api/mp/posters/generate/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/segments/route.ts
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M lib/service-records/processing.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-05-19-evolink-image-fallback.md
```

Mini-program status:

```text
## main...origin/main [ahead 8]
A  docs/store-admin-manager-workbench-dev-plan.md
 M pages/service-record/detail/index.js
 M pages/service-record/index.js
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
M  pages/store-admin/index.js
M  pages/store-admin/index.wxml
M  pages/store-admin/index.wxss
M  pages/store-admin/members/index.js
M  pages/store-admin/members/index.wxml
M  pages/store-admin/members/index.wxss
```

Untracked files that must be included:

```text
docs/release-manifest-2026-05-19-evolink-image-fallback.md
```

Dirty files intentionally excluded:

```text
Backend pre-existing unrelated dirty files:
- app/api/mp/service-records/sessions/[sessionId]/segments/route.ts
- lib/service-records/processing.server.ts

Mini-program workspace was not deployed or uploaded.
```

Final production deployment was made from a detached clean temporary worktree
that only contained the image fallback files listed in Included Changes. An
earlier deployment from the dirty backend workspace was immediately superseded.

## Included Changes

- `lib/posters/gpt-image-2.server.ts`: add Evolink image provider fallback behind `EVOLINK_IMAGE_*` env vars.
- `lib/posters/gpt-image-2.server.ts`: support `EVOLINK_IMAGE_PRIMARY=1` so Evolink can be used as today's primary image channel while APIMart is degraded.
- `lib/posters/gpt-image-2.server.ts`: keep APIMart available as fallback; retry fallback on upstream overload, provider timeout, or retryable provider error.
- `lib/posters/gpt-image-2.server.ts`: split Evolink timeout/retry env handling from APIMart timeout/retry env handling.
- `lib/posters/gpt-image-2.server.ts`: support Evolink task response fields `id`, `results`, and `result_data`.
- `app/api/mp/xhs/generate-cover-image/route.ts`: return clearer public image-generation error messages and status codes.
- `app/api/mp/posters/generate/route.ts`: return clearer public image-generation error messages and status codes.
- `tests/xhs-cover-style.static.test.js`: update static assertion for provider fallback support.
- Vercel production env:
  - `EVOLINK_IMAGE_API_KEY`
  - `EVOLINK_IMAGE_MODEL=gpt-image-2`
  - `EVOLINK_IMAGE_BASE_URL=https://api.evolink.ai/v1`
  - `EVOLINK_IMAGE_QUALITY=low`
  - `EVOLINK_IMAGE_PRIMARY=1`
  - `EVOLINK_IMAGE_POLL_TIMEOUT_MS=55000`
  - `APIMART_IMAGE_POLL_TIMEOUT_MS=6000`
  - `APIMART_IMAGE_REQUEST_TIMEOUT_MS=6000`

## Explicitly Not Included

- No WeChat mini-program upload.
- No Supabase schema change. CLI smoke created a temporary Supabase auth/profile test user, called the production mini-program API, then deleted the test user/profile.
- No service-record backend changes intentionally included in scope, although pre-existing dirty service-record files were present in the workspace.
- No automatic fallback expiration; fallback should be manually removed after APIMart is retested and confirmed stable.

## Database Changes

- Supabase migration files: none
- Applied to production: no schema/data migration
- Smoke-test data note: temporary auth/profile test user was created and deleted; the normal analytics event for the successful API request remains.
- Rollback/recovery plan: not applicable for schema; remove/disable Evolink env if the hotfix is rolled back.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not used
- Production deployment ID: `dpl_BXZCn47yUrTYQEUMRMAnXNB4S2zh`
- Superseded deployment IDs: `dpl_UWmfExRHVgvbsjqX99KYrzXnbABc`, `dpl_5uzrhoSbfDVDGZv1kt4tijA8XEAR`, `dpl_92rxzgueAAjzQz5TwqF1hMaQmMes`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `npx vercel --prod --yes` from a detached clean temporary worktree

Backend smoke results:

```text
corepack pnpm build
- passed locally
- 313 existing ESLint warnings, 0 errors

provider timeout static check
- passed; Evolink timeout no longer falls back to APIMart timeout config

POST https://www.ipnrgc.com/api/mp/xhs/generate-cover-image {}
- 401 auth_required, route exists and auth guard active

POST https://www.ipnrgc.com/api/mp/xhs/generate-cover-image with temporary Supabase access_token
- 200 in 39.9s
- source: evolink:gpt-image-2
- image URL returned and HEAD checked as image/png, 1,270,700 bytes
- AI points cost header: 0, unlimited test profile

POST https://www.ipnrgc.com/api/mp/posters/generate {}
- 400 invalid_payload, route exists and validation active

GET https://www.ipnrgc.com/api/mp/profile
- 401 auth_required, route exists and auth guard active

GET https://www.ipnrgc.com/api/mp/virtual-pay/products
- 200, product route available

Vercel logs for final deployment over the first 10 minutes:
- successful CLI smoke log: POST /api/mp/xhs/generate-cover-image 200 at 2026-05-19 18:04 CST
```

Required backend checks:

- `/api/mp/profile`: 401 auth_required
- `/api/mp/virtual-pay/products`: 200
- `/api/mp/service-records/sessions`: not changed in this release
- Any changed admin/store route: none

## Mini-program Upload

- WeChat AppID: not used
- DevTools CLI path: not used
- Upload version: not uploaded
- Upload description: not uploaded
- Upload command: none
- Upload result: none

Mini-program local checks:

```text
not applicable; mini-program files were not changed by this release
```

Required mini-program checks:

- `app.json` routes exist: not checked
- Mine page loads: not checked
- Store workspace loads: not checked
- Staff training page loads: not checked
- Pay/service package page loads: not checked
- Service record entry behaves as expected: not checked

## Risk Checklist

- Unknown dirty changes: backend has pre-existing service-record dirty files; mini-program has staged/unstaged unrelated dirty files.
- Deleted files: none observed.
- Route conflicts: image generation routes touched; smoke confirms route availability.
- Product/point display conflicts: refund path preserved on generation failure.
- Store account permission conflicts: not touched.
- Service-record backend availability: not intentionally changed; dirty files remain outside release scope.
- Test data visibility: temporary test auth/profile user was deleted after CLI smoke; analytics event for the smoke request remains.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_DxMYDCHmvZWHJSWn24HjZwtesBzJ`
- Previous mini-program version: unchanged
- Database rollback note: none
- Recovery path:
  - Roll back Vercel production alias to `dpl_DxMYDCHmvZWHJSWn24HjZwtesBzJ` if image fallback deployment causes regressions.
  - Set `EVOLINK_IMAGE_PRIMARY=0` or remove `EVOLINK_IMAGE_API_KEY` after APIMart recovers and has passed a fresh live test.
- Who should be notified: product/operator owner

## Final Decision

- Release approved: yes, backend production hotfix deployed
- Released by: Codex
- Release time: 2026-05-19 18:04 CST
- Follow-up items:
  - Re-test APIMart image generation tomorrow before disabling Evolink fallback.
  - If APIMart is healthy, remove `EVOLINK_IMAGE_PRIMARY` or set it to `0`, then restore APIMart timeout values if needed.
