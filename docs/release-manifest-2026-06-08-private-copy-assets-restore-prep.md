# Release Manifest: private-copy-assets-restore-prep-20260608

## Basic Info

- Release date: 2026-06-08 12:45 CST
- Release thread: current Codex thread, authorized by user message "开始吧" after Codex stated production release authorization was the missing step
- Operator: Codex
- Version: backend-private-copy-assets-restore-prep-20260608
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production Vercel project `ip`; no Supabase schema or data operation in this prep

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes for this backend private-copy + static assets restore. User authorized with "开始吧" immediately after Codex clarified production deploy authorization was missing.
- Are all other threads frozen from production deploy/upload? Not globally confirmed; this thread is only publishing the scoped backend restore package and not touching mini-program upload or Supabase.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status after prep:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521
 M package.json
?? docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
?? public/professional-learning-assets/
?? scripts/check-backend-release-package.mjs
?? scripts/required-professional-learning-rendered-assets.json
```

Mini-program status observed before backend prep:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M docs/release-manifest-template.md
 M pages/professional/index.wxml
 M pages/professional/index.wxss
 M pages/voice-coach/customer-profiles/index.js
 M pages/voice-coach/customer-profiles/index.wxml
 M pages/voice-coach/index.js
 M pages/voice-coach/index.wxml
 M pages/voice-coach/index.wxss
 M pages/voice-coach/scene-cards/index.js
 M pages/voice-coach/scene-cards/index.wxml
 M pages/voice-coach/setup/index.wxml
 M pages/voice-coach/training-assets.js
 M utils/config.js
?? docs/professional-learning-remote-image-domain-sop-2026-06-08.md
?? docs/release-manifest-2026-06-08-voicecoach-assets-setup-link-prep.md
?? docs/voice-coach-remote-image-domain-sop-2026-06-08.md
?? tools/check-professional-learning-remote-images.js
?? tools/check-voice-coach-remote-images.js
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
scripts/check-backend-release-package.mjs
scripts/required-professional-learning-rendered-assets.json
public/professional-learning-assets/professional-learning/**/*
```

Tracked dirty files that must be included:

```text
package.json
```

Dirty files intentionally excluded:

```text
None in the backend repository.
Mini-program dirty files are separate release-prep changes and are not part of this backend restore manifest.
```

## Root Cause

- Production currently returns 404 HTML for:
  - `GET /api/mp/private-copy/drafts?module=moment_post&limit=1`
  - `POST /api/mp/private-copy/generate`
- The paired backend repo still contains the private-copy route files:
  - `app/api/mp/private-copy/drafts/route.ts`
  - `app/api/mp/private-copy/drafts/[draftId]/route.ts`
  - `app/api/mp/private-copy/generate/route.ts`
- The same backend repo already contains `public/voice-coach-assets`, but did not contain `public/professional-learning-assets`.
- Recent production restores used incomplete deployment packages at different times. One package restored private-copy API routes; another static-asset package restored images. Vercel production aliases point at one deployment at a time, so an incomplete later deployment can make either API routes or static assets disappear.
- Durable fix: deploy one full backend package that contains private-copy API routes, voice-coach static assets, and professional-learning static assets together.

## Included Changes

- Add `public/professional-learning-assets` to the backend full app package.
- Preserve existing `public/voice-coach-assets`.
- Preserve existing `app/api/mp/private-copy/*` routes.
- Add `scripts/check-backend-release-package.mjs` as a release package guard.
- Add `scripts/required-professional-learning-rendered-assets.json` so the backend guard validates the 397 professional-learning images rendered by the current mini-program route.
- Wire the guard into `pnpm build` and expose it as `pnpm release:preflight`.
- No API route code change.
- No Supabase schema/data change.

## Explicitly Not Included

- No WeChat DevTools upload.
- No Vercel alias/promote command in prep.
- No Supabase migration execution.
- No manual production data write.

## Asset Inventory

```text
public/professional-learning-assets: 554 files, 80M
public/professional-learning-assets/professional-learning/v3-imagegen: 133 files
public/voice-coach-assets: 210 files, 17M
scripts/required-professional-learning-rendered-assets.json: 397 required rendered image paths
```

## Local Verification

```text
node --check scripts/check-backend-release-package.mjs: pass
node scripts/check-backend-release-package.mjs / pnpm release:preflight: pass, 4/4
git diff --check: pass
pnpm build: pass, release package guard ran before Next build
local production route/static smoke with dummy Supabase env: pass
post-remediation local rendered path check from mini-program route collector:
  renderedUniqueUrls: 397
  localMissing: 0
```

