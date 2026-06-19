# Release Manifest: Voice Coach Opening Preparation Supabase Production

## Basic Info

- Release date: 2026-06-19
- Release thread: This Codex thread.
  - Supabase production migration authorized by user message: "允许这个线程作为 release thread，直接在 Supabase main PRODUCTION 执行这次迁移。"
  - Backend production deploy authorized by user message: "本线程授权为后端生产 release thread，允许执行 Vercel production deploy。"
- Operator: Codex
- Version: voice-coach-opening-prepare-supabase-production-2026-06-19
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: `IP网站` / `topyedxzcdfswxdcucpl` / `main PRODUCTION`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, for Supabase production migration and backend Vercel production deploy.
- Are all other threads frozen from production deploy/upload? This thread will deploy backend only; mini-program upload remains unauthorized.
- Is this release allowed to touch production data or schema? Yes, limited to previously applying `supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql` and `supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql` to Supabase `main PRODUCTION`. No additional Supabase write is authorized in the backend deploy step.

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 3]
 M app/api/voice-coach/sessions/route.ts
 M lib/voice-coach/session-context.ts
 M lib/voice-coach/training.server.ts
?? app/api/voice-coach/opening-prepare/
?? lib/voice-coach/opening-preparation.server.ts
?? lib/voice-coach/training-context.server.ts
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? docs/release-manifest-2026-06-19-voice-coach-opening-prepare-supabase-production.md
?? supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql
?? supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql
?? tests/voice-coach-opening-prepare.static.test.js
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 44]
 M app.json
 M pages/professional/data/professional-learning-seed.js
 M pages/professional/index.js
 M pages/professional/index.wxml
 M pages/professional/index.wxss
 M pages/professional/lesson/index.js
 M pages/professional/lesson/index.wxml
 M pages/professional/lesson/index.wxss
 M pages/professional/utils/professional-learning.js
 M pages/service-record/detail/index.js
 M pages/voice-coach/chat.js
 M pages/voice-coach/index.js
 M pages/voice-coach/index.wxml
 M pages/voice-coach/index.wxss
 M pages/voice-coach/report.js
 M pages/voice-coach/setup/index.js
 M pages/voice-coach/training-map/index.js
 M tools/check-professional-learning-remote-images.js
 M tools/check-voice-coach-remote-images.js
 M tools/export-professional-learning-assets.js
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? docs/professional-speech-knowledge-jump-dev-doc-2026-06-17.md
?? docs/release-manifest-2026-06-16-professional-meridian-system-images.md
?? docs/release-manifest-2026-06-17-professional-entry-covers-miniapp-upload.md
?? docs/release-manifest-2026-06-17-professional-learning-system-miniapp-upload.md
?? docs/voice-coach-opening-zero-latency-target-mode-dev-doc-2026-06-18.md
?? manbeilian-current-html-after-card-refresh.png
?? outputs/
?? pages/professional/data/professional-learning-entrance-covers-v1.js
?? pages/professional/data/professional-learning-graph-v1.js
?? pages/professional/data/professional-learning-meridian-system-v4.js
?? pages/professional/data/professional-learning-skin-system-v4.js
?? pages/professional/data/professional-learning-speech-training-v1.js
?? pages/professional/data/professional-learning-zangfu-system-v4.js
?? pages/professional/speech/
?? pages/professional/utils/professional-speech-progress.js
?? pages/professional/utils/professional-speech-training.js
?? pages/voice-coach/opening-prepare.js
?? pages/voice-coach/opening-prepare.static.test.js
?? tools/build-professional-speech-training-assets.js
?? tools/check-professional-speech-training-coverage.js
```

Untracked files that must be included for the backend voice-coach production deploy candidate:

```text
app/api/voice-coach/opening-prepare/route.ts
lib/voice-coach/opening-preparation.server.ts
lib/voice-coach/training-context.server.ts
supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql
supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql
docs/release-manifest-2026-06-19-voice-coach-opening-prepare-supabase-production.md
tests/voice-coach-opening-prepare.static.test.js
```

Dirty files intentionally excluded from this backend voice-coach release:

```text
All mini-program files; WeChat upload remains a separate follow-up release.
supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql is not part of this production action.
```

## Included Changes

- Create `public.voice_coach_opening_preparations`.
- Add unique idempotency index for `(user_id, idempotency_key)`.
- Add status/session/context indexes.
- Enable RLS.
- Add service role all-row policy.
- Initial migration briefly created authenticated own-row policies/grants.
- Harden direct Data API access after Scales review:
  - revoke all direct `authenticated` table grants.
  - drop authenticated direct select/insert/update policies.
  - keep backend/service role access only.

## Explicitly Not Included

- No WeChat mini-program upload.
- No Vercel promote or alias.
- No data backfill.
- No modification of existing customer data.
- No modification of existing voice coach session/turn table definitions.

## Database Changes

- Supabase migration files:
  - `supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql`
  - `supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql`
- Applied to production: Yes.
- Production migration records:
  - `20260619015445_add_voice_coach_opening_preparations`
  - `20260619021545_harden_voice_coach_opening_preparations_grants`
- Rollback/recovery plan:

```sql
drop table if exists public.voice_coach_opening_preparations cascade;
```

## Backend Deployment

- Vercel project: `ip` / `prj_8SL1t8fEXw9QeQxScrvlroGio8TC` / scope `a171240s-projects`.
- Preview deployment URL: Not used; this release used a clean production candidate package.
- Previous production deployment ID: `dpl_8HyS5iLDMfFqrHQb4GZskc4zPML7`.
- Previous production deployment URL: `https://ip-185ccrezj-a171240s-projects.vercel.app`.
- Production deployment ID: `dpl_6cbnr11reAts8QtjfQbQXaMifF8R`.
- Production deployment URL: `https://ip-8mys5ez96-a171240s-projects.vercel.app`.
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`, `https://ipnrgc.com`, Vercel project aliases.
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes --meta actor=codex --meta release=voice-coach-opening-prepare-backend-2026-06-19`.
- Clean candidate package: `/tmp/meiye-backend-voice-opening-candidate-20260619-1450`.
- Candidate base: backend `HEAD` `750191e` to preserve current production professional entry-cover assets, plus selected voice-coach opening-preparation worktree changes.
- Explicitly excluded from candidate: `supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql`.

Backend smoke results:

```text
Pre-production local checks:
- git diff --check -- relevant opening preparation files and migrations: pass
- node --test tests/voice-coach-opening-prepare.static.test.js: pass, 5/5
- temporary local Postgres migration precheck: pass, 4 RLS policies
- hardening local Postgres precheck after Scales RETURN: pass
  - authenticated_grants: 0
  - service_role_grants: 4
  - policies: 1
