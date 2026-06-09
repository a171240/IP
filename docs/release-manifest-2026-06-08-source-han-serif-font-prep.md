# Release Manifest: Source Han Serif Mini-program Font Prep

## Basic Info

- Release date: 2026-06-08
- Release thread: backend release thread was later authorized for the 2026-06-08 backend/static release
- Operator: Codex
- Version: source-han-serif-font-prep-20260608
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? yes for backend/static release actions later on 2026-06-08
- Are all other threads frozen from production deploy/upload? backend release coordination handled by the release thread
- Is this release allowed to touch production data or schema? no

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521
 M app/api/voice-coach/sessions/route.ts
 M lib/voice-coach/llm.server.ts
 M lib/voice-coach/session-context.ts
 M package.json
 M tests/voice-coach-report.runtime.test.js
 M voice-coach-ws/src/__tests__/orchestrator.test.ts
 M voice-coach-ws/src/__tests__/streaming-llm.test.ts
 M voice-coach-ws/src/pipeline/orchestrator.ts
 M voice-coach-ws/src/shared/prompts.ts
?? docs/release-handoff-2026-06-08-voice-coach-policy-integration.md
?? docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
?? docs/release-manifest-2026-06-08-voice-coach-dialogue-policy-prep.md
?? docs/voice-coach-dialogue-repair-handoff-2026-06-08.md
?? docs/voice-coach-ws-production-release-checklist-2026-06-08.md
?? public/professional-learning-assets/
?? scripts/check-backend-release-package.mjs
?? scripts/required-professional-learning-rendered-assets.json
?? voice-coach-ws/src/__tests__/topic-guard.test.ts
?? voice-coach-ws/src/shared/topic-guard.ts
?? public/miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff
```

Mini-program status:

```text
Dirty mini-program worktree includes the SourceHanSerifSC loader/config/WXSS changes plus pre-existing voice-coach/professional/release-doc changes.
```

## Included Changes

- Add `public/miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff`.
- The file is a Source Han Serif SC Regular subset generated for mini-program text.
- SHA-256:
  `170d5712b3cf8d6ea0c23919077a83b1654c4c2397dc784901fe379711d17ffe`

## Explicitly Not Included

- No backend API logic changes.
- No backend API logic change is part of this font asset scope.
- No Vercel alias or promote action.
- No Supabase changes.
- No WeChat mini-program upload.
- No changes to existing dirty backend voice-coach logic files.

## Backend Deployment

- Production alias/domain target: `https://www.ipnrgc.com`
- Required deployed URL:
  `https://www.ipnrgc.com/miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff`
- Deploy command: bundled in the later backend Vercel production deploy from `/Users/Admin/Documents/美业话镜APP/handoff/IP`

Backend smoke results:

```text
Local static path check:
GET /miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff -> 200 font/woff, 930068 bytes, magic 774f4646

Current production check after backend deploy:
GET https://www.ipnrgc.com/miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff
  -> 200 font/woff
  -> content-length 930068
  -> access-control-allow-origin: *
  -> sha256 170d5712b3cf8d6ea0c23919077a83b1654c4c2397dc784901fe379711d17ffe
```

## Risk Checklist

- Unknown dirty changes: yes, existing backend worktree has unrelated dirty files.
- Deleted files: none observed for this font scope.
- Route conflicts: none; static public asset only.
- Remote asset/legal-domain risk: `www.ipnrgc.com` must remain configured in WeChat legal download domains.
- Production deployment risk: completed as part of the backend/static release, but the backend worktree is still dirty and still needs a scoped commit.
- Mini-program runtime risk: true-device font loading still depends on `https://www.ipnrgc.com` being configured in WeChat `downloadFile` legal domains and on a new mini-program preview/upload containing the font loader.

## Rollback / Recovery

- Remove `public/miniapp-assets/fonts/source-han-serif-sc-regular-miniapp.woff` from backend public assets and redeploy.
- Mini-program will fall back to system font if the font URL is unavailable.

## Final Decision

- Release approved: backend/static asset released
- Released by: Codex release thread
- Release time: 2026-06-08
- Follow-up items:
  - Commit the backend static font asset and this manifest in a scoped backend commit.
  - Confirm `www.ipnrgc.com` is configured in WeChat `downloadFile` legal domains.
  - Upload or preview a mini-program build containing `app.js`, `app.wxss`, `utils/config.js`, and `utils/source-han-serif-font.js`, then run true-device font check.
