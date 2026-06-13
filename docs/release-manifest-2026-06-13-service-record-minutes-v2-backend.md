# Release Manifest: Service Record Minutes V2 Backend

## Basic Info

- Release date: 2026-06-13
- Release thread: current Codex thread, authorized for L12/service-record release work
- Operator: Codex
- Version: backend service-record minutes v2, paired with mini-program `1.0.20260613.1`
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: existing production project; no schema change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, earlier in the L12 recorder release line.
- Are all other threads frozen from production deploy/upload? No. Deploy must use scoped files only.
- Is this release allowed to touch production data or schema? No schema/data migration.

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 2]
 M app/api/mp/xhs/generate-cover-image/route.ts
 M lib/posters/gpt-image-2.server.ts
 M lib/service-records/processing.server.ts
 M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
?? docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
?? tests/image-provider-fallback.runtime.test.js
?? tests/service-record-minutes-v2.static.test.js
```

Mini-program status:

```text
See `/Users/Admin/Documents/美业话镜小程序/docs/release-manifest-2026-06-13-service-record-minutes-v2.md`.
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-13-service-record-minutes-v2-backend.md
tests/service-record-minutes-v2.static.test.js
```

Dirty files intentionally excluded:

```text
app/api/mp/xhs/generate-cover-image/route.ts
lib/posters/gpt-image-2.server.ts
tests/xhs-cover-style.static.test.js
docs/release-manifest-2026-06-09-xhs-cover-abort-hotfix.md
docs/xhs-cover-generation-primary-fallback-flow-2026-06-09.md
tests/image-provider-fallback.runtime.test.js
```

## Included Changes

- `lib/service-records/processing.server.ts`
  - Adds DeepSeek `service_minutes_v2` prompt path for intelligent service minutes.
  - Adds business fields: sales opportunities, missed sales signals, manager brief, customer-profile update suggestions.
  - Keeps existing v1 output fields as fallback.
  - Adds conservative ASR quality warnings and long-recording chunk metadata.
- `tests/service-record-minutes-v2.static.test.js`
  - Locks prompt and normalization contract for the new v2 fields.

## Explicitly Not Included

- Xiaohongshu cover-generation changes.
- Poster provider fallback changes.
- Supabase schema or production data changes.
- Mini-program upload.

## Database Changes

- Supabase migration files: none.
- Applied to production: no.
- Rollback/recovery plan: revert backend deployment; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Preview deployment URL: pending.
- Production deployment ID: pending.
- Production alias/domain: pending.
- Deploy command: pending.

Backend smoke results:

```text
pending
```

Required backend checks:

```text
corepack pnpm exec tsc --noEmit --pretty false
PASS

node --test tests/service-record-minutes-v2.static.test.js
2/2 PASS

corepack pnpm release:preflight
4/4 PASS
```

## Mini-program Upload

- Upload version: `1.0.20260613.1`
- Upload result: blocked in mini-program manifest pending commercial UI evidence.

## Risk Checklist

- Unknown dirty changes: yes, unrelated Xiaohongshu files exist and are excluded.
- Deleted files: not observed.
- Route conflicts: no new route.
- Product/point display conflicts: none in backend.
- Store account permission conflicts: no new permission logic; existing service-record/customer-profile APIs are reused by mini-program.
- Service-record backend availability: local checks pass; production smoke pending.
- Test data visibility: no schema/data mutation.

## Rollback / Recovery

- Previous backend deployment ID: pending lookup before deploy.
- Previous mini-program version: unchanged by backend deploy.
- Database rollback note: no schema change.
- Who should be notified: release thread/user.

## Final Decision

- Release approved: backend deploy may proceed after scoped commit and route smoke.
- Released by: not released yet.
- Release time: pending.
- Follow-up items:
  - Vercel production deploy.
  - Smoke `/api/mp/profile` and `/api/mp/service-records/sessions`.
  - Mini-program upload remains blocked until commercial UI gate is complete.