- pnpm exec tsc --noEmit --pretty false: pass

Follow-up backend release-readiness checks, 2026-06-19 13:57 CST:
- git diff --check: pass
- corepack pnpm release:preflight: pass, 4/4
  - private-copy API routes are in the backend package
  - voice-coach static assets are in the backend package
  - professional-learning static assets are in the backend package
  - backend app package is not a static-only deploy folder
- node --test tests/voice-coach-opening-prepare.static.test.js: pass, 5/5
- corepack pnpm build: pass
  - route manifest includes /api/voice-coach/opening-prepare
  - build emitted existing lint/runtime warnings, but exited 0

Current production smoke before backend deploy, 2026-06-19 13:57 CST:
- python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 404: pass
- https://www.ipnrgc.com existing smoke routes: pass
- https://ip.ipgongchang.xin existing smoke routes: pass
- Pre-deploy baseline: POST /api/voice-coach/opening-prepare returned 404 on both production domains, proving the new backend route was not deployed before this release.

Final clean-candidate checks before backend production deploy, 2026-06-19 14:50 CST:
- candidate: /tmp/meiye-backend-voice-opening-candidate-20260619-1450
- corepack pnpm install --frozen-lockfile: pass
- corepack pnpm release:preflight: pass, 4/4
- node --test tests/voice-coach-opening-prepare.static.test.js: pass, 5/5
- corepack pnpm build: pass
  - route manifest includes /api/voice-coach/opening-prepare
  - build emitted existing lint/runtime warnings, but exited 0
- current production before deploy:
  - dpl_8HyS5iLDMfFqrHQb4GZskc4zPML7
  - https://ip-185ccrezj-a171240s-projects.vercel.app
  - aliases: https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ipnrgc.com

Backend production deploy, 2026-06-19 14:50-14:54 CST:
- deploy command: corepack pnpm dlx vercel@latest deploy --prod --yes --meta actor=codex --meta release=voice-coach-opening-prepare-backend-2026-06-19
- deployment id: dpl_6cbnr11reAts8QtjfQbQXaMifF8R
- deployment URL: https://ip-8mys5ez96-a171240s-projects.vercel.app
- Vercel inspect: Ready
- aliases verified:
  - https://www.ipnrgc.com
  - https://ip.ipgongchang.xin
  - https://ipnrgc.com
- remote build package check: pass, 4/4
- remote build route manifest includes: /api/voice-coach/opening-prepare

Backend production smoke after deploy, 2026-06-19 14:54 CST:
- python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 400: pass on both production domains
- POST /api/voice-coach/opening-prepare with empty body: 400 invalid_payload on both production domains; this proves the route is deployed and validating payload instead of returning 404.
- POST /api/voice-coach/opening-prepare with minimal valid unauthenticated payload:
  - https://www.ipnrgc.com: 401
  - https://ip.ipgongchang.xin: 401
