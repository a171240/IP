# Release Manifest: voice-coach-training-hotfix-20260607

## Basic Info

- Release date: 2026-06-07 19:45 CST
- Release thread: Codex thread authorized by user message "开始" after direct test found production 404s
- Operator: Codex
- Version: backend-voice-coach-training-hotfix-20260607
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production environment used by Vercel project `ip`; no production schema/data operation in this thread

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User authorized the hotfix with "开始" after the plan stated backend restore, build/API smoke, and backend production deploy.
- Are all other threads frozen from production deploy/upload? Current local scan shows the backend worktree only contains this scoped hotfix before release.
- Is this release allowed to touch production data or schema? No. Code/static asset deploy only; no Supabase migration execution or manual data edits.

## Workspace State Before Release

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521
?? app/api/mp/knowledge-spaces/
?? app/api/mp/voice-coach/training-home/
?? app/api/mp/voice-coach/training-progress/
?? app/api/mp/voice-coach/training-sessions/
?? app/api/mp/voice-coach/training-tasks/
?? lib/voice-coach/training-packs/
?? lib/voice-coach/training.server.ts
?? public/voice-coach-assets/
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
```

Untracked files that must be included:

```text
app/api/mp/knowledge-spaces/options/route.ts
app/api/mp/voice-coach/training-home/route.ts
app/api/mp/voice-coach/training-progress/route.ts
app/api/mp/voice-coach/training-tasks/[taskId]/start/route.ts
app/api/mp/voice-coach/training-sessions/[sessionId]/complete/route.ts
lib/voice-coach/training.server.ts
lib/voice-coach/training-packs/common-beauty-v2.json
lib/voice-coach/training-packs/baibaitu-speaking-v2.json
public/voice-coach-assets/voice-coach/**/*
```

Dirty files intentionally excluded:

```text
None.
```

## Included Changes

- Restore mini-program training knowledge-space options route.
- Restore mini-program voice-coach training home/progress/start/complete routes.
- Restore static training pack fallback service under `lib/voice-coach/training.server.ts`.
- Restore common beauty and Baibaitu training pack JSON.
- Restore `public/voice-coach-assets` static images used by the mini-program voice-coach home and training pages.

## Explicitly Not Included

- No mini-program code change.
- No WeChat DevTools upload.
- No Supabase production migration.
- No manual production data write.
- No unrelated backend route changes.

## Database Changes

- Supabase migration files: none added or executed by this thread.
- Applied to production: No.
- Rollback/recovery plan: redeploy previous Vercel production deployment `dpl_DfsGojBd7ZpGEvtbEfE912CLHYHC`.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_DfsGojBd7ZpGEvtbEfE912CLHYHC`
- Production deployment ID: `dpl_9o1Jo5djHt6AM5MzpAwx8P6uWmtQ`
- Production deployment URL: `https://ip-bgshr7t72-a171240s-projects.vercel.app`
- Production inspector URL: `https://vercel.com/a171240s-projects/ip/9o1Jo5djHt6AM5MzpAwx8P6uWmtQ`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `npx --yes vercel deploy --prod --yes --project ip`

Backend smoke results before deploy:

```text
pnpm build: pass
git diff --check: pass
local production server with dummy Supabase env:
  GET  /api/mp/knowledge-spaces/options -> 401 auth_required
  GET  /api/mp/voice-coach/training-home?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  GET  /api/mp/voice-coach/training-progress?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  POST /api/mp/voice-coach/training-tasks/sample/start -> 401 auth_required
  POST /api/mp/voice-coach/training-sessions/00000000-0000-0000-0000-000000000000/complete -> 401 auth_required
  GET  /voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  GET  /voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  POST /api/mp/private-copy/generate -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
  GET  /api/mp/virtual-pay/products -> 200
```

Backend smoke results after deploy:

```text
Production deployment state: READY
https://www.ipnrgc.com:
  GET  /api/mp/knowledge-spaces/options -> 401 auth_required
  GET  /api/mp/voice-coach/training-home?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  GET  /api/mp/voice-coach/training-progress?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  POST /api/mp/voice-coach/training-tasks/sample/start -> 401 auth_required
  GET  /voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  GET  /voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  POST /api/mp/private-copy/generate -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
  GET  /api/mp/virtual-pay/products -> 200
  POST /api/mp/service-records/sessions -> 401 auth_required
https://ip.ipgongchang.xin:
  GET  /api/mp/knowledge-spaces/options -> 401 auth_required
  GET  /api/mp/voice-coach/training-home?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  GET  /api/mp/voice-coach/training-progress?knowledge_space_id=common_beauty_knowledge_v1&training_pack_mode=common-generic -> 401 auth_required
  POST /api/mp/voice-coach/training-tasks/sample/start -> 401 auth_required
  GET  /voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  GET  /voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg?vc_img_v=20260601-hd-v2 -> 200 image/jpeg
  POST /api/mp/private-copy/generate -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
  GET  /api/mp/virtual-pay/products -> 200
  POST /api/mp/service-records/sessions -> 401 auth_required
No checked route returned 404 or 500.
```

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: not applicable
- Upload description: not applicable
- Upload command: not run
- Upload result: not applicable

## Risk Checklist

- Unknown dirty changes: none.
- Deleted files: none.
- Route conflicts: restores previously missing voice-coach training routes only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: route auth still starts with `resolveMpAccountContext`.
- Service-record backend availability: not touched; baseline route smoke recommended after deploy.
- Test data visibility: unauth smoke only; authenticated training content smoke requires valid mini-program token.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_DfsGojBd7ZpGEvtbEfE912CLHYHC`
- Previous mini-program version: unchanged.
- Database rollback note: no database operation in this thread.
- Recovery path: redeploy previous Vercel deployment if production smoke fails.

## Final Decision

- Release approved: Yes
- Released by: Codex
- Release time: 2026-06-07 19:48 CST
- Follow-up items: authenticated voice-coach training-home smoke with a valid mini-program token after deploy.
