# Release Manifest: Professional Learning Static Assets Restore

## Basic Info

- Release date: 2026-06-18
- Release thread: current Codex thread, user authorized with "开始修复"
- Operator: Codex
- Version: professional-learning-static-assets-restore-20260618
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, by confirming the fix after the release-thread requirement was stated.
- Are all other threads frozen from production deploy/upload? Not globally confirmed. This release uses a clean temp package to avoid unrelated mini-program upload or Supabase changes.
- Is this release allowed to touch production data or schema? No. Static asset restore only.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 14]
 M app/api/mp/posters/generate/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/oss-upload/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/segments/oss/route.ts
 M app/api/voice-coach/sessions/route.ts
 M lib/mp/account-context.server.ts
 M lib/mp/ai-points.server.ts
 M lib/posters/templates.ts
 M lib/service-records/processing.server.ts
 M lib/service-records/segments.server.ts
 M lib/service-records/server.ts
 M lib/voice-coach/session-context.ts
 M lib/voice-coach/training.server.ts
 M scripts/check-backend-release-package.mjs
 M scripts/required-professional-learning-rendered-assets.json
 M tests/poster-premium-prompt.static.test.js
 M tests/service-record-minutes-v2.static.test.js
?? app/api/app/service-records/sessions/[sessionId]/audio/
?? app/api/app/store-admin/invites/[token]/qrcode/
?? app/api/mp/service-records/device-files/
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? app/api/mp/service-records/sessions/[sessionId]/device-files/
?? app/api/mp/store-admin/invites/[token]/qrcode/
?? app/api/voice-coach/opening-prepare/
?? docs/professional-learning-static-assets-prod-404-investigation-2026-06-18.md
?? public/professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/
?? public/professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/
?? public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
?? public/professional-learning-assets/professional-learning/v3-imagegen/skin-system/
?? public/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/
```

Mini-program status before release: dirty; no mini-program upload is included.

## Included Changes

- Restore current professional-learning static JPGs under `public/professional-learning-assets`.
- Include 941 JPG files under `professional-learning/v3-imagegen`.
- Include the updated backend release guard and 819 rendered-image required-assets manifest.
- Preserve current production-exposed L12/store invite helper routes needed by the active backend package.

## Explicitly Not Included

- No WeChat mini-program upload.
- No Supabase migration or production data change.
- No Vercel alias change beyond the production deployment.

## Database Changes

- Supabase migration files: none applied.
- Applied to production: no.
- Rollback/recovery plan: redeploy the previous Vercel production deployment if this static restore causes backend regression.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_FwFcEx4TD7n8bYu3o7wVciQasacF`
- Previous production alias/domain: `https://www.ipnrgc.com`
- Release package: `/tmp/ip-professional-assets-restore-20260618.K9u1DZ`
- Deploy command: `pnpm dlx vercel@54.9.1 deploy --prebuilt --prod --yes`
- Production deployment ID: `dpl_8ipsmrfMbKeSxK6e9NDjRpVEJQgs`
- Production deployment URL: `https://ip-7x375ul3m-a171240s-projects.vercel.app`

Backend checks before release:

```text
node scripts/check-backend-release-package.mjs
backend release package check passed: 4/4

node tools/check-professional-learning-image-coverage.js
failureCount: 0

node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000
renderedUniqueUrls: 819
failureCount: 808
```

Backend package/build checks before deploy:

```text
release package v3-imagegen JPG count: 941
node scripts/check-backend-release-package.mjs
backend release package check passed: 4/4

pnpm dlx vercel@54.9.1 build --prod
Build completed successfully.
```

## Required Post-Release Checks

```bash
node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000
```

Expected:

```text
renderedUniqueUrls: 819
failureCount: 0
```

Actual after release:

```text
node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000
renderedUniqueUrls: 819
ok: 819
failureCount: 0
```

Representative image GETs must return `200 image/jpeg`:

```text
/professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg
/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/M01/pages/M01-01.jpg
/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg
/professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/EC01/pages/EC01-P01.jpg
/professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/A01/pages/A01-P01.jpg
```

Actual representative checks after release:

```text
skin-system/S00-01/pages/S00-01-P01.jpg -> 200 image/jpeg
meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg
zangfu-system/Z00/pages/Z00-01.jpg -> 200 image/jpeg
entrance-covers/EC01/pages/EC01-P01.jpg -> 200 image/jpeg
customer-speech-system/A01/pages/A01-P01.jpg -> 200 image/jpeg
```

Backend auth-boundary smoke after release:

```text
GET /api/mp/profile -> 401 auth_required, x-matched-path /api/mp/profile
GET /api/mp/virtual-pay/products -> 200 application/json, x-matched-path /api/mp/virtual-pay/products
GET /api/mp/service-records/sessions -> 401 application/json, x-matched-path /api/mp/service-records/sessions
GET /api/mp/service-records/device-files/check -> 405, x-matched-path /api/mp/service-records/device-files/check
GET /api/mp/store-admin/invites/test-token/qrcode -> 404 application/json, x-matched-path /api/mp/store-admin/invites/[token]/qrcode
```

## Risk Checklist

- Unknown dirty changes: controlled by clean temp package.
- Deleted files: none intended.
- Route conflicts: production already contains newer service-record routes; static restore must not roll them back.
- Remote image risk: current production fails 808/819, restore must pass 819/819.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: auth-boundary smoke required after deployment.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_FwFcEx4TD7n8bYu3o7wVciQasacF`
- Previous mini-program version: no upload in this release.
- Database rollback note: none.
- Who should be notified: project owner.

## Final Decision

- Release approved: yes.
- Released by: Codex
- Release time: 2026-06-18 15:14:59 CST
- Follow-up items: keep `scripts/required-professional-learning-rendered-assets.json` updated whenever professional-learning rendered URLs change.
