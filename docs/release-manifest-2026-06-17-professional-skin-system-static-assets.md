# Release Manifest: Professional Skin System Static Assets

## Basic Info

- Release date: 2026-06-17
- Release thread: current Codex release thread, user explicitly authorized Vercel production deploy and mini-program upload for this version
- Operator: Codex
- Version: professional-skin-system-static-assets-20260617
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend release source: sanitized temp worktree `/tmp/ip-skin-static-release-20260617` at backend HEAD `f78bdf8`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Mini-program HEAD: `4f6d115`
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
?? docs/release-manifest-2026-06-17-professional-zangfu-static-assets.md
?? lib/service-records/audio-evidence.server.ts
?? lib/wechat/
?? public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? tests/manbeilian-knowledge-space.static.test.js
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 37]
 M pages/poster/index.js
 M pages/professional/data/professional-learning-seed.js
 M pages/professional/lesson/index.wxml
 M pages/professional/lesson/index.wxss
 M pages/professional/utils/professional-learning.js
 M pages/service-record/detail/index.js
 M pages/service-record/detail/index.wxml
 M pages/service-record/detail/index.wxss
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/service-record/service-record-voice-coach-setup.js
 M pages/service-record/service-record-voice-coach-setup.test.js
 M pages/store-admin/members/index.js
 M pages/store-admin/service-records/detail/index.js
 M pages/store-admin/service-records/detail/index.wxml
 M pages/store-admin/service-records/detail/index.wxss
 M pages/voice-coach/index.wxss
 M project.config.json
 M tools/check-voice-coach-remote-images.js
 M tools/export-professional-learning-assets.js
 M utils/account-context.js
 M utils/ai-points.js
?? pages/professional/data/professional-learning-meridian-system-v4.js
?? pages/professional/data/professional-learning-skin-system-v4.js
?? pages/professional/data/professional-learning-zangfu-system-v4.js
```

Untracked files that must be included:

```text
public/professional-learning-assets/professional-learning/v3-imagegen/skin-system/
public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
public/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/
```

Dirty files intentionally excluded:

```text
All backend API, service-record, poster, account, Supabase, WeChat, and test dirty files listed above.
All mini-program dirty files are excluded from this backend static asset deploy except the already-exported static skin assets.
```

## Included Changes

- Publish 257 JPG files for `v3-imagegen/skin-system` under the professional-learning static asset host.
- Preserve existing professional-learning static assets, including `v3-imagegen/meridian-system` and `v3-imagegen/zangfu-system`.

Skin course local data scope:

```text
skin-physiology: 15 lessons, 73 image cards
skin-types: 22 lessons, 111 image cards
project-principles: 10 lessons, 47 image cards
compliance-translation: 8 lessons, 26 image cards
Total: 55 lessons, 257 image cards
```

## Explicitly Not Included

- No backend API route changes.
- No Supabase migration or data change.
- No mini-program upload in this backend static asset deploy step.
- No mini-program code deployment in this backend static asset deploy step.
- No Vercel alias/promotion beyond the production deploy for the backend project.

## Database Changes

- Supabase migration files: none included.
- Applied to production: no.
- Rollback/recovery plan: redeploy the previous Vercel production deployment if the static asset deploy regresses unrelated routes.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: `https://ip-a2orea5fh-a171240s-projects.vercel.app`
- Production deployment ID: `dpl_4PjGRMQY1KqwEQUhWJP1usLHqmRV`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `pnpm dlx vercel@54.9.1 deploy --prod --yes`

Backend smoke results before release:

```text
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg -> 404 text/html; charset=utf-8
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S02-03/pages/S02-03-P07.jpg -> 404 text/html; charset=utf-8
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S06-08/pages/S06-08-P04.jpg -> 404 text/html; charset=utf-8
```

Required backend checks:

- Professional-learning remote image GET gate after deploy.
- Targeted GET checks for S00-01, S02-03, S04-01, and S06-08 assets.
- Existing meridian/zangfu static asset preservation spot check.

Backend smoke results after release:

```text
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S00-01/pages/S00-01-P01.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S02-03/pages/S02-03-P07.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S04-01/pages/S04-01-P06.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/skin-system/S06-08/pages/S06-08-P04.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg, JPEG 600x800
GET /professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg -> 200 image/jpeg, JPEG 600x800

Custom runtime-equivalent skin-system remote GET:
checked 257, ok 257, failureCount 0
```

## Mini-program Upload

- WeChat AppID: not used in this backend static asset deploy step.
- DevTools CLI path: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: not run.
- Upload result: not run.

Mini-program local checks:

```text
node --check pages/professional/data/professional-learning-skin-system-v4.js
node --check pages/professional/data/professional-learning-seed.js
node --check pages/professional/utils/professional-learning.js
node --check tools/export-professional-learning-assets.js
node tools/check-professional-learning-image-coverage.js --path skin-physiology --path skin-types --path project-principles --path compliance-translation --require-all-step-images

PASS:
skin-physiology lessonCount 15, coverCount 15, firstCardImageCount 15, stepImageCount 73, stepCount 73, failureCount 0
skin-types lessonCount 22, coverCount 22, firstCardImageCount 22, stepImageCount 111, stepCount 111, failureCount 0
project-principles lessonCount 10, coverCount 10, firstCardImageCount 10, stepImageCount 47, stepCount 47, failureCount 0
compliance-translation lessonCount 8, coverCount 8, firstCardImageCount 8, stepImageCount 26, stepCount 26, failureCount 0

Text helper field QA:
checked 55 lessons, 257 cards, badCardCount 0
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
- Release time: 2026-06-17 12:10:07 CST
- Follow-up items: mini-program experience build upload completed in `/Users/Admin/Documents/美业话镜小程序/docs/release-manifest-2026-06-17-professional-learning-system-miniapp-upload.md`; next step is real-device scan.
