# Release Manifest: Manbeilian Knowledge Space Access

## Basic Info

- Release date: 2026-06-15
- Release thread: current Codex thread; user explicitly confirmed this thread as the Manbeilian knowledge-base fix release thread
- Operator: Codex
- Version: Manbeilian knowledge-space backend/data access hotfix
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production project `IP网站` / `topyedxzcdfswxdcucpl`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `确认本线程为曼贝莲知识库修复 release 线程，允许执行生产 Supabase migration 和 Vercel 后端部署。`
- Are all other threads frozen from production deploy/upload? This thread is the only authorized production migration/deploy thread for this Manbeilian knowledge-space fix. Unrelated dirty service-record/audio work is excluded from the clean release package.
- Is this release allowed to touch production data or schema? Yes for the Manbeilian data-only Supabase migration. No schema/RLS change is included.

## Workspace State

Backend status before release prep:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 14]
 M app/api/mp/service-records/sessions/[sessionId]/route.ts
 M lib/service-records/processing.server.ts
 M lib/service-records/server.ts
 M lib/voice-coach/training.server.ts
 M tests/service-record-minutes-v2.static.test.js
?? app/api/app/service-records/sessions/[sessionId]/audio/
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? lib/service-records/audio-evidence.server.ts
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? tests/manbeilian-knowledge-space.static.test.js
```

Mini-program status before release prep:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 37]
 M pages/service-record/detail/index.js
 M pages/service-record/detail/index.wxml
 M pages/service-record/detail/index.wxss
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/service-record/service-record-voice-coach-setup.js
 M pages/service-record/service-record-voice-coach-setup.test.js
 M pages/store-admin/service-records/detail/index.js
 M pages/store-admin/service-records/detail/index.wxml
 M pages/store-admin/service-records/detail/index.wxss
 M pages/voice-coach/index.wxss
 M project.config.json
 M tools/check-voice-coach-remote-images.js
?? docs/manbeilian-knowledge-space-training-dev-doc-2026-06-10.md
?? docs/manbeilian-mini-program-asset-audit-2026-06-12.md
?? docs/manbeilian-project-card-knowledge-base-dev-doc-2026-06-10.md
?? docs/manbeilian-web-driven-knowledge-base-dev-doc-2026-06-13.md
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? docs/service-record-commercial-ui-dual-plugin-handoff-2026-06-15.md
?? docs/service-record-commercial-ui-framework-options-2026-06-15.md
?? docs/service-record-l12-real-device-test-card-2026-06-15.md
?? docs/service-record-real-chain-acceptance-checklist-2026-06-15.md
?? docs/service-record-smart-minutes-product-design-blueprint-2026-06-14.md
?? docs/service-record-world-class-ui-framework-2026-06-14.md
?? manbeilian-current-html-after-card-refresh.png
?? outputs/
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
?? tools/inspect-ble-diagnostic.js
?? tools/inspect-ble-diagnostic.test.js
?? tools/inspect-service-record-real-chain.js
?? tools/inspect-service-record-test-packet.js
?? tools/inspect-service-record-test-packet.test.js
?? tools/service-record-real-chain-diagnostic-ui.test.js
?? utils/service-record-minutes-v2-contract.js
?? utils/service-record-minutes-v2-contract.test.js
?? utils/service-record-real-chain-evidence.js
?? utils/service-record-real-chain-evidence.test.js
?? utils/service-record-voice-coach-setup.js
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-15-manbeilian-knowledge-space-access.md
supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
tests/manbeilian-knowledge-space.static.test.js
```

Dirty files intentionally excluded:

```text
Backend service-record/audio files listed above are unrelated to Manbeilian knowledge-space access and must not be included in a clean backend release package.
Mini-program dirty files are unrelated to this backend/data hotfix; no mini-program upload is included.
```

## Included Changes

- `lib/voice-coach/training.server.ts`
  - Adds Manbeilian as a first-class backend knowledge space and training-pack mode.
  - Reads production mini-program tables first: `mp_knowledge_spaces`, `mp_knowledge_space_access`, `voice_training_packs`, `voice_training_tasks`, `voice_training_progress`.
  - Preserves legacy `voice_coach_*` fallbacks.
  - Allows Manbeilian local fallback so the mini-program can render its built-in 221-card package even when the DB pack has no task rows.
  - Keeps platform-admin, company, store, and explicit access checks in the backend service layer.
- `supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql`
  - Data-only seed for Manbeilian knowledge-space access.
  - Upserts the Manbeilian training pack shell.
  - Upserts `mp_knowledge_spaces.code = 'manbeilian'`.
  - Grants active Manbeilian company members access through `mp_knowledge_space_access`.
- `tests/manbeilian-knowledge-space.static.test.js`
  - Static regression coverage for backend recognition, production table usage, fallback behavior, and data-only migration shape.

## Explicitly Not Included

- Recording-card lock or service-record entitlement changes.
- Mini-program upload.
- Static Manbeilian asset changes.
- RLS/schema changes.
- Seeding 221 task rows into `voice_training_tasks`; mini-program local package remains the source for those card tasks in this release.

## Database Changes

- Supabase migration files: `supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql`
- Applied to production: yes, migration `seed_manbeilian_knowledge_space` recorded in production.
- Production migration note: first migration attempt failed and rolled back with no partial data because duplicate active memberships produced duplicate `(user_id, knowledge_space_id)` conflict rows. The local migration was corrected to group by `user_id`, and the second apply succeeded.
- Current production read-only check before release:

```text
company: {"id":"3551a32a-a2a2-4406-8ad4-1831bd8fab09","name":"曼贝莲","status":"active"}
active_member_count: 30
knowledge_spaces: []
active_access_count: 0
packs: []
published_task_count: 0
```

