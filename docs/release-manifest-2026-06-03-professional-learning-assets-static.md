# Release Manifest Draft: Professional Learning Static Assets

This is a release-prep manifest. It does not record a completed production
release.

## Basic Info

- Release date: 2026-06-04
- Prepared at: 2026-06-04 00:03 CST
- Release thread: current Codex thread, explicitly confirmed by user as release thread
- Operator: Codex
- Version: backend-professional-learning-assets-static-20260603
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__poster-hq-v1-20260602`
- Backend branch: `codex/poster-hq-v1-20260602`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production env used by Vercel project `ip`; no schema or data change in this release

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said:
  `同意由当前线程作为本版本 release thread，发布“专业学习静态资源”到生产。`
- Are all other threads frozen from production deploy/upload? Old Codex thread
  `梳理开发文档推进方案` must remain frozen. No old thread transcript was read.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before production release:

```text
## codex/poster-hq-v1-20260602...origin/codex/poster-hq-v1-20260602
?? docs/professional-learning-assets-local-handoff-2026-06-03.md
?? docs/release-manifest-2026-06-03-professional-learning-assets-static.md
?? public/professional-learning-assets/
```

Mini-program status:

```text
Dirty mini-program worktree exists on branch codex/app-migration-handoff-20260521.
This backend release prep does not upload or package mini-program files.
```

Untracked files that must be included in the backend release:

```text
public/professional-learning-assets/
docs/professional-learning-assets-local-handoff-2026-06-03.md
docs/release-manifest-2026-06-03-professional-learning-assets-static.md
```

Dirty files intentionally excluded:

```text
All mini-program dirty files are excluded from this backend-only static asset deployment.
No API, database, payment, store-admin, poster, or service-record backend code is included.
```

## Included Changes

- Add compressed professional-learning static images under
  `public/professional-learning-assets/`.
- Asset package contains 288 JPEG files, 900px wide, about 41 MB on disk.
- Intended production base URL after release:
  `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning`.

## Explicitly Not Included

- No mini-program upload.
- No Supabase schema or data change.
- No backend API code change.
- No Vercel production deploy has been run from this manifest yet.
- No project protection or Vercel Authentication setting change.

## Database Changes

- Supabase migration files: none
- Applied to production: no
- Rollback/recovery plan: Vercel deployment rollback only; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Current production deployment before release: `dpl_32XqJHGcyXLXztctiE6PRRpTT9Hy`
- Current production alias/domain:
  `https://ip.ipgongchang.xin`, `https://www.ipnrgc.com`
- Preview deployment URL:
  `https://ip-haqle4l7a-a171240s-projects.vercel.app`
- Preview deployment ID: `dpl_7C5W5anWKuzLnJ5Zg9nso3mRnsH5`
- Preview target/status: `preview`, `Ready`
- Production deployment ID: not run
- Deploy command for production release thread:
  `corepack pnpm dlx vercel@latest deploy --prod --yes`

Backend smoke results before production deploy:

```text
corepack pnpm build -> pass, 0 errors, existing 315 lint warnings
Vercel preview deploy -> Ready, target preview
Preview root page opens in authenticated Chrome
Unauthenticated curl to preview URLs -> 401 due Vercel Authentication
Production professional-learning JPG URLs -> 404 before release
public/professional-learning-assets -> 288 files, about 41 MB
sample 12-practice.jpg -> JPEG, 900x1350, about 174 KB
```

Required backend checks after production deploy:

- `/api/mp/profile` should still return `401` without auth.
- These static URLs should return `200 image/jpeg`:
  - `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/dry-skin/01-main.jpg`
  - `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/skin-layers/pages/01-customer_problem.jpg`
  - `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning/v2/forbidden-medical-claims/pages/12-practice.jpg`

## Mini-program Upload

- WeChat AppID: not applicable yet
- Upload version: not applicable yet
- Upload command: not run
- Upload result: not run

Mini-program local checks already run:

```text
node --check tools/export-professional-learning-assets.js -> pass
node --check utils/professional-learning.js -> pass
node tools/audit-professional-learning-assets.js -> mappings complete, releaseBlocked true because local source images are too large
```

Mini-program follow-up after production static URLs return 200:

- Set `PROFESSIONAL_LEARNING_ASSET_BASE_URL` to
  `https://ip.ipgongchang.xin/professional-learning-assets/professional-learning`.
- Exclude `assets/professional-learning` from the WeChat upload package.
- Re-run professional-learning local checks before any mini-program upload.

## Risk Checklist

- Unknown dirty changes: mini-program worktree is dirty and excluded.
- Deleted files: none detected in backend static asset scope.
- Route conflicts: none; only `public/` static files added.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_32XqJHGcyXLXztctiE6PRRpTT9Hy`
- Previous mini-program version: unchanged
- Database rollback note: no database change
- Recovery plan: rollback Vercel production deployment if static asset deploy causes unexpected production behavior.

## Final Decision

- Release approved: yes, by user request in this thread
- Released by: not released
- Release time: not released
- Follow-up items: make this thread the explicit release thread before production deploy, then smoke the three production JPG URLs before changing mini-program config.