Current production confirmation before deploy:

```text
https://www.ipnrgc.com:
  GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 404 text/html, 21283 bytes
  POST /api/mp/private-copy/generate -> 404 text/html, 21283 bytes

https://ip.ipgongchang.xin:
  GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 404 text/html, 21283 bytes
  POST /api/mp/private-copy/generate -> 404 text/html, 21283 bytes

Mini-program API contract gate against https://ip.ipgongchang.xin:
  10/12 pass
  2/12 fail: private-copy drafts and private-copy generate are route-missing 404 HTML

Remote static image gates:
  voice-coach images -> 120/120 pass on retry with concurrency 4
  professional-learning images -> 397/397 pass
```

Local production smoke command environment:

```text
PORT=3217
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
SUPABASE_SERVICE_ROLE_KEY=dummy
```

Local production smoke results:

```text
GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 401 auth_required
POST /api/mp/private-copy/generate -> 401 auth_required
PATCH /api/mp/private-copy/drafts/00000000-0000-0000-0000-000000000000 -> 401 auth_required
POST /api/mp/xhs/generate-cover-image -> 401 auth_required
GET  /api/mp/profile -> 401 auth_required
GET  /api/mp/virtual-pay/products -> 200
POST /api/mp/service-records/sessions -> 401 auth_required
GET  /api/mp/knowledge-spaces/options -> 401 auth_required
GET  /api/mp/voice-coach/training-home?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
GET  /voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg -> 200 image/jpeg
GET  /professional-learning-assets/professional-learning/v2/skin-layers/01-main.jpg -> 200 image/jpeg
GET  /professional-learning-assets/professional-learning/v3-imagegen-reference/liver-organ-expression/pages/01-soothing-flow-candidate-c-customer-entry.jpg -> 200 image/jpeg
```

## Backend Deployment

- Vercel project: `ip`
- Preview deployment ID: `dpl_GKGSacnSz5fZ2WjnoQuYprwXXbKd`
- Preview deployment URL: `https://ip-ckr5di68x-a171240s-projects.vercel.app`
- Preview inspector URL: `https://vercel.com/a171240s-projects/ip/GKGSacnSz5fZ2WjnoQuYprwXXbKd`
- Preview target/status: `preview`, `Ready`
- Previous production deployment ID: `dpl_Gg1PDkiEqQRmf9rP2ohLg8WngRKC`
- Previous production deployment URL: `https://ip-eruhfoka4-a171240s-projects.vercel.app`
- Previous production aliases: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- First production deployment ID in this release thread: `dpl_5iarRFHT8UobMo6eQciEwWDrogLb`
- First production deployment URL in this release thread: `https://ip-knuczm4p8-a171240s-projects.vercel.app`
- First production deployment result: API contract restored, but professional-learning remote image gate found 129 missing v3 images.
- Current remediation production deployment ID: `dpl_5oRAQkHqZKjW4ChuTmKyuPpMkBj5`
- Current remediation production deployment URL: `https://ip-mqe3u6vug-a171240s-projects.vercel.app`
- Current remediation production target/status: `production`, `Ready`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command:

```text
npx --yes vercel deploy --prod --yes --project ip
```

Preview deployment evidence:

```text
Preview deploy command:
  npx --yes vercel deploy --yes --project ip

Vercel remote build:
  backend release package check passed: 4/4
  Build Completed in /vercel/output [2m]

Vercel inspect:
  id: dpl_GKGSacnSz5fZ2WjnoQuYprwXXbKd
  target: preview
  status: Ready
  url: https://ip-ckr5di68x-a171240s-projects.vercel.app

Preview URL route/static smoke:
  blocked by Vercel Deployment Protection before application routing
  GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 401 text/html Authentication Required from Vercel SSO
  POST /api/mp/private-copy/generate -> 401 text/html Authentication Required from Vercel SSO
  GET  /voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg -> 401 text/html Authentication Required from Vercel SSO
  GET  /professional-learning-assets/professional-learning/v2/skin-layers/01-main.jpg -> 401 text/html Authentication Required from Vercel SSO
```

First production deployment evidence:

