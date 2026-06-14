# Release Manifest: Manbeilian Knowledge Image Cache Headers Production

## Basic Info

- Release date: 2026-06-14
- Release thread: current Codex thread; user authorized continuing backend optimization for Manbeilian image cache behavior
- Operator: Codex
- Version: Manbeilian knowledge image cache headers
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: existing production project; no schema or data change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. Earlier in this thread the user said this is the release thread and may deploy the backend to Vercel production from a clean worktree; user then approved starting the cache optimization.
- Are all other threads frozen from production deploy/upload? This thread is the only authorized backend production deploy for this Manbeilian cache-header release. Mini-program upload is not included.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before release:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 11]
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? tests/image-provider-fallback.runtime.test.js
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 35]
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
?? docs/service-record-smart-minutes-product-design-blueprint-2026-06-14.md
?? docs/service-record-world-class-ui-framework-2026-06-14.md
?? manbeilian-current-html-after-card-refresh.png
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-14-manbeilian-cache-headers-production.md
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

- Backend commit `c21708b Cache Manbeilian knowledge images immutably`
  - Adds `Cache-Control: public, max-age=31536000, immutable` for:
    - `/voice-coach-assets/manbeilian-knowledge/v1/images/:path*`
    - `/voice-coach-assets/manbeilian-knowledge/v1/covers/:path*`
  - Leaves Manbeilian manifest/group JSON cache behavior unchanged.

## Explicitly Not Included

- Any Xiaohongshu cover-generation changes.
- Any Supabase schema or production data changes.
- Any mini-program upload.
- Any Manbeilian image re-generation, mini-program UI change, or asset path/version change.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: redeploy previous Vercel production deployment; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not used.
- Production deployment ID: `dpl_F9vCQJKnkiimJnWXHAio9KkeFsws`
- Production deployment URL: `https://ip-b5g6scgu4-a171240s-projects.vercel.app`
- Vercel inspector URL: `https://vercel.com/a171240s-projects/ip/F9vCQJKnkiimJnWXHAio9KkeFsws`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: from clean package `/tmp/manbeilian-cache-release-20260614-BjhutV`, `npx --yes vercel@latest deploy --prod --yes`
- Deploy note: first CLI attempt from the clean package failed before deployment because `.vercel/project.json` is local-only and not included by `git archive`; copied the existing project binding file into the clean package and retried successfully.

Backend smoke results before deploy:

```text
HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg
200 image/jpeg, cache-control: public, max-age=0, must-revalidate

HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/images/miaoyao-project-cards/card-01-project-overview.jpg
200 image/jpeg, cache-control: public, max-age=0, must-revalidate
```

Required backend checks:

```text
node --check next.config.mjs: PASS
git diff --check -- next.config.mjs: PASS
Clean package `/tmp/manbeilian-cache-release-20260614-BjhutV`:
node --check next.config.mjs: PASS
next.config.mjs headers() inspection: PASS, first two rules target Manbeilian v1 images and covers with Cache-Control public, max-age=31536000, immutable
corepack pnpm build: PASS with existing repository warnings only
Vercel remote build: PASS with existing repository warnings only
```

Required post-deploy checks:

```text
HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg
200 image/jpeg, content-length 163536, cache-control: public, max-age=31536000, immutable

HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/images/miaoyao-project-cards/card-01-project-overview.jpg
200 image/jpeg, content-length 392186, cache-control: public, max-age=31536000, immutable

HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/manifest.json
200 application/json, cache-control: public, max-age=0, must-revalidate

GET https://www.ipnrgc.com/api/mp/profile
401 application/json, {"ok":false,"error":"请先登录","code":"auth_required"}

Transient remote-check note:
First two full-knowledge remote checks each had a single fetch failed on images/manbeilian-manager-scoring-cards/card-02-daily-check.jpg; direct retry for that exact URL returned 200 image/jpeg, 346199 bytes, cache-control: public, max-age=31536000, immutable.

Final full-knowledge remote check:
cd /Users/Admin/Documents/美业话镜小程序
node tools/check-manbeilian-knowledge-assets.js --full-knowledge --skip-source-safety --remote --concurrency 1 --timeout-ms 120000
PASS: expectedTaskCount=221, checkedCount=221, remote.failureCount=0
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
No mini-program upload is authorized in this backend release.
```

## Risk Checklist

- Unknown dirty changes: backend XHS dirty changes are intentionally excluded by deploying from a clean temporary package.
- Deleted files: none in release scope.
- Route conflicts: none; static header config only.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_Ax9sqrXj3WYQYyyxaggnoMVvKoTG`
- Previous mini-program version: unchanged.
- Database rollback note: no database changes.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: yes.
- Released by: Codex.
- Release time: 2026-06-14 22:37 Asia/Shanghai.
- Follow-up items:
  - Production image URLs now return long cache headers for Manbeilian v1 images and covers.
  - `/api/mp/profile` still returns the expected auth gate.
  - No mini-program upload was performed.
