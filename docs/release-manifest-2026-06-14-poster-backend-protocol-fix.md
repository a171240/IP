# Release Manifest: Poster Backend Protocol Fix

## Basic Info

- Release date: 2026-06-14
- Release thread: current Codex poster fix thread; production deploy not executed yet
- Operator: Codex
- Version: backend poster protocol fix, paired with pending mini-program poster companion patch
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: existing production project; no schema or data change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Not yet with exact release-thread wording; this manifest prepares the scoped bundle.
- Are all other threads frozen from production deploy/upload? No. Deploy must use scoped files and a clean worktree.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 6]
 M app/api/mp/posters/assets/route.ts
 M app/api/mp/posters/generate/route.ts
 M app/api/mp/posters/history/route.ts
 M app/api/mp/posters/intake/route.ts
 M app/api/mp/posters/templates/route.ts
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M lib/posters/intake.ts
 M lib/posters/templates.ts
 M tests/poster-premium-prompt.static.test.js
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? tests/image-provider-fallback.runtime.test.js
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 32]
 M app.json
 M pages/poster/index.js
 M pages/voice-coach/index.js
 M pages/voice-coach/index.wxss
 M pages/voice-coach/training-map/index.js
 M pages/voice-coach/training-map/index.wxml
 M pages/voice-coach/training-pack-registry.js
 M pages/xiaohongshu/index.js
 M tools/check-voice-coach-remote-images.js
 M utils/knowledge-space.js
?? assets/manbeilian-covers/
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
docs/release-manifest-2026-06-14-poster-backend-protocol-fix.md
```

Dirty files intentionally excluded:

```text
app/api/mp/xhs/generate-cover-image/route.ts
lib/posters/gpt-image-2.server.ts
tests/xhs-cover-style.static.test.js
docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
tests/image-provider-fallback.runtime.test.js

Mini-program files excluded from backend release:
app.json
pages/voice-coach/index.js
pages/voice-coach/index.wxss
pages/voice-coach/training-map/index.js
pages/voice-coach/training-map/index.wxml
pages/voice-coach/training-pack-registry.js
pages/xiaohongshu/index.js
tools/check-voice-coach-remote-images.js
utils/knowledge-space.js
assets/manbeilian-covers/
assets/manbeilian-preview/
docs/manbeilian-*
docs/professional-learning-full-knowledge-base-2026-06-09.md
pages/manbeilian/
pages/voice-coach/manbeilian-speaking-pack-v1.js
tools/build-manbeilian-knowledge-package.js
tools/build-manbeilian-knowledge-preview.js
tools/check-manbeilian-knowledge-assets.js
```

## Included Changes

- `app/api/mp/posters/templates/route.ts`
  - Returns `layoutPresets`, `templateLayoutMap`, `visualStylePresets`, and `templateVisualStyleMap`.
- `lib/posters/templates.ts`
  - Adds 10 layout presets, 7 visual-style presets, template-to-preset maps, and default preset getters.
  - Adds layout, visual-style, and QR composite protocol blocks to rendered template prompts.
  - Folds selected visual-style negative prompt into the final negative prompt.
- `app/api/mp/posters/generate/route.ts`
  - Accepts `layoutPresetId`, `visualStylePresetId`, `fieldSources`, `qrState`, `qrAssetRef`, `allowMissingFields`, and `layoutReferenceMode`.
  - Requires `qrAssetRef.kind === "qr"`.
  - Excludes QR assets from model image references and stores QR metadata for mini-program post-composition.
  - Persists and returns selected layout/visual/QR/field-source protocol fields.
- `app/api/mp/posters/history/route.ts`
  - Returns stored layout, visual-style, field-source, and QR metadata for history restore.
- `app/api/mp/posters/assets/route.ts`
  - Allows `qr` asset kind.
- `app/api/mp/posters/intake/route.ts`
  - Raises intake asset refs limit from 5 to 6 for QR.
- `lib/posters/intake.ts`
  - Adds `qr` to `PosterAssetKind`.
- `tests/poster-premium-prompt.static.test.js`
  - Adds regression coverage for layout, visual-style, QR protocol, and 6-asset limit.

## Explicitly Not Included

- Xiaohongshu cover-generation changes.
- Poster image-provider fallback changes in `lib/posters/gpt-image-2.server.ts`.
- Voice-coach, Manbeilian, professional-learning, or L12 recorder changes.
- Supabase schema or production data changes.
- Mini-program upload.
- Mini-program companion patch `pages/poster/index.js` is intentionally kept out of the backend Vercel release commit. It should be committed separately in the mini-program repository.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: revert backend deployment; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not created.
- Production deployment ID: not deployed yet.
- Production alias/domain: `https://www.ipnrgc.com` after deploy.
- Deploy command: pending explicit production deploy authorization.

