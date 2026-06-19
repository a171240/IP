# Release Manifest: Professional Entry Covers Static Assets

## Basic Info

- Release date: 2026-06-19
- Release thread: confirmed by user in this Codex thread
- Operator: Codex
- Version: professional-entry-covers-static-assets-2026-06-19
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: not touched

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? YES, for backend production release of professional entry covers static assets only
- Are all other threads frozen from production deploy/upload? NO, therefore this release must use a clean candidate package and exclude dirty worktree changes
- Is this release allowed to touch production data or schema? NO

Production deploy is authorized only for the 12 professional entry cover static
JPG assets listed below. Voice-coach, Supabase, API, and mini-program upload are
not authorized.

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 3]
 M app/api/voice-coach/sessions/route.ts
 M lib/voice-coach/session-context.ts
 M lib/voice-coach/training.server.ts
?? app/api/voice-coach/opening-prepare/
?? docs/release-manifest-2026-06-19-voice-coach-opening-prepare-supabase-production.md
?? lib/voice-coach/opening-preparation.server.ts
?? lib/voice-coach/training-context.server.ts
?? public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql
?? supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql
?? tests/voice-coach-opening-prepare.static.test.js
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 44]
Dirty worktree includes professional-learning, voice-coach, service-record,
docs/tools/outputs, and app-core files. This manifest only covers the
professional entry cover lane.
```

Untracked files that must be included:

```text
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/01-skin-structure-foundation.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/02-skin-barrier-corneum.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/03-skin-type-condition.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/04-pores-acne-blackheads.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/05-care-project-principles.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/06-tcm-foundation-expression.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/07-meridian-system-map.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/08-bladder-meridian-back-waist.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/09-gallbladder-meridian-side-line.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/10-ren-meridian-front-center-line.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/11-zangfu-state-expression.jpg
public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/12-professional-translation-boundary.jpg
```

Dirty files intentionally excluded:

```text
app/api/voice-coach/sessions/route.ts
lib/voice-coach/session-context.ts
lib/voice-coach/training.server.ts
app/api/voice-coach/opening-prepare/
docs/release-manifest-2026-06-19-voice-coach-opening-prepare-supabase-production.md
lib/voice-coach/opening-preparation.server.ts
lib/voice-coach/training-context.server.ts
supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
supabase/migrations/20260619015445_add_voice_coach_opening_preparations.sql
supabase/migrations/20260619021545_harden_voice_coach_opening_preparations_grants.sql
tests/voice-coach-opening-prepare.static.test.js
```

## Included Changes

- Add 12 professional-learning entry cover JPG static assets under
  `public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/pages/`.
- No API, database, config, or route changes are included.

## Explicitly Not Included

- Mini-program source upload.
- Voice-coach opening-prepare API changes.
- Supabase migrations or production data/schema writes.
- Any service-record or app-core mini-program changes.

## Database Changes

- Supabase migration files: none included
- Applied to production: no
- Rollback/recovery plan: remove the static asset directory in a follow-up
  backend release if needed.

## Backend Deployment

- Vercel project: existing backend project
- Preview deployment URL: not created
- Production deployment ID: `dpl_8HyS5iLDMfFqrHQb4GZskc4zPML7`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel@latest deploy --prod --yes --meta actor=codex --meta release=professional-entry-covers-static-assets-2026-06-19 --scope a171240s-projects`

Clean candidate package:

```text
/tmp/meiye-entry-covers-release.2ozsJO
```

Deployment URL:

```text
https://ip-185ccrezj-a171240s-projects.vercel.app
```

Vercel inspect:

```text
id: dpl_8HyS5iLDMfFqrHQb4GZskc4zPML7
target: production
status: Ready
url: https://ip-185ccrezj-a171240s-projects.vercel.app
aliases:
- https://www.ipnrgc.com
- https://ip.ipgongchang.xin
- https://ipnrgc.com
```

Backend release preflight:

```text
corepack pnpm release:preflight
PASS private-copy API routes are in the backend package
PASS voice-coach static assets are in the backend package
PASS professional-learning static assets are in the backend package
PASS backend app package is not a static-only deploy folder
backend release package check passed: 4/4
```

Required static asset checks:

```text
Before deploy: corepack pnpm release:preflight PASS
After deploy:
- `corepack pnpm release:verify:professional-images`
- `node tools/check-professional-learning-remote-images.js --concurrency 4 --timeout-ms 30000`
```

Current live GET state before deployment:

```text
806 old rendered professional-learning images PASS
12 new entry-covers-v2 images 404 because the static assets are not deployed yet
```

Current live GET state after deployment:

```text
Backend release verify:
baseUrl: https://www.ipnrgc.com
renderedUniqueUrls: 819
ok: 819
failureCount: 0

Mini-program rendered URL verify:
baseUrl: https://www.ipnrgc.com/professional-learning-assets/professional-learning
renderedUniqueUrls: 818
ok: 818
failureCount: 0
```

## Mini-program Upload

- WeChat upload: not included in this manifest
- Mini-program source change required separately:
  `/Users/Admin/Documents/美业话镜小程序/pages/professional/data/professional-learning-entrance-covers-v1.js`

## Risk Checklist

- Unknown dirty changes: yes, excluded above
- Deleted files: none observed in this lane
- Route conflicts: none for this static asset lane
- Product/point display conflicts: not touched
- Store account permission conflicts: not touched
- Service-record backend availability: not touched
- Test data visibility: not touched
- Static image remote GET gate: blocked until deployment

## Rollback / Recovery

- Previous backend deployment ID: `dpl_12iHYcNMYWpkn88PKS8NgtXgjAWE`
- Previous mini-program version: not changed in this manifest
- Database rollback note: not applicable
- Static rollback: deploy a backend artifact without
  `public/professional-learning-assets/professional-learning/v3-imagegen/entry-covers-v2/`.

## Final Decision

- Release approved: YES, static asset backend release only
- Released by: Codex
- Release time: 2026-06-19 14:14:35 CST
- Follow-up items:
  - Mini-program source/upload remains separate and was not uploaded here.
  - Voice-coach, Supabase, and API dirty work remain excluded from this release.
