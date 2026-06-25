# Release Manifest: Voice Coach Backend Rollback To 20260619 Baseline

## Basic Info

- Release date: 2026-06-23
- Release thread: current Codex thread, explicitly authorized earlier as backend release thread; user requested restoring the previous voice conversation version.
- Operator: Codex
- Version: backend-voice-coach-rollback-20260619-baseline
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: no schema/data write.

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes, backend release thread was previously authorized.
- Is this a new voice feature fix? No. This is a rollback to the 2026-06-19 baseline.
- Is this release allowed to touch production data or schema? No.

## Why This Rollback Exists

The user reported that the voice conversation was effectively real-time before the recent voice-chain changes, and requested restoring the previous version rather than continuing to patch the current behavior.

The 2026-06-19 baseline came from the "voice-coach first-response latency / opening-prepare" thread:

- Backend production deployment: `dpl_6cbnr11reAts8QtjfQbQXaMifF8R`
- Backend deployment URL: `https://ip-8mys5ez96-a171240s-projects.vercel.app`
- Relevant release: `voice-coach-opening-prepare-backend-2026-06-19`

The rollback intentionally removes the 2026-06-23 backend voice job releases from production:

- `dpl_H5dHdSug1tQGoDH57AJh8LnjR8vF` (`voice-coach-job-idempotency-backend-20260623`)
- `dpl_4HNQhFu1fHmAxXCfkPYQuSr73bjV` (`voice-coach-fast-ack-backend-20260623`)

## Workspace State Before Rollback

Backend status after local source restore:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 145]
 M docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
 M scripts/check-aliyun-cloud-access.mjs
 M scripts/generate-aliyun-operator-handoff.mjs
 M scripts/prepare-aliyun-release-artifacts.mjs
 M tests/aliyun-cloud-access.static.test.js
?? docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
?? docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
```

Voice runtime files restored locally to baseline with no remaining diff:

```text
app/api/voice-coach/sessions/[sessionId]/beautician-turn/submit/route.ts
app/api/voice-coach/sessions/[sessionId]/events/route.ts
lib/voice-coach/jobs.server.ts
```

Dirty files intentionally excluded:

```text
- docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
- scripts/check-aliyun-cloud-access.mjs
- scripts/generate-aliyun-operator-handoff.mjs
- scripts/prepare-aliyun-release-artifacts.mjs
- tests/aliyun-cloud-access.static.test.js
- docs/release-manifest-2026-06-23-voice-coach-fast-ack-backend.md
- docs/release-manifest-2026-06-23-voice-coach-job-idempotency-backend.md
```

## Included Changes

- Vercel production rollback to the already-built 2026-06-19 backend deployment.
- No new backend build package.
- No new backend code patch beyond local source restoration to the same baseline.

## Explicitly Not Included

- No Supabase schema/data write.
- No git push.
- No unrelated Aliyun work.
- No mini-program upload in this backend rollback manifest; mini-program restore is tracked in the mini-program repository manifest.

## Backend Rollback

- Vercel project: `ip`
- Vercel org/team: `a171240s-projects`
- Current production before rollback: `dpl_4HNQhFu1fHmAxXCfkPYQuSr73bjV`, `https://ip-q9zfux2h8-a171240s-projects.vercel.app`
- Rollback target: `dpl_6cbnr11reAts8QtjfQbQXaMifF8R`, `https://ip-8mys5ez96-a171240s-projects.vercel.app`
- Rollback command attempted: `corepack pnpm dlx vercel@latest rollback dpl_6cbnr11reAts8QtjfQbQXaMifF8R --yes --timeout 5m --scope a171240s-projects`
- Rollback command result: blocked by Vercel plan limit, `Error: To rollback further than the previous production deployment, upgrade to pro. (402)`.
- Recovery command used: `corepack pnpm dlx vercel@latest promote dpl_6cbnr11reAts8QtjfQbQXaMifF8R --yes --timeout 5m --scope a171240s-projects`
- Recovery command result: success, `ip` promoted to `ip-8mys5ez96-a171240s-projects.vercel.app` (`dpl_6cbnr11reAts8QtjfQbQXaMifF8R`).

## Validation

Pre-rollback local checks:

```text
selected voice runtime file diff after restore: PASS, no diff
```

Post-rollback smoke:

```text
corepack pnpm dlx vercel@latest inspect dpl_6cbnr11reAts8QtjfQbQXaMifF8R --scope a171240s-projects:
PASS, deployment Ready, target production, aliases include https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ipnrgc.com

python3 /Users/Admin/.codex/skills/meiye-release-gate/scripts/smoke_backend_api.py --opening-prepare-status 400:
PASS on https://www.ipnrgc.com
PASS on https://ip.ipgongchang.xin

Changed voice route auth smoke:
PASS POST https://www.ipnrgc.com/api/voice-coach/sessions/test-session/beautician-turn/submit -> 401 {"error":"请先登录"}
PASS GET https://www.ipnrgc.com/api/voice-coach/sessions/test-session/events?cursor=0&timeout_ms=150 -> 401 {"error":"请先登录"}
PASS POST https://ip.ipgongchang.xin/api/voice-coach/sessions/test-session/beautician-turn/submit -> 401 {"error":"请先登录"}
PASS GET https://ip.ipgongchang.xin/api/voice-coach/sessions/test-session/events?cursor=0&timeout_ms=150 -> 401 {"error":"请先登录"}
```

## Rollback / Recovery

- If the 2026-06-19 baseline still fails true-device smoke, do not patch blindly. Re-open the two scoped changes only:
  - 2026-06-23 mini-program HTTP polling upload
  - 2026-06-23 backend job-idempotency / fast-ACK releases
- No database rollback is needed.

## Final Decision

- Release approved: yes.
- Released by: Codex.
- Release time: 2026-06-23 20:50 CST.
- Follow-up: true-device voice conversation smoke after backend rollback and mini-program restore upload.
