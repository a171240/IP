# Release Manifest - Baibaitu Training + Private Copy

## Basic Info

- Release date: 2026-05-26
- Release thread: current Codex thread
- Operator: Codex, with user approval
- Version: `1.0.20260526.1`
- Backend repository: `a171240/IP`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Backend code commit: `a389a7e`
- Backend release manifest commit: `1980981`
- Mini-program repository: `a171240/meiye-huajing-miniprogram`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Mini-program commit: `f965a36`
- Supabase project/environment: production, project host `topyedxzcdfswxdcucpl.supabase.co`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次发布线程，可以执行生产发布".
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this release uses the clean pushed backend integration branch and the clean pushed mini-program branch.
- Is this release allowed to touch production data or schema? Yes, but production DB inspection shows required schema already exists; no duplicate migration will be applied unless a later check finds a missing object.

## Workspace State

Backend status:

```text
## codex/baibaitu-private-copy-release-20260526...origin/codex/baibaitu-private-copy-release-20260526
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
```

Untracked files that must be included:

```text
none
```

Dirty files intentionally excluded:

```text
none
```

## Included Changes

- Backend: Baibaitu training API routes and access checks.
- Backend: Private copy assistant API routes and generation runtime from `origin/codex/app-api-handoff-20260521`.
- Backend: APIMart image primary guard so `EVOLINK_IMAGE_PRIMARY` alone cannot make Evolink the primary image provider.
- Mini-program: private-copy tab/page/assets and Baibaitu mini-program training UI.

## Explicitly Not Included

- No unrelated backend refactor.
- No payment/product pricing change.
- No manual production data mutation beyond schema verification.

## Database Changes

- Supabase migration files in branch:
  - `supabase/migrations/20260521_add_private_copy_drafts.sql`
  - `supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql`
  - `supabase/migrations/20260525093000_baibaitu_training_minimal.sql`
- Applied to production in this thread: no new migration executed; preflight shows equivalent production migration history already exists:
  - private-copy: `20260521110108`, `20260521110205`
  - Baibaitu: `20260525101216`
- Production schema preflight:
  - `private_copy_drafts` exists with expected runtime columns.
  - `voice_training_packs`, `voice_training_tasks`, `voice_training_session_links`, `voice_training_progress`, and `voice_training_rewards` exist.
  - RLS is enabled on the private-copy and voice-training tables.
  - `private_copy_drafts` grants are present for `authenticated` and `service_role`; no `anon` grant was found.
- Rollback/recovery plan: if backend deploy fails, roll back to previous production deployment `dpl_D2PJ7U7oPGJbxda9eq2JwiN2pEDn`. If schema verification later finds a missing object, apply only the missing idempotent SQL and record it below.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_D2PJ7U7oPGJbxda9eq2JwiN2pEDn`
- Previous production aliases: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Preview deployment URL: not used
- Production deployment ID: `dpl_2m3EMSZhLhxeJdKM8nKkLw82Cdso`
- Production deployment URL: `https://ip-7bzfej7f3-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `pnpm dlx vercel@latest deploy --prod --yes`

Backend checks before deploy:

```text
pnpm exec tsc --noEmit --pretty false: pass
node --test tests/baibaitu-training-flow.runtime.test.js: pass, 4/4
pnpm build: pass
pre-deploy /api/mp/profile without auth: 401 auth_required
pre-deploy /api/mp/private-copy/generate without auth: 404, confirming production backend still needs this route deployment
```

Required backend checks after deploy:

```text
GET  https://www.ipnrgc.com/api/mp/profile -> 401 auth_required
GET  https://www.ipnrgc.com/api/mp/private-copy/drafts -> 401 auth_required
POST https://www.ipnrgc.com/api/mp/private-copy/generate with empty payload -> 400 invalid_payload
GET  https://www.ipnrgc.com/api/mp/voice-coach/training-home -> 401 auth_required
GET  https://www.ipnrgc.com/api/mp/virtual-pay/products -> 200
GET  https://www.ipnrgc.com/api/mp/service-records/sessions -> 401 auth_required
POST https://ip.ipgongchang.xin/api/mp/private-copy/generate with empty payload -> 400 invalid_payload
```

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: `1.0.20260526.1`
- Upload description: `baibaitu-private-copy-20260526`
- Upload command: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /Users/Admin/Documents/美业话镜小程序 --version 1.0.20260526.1 --desc baibaitu-private-copy-20260526 --lang zh`
- Upload result: success. DevTools returned `✔ upload`; package size `1.2 MB / 1261591 bytes`.

Mini-program local checks:

```text
app.json private tab route check: pass
node --check pages/private-copy/index.js: pass
node --check utils/ai-points.js: pass
node --check pages/voice-coach/baibaitu-training-api.js: pass
node --check pages/voice-coach/training-map/index.js: pass
```

Required mini-program checks:

- `app.json` routes exist: pass before upload.
- Mine page loads: pending real-device/manual check.
- Store workspace loads: pending real-device/manual check.
- Staff training page loads: pending real-device/manual check.
- Pay/service package page loads: backend route smoke required after deploy.
- Service record entry behaves as expected: backend route smoke required after deploy.

## Risk Checklist

- Unknown dirty changes: none in the selected backend and mini-program worktrees.
- Deleted files: none.
- Route conflicts: private-copy backend route was 404 before deploy and should become 401/validation error after deploy.
- Product/point display conflicts: private-copy action code costs match backend and mini-program (`private.copy.generate`, `private.copy.regenerate`).
- Store account permission conflicts: no store-admin permission change in this release.
- Service-record backend availability: to be checked after deploy.
- Test data visibility: `private_copy_drafts` already has production rows; do not drop or recreate the table.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_D2PJ7U7oPGJbxda9eq2JwiN2pEDn`
- Previous mini-program version: `1.0.20260525.1`
- Database rollback note: no DB rollback expected because existing production schema is reused. If a migration is later applied, do not drop tables with user data; ship a compensating migration after backup/export.
- Who should be notified: user in this thread.

## Final Decision

- Release approved: yes, by user authorization in this thread.
- Released by: Codex
- Release time: 2026-05-26 12:32:56 CST
- Follow-up items: run authenticated real-device private-copy generation and Baibaitu account walkthrough with real test accounts.
