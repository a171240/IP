# Release Manifest: Manbeilian Knowledge Covers Production

## Basic Info

- Release date: 2026-06-14
- Release thread: current Codex thread; user explicitly authorized this thread as the backend Vercel production release thread
- Operator: Codex
- Version: Manbeilian knowledge static assets production release
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: existing production project; no schema or data change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `这个线程是本次 release 线程，可以从干净 worktree 部署后端到 Vercel production。`
- Are all other threads frozen from production deploy/upload? This thread is the only authorized backend production deploy for this Manbeilian static-resource release. Mini-program upload is not authorized here.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 8]
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? tests/image-provider-fallback.runtime.test.js
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 34]
 M pages/service-record/detail/index.wxml
 M pages/service-record/detail/index.wxss
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/store-admin/service-records/detail/index.wxml
 M pages/store-admin/service-records/detail/index.wxss
 M pages/voice-coach/index.wxss
 M pages/xiaohongshu/index.js
 M tools/check-voice-coach-remote-images.js
?? docs/manbeilian-knowledge-space-training-dev-doc-2026-06-10.md
?? docs/manbeilian-mini-program-asset-audit-2026-06-12.md
?? docs/manbeilian-project-card-knowledge-base-dev-doc-2026-06-10.md
?? docs/manbeilian-web-driven-knowledge-base-dev-doc-2026-06-13.md
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? docs/service-record-world-class-ui-framework-2026-06-14.md
?? manbeilian-current-html-after-card-refresh.png
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-14-manbeilian-knowledge-covers-production.md
```

Dirty files intentionally excluded:

```text
Backend:
app/api/mp/xhs/generate-cover-image/route.ts
lib/posters/gpt-image-2.server.ts
tests/xhs-cover-style.static.test.js
docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
tests/image-provider-fallback.runtime.test.js

Mini-program:
all current dirty files; no mini-program upload in this backend release
```

## Included Changes

- Backend commit `8125c4c Add Manbeilian knowledge covers`
  - Adds four Manbeilian homepage cover images under `public/voice-coach-assets/manbeilian-knowledge/v1/covers/`.
  - Replaces three reviewed herbal-story card images under `public/voice-coach-assets/manbeilian-knowledge/v1/images/miaoyao-herbal-story-cards/`.
- This manifest commit only documents and authorizes the production deployment.

## Explicitly Not Included

- Xiaohongshu cover-generation changes.
- Any Supabase schema or production data changes.
- Any mini-program upload.
- Any service-record, store-admin, voice-coach UI, or Manbeilian mini-program dirty files beyond the already committed backend static resources.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: revert or redeploy the previous Vercel production deployment; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not used.
- Production deployment ID: pending.
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: from clean worktree, `vercel deploy --prod`

Backend smoke results before deploy:

```text
GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg -> 404 text/html
GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/chunguiye.jpg -> 404 text/html
GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/herbal.jpg -> 404 text/html
GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/coach.jpg -> 404 text/html
```

Required backend checks:

```text
corepack pnpm build
PASS, with existing repository lint/runtime warnings only.

Local static asset inspection:
4 cover images are JPEG 900x675.
3 herbal replacement images are JPEG 900x1200.
```

Required post-deploy checks:

```text
curl -I https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg
curl -I https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/chunguiye.jpg
curl -I https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/herbal.jpg
curl -I https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/coach.jpg

cd /Users/Admin/Documents/美业话镜小程序
node tools/check-manbeilian-knowledge-assets.js --full-knowledge --skip-source-safety --remote --concurrency 1 --timeout-ms 45000
```

## Mini-program Upload

- WeChat AppID: not used in this release.
- DevTools CLI path: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: none.
- Upload result: not uploaded.

Mini-program local checks:

```text
Mini-program commit `c74d8cd Add Manbeilian knowledge runtime` exists locally.
No mini-program upload is authorized in this backend release.
```

## Risk Checklist

- Unknown dirty changes: backend XHS dirty changes are intentionally excluded by deploying from a clean worktree.
- Deleted files: none in release scope.
- Route conflicts: none; static assets only.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: to be recorded after deploy inspection if needed.
- Previous mini-program version: unchanged.
- Database rollback note: no database changes.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: yes, by user instruction in current thread.
- Released by: pending.
- Release time: pending.
- Follow-up items:
  - Deploy backend from clean worktree.
  - Confirm four cover URLs return `200 image/jpeg`.
  - Confirm Manbeilian remote full-knowledge check returns `221/221`.