- corepack pnpm release:verify:professional-images: pass
  - baseUrl: https://www.ipnrgc.com
  - renderedUniqueUrls: 819
  - ok: 819
  - failureCount: 0

Production Supabase checks:
- apply migration via Supabase MCP: success true
- table_exists: 1
- columns: 31
- indexes: 5
- policies: 4
- role grants for authenticated/service_role: 14 grant rows
- RLS enabled: true
- initial policies verified:
  - voice_coach_opening_preparations_insert_own
  - voice_coach_opening_preparations_select_own
  - voice_coach_opening_preparations_service_role_all
  - voice_coach_opening_preparations_update_own
- migration list includes: 20260619015445_add_voice_coach_opening_preparations
- Scales release-gate RETURN remediation:
  - apply hardening migration via Supabase MCP: success true
  - authenticated_grants after hardening: 0
  - service_role_grants after hardening: 7
  - policies after hardening: 1
  - remaining policy: voice_coach_opening_preparations_service_role_all
  - migration list includes: 20260619021545_harden_voice_coach_opening_preparations_grants
```

Required backend checks:

- `/api/mp/profile`: Not part of this voice-coach backend release.
- `/api/mp/virtual-pay/products`: Not part of this voice-coach backend release.
- `/api/mp/service-records/sessions`: Not part of this voice-coach backend release.
- Changed admin/store route: None in this voice-coach backend release.

## Mini-program Upload

- WeChat AppID: Not applicable.
- DevTools CLI path: Not used.
- Upload version: Not uploaded.
- Upload description: Not uploaded.
- Upload command: Not run.
- Upload result: Not uploaded.

Mini-program local checks:

```text
No WeChat mini-program upload was performed in this backend release.

Follow-up mini-program local opening-preparation checks, 2026-06-19 13:57 CST:
- git diff --check: pass
- node --test pages/voice-coach/opening-prepare.static.test.js: pass, 3/3
- node --check pages/voice-coach/chat.js: pass
- node --check pages/voice-coach/setup/index.js: pass
- node --check pages/voice-coach/training-map/index.js: pass
- node --check pages/voice-coach/report.js: pass
- node --check pages/service-record/detail/index.js: pass

Mini-program release-candidate caution:
- Do not upload directly from the dirty mini-program workspace.
- `pages/voice-coach/index.js` currently mixes opening-preparation work with professional-speech / knowledge-library UI work.
- Before any WeChat upload, build a clean candidate or perform a line-level audit so the upload scope is explicitly either:
  - full combined mini-program release, or
  - voice-coach opening-preparation only.
```

## Risk Checklist

- Unknown dirty changes: Present; excluded from this backend release.
- Mini-program mixed lane risk: Present. `pages/voice-coach/index.js` is not a pure opening-preparation diff; do not upload without clean-candidate scope selection.
- Deleted files: None identified in relevant migration scope.
- Route conflicts: Opening-preparation backend route deployed from a clean candidate; mini-program route usage remains pending upload.
- Product/point display conflicts: Not applicable.
- Store account permission conflicts: Not applicable.
- Service-record backend availability: Not applicable.
- Test data visibility: No data backfill or test rows will be inserted in production.
- Scales release gate review:
  - Initial verdict: RETURN.
  - P1 migration history drift: remediated by aligning local migration file to `20260619015445`.
  - P1 authenticated insert/update overexposure: remediated by hardening migration `20260619021545` and backend service-role code path.
  - P2 mini-program status evidence: remediated by pasting exact mini-program `git status --short --branch`.
  - P2 rollback too coarse: follow-up recovery note added below.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_8HyS5iLDMfFqrHQb4GZskc4zPML7`.
- Previous backend deployment URL: `https://ip-185ccrezj-a171240s-projects.vercel.app`.
- Previous mini-program version: Not changed.
- Database rollback note:
  - Before backend code writes data: drop `public.voice_coach_opening_preparations` if the new table causes production issues.
  - After backend code is deployed: first disable opening-prepare calls or roll back backend deployment, then back up/inspect table rows before dropping or truncating.
- Who should be notified: User in this thread.

## Final Decision

- Release approved: Yes, scoped production Supabase migration and backend Vercel production deploy approved by user.
- Released by: Codex.
- Release time:
  - Supabase production migration: 2026-06-19 09:55:35 CST.
  - Backend Vercel production deploy: 2026-06-19 14:54 CST.
- Follow-up items:
  - Mini-program opening-preparation checks pass locally, but WeChat upload/experience build has not been authorized or run.
  - True-device first-line latency validation remains pending until mini-program experience build is complete.
