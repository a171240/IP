# Release Manifest: Manbeilian Knowledge Static Assets

## Basic Info

- Release date: 2026-06-13
- Release thread: current Codex thread, authorized by user request to deploy Manbeilian backend static assets only
- Operator: Codex
- Version: `manbeilian-knowledge/v1`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? User explicitly asked this thread to take over deployment for the Manbeilian knowledge backend static assets.
- Are all other threads frozen from production deploy/upload? No. This release must use scoped files only.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before staging:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 4]
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? public/voice-coach-assets/manbeilian-knowledge/
?? tests/image-provider-fallback.runtime.test.js
```

Mini-program status before backend release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 32]
 M app.json
 M pages/voice-coach/index.js
 M pages/voice-coach/index.wxml
 M pages/voice-coach/index.wxss
 M pages/voice-coach/training-map/index.js
 M pages/voice-coach/training-map/index.wxml
 M pages/voice-coach/training-pack-registry.js
 M pages/xiaohongshu/index.js
 M tools/check-voice-coach-remote-images.js
 M utils/knowledge-space.js
?? assets/manbeilian-preview/
?? docs/manbeilian-knowledge-space-training-dev-doc-2026-06-10.md
?? docs/manbeilian-mini-program-asset-audit-2026-06-12.md
?? docs/manbeilian-project-card-knowledge-base-dev-doc-2026-06-10.md
?? docs/manbeilian-web-driven-knowledge-base-dev-doc-2026-06-13.md
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? manbeilian-current-html-after-card-refresh.png
?? pages/manbeilian/
?? pages/voice-coach/manbeilian-speaking-pack-v1.js
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
?? tools/check-manbeilian-knowledge-assets.js
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-13-manbeilian-knowledge-assets.md
public/voice-coach-assets/manbeilian-knowledge/v1/**
```

Dirty files intentionally excluded:

```text
app/api/mp/xhs/generate-cover-image/route.ts
lib/posters/gpt-image-2.server.ts
tests/xhs-cover-style.static.test.js
docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
tests/image-provider-fallback.runtime.test.js
```

## Included Changes

- Add Manbeilian knowledge static resource tree:
  - `public/voice-coach-assets/manbeilian-knowledge/v1/manifest.json`
  - `public/voice-coach-assets/manbeilian-knowledge/v1/package-summary.json`
  - `public/voice-coach-assets/manbeilian-knowledge/v1/groups/*.json`
  - `public/voice-coach-assets/manbeilian-knowledge/v1/images/**/*.jpg`
- Resource inventory:
  - 26 group JSON files
  - 217 JPG images
  - 1 root `manifest.json`
  - 1 root `package-summary.json`
  - Total size: about 67 MB on disk
  - Images: 900x1200

## Explicitly Not Included

- Backend API/interface changes.
- Supabase schema or data changes.
- Xiaohongshu cover-generation changes.
- Existing `public/voice-coach-assets/voice-coach/baibaitu-speaking/**` assets.
- Existing `public/voice-coach-assets/voice-coach/common-beauty/**` assets.
- Mini-program upload.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: revert backend deployment to previous Vercel production deployment; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not created in this round.
- Production deployment ID: `dpl_ENdr7B72sgRY1sZbVLRs5yZzzqDH`
- Production deployment URL: `https://ip-bzl6slzce-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`
- Vercel inspect URL: `https://vercel.com/a171240s-projects/ip/ENdr7B72sgRY1sZbVLRs5yZzzqDH`
- Deploy command: `npx --yes vercel@latest --prod --yes`
- Deploy source: clean detached worktree `/tmp/meiye-ip-manbeilian-assets-20260613-BVj8if` at backend commit `039934e`.

Backend smoke results:

```text
GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/manifest.json
HTTP 200, bytes=20282, content-type=application/json; charset=utf-8
Parsed JSON: title="曼贝莲项目知识库", groupCount=26, imageCount=217

GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/groups/miaoyao-project-cards.json
HTTP 200, bytes=8172, content-type=application/json; charset=utf-8
Parsed JSON: title="苗药筋骨养护", imageCount=10

GET https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/images/miaoyao-project-cards/card-01-project-overview.jpg
HTTP 200, bytes=392186, content-type=image/jpeg
Image dimensions: 900x1200

Old asset preservation spot checks:

GET https://www.ipnrgc.com/voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg
HTTP 200, bytes=101432

GET https://www.ipnrgc.com/voice-coach-assets/voice-coach/baibaitu-speaking/v1/s01/concept.jpg
HTTP 200, bytes=58672
```

Required backend checks:

```text
node JSON parse check: PASS, 245 total files, 28 JSON files, 217 JPG files
sips dimension spot check: PASS, representative images are 900x1200
corepack pnpm release:preflight: PASS, 4/4
corepack pnpm build: PASS in original worktree and clean deployment worktree; existing lint/runtime warnings only
Vercel production build: PASS; existing lint/runtime warnings only
```

## Mini-program Upload

- Upload version: not included.
- Upload result: not included.

## Risk Checklist

- Unknown dirty changes: yes, unrelated Xiaohongshu files exist and are excluded.
- Deleted files: not observed.
- Route conflicts: no route or API file touched.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: not touched.
- Test data visibility: no schema/data mutation.
- Static asset overwrite risk: scoped to new `manbeilian-knowledge/v1` tree only.

## Rollback / Recovery

- Previous backend production deployment ID: `dpl_76XzrzLFj1k4g8Ep47SDG9c15q8j`
- Previous backend production deployment URL: `https://ip-lxhsc7xwi-a171240s-projects.vercel.app`
- Previous mini-program version: unchanged.
- Database rollback note: no schema/data change.
- Who should be notified: release thread/user.

## Final Decision

- Release approved: yes, backend static asset production deploy completed.
- Released by: Codex release thread.
- Release time: `2026-06-13 19:20:38 CST`
- Follow-up items:
  - After backend GET smoke passes, return to mini-program Manbeilian knowledge loading checks.