Backend smoke results:

```text
Not run against production yet.
Required after deploy:
- GET https://www.ipnrgc.com/api/mp/posters/templates
  Expect ok=true, templates=13, layoutPresets=10, visualStylePresets=7.
- GET https://www.ipnrgc.com/api/mp/profile
  Expect 401 auth_required at auth boundary.
```

Required backend checks:

```text
node --test tests/poster-premium-prompt.static.test.js
7/7 PASS

corepack pnpm exec tsc --noEmit --pretty false
PASS

corepack pnpm exec eslint lib/posters/templates.ts lib/posters/intake.ts app/api/mp/posters/templates/route.ts app/api/mp/posters/generate/route.ts app/api/mp/posters/history/route.ts app/api/mp/posters/assets/route.ts app/api/mp/posters/intake/route.ts tests/poster-premium-prompt.static.test.js
0 errors, 7 existing CommonJS require warnings in tests/poster-premium-prompt.static.test.js

git diff --check -- scoped poster files
PASS

Clean worktree from the scoped poster release commit:
corepack pnpm release:preflight
4/4 PASS

node --test tests/poster-premium-prompt.static.test.js
7/7 PASS

corepack pnpm exec tsc --noEmit --pretty false
PASS

corepack pnpm build
PASS, with existing repository lint/runtime warnings
```

Local integration evidence:

```text
next dev --webpack -p 3017
GET http://127.0.0.1:3017/api/mp/posters/templates
200, ok=true, templates=13, layoutPresets=10, visualStylePresets=7

WeChat DevTools automator with poster_api_base_url=http://127.0.0.1:3017
templateCount=13
layoutPresetCount=10
visualStyleCount=7
selectedTemplateId=P01
selectedLayoutPresetId=editorial-whitespace
selectedVisualStylePresetId=frosted-glass-archive-cover
lastError=""
```

Notes:

```text
Default Next Turbopack dev mode currently hits an existing CommonJS/ESM format issue in this repository.
Webpack dev mode served the changed poster template route successfully.
Local history route may return 500 without Supabase env; this does not affect the template protocol validation.
```

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: none.
- Upload result: not uploaded.

Mini-program local checks:

```text
node --check pages/poster/index.js
PASS

git diff --check -- pages/poster/index.js project.private.config.json
PASS

project.private.config.json
No final diff after temporary urlCheck=false verification.
```

Required mini-program checks:

- Poster page loads templates from backend after backend deploy.
- Poster generation sends and receives layout/visual/QR protocol fields.
- QR asset history restore should keep up to 6 assets after the companion mini-program patch is committed/uploaded.

## Risk Checklist

- Unknown dirty changes: yes, unrelated Xiaohongshu and mini-program worktree changes exist and are excluded.
- Deleted files: not observed.
- Route conflicts: changed existing poster routes only; no new route path.
- Product/point display conflicts: no point cost or billing change.
- Store account permission conflicts: no permission change.
- Service-record backend availability: not touched.
- Test data visibility: no production data mutation.

## Rollback / Recovery

- Previous backend deployment ID: to record before production deploy.
- Previous mini-program version: unchanged.
- Database rollback note: no schema/data change.
- Who should be notified: poster fix/release thread and repository coordination thread.

## Final Decision

- Release approved: preparation approved by repository coordination thread as PASS; production deploy still pending explicit release-thread authorization.
- Released by: not released yet.
- Release time: not released yet.
- Follow-up items:
  - Commit backend 8 poster files plus this manifest with scoped staging.
  - Deploy from a clean worktree only after explicit production deploy authorization.
  - After deploy, run production GET smoke and update this manifest.
  - Commit mini-program `pages/poster/index.js` companion line separately in the mini-program repository.
