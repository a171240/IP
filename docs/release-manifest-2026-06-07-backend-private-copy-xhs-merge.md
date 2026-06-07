# Release Manifest: backend-private-copy-xhs-merge-20260607

## Basic Info

- Release date: 2026-06-07 19:13 CST
- Release thread: Codex thread authorized by user message "给你授权，开始吧"
- Operator: Codex
- Version: backend-private-copy-xhs-merge-20260607
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Supabase project/environment: production environment used by Vercel project `ip`; no production schema/data operation in this thread

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User authorized release with "给你授权，开始吧".
- Are all other threads frozen from production deploy/upload? Current local scan shows both relevant worktrees clean before release.
- Is this release allowed to touch production data or schema? No. Code deploy only; no Supabase migration execution or manual data edits.

## Workspace State Before Release

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 3]
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 7]
```

Untracked files that must be included:

```text
None at release start.
```

Dirty files intentionally excluded:

```text
None at release start.
```

## Included Changes

- Merge remote backend private-copy assistant implementation with local backend changes.
- Keep remote complete `app/api/mp/private-copy/*` and `lib/private-copy/*` implementation.
- Remove superseded local private-copy storage/types implementation and duplicate migration name.
- Preserve XHS cover prompt improvements from both local and remote branches, including old prompt anchors required by static tests.
- Preserve local GPT image provider fallback changes from earlier backend commit.

## Explicitly Not Included

- No production Supabase migration execution.
- No manual production data writes.
- No Vercel alias/promote command outside the production deployment command.

## Database Changes

- Supabase migration files in repository:
  - `supabase/migrations/20260521_add_private_copy_drafts.sql`
  - `supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql`
- Applied to production by this thread: No.
- Rollback/recovery plan: if deployed code fails on private-copy schema mismatch, revert Vercel to previous production deployment and separately evaluate whether the migration had already been applied.

## Backend Deployment

- Vercel project: `ip`
- Production deployment ID: `dpl_DfsGojBd7ZpGEvtbEfE912CLHYHC`
- Production deployment URL: `https://ip-1p4ff49mv-a171240s-projects.vercel.app`
- Production inspector URL: `https://vercel.com/a171240s-projects/ip/DfsGojBd7ZpGEvtbEfE912CLHYHC`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `npx --yes vercel deploy --prod --yes --project ip`

Backend smoke results before deploy:

```text
git diff --check: pass
node --test tests/xhs-cover-style.static.test.js: pass, 6/6
pnpm build: pass
local production route smoke with dummy Supabase env:
  GET  /api/mp/private-copy/drafts -> 401 auth_required
  POST /api/mp/private-copy/generate -> 401 auth_required
  PATCH /api/mp/private-copy/drafts/[draftId] -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
production unauth route smoke before deploy:
  https://ip.ipgongchang.xin private-copy drafts/generate and xhs cover -> 401 auth_required
  https://www.ipnrgc.com private-copy drafts/generate and xhs cover -> 401 auth_required
```

Backend smoke results after deploy:

```text
Production deployment state: READY
https://www.ipnrgc.com:
  GET  /api/mp/private-copy/drafts?limit=1 -> 401 auth_required
  POST /api/mp/private-copy/generate -> 401 auth_required
  PATCH /api/mp/private-copy/drafts/00000000-0000-0000-0000-000000000000 -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
  GET  /api/mp/profile -> 401 auth_required
  GET  /api/mp/virtual-pay/products -> 200
  POST /api/mp/service-records/sessions -> 401 auth_required
https://ip.ipgongchang.xin:
  GET  /api/mp/private-copy/drafts?limit=1 -> 401 auth_required
  POST /api/mp/private-copy/generate -> 401 auth_required
  PATCH /api/mp/private-copy/drafts/00000000-0000-0000-0000-000000000000 -> 401 auth_required
  POST /api/mp/xhs/generate-cover-image -> 401 auth_required
  GET  /api/mp/profile -> 401 auth_required
  GET  /api/mp/virtual-pay/products -> 200
  POST /api/mp/service-records/sessions -> 401 auth_required
No checked route returned 404 or 500.
```

Required backend checks:

- `/api/mp/private-copy/drafts`
- `/api/mp/private-copy/generate`
- `/api/mp/private-copy/drafts/[draftId]`
- `/api/mp/xhs/generate-cover-image`
- Existing payment/service-record routes: unauth route checks only unless valid production auth is supplied.

## Risk Checklist

- Unknown dirty changes: none at release start.
- Deleted files: deleted superseded `lib/private-copy/storage.server.ts`, `lib/private-copy/types.ts`.
- Route conflicts: private-copy routes were merge-conflicted and resolved to the remote complete implementation with local compatibility retained.
- Product/point display conflicts: private-copy action codes exist in backend AI point map.
- Store account permission conflicts: not changed.
- Service-record backend availability: not intentionally changed; route smoke recommended after deploy.
- Test data visibility: no authenticated generation smoke planned without valid user token.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_8GmNiGyH5KMdWqLvXsETvRh4K9zL`.
- Database rollback note: no database operation in this thread.
- Recovery path: redeploy previous Vercel deployment or revert this branch's backend merge commit if route smoke fails.

## Final Decision

- Release approved: Yes
- Released by: Codex
- Release time: 2026-06-07 19:21 CST
- Follow-up items: authenticated private-copy generation smoke with a valid mini-program token after deploy.