- Expected production change after migration:
  - `voice_training_packs` has published pack `manbeilian_professional_speaking_v1`.
  - `mp_knowledge_spaces` has active company-scoped `code = 'manbeilian'`.
  - `mp_knowledge_space_access` has active rows for Manbeilian active members.
- Actual production verification after migration:

```text
migration_recorded: true
knowledge_space_id: 436493cc-d8b7-433c-923b-3d52d8aa0d49
knowledge_space_status: active
active_access_count: 26
active_unique_user_count: 26
pack_status: published
pack_mode: manbeilian-speaking
pack_local_fallback: true
```
- Rollback/recovery plan:
  - Data rollback can revoke access rows with metadata seed source `20260615143000_seed_manbeilian_knowledge_space`.
  - Set `mp_knowledge_spaces.code = 'manbeilian'` to `inactive` or restore prior row values if a row existed before deployment.
  - Set `voice_training_packs.brand_code = 'manbeilian'` / target pack to `draft` or restore prior row values if a row existed before deployment.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: not used.
- Production deployment ID: `dpl_4g1TirF7SLHP9tzqqgbuc2c3KEV6`
- Production deployment URL: `https://ip-pluqlvkg1-a171240s-projects.vercel.app`
- Vercel inspector URL: `https://vercel.com/a171240s-projects/ip/4g1TirF7SLHP9tzqqgbuc2c3KEV6`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: from clean package `/tmp/manbeilian-knowledge-release-20260615-srjBM2`, `npx --yes vercel@latest deploy --prod --yes`
- Previous production deployment ID: `dpl_Aouj9rTAtFgppCKVrHUMzN8XtVxL`
- Previous production deployment URL: `https://ip-5xu8bj2hw-a171240s-projects.vercel.app`
- Deploy note: first clean-package copy attempt used macOS-incompatible `install -D`; no deployment was run from that incomplete package. Files were then copied with `mkdir -p` + `cp`, verified by grep/static test/preflight, and deployed successfully.

Backend smoke results before deploy:

```text
GET https://www.ipnrgc.com/api/mp/knowledge-spaces/options -> 401 auth_required, route exists.
GET https://www.ipnrgc.com/api/mp/voice-coach/training-home?knowledge_space_id=manbeilian_store_knowledge_v1&training_pack_mode=manbeilian-speaking -> 401 auth_required, route exists.
HEAD https://www.ipnrgc.com/voice-coach-assets/manbeilian-knowledge/v1/covers/project-main.jpg -> 200 image/jpeg.
```

Required backend checks:

```text
node --test tests/manbeilian-knowledge-space.static.test.js: PASS
pnpm exec tsc --noEmit --pretty false: PASS
git diff --check -- lib/voice-coach/training.server.ts supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql tests/manbeilian-knowledge-space.static.test.js: PASS
pnpm build: PASS, existing repository lint/runtime warnings only
Clean package `/tmp/manbeilian-knowledge-release-20260615-srjBM2`:
node --test tests/manbeilian-knowledge-space.static.test.js: PASS
pnpm release:preflight: PASS, 4/4
Vercel remote build: PASS, existing repository lint/runtime warnings only
```

Post-deploy checks:

```text
Supabase read-only verification:
- migration_recorded=true
- Manbeilian knowledge space exists and status is active.
- Active access count = 26 and active unique user count = 26.
- Manbeilian training pack exists, status is published, training_pack_mode=manbeilian-speaking, local_fallback=true.

Backend HTTP:
- GET https://www.ipnrgc.com/api/mp/profile -> 401 auth_required, x-matched-path /api/mp/profile, no 404/500.
- GET https://www.ipnrgc.com/api/mp/knowledge-spaces/options -> 401 auth_required without auth, x-matched-path /api/mp/knowledge-spaces/options, no 404/500.
- GET https://www.ipnrgc.com/api/mp/voice-coach/training-home?knowledge_space_id=manbeilian_store_knowledge_v1&training_pack_mode=manbeilian-speaking -> 401 auth_required without auth, x-matched-path /api/mp/voice-coach/training-home, no 404/500.
- Vercel logs after deployment show authenticated production requests returning 200 for `/api/mp/knowledge-spaces/options` and `/api/mp/voice-coach/training-home`.
```

## Mini-program Upload

- WeChat AppID: not used in this release.
- DevTools CLI path: not used.
- Upload version: not uploaded.
- Upload description: not uploaded.
- Upload command: none.
- Upload result: not uploaded.

Mini-program local checks:

```text
No mini-program code change or upload is included.
```

## Risk Checklist

- Unknown dirty changes: yes. Backend and mini-program have unrelated service-record/audio dirty files and untracked docs/tools; exclude from deployment package.
- Deleted files: none observed in release scope.
- Route conflicts: changed routes use existing voice-coach knowledge/training service only.
- Product/point display conflicts: none.
- Store account permission conflicts: release intentionally changes Manbeilian knowledge-space visibility.
- Service-record backend availability: not touched.
- Test data visibility: production currently lacks Manbeilian knowledge-space rows; migration is required for DB-backed visibility.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_Aouj9rTAtFgppCKVrHUMzN8XtVxL`
- Previous mini-program version: unchanged.
- Database rollback note: see data rollback plan above; data-only migration.
- Who should be notified: user in current Codex thread.

## Final Decision

- Release approved: yes.
- Released by: Codex.
- Release time: 2026-06-15 14:58:41 CST.
- Follow-up items:
  - Recording-card release lock is still open and explicitly excluded from this fix.
