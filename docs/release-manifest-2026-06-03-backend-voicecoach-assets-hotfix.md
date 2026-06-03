# Release Manifest: Backend VoiceCoach Assets Hotfix

## Basic Info

- Release date: 2026-06-03
- Release thread: current Codex thread, explicitly confirmed by user as release thread
- Operator: Codex
- Version: backend-voicecoach-assets-hotfix-20260603
- Backend repository: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/codex__backend-restore-voicecoach-20260603`
- Backend branch: `codex/backend-restore-voicecoach-20260603`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production env used by Vercel project `ip`; no schema or data change in this release

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `这个线程作为 release thread`
- Are all other threads frozen from production deploy/upload? This thread will perform only this backend production deploy. Other local dirty work is intentionally excluded.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status:

```text
## codex/backend-restore-voicecoach-20260603
 M docs/codex-execution-standard.md
 M docs/release-manifest-template.md
 M package.json
?? app/api/mp/knowledge-spaces/
?? app/api/mp/voice-coach/training-home/
?? app/api/mp/voice-coach/training-progress/
?? app/api/mp/voice-coach/training-sessions/
?? app/api/mp/voice-coach/training-tasks/
?? lib/voice-coach/training-packs/
?? lib/voice-coach/training.server.ts
?? public/voice-coach-assets/
?? scripts/voice-coach-asset-invariants.mjs
```

Mini-program status:

```text
Dirty mini-program worktree exists on branch codex/app-migration-handoff-20260521.
This backend release does not edit, upload, or package mini-program files.
```

Untracked files that must be included:

```text
app/api/mp/knowledge-spaces/
app/api/mp/voice-coach/training-home/
app/api/mp/voice-coach/training-progress/
app/api/mp/voice-coach/training-sessions/
app/api/mp/voice-coach/training-tasks/
lib/voice-coach/training-packs/
lib/voice-coach/training.server.ts
public/voice-coach-assets/
scripts/voice-coach-asset-invariants.mjs
```

Dirty files intentionally excluded:

```text
All dirty files in /Users/Admin/Documents/美业话镜小程序 are excluded.
No poster, store-admin, pay, service-record, private-copy, or Supabase migration work is included.
```

## Included Changes

- Restore MP knowledge-space options API.
- Restore MP VoiceCoach training home/progress/task/session APIs.
- Restore static VoiceCoach training packs for common beauty and Baibaitu speaking.
- Restore and harden VoiceCoach static image assets under `public/voice-coach-assets`.
- Replace old Baibaitu v1 image paths with HD images to avoid cached low-resolution URLs.
- Add `mp:voice-coach-invariants` guard and document it as a required release check.

## Explicitly Not Included

- No mini-program upload.
- No Supabase schema/data changes.
- No poster API or poster asset changes.
- No private-copy route changes.
- No store-admin, virtual-pay, service-record, or account-role changes.

## Database Changes

- Supabase migration files: none
- Applied to production: no
- Rollback/recovery plan: rollback Vercel production alias/deployment only; no database rollback required.

## Backend Deployment

- Vercel project: `ip`
- Vercel projectId: `prj_8SL1t8fEXw9QeQxScrvlroGio8TC`
- Preview deployment URL: not used; this is a targeted production hotfix after local build and invariant checks
- Production deployment ID: `dpl_GJH6rZXfLPetnShVf4CF6xCiq2ix`
- Production alias/domain: `https://ip.ipgongchang.xin`, `https://www.ipnrgc.com`
- Deploy command: `corepack pnpm dlx vercel deploy --prod --yes`

Backend smoke results before production deploy:

```text
Production before deploy:
/api/mp/profile -> 401
/api/mp/knowledge-spaces/options -> 404
/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg -> 404

Local:
corepack pnpm mp:voice-coach-invariants -> passed 21 checks
corepack pnpm build -> passed, 0 errors, existing lint warnings only
Current production deployment before release -> dpl_2rRTHKNr6s4aspsiJaqjvyFK6tWy
```

Required backend checks:

- `/api/mp/profile`
- `/api/mp/knowledge-spaces/options`
- `/api/mp/voice-coach/training-home?training_pack_mode=common-generic`
- `/api/mp/voice-coach/training-home?training_pack_mode=baibaitu-speaking`
- `corepack pnpm mp:voice-coach-invariants -- --base-url https://ip.ipgongchang.xin`
- `corepack pnpm mp:voice-coach-invariants -- --base-url https://www.ipnrgc.com`

Backend smoke results after production deploy:

```text
Production deployment:
dpl_GJH6rZXfLPetnShVf4CF6xCiq2ix
https://ip-pkcmh4g3f-a171240s-projects.vercel.app

Vercel inspect:
target -> production
status -> Ready
aliases -> https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ipnrgc.com

https://www.ipnrgc.com:
/api/mp/profile -> 401
/api/mp/knowledge-spaces/options -> 401
/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg -> 200 image/jpeg
corepack pnpm mp:voice-coach-invariants -- --base-url https://www.ipnrgc.com -> passed 28 checks
Full public asset check -> 210/210 images OK

https://ip.ipgongchang.xin:
/api/mp/profile -> 401
/api/mp/knowledge-spaces/options -> 401
/voice-coach-assets/voice-coach/baibaitu-speaking/v2/s01/scene.jpg -> 200 image/jpeg
corepack pnpm mp:voice-coach-invariants -- --base-url https://ip.ipgongchang.xin -> passed 28 checks
High-concurrency full public asset check -> 185/210 OK, 25 transient timeout/502
Low-concurrency retry of the 25 failed assets -> 25/25 OK
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

- Not applicable for this backend-only hotfix.

## Risk Checklist

- Unknown dirty changes: mini-program worktree is dirty but excluded; backend repair worktree scope checked.
- Deleted files: none detected.
- Route conflicts: targeted MP VoiceCoach/knowledge-space route restore only.
- Product/point display conflicts: not touched.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: not touched.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_2rRTHKNr6s4aspsiJaqjvyFK6tWy`
- Previous mini-program version: unchanged
- Database rollback note: no database change
- Who should be notified: user in this thread

## Final Decision

- Release approved: yes, by user request in this thread
- Released by: Codex
- Release time: 2026-06-03 22:44:59 CST
- Follow-up items: future backend production deploys must include this VoiceCoach invariant guard or run it before release; otherwise another old artifact can still overwrite these routes/assets
