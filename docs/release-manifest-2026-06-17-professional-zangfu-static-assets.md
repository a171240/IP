# Release Manifest: Professional Zangfu Static Assets

## Basic Info

- Release date: 2026-06-17
- Release thread: current Codex release thread, user previously authorized Vercel production deploy and mini-program upload for this version
- Operator: Codex
- Version: professional-zangfu-static-assets-20260617
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend release source: sanitized temp worktree `/tmp/ip-zangfu-static-release-20260617` at backend HEAD `f78bdf8`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes.
- Are all other threads frozen from production deploy/upload? This thread is acting as the release thread for this asset fix.
- Is this release allowed to touch production data or schema? No. Static assets only.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 14]
 M app/api/mp/posters/generate/route.ts
 M app/api/mp/service-records/sessions/[sessionId]/route.ts
 M lib/mp/account-context.server.ts
 M lib/mp/ai-points.server.ts
 M lib/posters/templates.ts
 M lib/service-records/processing.server.ts
 M lib/service-records/server.ts
 M lib/voice-coach/training.server.ts
 M tests/poster-premium-prompt.static.test.js
 M tests/service-record-minutes-v2.static.test.js
?? app/api/app/service-records/sessions/[sessionId]/audio/
?? app/api/app/store-admin/invites/[token]/qrcode/
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? app/api/mp/store-admin/invites/[token]/qrcode/
?? docs/release-manifest-2026-06-15-company-admin-role-label-production.md
?? docs/release-manifest-2026-06-15-manbeilian-knowledge-space-access.md
?? docs/release-manifest-2026-06-15-store-admin-invite-qrcode-route.md
?? lib/service-records/audio-evidence.server.ts
?? lib/wechat/
?? public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? tests/manbeilian-knowledge-space.static.test.js
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 37]
 M pages/professional/data/professional-learning-seed.js
 M pages/professional/lesson/index.wxml
 M pages/professional/lesson/index.wxss
 M pages/professional/utils/professional-learning.js
 M tools/export-professional-learning-assets.js
?? pages/professional/data/professional-learning-meridian-system-v4.js
?? pages/professional/data/professional-learning-zangfu-system-v4.js
```

Untracked files that must be included:

```text
public/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/
public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
```

Dirty files intentionally excluded:

```text
All backend API, service-record, poster, account, Supabase, WeChat, and test dirty files listed above.
All mini-program dirty files are excluded from this backend static asset deploy.
```

## Included Changes

- Publish 208 JPG files for `v3-imagegen/zangfu-system` under the professional-learning static asset host.
- Preserve existing professional-learning static assets, including `v3-imagegen/meridian-system`.

## Explicitly Not Included

- No backend API route changes.
- No Supabase migration or data change.
- No mini-program upload.
- No mini-program code deployment.
- No Vercel alias/promotion beyond the production deploy for the backend project.

## Database Changes

- Supabase migration files: none included.
- Applied to production: no.
- Rollback/recovery plan: redeploy the previous Vercel production deployment if the static asset deploy regresses unrelated routes.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: `https://ip-lh8xlpt3s-a171240s-projects.vercel.app`
- Production deployment ID: `dpl_HV1d9P8r7Dt5LgwfFdm2iDgAiJpu`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `pnpm dlx vercel@54.9.1 deploy --prod --yes`

Backend smoke results before release:

```text
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg -> 404 text/html
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z01/pages/Z01-01.jpg -> 404 text/html
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z12/pages/Z12-16.jpg -> 404 text/html
GET /professional-learning-assets/professional-learning/v3-imagegen/meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg
```

Required backend checks:

- Professional-learning remote image GET gate after deploy: PASS with runtime-equivalent URL conversion.
- Targeted GET checks for Z00, Z01, Z06, and Z12 assets: PASS.

Backend smoke results after release:

```text
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z01/pages/Z01-01.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z06/pages/Z06-01.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z12/pages/Z12-16.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg, JPEG 600x800

Custom runtime-equivalent organ-expression remote GET:
checked 208, ok 208, failureCount 0

Official remote image tool note:
node tools/check-professional-learning-remote-images.js --path organ-expression --concurrency 8 --timeout-ms 30000
reported failures on raw local meridian image paths that did not use PROFESSIONAL_LEARNING_ASSET_BASE_URL. Those failures were not accepted as the proof source for this static-asset release; targeted and runtime-equivalent remote GETs passed.
```

## Mini-program Upload

- WeChat AppID: not used in this release step.
- DevTools CLI path: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: not run.
- Upload result: not run.

Mini-program local checks:

```text
node tools/check-professional-learning-image-coverage.js --path organ-expression --require-all-step-images
PASS: lessonCount 13, coverCount 13, firstCardImageCount 13, stepImageCount 208, stepCount 208, failureCount 0
```

## Risk Checklist

- Unknown dirty changes: avoided by deploying from sanitized temp worktree.
- Deleted files: none.
- Route conflicts: static assets only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: pending lookup if rollback is needed.
- Previous mini-program version: no upload in this step.
- Database rollback note: none.
- Who should be notified: project owner.

## Final Decision

- Release approved: yes, static assets released.
- Released by: Codex
- Release time: 2026-06-17 11:42:22 CST
- Follow-up items: adjust `tools/check-professional-learning-remote-images.js` so `--path` and raw `meridian_image_card` logical paths are validated after the same runtime URL conversion used by the mini-program.