```text
Vercel inspect:
  id: dpl_5iarRFHT8UobMo6eQciEwWDrogLb
  target: production
  status: Ready
  url: https://ip-knuczm4p8-a171240s-projects.vercel.app
  aliases: https://www.ipnrgc.com, https://ip.ipgongchang.xin

Mini-program API contract gate:
  node tools/check-mp-api-contract-before-asset-release.js -> 12/12 pass
  private-copy drafts -> 401 auth_required, not 404
  private-copy generate -> 401 auth_required, not 404

Remote static image gates:
  voice-coach images -> 120/120 pass
  professional-learning images -> 268/397 pass, 129 failed 404
```

Professional-learning image remediation:

```text
Cause:
  backend public/professional-learning-assets had v2 assets and review/reference v3 assets,
  but the mini-program rendered URLs use public/professional-learning-assets/professional-learning/v3-imagegen/**/*.jpg.

Fix:
  generated tmp/professional-learning-backend-upload from mini-program tools/export-professional-learning-assets.js
  copied tmp/professional-learning-backend-upload/public/professional-learning-assets into backend public/professional-learning-assets
  generated scripts/required-professional-learning-rendered-assets.json with 397 current rendered image paths
  upgraded scripts/check-backend-release-package.mjs to assert all 397 required paths exist

Verification:
  pnpm release:preflight -> pass, 4/4
  git diff --check -> pass
  pnpm build -> pass
```

Second production deployment evidence:

```text
Deploy command:
  npx --yes vercel deploy --prod --yes --project ip

Vercel remote build:
  backend release package check passed: 4/4
  Build Completed in /vercel/output [1m]

Vercel inspect:
  id: dpl_5oRAQkHqZKjW4ChuTmKyuPpMkBj5
  target: production
  status: Ready
  url: https://ip-mqe3u6vug-a171240s-projects.vercel.app
  aliases: https://www.ipnrgc.com, https://ip.ipgongchang.xin
```

Final production smoke after remediation deploy:

```text
https://www.ipnrgc.com:
  GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 401 application/json, code auth_required, 58 bytes
  POST /api/mp/private-copy/generate -> 401 application/json, code auth_required, 58 bytes
  GET  /professional-learning-assets/professional-learning/v3-imagegen/tcm-yinyang-foundation/pages/02-yinyang-state-translation.jpg -> 200 image/jpeg, 163804 bytes

https://ip.ipgongchang.xin:
  GET  /api/mp/private-copy/drafts?module=moment_post&limit=1 -> 401 application/json, code auth_required, 58 bytes
  POST /api/mp/private-copy/generate -> 401 application/json, code auth_required, 58 bytes
  GET  /professional-learning-assets/professional-learning/v3-imagegen/tcm-yinyang-foundation/pages/02-yinyang-state-translation.jpg -> 200 image/jpeg, 163804 bytes
```

Final mini-program-side checks after backend deploy:

```text
node tools/check-mp-api-contract-before-asset-release.js -> 12/12 pass
node tools/check-voice-coach-remote-images.js --concurrency 4 --timeout-ms 30000 -> 120/120 pass
node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000 -> 397/397 pass
```

## Risk Checklist

- Unknown dirty changes: none identified; backend dirty scope is `package.json`, this manifest, `scripts/check-backend-release-package.mjs`, `scripts/required-professional-learning-rendered-assets.json`, and `public/professional-learning-assets`.
- Deleted files: none.
- Route conflicts: no route code edited; deploy package must include existing private-copy routes.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched; unauth smoke included.
- Static asset overwrite risk: reduced by including both voice-coach and professional-learning assets in the full backend package.
- Test data visibility: authenticated private-copy generation smoke still requires a valid mini-program token after deploy.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_Gg1PDkiEqQRmf9rP2ohLg8WngRKC`.
- Previous mini-program version: unchanged by backend prep.
- Database rollback note: no database operation.
- Recovery path: if production smoke fails after deploy, redeploy the previous Vercel production deployment and keep the mini-program upload blocked.

## Final Decision

- Release approved: Yes for backend production deploy only.
- Released by: Codex.
- Release time: 2026-06-08 12:59:50 CST.
- Final backend decision: PASS for production backend restore. API contract is 12/12 and both remote image gates pass.
- Mini-program upload decision: not uploaded by this manifest; backend prerequisite is now clear for the next mini-program upload-prep check.
- Follow-up items:
  - Before any future backend deploy, keep `pnpm release:preflight` in the build path and do not bypass `scripts/required-professional-learning-rendered-assets.json`.
  - If professional-learning rendered image paths change, regenerate the backend public assets and required-assets JSON in the same release.
  - Proceed to mini-program upload-prep checks only after confirming the mini-program dirty scope.
