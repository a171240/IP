# Release Manifest: Private Copy API Restore

## Basic Info

- Release date: 2026-06-01
- Release thread: current Codex thread, authorized by user message "开始部署"
- Operator: Codex
- Version: private-copy-api-restore-20260601
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__app-api-handoff-20260521`
- Backend branch: `codex/knowledge-space-backend-20260530`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, no manual schema command run in this thread

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? User asked "开始部署" on 2026-06-01.
- Are all other threads frozen from production deploy/upload? Not independently confirmed.
- Is this release allowed to touch production data or schema? No production data/schema command is run in this thread.

## Workspace State

Backend status:

```text
## codex/knowledge-space-backend-20260530...origin/codex/knowledge-space-backend-20260530
 M lib/mp/ai-points.server.ts
?? app/api/mp/private-copy/
?? lib/private-copy/
?? supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql
?? supabase/migrations/20260521_add_private_copy_drafts.sql
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M pages/mine/index.js
 M pages/mine/index.wxml
 M pages/mine/index.wxss
 M pages/service-record/index.js
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/store-admin/index.js
 M pages/store-admin/index.wxml
 M pages/store-admin/index.wxss
 M pages/voice-coach/baibaitu-training-storage.js
 M pages/voice-coach/beauty-training-storage.js
 M pages/voice-coach/index.js
 M pages/voice-coach/training-assets.js
 M project.config.json
?? docs/...
?? screenshots and generated assets
```

Untracked files that must be included:

```text
app/api/mp/private-copy/
lib/private-copy/
supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql
supabase/migrations/20260521_add_private_copy_drafts.sql
docs/release-manifest-2026-06-01-private-copy-api-restore.md
```

Dirty files intentionally excluded:

```text
All dirty mini-program files. No WeChat upload in this release.
```

## Included Changes

- Restore `POST /api/mp/private-copy/generate`.
- Restore `GET /api/mp/private-copy/drafts`.
- Restore `GET/PATCH /api/mp/private-copy/drafts/[draftId]`.
- Add private-copy generation, schema, guardrails, prompt, and DeepSeek JSON helper modules.
- Add private-copy AI point action codes.
- Add idempotent `private_copy_drafts` migration files for repo completeness.

## Explicitly Not Included

- No WeChat DevTools upload.
- No mini-program source edits.
- No Supabase production schema or data command from this thread.
- No unrelated store-admin, voice-coach, service-record, mine-page changes.

## Database Changes

- Supabase migration files:
  - `supabase/migrations/20260521_add_private_copy_drafts.sql`
  - `supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql`
- Applied to production: not by this thread.
- Rollback/recovery plan: leave existing table in place; rollback backend deployment if route behavior regresses.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: `https://ip-834daqxd9-a171240s-projects.vercel.app`
- Production deployment ID: `dpl_381DUzdTv2SRCkuNtGAtRLZPzuCh`
- Production alias/domain: `https://ip.ipgongchang.xin`
- Deploy command: `corepack pnpm dlx vercel deploy --prod --yes`

Backend smoke results:

```text
pre-deploy POST https://ip.ipgongchang.xin/api/mp/private-copy/generate with empty payload: 404
pre-deploy GET https://ip.ipgongchang.xin/api/mp/private-copy/drafts without auth: 404
corepack pnpm exec tsc --noEmit --pretty false: pass
corepack pnpm build: pass; route list includes /api/mp/private-copy/generate and /api/mp/private-copy/drafts
node --check pages/private-copy/index.js: pass
preview POST /api/mp/private-copy/generate with empty payload via vercel curl: 400 invalid_payload
preview GET /api/mp/private-copy/drafts without auth via vercel curl: 401 auth_required
preview GET /api/mp/profile without auth via vercel curl: 401 auth_required
preview GET /api/mp/virtual-pay/products via vercel curl: 200
production deploy: ready, dpl_381DUzdTv2SRCkuNtGAtRLZPzuCh
production POST https://ip.ipgongchang.xin/api/mp/private-copy/generate with empty payload: 400 invalid_payload
production GET https://ip.ipgongchang.xin/api/mp/private-copy/drafts without auth: 401 auth_required
production GET https://ip.ipgongchang.xin/api/mp/profile without auth: 401 auth_required
production GET https://ip.ipgongchang.xin/api/mp/service-records/sessions without auth: 401 auth_required
production GET https://ip.ipgongchang.xin/api/mp/virtual-pay/products: 200
production MP_API_BASE_URL=https://ip.ipgongchang.xin corepack pnpm mp:api-contract-smoke: pass, 12/12
```

Required backend checks:

- `/api/mp/profile`: pass, 401 auth_required without auth
- `/api/mp/virtual-pay/products`: pass, 200 product list
- `/api/mp/service-records/sessions`: pass, 401 auth_required without auth
- Changed route `/api/mp/private-copy/generate`: pass, 400 invalid_payload with empty body
- Changed route `/api/mp/private-copy/drafts`: pass, 401 auth_required without auth
- Full MP API contract smoke: pass, 12/12

## Mini-program Upload

- WeChat AppID: not applicable
- DevTools CLI path: not applicable
- Upload version: not applicable
- Upload description: not applicable
- Upload command: not run
- Upload result: not run

Mini-program local checks:

```text
node --check pages/private-copy/index.js: pass
```

Required mini-program checks:

- `app.json` routes exist: unchanged
- Mine page loads: not in scope
- Store workspace loads: not in scope
- Staff training page loads: not in scope
- Pay/service package page loads: not in scope
- Service record entry behaves as expected: not in scope

## Risk Checklist

- Unknown dirty changes: mini-program has unrelated dirty files, excluded.
- Deleted files: none observed.
- Route conflicts: private-copy backend route only.
- Product/point display conflicts: backend and mini-program now both use `private.copy.generate` / `private.copy.regenerate`.
- Store account permission conflicts: not in scope.
- MP API contract smoke: pass, 12/12.
- Service-record backend availability: pass, unauthenticated smoke returned 401 auth_required.
- Test data visibility: private-copy drafts table may already exist from earlier release; no data deletion.

## Rollback / Recovery

- Previous backend deployment ID: not captured before deploy; use Vercel deployment history if rollback is needed.
- Previous mini-program version: unchanged
- Database rollback note: no schema command run in this thread.
- Who should be notified: product operator.

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-06-01 13:19 CST
- Follow-up items: authenticated real-device private-copy generation after backend production route is live.
