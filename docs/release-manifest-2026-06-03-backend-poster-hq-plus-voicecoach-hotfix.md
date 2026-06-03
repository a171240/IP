# Release Manifest: Backend Poster HQ + VoiceCoach Assets Hotfix

## Basic Info

- Release date: 2026-06-03
- Release thread: current Codex thread, explicitly confirmed by user as release thread
- Operator: Codex
- Version: backend-poster-hq-plus-voicecoach-hotfix-20260603
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__poster-hq-v1-20260602`
- Backend branch: `codex/poster-hq-v1-20260602`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: not included in this backend-only release
- Supabase project/environment: production env used by Vercel project `ip`; no schema or data change in this release

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `这个线程作为 release thread`.
- Are all other threads frozen from production deploy/upload? This release deploys only this backend baseline. Other local dirty mini-program work is intentionally excluded.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before manifest file:

```text
## codex/poster-hq-v1-20260602
```

Mini-program status:

```text
Not inspected for inclusion. The mini-program worktree is explicitly excluded from this backend release.
```

Untracked files that must be included:

```text
docs/release-manifest-2026-06-03-backend-poster-hq-plus-voicecoach-hotfix.md
```

Dirty files intentionally excluded:

```text
All dirty files outside /Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__poster-hq-v1-20260602 are excluded.
No mini-program upload is included.
```

## Included Changes

- Poster high-quality prompt pipeline:
  - Add mother-prompt-first poster prompt builder.
  - Add visual style preset catalog for poster generation.
  - Preserve real user/store fields while rejecting placeholder template defaults.
  - Treat QR as a separate asset/compositing concern instead of asking the image model to draw QR codes.
  - Add guards against invented years, wrong dates, wrong prices, and fake contact details.
- Poster API compatibility:
  - Expose visual style presets through poster templates API.
  - Support `visualStylePresetId`, `fieldSources`, `qrState`, `qrAssetRef`, and prompt-only layout reference mode.
  - Keep poster asset upload support for style, logo, store, product, people, and QR assets.
- VoiceCoach / knowledge-space image hotfix:
  - Restore MP knowledge-space options API.
  - Restore MP VoiceCoach training home/progress/task/session APIs.
  - Restore common-beauty and Baibaitu speaking training packs.
  - Restore 210 static VoiceCoach public image assets.
  - Replace old Baibaitu v1 image paths with HD images to avoid cached low-resolution URLs.
  - Add `mp:voice-coach-invariants` as a required release guard.

## Explicitly Not Included

- No mini-program upload.
- No Supabase schema or data changes.
- No store-admin, virtual-pay, service-record, private-copy, or account-role changes.
- No rollback of other local worktree changes.

## Database Changes

- Supabase migration files: none
- Applied to production: no
- Rollback/recovery plan: rollback Vercel production alias/deployment only; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Vercel projectId: `prj_8SL1t8fEXw9QeQxScrvlroGio8TC`
- Preview deployment URL: not used; this is a release-thread production deploy after local checks
- Previous production deployment ID: `dpl_GJH6rZXfLPetnShVf4CF6xCiq2ix`
- Production deployment ID: pending
- Production alias/domain: `https://ip.ipgongchang.xin`, `https://www.ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel deploy --prod --yes`

Backend smoke results before production deploy:

```text
git diff --check -> passed
corepack pnpm exec eslint app/api/mp/posters/generate/route.ts lib/posters/intake.ts lib/posters/templates.ts lib/posters/hq-prompt.ts lib/posters/visual-style-presets.ts -> passed, zero output
node --test tests/poster-premium-prompt.static.test.js -> passed 17/17
corepack pnpm mp:voice-coach-invariants -> passed 21 checks
corepack pnpm build -> passed, 0 errors, existing repo lint warnings only
```

Required backend checks:

- `/api/mp/profile`
- `/api/mp/knowledge-spaces/options`
- `/api/mp/voice-coach/training-home?training_pack_mode=common-generic`
- `/api/mp/voice-coach/training-home?training_pack_mode=baibaitu-speaking`
- `corepack pnpm mp:voice-coach-invariants -- --base-url https://ip.ipgongchang.xin`
- `corepack pnpm mp:voice-coach-invariants -- --base-url https://www.ipnrgc.com`
- Poster endpoints changed in this release:
  - `/api/mp/posters/templates`
  - `/api/mp/posters/intake`
  - `/api/mp/posters/generate`
  - `/api/mp/posters/history`
  - `/api/mp/posters/assets`

Backend smoke results after production deploy:

```text
Pending.
```

## Mini-program Upload

- WeChat AppID: not applicable
- DevTools CLI path: not applicable
- Upload version: not applicable
- Upload description: not applicable
- Upload command: not run
- Upload result: not run

Mini-program local checks:

```text
Not run. No mini-program files are included in this backend-only release.
```

Required mini-program checks:

- Not applicable for this backend-only release.

## Risk Checklist

- Unknown dirty changes: current backend baseline is clean before adding this manifest; mini-program work is excluded.
- Deleted files: none detected.
- Route conflicts: poster API and VoiceCoach/knowledge-space routes checked separately.
- Product/point display conflicts: poster generation charging path unchanged except metadata additions.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_GJH6rZXfLPetnShVf4CF6xCiq2ix`
- Previous mini-program version: unchanged
- Database rollback note: no database change
- Who should be notified: user in this thread

## Final Decision

- Release approved: yes, by user request in this thread
- Released by: Codex
- Release time: pending
- Follow-up items: keep poster prompt tests and VoiceCoach asset invariant as required checks for every backend production deploy that touches poster, knowledge-space, or VoiceCoach surfaces.
