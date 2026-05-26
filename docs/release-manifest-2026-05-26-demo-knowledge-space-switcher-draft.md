# Release Manifest Draft: Demo Knowledge Space Switcher

## Basic Info

- Release date: 2026-05-26
- Release thread: confirmed by user in this Codex thread
- Operator: Codex
- Version: proposed `1.0.20260526.2`
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__backend-main-checkpoint-20260514`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production project `IP网站` / ref `topyedxzcdfswxdcucpl`, pending release-thread confirmation

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次 release thread"
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this release uses the current staged mini-program/backend worktrees only.
- Is this release allowed to touch production data or schema? Yes, after the final preflight checks in this thread.
- Production actions currently blocked: None after final preflight passes.

## Workspace State

Backend status:

```text
## codex/baibaitu-private-copy-release-20260526...origin/codex/baibaitu-private-copy-release-20260526
 M app/api/mp/voice-coach/training-home/route.ts
 M app/api/mp/voice-coach/training-progress/route.ts
 M app/api/mp/voice-coach/training-sessions/[sessionId]/complete/route.ts
 M app/api/mp/voice-coach/training-tasks/[taskId]/start/route.ts
 M app/api/voice-coach/sessions/route.ts
 M lib/voice-coach/session-context.ts
 M tests/baibaitu-training-flow.runtime.test.js
?? app/api/mp/knowledge-spaces/
?? lib/mp/knowledge-space.server.ts
?? lib/voice-training/knowledge-space-training.server.ts
?? supabase/migrations/20260526130550_add_mp_knowledge_spaces.sql
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M pages/voice-coach/baibaitu-training-api.js
 M pages/voice-coach/baibaitu-training-storage.js
 M pages/voice-coach/chat.js
 M pages/voice-coach/index.js
 M pages/voice-coach/index.wxml
 M pages/voice-coach/index.wxss
 M pages/voice-coach/report.js
 M pages/voice-coach/report.wxml
 M pages/voice-coach/training-map/index.js
 M pages/voice-coach/training-map/index.json
 M pages/voice-coach/training-map/index.wxml
 M utils/request.js
?? docs/demo-knowledge-space-target-mode-execution-plan.md
?? pages/voice-coach/training-api.js
?? utils/knowledge-space.js
```

Untracked files that must be included:

```text
app/api/mp/knowledge-spaces/options/route.ts
lib/mp/knowledge-space.server.ts
lib/voice-training/knowledge-space-training.server.ts
supabase/migrations/20260526130550_add_mp_knowledge_spaces.sql
docs/demo-knowledge-space-target-mode-execution-plan.md
pages/voice-coach/training-api.js
utils/knowledge-space.js
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

- No production Supabase migration has been applied.
- No Vercel production deploy has been run.
- No WeChat upload has been run.
- No broad admin bypass or global max-permission flag is added.
- No payment/product, service-record, store-admin, poster, XHS, or private-copy behavior is intentionally changed.

## Database Changes

- Supabase migration files:
  - `supabase/migrations/20260526130550_add_mp_knowledge_spaces.sql`
- Applied to production: No
- Migration summary:
  - Create `public.mp_knowledge_spaces`.
  - Create `public.mp_knowledge_space_access`.
  - Add `knowledge_space_id` to `voice_coach_sessions`, `voice_training_session_links`, `voice_training_progress`, and `voice_training_rewards`.
  - Replace training progress/reward uniqueness with knowledge-space-scoped uniqueness.
  - Seed `baibaitu` and `chunshe`.
  - Backfill existing Baibaitu training links, progress, rewards, and identifiable sessions to the Baibaitu knowledge space.
  - Add RLS, grants, indexes, and comments.
- Supabase CLI status: local `supabase` command is not installed, so the migration was created manually and has not been locally applied.

Required production grant after migration:

```sql
insert into public.mp_knowledge_space_access (user_id, knowledge_space_id, role, status)
select '<auth.users.id>'::uuid, id, 'demo_operator', 'active'
from public.mp_knowledge_spaces
where code in ('baibaitu', 'chunshe')
on conflict (user_id, knowledge_space_id)
do update set
  role = excluded.role,
  status = 'active',
  expires_at = null,
  updated_at = now();
```

Rollback/recovery plan:

- If migration has run but backend deploy is stopped, leave new tables idle and do not upload mini-program.
- If a user is over-granted, revoke by updating `mp_knowledge_space_access.status`.
- If backend behavior regresses, roll Vercel back first; then disable access grants rather than dropping tables.
- Do not drop tables or columns after real user training data exists.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: pending
- Production deployment ID: pending
- Production alias/domain: pending
- Deploy command: pending release thread

Backend smoke results before release:

```text
corepack pnpm build
Result: pass

node --test tests/baibaitu-training-flow.runtime.test.js
Result: pass, 5/5

git diff --check
Result: pass
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
- Upload version: proposed `1.0.20260526.2`
- Upload description: proposed `demo-knowledge-space-switcher-20260526`
- Upload command: pending release thread
- Upload result: pending

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

- Previous backend deployment ID: fill in during release thread.
- Previous mini-program version: `1.0.20260526.1` if that remains current.
- Database rollback note: use access revocation and backend rollback first; avoid destructive schema rollback.
- Who should be notified: user in the release thread.

## Final Decision

- Release approved: Yes, pending successful execution of the release checklist above.
- Released by: pending
- Release time: pending
- Follow-up items:
  - Confirm this is the release thread.
  - Identify the demo WeChat account's Supabase `auth.users.id`.
  - Apply migration.
  - Grant `baibaitu` and `chunshe`.
  - Deploy backend.
  - Upload mini-program.
  - Run authenticated real-device walkthrough.
