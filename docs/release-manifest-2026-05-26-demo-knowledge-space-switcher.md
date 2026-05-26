# Release Manifest: Demo Knowledge Space Switcher

## Basic Info

- Release date: 2026-05-26
- Release thread: confirmed by user in this Codex thread
- Operator: Codex
- Version: `1.0.20260526.2`
- Backend commit released: `bbdbb83`
- Mini-program commit released: `bc02369`
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__backend-main-checkpoint-20260514`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production project `IP网站` / ref `topyedxzcdfswxdcucpl`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次 release thread"
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this release used the committed/pushed mini-program and backend worktrees listed here.
- Is this release allowed to touch production data or schema? Yes
- Production actions currently blocked: None; release executed.

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
None identified. Re-check immediately before staging or release.
```

## Included Changes

- Backend: create knowledge-space authorization model with `mp_knowledge_spaces` and `mp_knowledge_space_access`.
- Backend: add `knowledge_space_id` snapshots to voice coach sessions and training persistence tables.
- Backend: add `/api/mp/knowledge-spaces/options`.
- Backend: route voice-training home, progress, start, and complete flows through `resolveActiveKnowledgeSpace`.
- Backend: introduce generic knowledge-space training pack helper and static Chunshe demo pack.
- Backend: keep legacy Baibaitu access fallback to avoid breaking existing Baibaitu users.
- Backend: update tests so the contract checks the new knowledge-space flow and Chunshe pack mapping.
- Mini-program: add picker, local active-space storage, request header propagation, and generic training API client.

## Explicitly Not Included

- No unrelated Supabase production migration was applied.
- Vercel production deploy has been run for this release.
- WeChat upload has been run for this release.
- No broad admin bypass or global max-permission flag is added.
- No payment/product, service-record, store-admin, poster, XHS, or private-copy behavior is intentionally changed.

## Database Changes

- Supabase migration files:
  - `supabase/migrations/20260526130550_add_mp_knowledge_spaces.sql`
  - `supabase/migrations/20260526135453_harden_mp_knowledge_space_grants.sql`
- Applied to production: Yes
- Production migration history:
  - `20260526055401` / `add_mp_knowledge_spaces`
  - `20260526055507` / `harden_mp_knowledge_space_grants`
- Migration summary:
  - Create `public.mp_knowledge_spaces`.
  - Create `public.mp_knowledge_space_access`.
  - Add `knowledge_space_id` to `voice_coach_sessions`, `voice_training_session_links`, `voice_training_progress`, and `voice_training_rewards`.
  - Replace training progress/reward uniqueness with knowledge-space-scoped uniqueness.
  - Seed `baibaitu` and `chunshe`.
  - Backfill existing Baibaitu training links, progress, rewards, and identifiable sessions to the Baibaitu knowledge space.
  - Add RLS, grants, indexes, and comments.
  - Revoke non-SELECT access from `anon` and `authenticated` on the new knowledge-space tables.
- Supabase CLI status: local `supabase` command is not installed, so the migration was created manually and has not been locally applied.

Production grant applied:

```sql
insert into public.mp_knowledge_space_access (user_id, knowledge_space_id, role, status)
select '<吴江店演示账号 user_id>'::uuid, id, 'demo_operator', 'active'
from public.mp_knowledge_spaces
where code in ('baibaitu', 'chunshe')
on conflict (user_id, knowledge_space_id)
do update set
  role = excluded.role,
  status = 'active',
  expires_at = null,
  updated_at = now();
```

Grant verification:

- 吴江店演示账号 now has active `demo_operator` access to `baibaitu`.
- 吴江店演示账号 now has active `demo_operator` access to `chunshe`.

Rollback/recovery plan:

- If migration has run but backend deploy is stopped, leave new tables idle and do not upload mini-program.
- If a user is over-granted, revoke by updating `mp_knowledge_space_access.status`.
- If backend behavior regresses, roll Vercel back first; then disable access grants rather than dropping tables.
- Do not drop tables or columns after real user training data exists.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: pending
- Production deployment ID: `dpl_DLzBAUfptqSDC8tQhnbUXn4siWah`
- Production deployment URL: `https://ip-izj3tj11f-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`
- Deploy command: `VERCEL_TELEMETRY_DISABLED=1 corepack pnpm dlx vercel@50.28.0 deploy --prod --yes`

