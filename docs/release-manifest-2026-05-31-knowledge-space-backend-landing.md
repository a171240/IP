# Release Manifest: Knowledge Space Backend Landing

## Basic Info

- Release date: 2026-05-31
- Release thread: current Codex thread; user explicitly confirmed this thread is the release thread
- Operator: Codex
- Version: backend `knowledge-space-training-v2-20260531`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__app-api-handoff-20260521`
- Backend branch: `codex/knowledge-space-backend-20260530`
- Supabase project/environment: production schema not changed in this release

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "当前线程是本版本 release thread".
- Are all other threads frozen from production deploy/upload? Not independently verifiable; current release action is limited to this thread.
- Is this release allowed to touch production data or schema? No. No Supabase migration or manual data change is included.

## Workspace State

Mini-program status:

```text
Dirty worktree with prior release changes and untracked voice-coach assets/docs.
This backend landing does not edit mini-program files and does not upload the mini-program.
```

Backend status:

```text
Dirty worktree with existing voice-coach backend changes, public voice-coach assets,
and untracked MP knowledge-space/training API routes.
This release intentionally includes the training API routes and the new backend
training-pack JSON data files.
```

Untracked files that must be included:

```text
app/api/mp/knowledge-spaces/
app/api/mp/voice-coach/training-home/
app/api/mp/voice-coach/training-progress/
app/api/mp/voice-coach/training-sessions/
app/api/mp/voice-coach/training-tasks/
lib/voice-coach/training.server.ts
lib/voice-coach/training-packs/common-beauty-v2.json
lib/voice-coach/training-packs/baibaitu-speaking-v2.json
scripts/export-voice-coach-training-packs.mjs
public/voice-coach-assets/
```

Dirty files intentionally excluded:

```text
No Supabase migration is applied.
No mini-program upload is performed by this backend release.
```

## Included Changes

- Add backend static training-pack data for the common knowledge base: 30 tasks, 30 `common-beauty/v2` scene images.
- Add backend static training-pack data for the Baibaitu knowledge base: 30 tasks, 30 scene images, 30 flow images, 30 concept images under `baibaitu-speaking/v2`.
- Make `training-home` return a complete task list, `content_version`, `asset_version`, `task_count`, and current task.
- Make backend training pack resolution prefer database `tasks_json` when present, with complete static packs as fallback.
- Make task start resolve against the full training pack instead of the old single static task.
- Persist per-task `task_results` when a training session is completed.
- Keep `pack.tasks_json` out of public API responses to avoid duplicate payload bloat.

## Explicitly Not Included

- No Supabase production migration execution.
- No production data seeding.
- No WeChat mini-program upload.
- No payment, service-record, store-admin, or account permission changes.

## Database Changes

- Supabase migration files: existing `supabase/migrations/20260530_add_voice_coach_training_knowledge_spaces.sql`
- Applied to production: no
- Rollback/recovery plan: no schema is changed; rollback is Vercel deployment rollback only.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_2JL7QbfMh8xJ1xt18FH4fxEqNBCb`
- Preview deployment URL: not used
- Production deployment ID: `dpl_BzGt68NW9auq1Tivs5UJwrXV8kC8`
- Production alias/domain: `https://ip.ipgongchang.xin`
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes`

Backend smoke results:

```text
node scripts/export-voice-coach-training-packs.mjs: pass
corepack pnpm exec tsc --noEmit --pretty false: pass
corepack pnpm build: pass, existing lint/runtime warnings only
Vercel production deploy: pass
Deploy URL: https://ip-88rl9lis3-a171240s-projects.vercel.app
Production deployment ID: dpl_BzGt68NW9auq1Tivs5UJwrXV8kC8
Vercel CLI output also aliased https://www.ipnrgc.com
JSON validation:
- common-beauty-v2.json: 30 tasks, 30 v2 images
- baibaitu-speaking-v2.json: 30 tasks, 90 v2 images
Production smoke:
- https://ip.ipgongchang.xin/voice-coach-assets/voice-coach/common-beauty/v2/d01/scene.jpg: 200 image/jpeg
- https://ip.ipgongchang.xin/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s30/concept.jpg: 200 image/jpeg
- https://www.ipnrgc.com/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/flow.jpg: 200 image/jpeg after retry; first attempt had transient ECONNRESET
- https://ip.ipgongchang.xin/api/mp/profile: 401 auth_required
- https://ip.ipgongchang.xin/api/mp/virtual-pay/products: 200 product list
- https://ip.ipgongchang.xin/api/mp/service-records/sessions: 401 auth_required
- https://ip.ipgongchang.xin/api/mp/voice-coach/training-home?training_pack_mode=common-generic: 401 auth_required
- https://ip.ipgongchang.xin/api/mp/voice-coach/training-home?training_pack_mode=baibaitu-speaking: 401 auth_required
```

Required backend checks:

- `/api/mp/profile`
- `/api/mp/virtual-pay/products`
- `/api/mp/service-records/sessions`
- `/api/mp/voice-coach/training-home?training_pack_mode=common-generic`
- `/api/mp/voice-coach/training-home?training_pack_mode=baibaitu-speaking`
- Static image paths under `/voice-coach-assets/voice-coach/common-beauty/v2/` and `/voice-coach-assets/voice-coach/baibaitu-speaking/v2/`

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- Upload version: handled separately by user
- Upload result: not performed by this backend release

## Risk Checklist

- Unknown dirty changes: yes; current backend worktree contains prior release changes and untracked training API files.
- Deleted files: none observed.
- Route conflicts: no existing route overwritten; new MP training routes are under `/api/mp/voice-coach/*`.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: training-home remains authenticated; unauthenticated smoke should return 401.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_2JL7QbfMh8xJ1xt18FH4fxEqNBCb`
- Previous mini-program version: no mini-program upload in this release
- Database rollback note: no production schema applied
- Recovery path: roll Vercel production back to `dpl_2JL7QbfMh8xJ1xt18FH4fxEqNBCb` or earlier stable `dpl_H3fbSmr8Q2KYonbK54pBdxSBP55k`

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-05-31
- Follow-up items:
  - After the user's second mini-program upload is stable, update the mini-program remote normalizer to consume backend `visualScene` and `learningVisuals` directly.
  - Later, apply the Supabase migration and seed store-specific `tasks_json` when production DB governance is ready.
