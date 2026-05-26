# Release Manifest: XHS Cover Signed URL Hotfix V5

## Basic Info

- Release date: 2026-05-26
- Release thread: Yes, user explicitly confirmed this is the production release thread.
- Operator: Codex
- Version: xhs-cover-signed-url-hotfix-v5-20260526
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__backend-main-checkpoint-20260514`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: Production project `topyedxzcdfswxdcucpl`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes.
- Are all other threads frozen from production deploy/upload? Assumed for this release thread.
- Is this release allowed to touch production data or schema? No schema/data mutation required.

## Workspace State

Backend status before release:

```text
## codex/baibaitu-private-copy-release-20260526...origin/codex/baibaitu-private-copy-release-20260526
 M app/api/mp/library/route.ts
 M app/api/mp/workbench/route.ts
 M app/api/mp/xhs/covers/[draftId]/route.ts
 M app/api/mp/xhs/drafts/[draftId]/route.ts
 M app/api/mp/xhs/drafts/route.ts
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/xhs/assets.server.ts
?? lib/xhs/cover-url.server.ts
?? docs/release-manifest-2026-05-26-xhs-cover-signed-url-v5.md
```

Mini-program status before release:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M pages/voice-coach/training-map/index.js
 M pages/voice-coach/training-map/index.wxml
 M pages/voice-coach/training-map/index.wxss
?? assets/voice-coach/training-map-visual.jpg
?? docs/beauty-knowledge-training-library-v1-dev-plan.md
?? docs/beauty-knowledge-v1-card-content-workbook.md
```

Untracked files that must be included:

```text
lib/xhs/cover-url.server.ts
docs/release-manifest-2026-05-26-xhs-cover-signed-url-v5.md
```

Dirty files intentionally excluded:

```text
Mini-program voice-coach training-map dirty files and beauty-knowledge docs are unrelated to this backend-only hotfix.
```

## Included Changes

- Add Supabase signed URL generation for XHS assets.
- Return signed Supabase image URLs from mini-program XHS cover generation and draft/library/workbench APIs.
- Change old `/api/mp/xhs/covers/[draftId]` proxy route to redirect to a signed Supabase URL.
- Keep byte-serving fallback with correct `206 Partial Content` for range requests if signing fails.

## Explicitly Not Included

- No mini-program code change or upload.
- No Supabase schema/data mutation.
- No APIMart provider change.
- No unrelated voice-coach training-map changes.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: revert backend deployment to previous production deployment.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not used
- Production deployment ID: `dpl_CpezwmBFk3fMwhZiNMqXbKLRGF3x`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `npx vercel deploy --prod --yes`

Backend smoke results:

```text
npx tsc --noEmit --pretty false: pass
corepack pnpm build: pass
Signed Supabase URL range check: 206 Partial Content, image/png, 1024 bytes
Local production-mode proxy check:
- /api/mp/xhs/covers/<draftId>?v=... -> 302 to Supabase signed URL
- Follow redirect full image -> 200 image/png, 1,997,754 bytes
- Follow redirect with Range bytes=0-1023 -> 206 image/png, 1,024 bytes
Production deployment:
- `https://www.ipnrgc.com/api/mp/xhs/covers/96d410f4-e07e-4baa-bb64-fd2d50031940?v=1779781643173` -> 302, `Cache-Control: private, no-store`
- Follow redirect full image -> 200 image/png, 1,997,754 bytes
- Follow redirect with Range bytes=0-1023 -> 206 image/png, 1,024 bytes
- `/api/mp/profile` -> 401 application/json
- `/api/mp/virtual-pay/products` -> 200 application/json
- `/api/mp/service-records/sessions` -> 401 application/json
```

Required backend checks:

- `/api/mp/profile`: 401 application/json, expected without auth
- `/api/mp/virtual-pay/products`: 200 application/json
- `/api/mp/service-records/sessions`: 401 application/json, expected without auth
- Changed XHS cover route: 302 to Supabase signed URL, Range-follow returns 206 image/png

## Mini-program Upload

- WeChat AppID: not applicable
- DevTools CLI path: not applicable
- Upload version: not applicable
- Upload description: not applicable
- Upload command: not run
- Upload result: not run

Mini-program local checks:

```text
No mini-program files changed for this hotfix.
```

Required mini-program checks:

- `app.json` routes exist: not touched
- Mine page loads: not touched
- Store workspace loads: not touched
- Staff training page loads: not touched
- Pay/service package page loads: not touched
- Service record entry behaves as expected: not touched

## Risk Checklist

- Unknown dirty changes: mini-program has unrelated dirty files; excluded from release.
- Deleted files: none.
- Route conflicts: changed only XHS cover/draft/library/workbench routes.
- Product/point display conflicts: none expected.
- Store account permission conflicts: none expected.
- Service-record backend availability: smoke after deploy.
- Test data visibility: uses existing generated draft `96d410f4-e07e-4baa-bb64-fd2d50031940` for image route verification.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_968axyiBqqA485Jr8cVXWASX5DgH`
- Previous mini-program version: `1.0.20260526.4`
- Database rollback note: none required.
- Who should be notified: user.

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-05-26 19:18 CST
- Follow-up items: Have user retest cover generation/preview in the test mini-program after backend production deployment.
