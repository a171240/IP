# Release Manifest: Professional Speech And Entry Static Assets

## Basic Info

- Release date: 2026-06-17
- Release thread: current Codex release thread, user explicitly authorized Vercel production deploy and mini-program upload for this version
- Operator: Codex
- Version: professional-speech-entry-static-assets-20260617
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend release source: sanitized temp worktree `/tmp/ip-speech-entry-static-release-20260617.1bYnu6` at backend HEAD `f78bdf8`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Mini-program HEAD: `4f6d115`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes.
- Are all other threads frozen from production deploy/upload? This thread is acting as the release thread for this asset release.
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
?? docs/release-manifest-2026-06-17-professional-skin-system-static-assets.md
?? docs/release-manifest-2026-06-17-professional-zangfu-static-assets.md
?? lib/service-records/audio-evidence.server.ts
?? lib/wechat/
?? public/professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/
?? public/professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/
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
?? pages/professional/data/professional-learning-speech-training-v1.js
?? pages/professional/data/professional-learning-zangfu-system-v4.js
?? tools/build-professional-speech-training-assets.js
?? tools/check-professional-speech-training-coverage.js
```

Untracked files that must be included:

```text
public/professional-learning-assets/professional-learning/v3-imagegen/customer-speech-system/
public/professional-learning-assets/professional-learning/v3-imagegen/entrance-covers/
public/professional-learning-assets/professional-learning/v3-imagegen/meridian-system/
public/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/
public/professional-learning-assets/professional-learning/v3-imagegen/skin-system/
```

Dirty files intentionally excluded:

```text
All backend API, service-record, poster, account, Supabase, WeChat, and test dirty files listed above.
All mini-program dirty files are excluded from this backend static asset deploy except the already-exported static JPG assets.
```

## Included Changes

- Publish 90 JPG files for `v3-imagegen/customer-speech-system`.
- Publish 13 logo-overlaid JPG files for `v3-imagegen/entrance-covers`.
- Preserve existing professional-learning static assets, including meridian, zangfu, skin, and route-specific small folders.
- Final deployed `v3-imagegen` JPG total: 941.

Local asset proof:

```text
customer-speech-system: 90 JPG, 600x800, 8.2M
entrance-covers: 13 JPG, 600x800, 1.3M
meridian-system: 240 JPG
zangfu-system: 208 JPG
skin-system: 257 JPG
professional-learning v3-imagegen total: 941 JPG
speech data check: itemCount 30, cardCount 90, A/B/C groupCounts 10/10/10, PASS
```

## Explicitly Not Included

- No backend API route changes.
- No Supabase migration or data change.
- No mini-program code upload in this backend static asset deploy step.
- No page wiring for the entrance cover candidates in this deploy step.
- No Vercel alias/promotion beyond the production deploy for the backend project.

## Database Changes

- Supabase migration files: none included.
- Applied to production: no.
- Rollback/recovery plan: redeploy the previous Vercel production deployment if the static asset deploy regresses unrelated routes.

## Backend Deployment

- Vercel project: `ip`
- Preview/production deployment URL: `https://ip-rdhwqmffo-a171240s-projects.vercel.app`
- Production deployment ID: `dpl_CgGJ8sSKiS4CSH2MPAtjyDV2MWTK`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `pnpm dlx vercel@54.9.1 deploy --prod --yes`

Backend smoke results before release:

```text
backend release package check passed: 4/4
local speech coverage check: PASS, itemCount 30, cardCount 90, imageSize 600x800
```

Backend smoke results after release:

```text
first production deploy detected missing old asset folder:
https://www.ipnrgc.com/professional-learning-assets/professional-learning/v3-imagegen/zangfu-system/Z00/pages/Z00-01.jpg -> 404
Correction: restored 208 zangfu-system JPG files into the backend public asset package and redeployed.

second production deploy detected missing old asset folder:
skin-system was absent from the backend public asset package after the 684-file GET pass.
Correction: restored 257 skin-system JPG files into the backend public asset package and redeployed.

final deployment:
Vercel inspect status: Ready
Production alias: https://www.ipnrgc.com
Full remote GET: checked 941 JPG, ok 941, failureCount 0
Remote representative dimensions:
- customer-speech-system/A01/pages/A01-P01.jpg -> 200 image/jpeg, 600x800
- customer-speech-system/B11/pages/B11-P01.jpg -> 200 image/jpeg, 600x800
- customer-speech-system/C30/pages/C30-P03.jpg -> 200 image/jpeg, 600x800
- entrance-covers/EC01/pages/EC01-P01.jpg -> 200 image/jpeg, 600x800
- entrance-covers/EC13/pages/EC13-P01.jpg -> 200 image/jpeg, 600x800
- meridian-system/M01/pages/M01-01.jpg -> 200 image/jpeg, 600x800
- zangfu-system/Z00/pages/Z00-01.jpg -> 200 image/jpeg, 600x800
- skin-system/S00-01/pages/S00-01-P01.jpg -> 200 image/jpeg, 600x800
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
node --check tools/build-professional-speech-training-assets.js
node --check tools/check-professional-speech-training-coverage.js
node --check pages/professional/data/professional-learning-speech-training-v1.js
node tools/check-professional-speech-training-coverage.js
PASS: itemCount 30, cardCount 90, groupCounts 10/10/10, imageSize 600x800, totalMB 8.1
```

## Risk Checklist

- Unknown dirty changes: will be avoided by deploying from sanitized temp worktree.
- Deleted files: none.
- Route conflicts: static assets only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: not touched.
- Remote image GET gate: passed, 941/941.

## Rollback / Recovery

- Previous backend deployment ID: available in Vercel deployment history if rollback is needed.
- Previous mini-program version: no upload in this step.
- Database rollback note: none.
- Who should be notified: project owner.

## Final Decision

- Release approved: yes, static asset release passed final remote smoke checks.
- Released by: Codex
- Release time: 2026-06-17 13:47:58 CST
- Follow-up items: after product selection, wire chosen entrance covers into mini-program data if needed.