Backend smoke results before release:

```text
corepack pnpm build
Result: pass

node --test tests/baibaitu-training-flow.runtime.test.js
Result: pass, 5/5

git diff --check
Result: pass

corepack pnpm build
Result: pass, with existing warnings.
```

Backend smoke results after deploy:

```text
GET https://www.ipnrgc.com/api/mp/profile -> 401 auth_required
GET https://www.ipnrgc.com/api/mp/knowledge-spaces/options -> 401 auth_required
GET https://www.ipnrgc.com/api/mp/voice-coach/training-home -> 401 auth_required
GET https://www.ipnrgc.com/api/mp/voice-coach/training-progress -> 401 auth_required
GET https://www.ipnrgc.com/api/mp/virtual-pay/products -> 200
GET https://www.ipnrgc.com/api/mp/service-records/sessions -> 401 auth_required
GET https://ip.ipgongchang.xin/api/mp/knowledge-spaces/options -> 401 auth_required
vercel logs --level error --since 15m -> No logs found
```

Known warnings:

```text
corepack pnpm build reports existing lint/runtime warnings such as no-explicit-any and Next runtime export recognition warnings.
Build exits 0.
```

Required backend checks after deploy:

- `/api/mp/profile`
- `/api/mp/knowledge-spaces/options`
- `/api/mp/voice-coach/training-home`
- `/api/mp/voice-coach/training-progress`
- `/api/mp/voice-coach/training-tasks/[taskId]/start`
- `/api/mp/voice-coach/training-sessions/[sessionId]/complete`
- `/api/mp/virtual-pay/products`
- `/api/mp/service-records/sessions`

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: `1.0.20260526.2`
- Upload description: `demo-knowledge-space-switcher-20260526`
- Upload command: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /Users/Admin/Documents/美业话镜小程序 --version 1.0.20260526.2 --desc demo-knowledge-space-switcher-20260526 --lang zh`
- Upload result: success, package size `1.2 MB` / `1267533` bytes

Mini-program local checks:

```text
node --check utils/knowledge-space.js
node --check utils/request.js
node --check pages/voice-coach/training-api.js
node --check pages/voice-coach/index.js
node --check pages/voice-coach/training-map/index.js
node --check pages/voice-coach/chat.js
node --check pages/voice-coach/report.js
Result: pass

git diff --check
Result: pass

app.json route file check
Result: 47 routes, route files ok
```

Required mini-program checks:

- Voice coach home page loads.
- Knowledge-space picker appears only when the account has multiple spaces.
- Demo account can switch between Baibaitu and Chunshe.
- Chunshe start task creates a Chunshe-scoped voice coach session.
- Baibaitu existing training flow remains available.
- Unauthorized accounts cannot see or request unauthorized spaces.
- Mine, Store workspace, Pay/service package, and Service Record regression checks pass.

## Risk Checklist

- Unknown dirty changes: re-check before staging.
- Deleted files: none identified.
- Route conflicts: no new mini-program route; existing voice coach routes are reused.
- Product/point display conflicts: not intentionally touched.
- Store account permission conflicts: release depends on explicit knowledge-space grants.
- Service-record backend availability: not intentionally touched; smoke anyway.
- Test data visibility: demo Chunshe data must only appear for authorized demo/operator accounts.
- Backend conflict: yes, mini-program upload depends on backend migration and deploy.

## Rollback / Recovery

- Previous backend deployment ID: not captured in this thread; use Vercel deployment history before `dpl_DLzBAUfptqSDC8tQhnbUXn4siWah` if rollback is needed.
- Previous mini-program version: `1.0.20260526.1` if that remains current.
- Database rollback note: use access revocation and backend rollback first; avoid destructive schema rollback.
- Who should be notified: user in the release thread.

## Final Decision

- Release approved: Yes
- Released by: Codex
- Release time: 2026-05-26 14:01:44 CST
- Follow-up items:
  - Run authenticated real-device walkthrough with the 吴江店演示账号.
  - Confirm the homepage picker shows 白白兔 and 椿舍.
