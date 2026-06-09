# Voice Coach Policy Integration Handoff - 2026-06-08

## Purpose

This document records the current voice-coach backend dialogue repair patch. It is not a deployment record.

Current decision: the patch may stay in the canonical backend worktree as a release candidate, but production rollout must be coordinated by the release-prep thread.

Latest release-prep acknowledgement: 2026-06-08 23:15 CST. The dedicated voice repair thread reported the local repair complete. Release-prep reran the local release checks, production API contract, and dirty-scope checks. HTTP/Vercel was deployed to production as `dpl_AouC2kNKB7hEMvXTYoYiYMkdbiGU`. Realtime `voice-coach-ws` was deployed through Aliyun Workbench direct package release and PM2 reload. No mini-program upload, staging, or Supabase write was performed.

Release-prep documents prepared after acknowledgement:

```text
docs/release-manifest-2026-06-08-voice-coach-dialogue-policy-prep.md
docs/voice-coach-ws-production-release-checklist-2026-06-08.md
```

## Canonical Repository

- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Old worktree rejected as canonical release source: `/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/feat__voice-coach-realtime`
- Reason: the old worktree branch is behind canonical and its patch does not apply cleanly to canonical `lib/voice-coach/llm.server.ts` / `lib/voice-coach/session-context.ts`; it must remain patch-reference only.

## Current Backend Dirty Scope

Voice policy candidate files:

```text
app/api/voice-coach/sessions/route.ts
lib/voice-coach/llm.server.ts
lib/voice-coach/session-context.ts
tests/voice-coach-report.runtime.test.js
voice-coach-ws/src/__tests__/orchestrator.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/pipeline/orchestrator.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/shared/topic-guard.ts
```

Existing static/API release package files, not part of the voice policy patch:

```text
package.json
docs/release-manifest-2026-06-08-private-copy-assets-restore-prep.md
public/professional-learning-assets/
scripts/check-backend-release-package.mjs
scripts/required-professional-learning-rendered-assets.json
```

Do not include unrelated files such as:

```text
lib/voice-coach/training.server.ts
lib/voice-coach/training-packs/*.json
supabase/migrations/*
vercel.json
app/api/mp/store-admin/*
app/api/mp/service-records/*
```

## Problem Being Fixed

1. Customer display name such as `徐老师` was entering the simulated customer prompt ambiguously and could be used as a customer-to-beautician addressee.
2. Long voice-coach conversations for `胶原抗衰护理` could drift into unrelated `胸部护理` content.
3. Common knowledge-base training could start a session without any reliable `training_context` in `scenario_snapshot_json.prompt_context_text`, so the realtime WS path had no active topic lock.
4. The project/customer flow could avoid chest drift but still loop around the safety axis for many turns.
5. The fix is now a training-context snapshot repair plus dialogue policy layer plus topic guard invariant, not just a forbidden-term patch.

## True-device Result After Preview Smoke

Status: RETURN

User true-device testing from the mini-program preview QR found:

```text
Round 1, common knowledge base flow:
- By the 3rd or 4th round, the simulated customer drifted again into 胸部护理.

Round 2, project/customer setup flow:
- After roughly 10+ turns, no 胸部护理 drift appeared.
- The simulated customer kept circling around project safety questions.
- Every turn still addressed the beautician as 徐老师, even though 徐老师 is the customer name.
```

Interpretation before this repair:

- The mini-program preview calls production `https://ip.ipgongchang.xin` and `wss://ip.ipgongchang.xin/ws/voice-coach`.
- This proves production voice behavior is not ready for mini-program upload/release claim.
- Production was still missing the new local repair.
- Vercel HTTP and ECS/PM2 WS must both be released before true-device smoke can validate the dialogue behavior.

## Post-release True-device Result And Follow-up

Status: PARTIAL PASS, FOLLOW-UP DEPLOYED, WAITING NEW TRUE-DEVICE SMOKE

After HTTP/Vercel and WS/Aliyun-PM2 were released, user true-device testing showed:

```text
- Customer speech no longer addressed the beautician as 徐老师 in the inspected latest production session.
- 胶原抗衰护理 did not drift into 胸部护理 in the inspected latest production session.
- A remaining long-conversation quality issue stayed: when the beautician gave vague replies, the simulated customer still spent too many turns around sensitive-skin/safety/boundary questions.
```

Follow-up patch added after that production smoke:

```text
lib/voice-coach/llm.server.ts
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
```

Behavioral change:

- Add a `推进决策` dialogue axis.
- If the recent customer turns have already covered the sensitive/safety/boundary/evidence cluster and the beautician reply is still vague, the next customer move must ask for a concrete next step instead of another generic safety question.
- The fallback wording becomes: ask whether to do skin detection first, repair first, try once, or judge the price-cycle value.
- HTTP/Next and realtime WS policy logic were kept aligned.

Verification for this follow-up patch:

```text
git diff --check: PASS
cd voice-coach-ws && npm run typecheck: PASS
cd voice-coach-ws && npm test: PASS, 8 files / 45 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm release:preflight: PASS 4/4
corepack pnpm build: PASS, with existing ESLint any warnings and Next runtime re-export warnings only
```

Deployment boundary:

- This follow-up patch was deployed to Vercel production on 2026-06-08 23:15 CST.
- This follow-up patch was deployed to the Aliyun/PM2 `voice-coach-ws` service on 2026-06-08 23:11-23:15 CST.
- No Supabase write and no mini-program upload were performed.

Follow-up production release record:

```text
HTTP/Vercel deployment:
  id: dpl_AouC2kNKB7hEMvXTYoYiYMkdbiGU
  url: https://ip-p24q1pb1y-a171240s-projects.vercel.app
  aliases: https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ip-a171240s-projects.vercel.app, https://ip-a171240-a171240s-projects.vercel.app, https://ipnrgc.com

WS/Aliyun-PM2 deployment:
  method: Aliyun Workbench direct package release
  package sha256: 786b97010cf472bfcafb172b3c2bf19b5a056e101308d345d0f8326cb4c5c944
  backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-advance-policy-231124
  build: sudo npm run build PASS
  pm2: voice-coach-ws online, pid 2295619, user root
  local health: {"ok":true}
  public /ws-health: 200 {"ok":true}
  public WS auth-gate smoke: 401 expected auth gate

Mini-program API contract after follow-up release:
  PASS 12/12 against https://ip.ipgongchang.xin

Production Supabase read-only session check after follow-up release:
  cutoff: 2026-06-08T15:15:00.000Z / 2026-06-08 23:15 CST
  voice_coach_sessions after cutoff: count 0
  write: none
  interpretation: the follow-up release is live, but there is no post-follow-up true-device voice session yet
```

## Expected Behavior

- Customer name is UI/report metadata only and must not become the simulated customer's address to the beautician.
- Customer turns should stay on the active service/project and current conversation axis.
- If generation drifts into forbidden unrelated terms, policy fallback returns the conversation to the selected service.
- HTTP/Next generation paths and realtime WS streaming paths should apply compatible policy constraints.
- Long conversations should rotate through project axes such as safety, principle, evidence, boundary, expectation, value, process, and trust instead of asking the same safety concern every round.

## Implemented Repair

- `training_context` is now accepted by `POST /api/voice-coach/sessions`.
- Session creation merges frontend `training_context` with server-side training pack/task metadata when available.
- `scenario_snapshot_json.training_context`, `scenario_snapshot_json.prompt_context_text`, and `session_context_json.training_context` are populated for training-task sessions even when no customer profile or scene card exists.
- Training-context-only prompt text now includes `当前训练项目`, task title/focus, customer opening line, pass goals, scoring focus, and forbidden phrases.
- Service/topic inference recognizes collagen anti-aging context and normalizes it to `胶原抗衰护理` when the task title/focus/customer line mention collagen plus anti-aging/tightening terms.
- Customer-name normalization strips prefixes such as `徐老师您好` / `徐老师，我想问...` / `徐老师老师...` before TTS and persistence when useful text remains.
- Topic guard still blocks unrelated `胸部护理` / private-care drift for `胶原抗衰护理`, while allowing those terms when the selected service itself is `胸部护理`.
- Dialogue policy now rotates away from repeated safety axes after recent customer turns have already stayed on safety, preferring evidence, boundary, mechanism, expectation, process, value, or trust.

## Verification Reported By Voice Repair Thread

```text
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm release:preflight
  PASS 4/4

git diff --check
  PASS

cd voice-coach-ws && npm run typecheck
  PASS

cd voice-coach-ws && npm test
  PASS, 8 files / 43 tests

NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js
  PASS, 15/15

corepack pnpm build
  PASS, with existing lint/runtime warnings only
```

Release-prep spot-check on 2026-06-08 17:02 CST:

```text
git status --short --branch:
  canonical backend branch codex/app-api-handoff-20260521
  voice scoped files dirty under app/api/voice-coach/sessions, lib/voice-coach, tests/voice-coach-report, and voice-coach-ws/src
  package.json and static asset package still dirty but not part of this voice repair scope

git diff --check:
  PASS
```

Release-prep rerun on 2026-06-08 17:36 CST:

```text
mini-program git diff --check: PASS
backend git diff --check: PASS
corepack pnpm release:preflight: PASS 4/4
voice-coach-ws npm run typecheck: PASS
voice-coach-ws npm test: PASS, 8 files / 43 tests
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js: PASS, 15/15
corepack pnpm build: PASS, with existing lint/runtime warnings only
mini-program production API contract against https://ip.ipgongchang.xin: PASS 12/12
backend staged files: none
mini-program staged files: none
```

Production API/static checks after the earlier static/API restore:

```text
Mini-program API contract against https://ip.ipgongchang.xin:
  PASS 12/12

Voice-coach remote images:
  PASS 120/120

Professional-learning remote images:
  PASS 397/397
```

Production update on 2026-06-08 17:59 CST:

```text
HTTP/Vercel production deployment:
  id: dpl_H9ujes4eqDbjmiv3tcMqNjRV7H7F
  url: https://ip-971umj6ee-a171240s-projects.vercel.app
  aliases: https://www.ipnrgc.com, https://ip.ipgongchang.xin, https://ipnrgc.com

Post-deploy checks:
  mini-program API contract against https://ip.ipgongchang.xin: PASS 12/12
  voice-coach remote images: PASS 120/120
  professional-learning remote images: PASS 397/397

WS/Aliyun-PM2:
  authorized: yes
  deployed: yes
  server: Aliyun lightweight application server AlibabaCloudLinux-xcya, 106.14.241.129
  method: Aliyun Workbench direct package release because /opt/ip-site is not a git repository
  package: canonical local voice-coach-ws/src + package.json + tsconfig.json
  package sha256: 16d040347f843b81c68cdd86a1275862537c7fcec478b76a07f1d3be7a8bb091
  backup: /opt/ip-site/voice-coach-ws/.release-backups/20260608-204743/src-before-fullsrc
  build: sudo npm run build PASS
  pm2: voice-coach-ws online, pid 2290677, user root
  public /ws-health: 200 {"ok":true}
  public WS auth-gate smoke: 401 expected auth gate on wss://ip.ipgongchang.xin/ws/voice-coach without token
```

## Deployment Boundary

HTTP/Next backend:

- Files under `lib/voice-coach/*` are used by Vercel/Next API paths.
- `app/api/voice-coach/sessions/route.ts` is also part of this HTTP/Vercel repair.
- A production Vercel deploy is required before these HTTP changes affect production.
- This was done on 2026-06-08 as deployment `dpl_H9ujes4eqDbjmiv3tcMqNjRV7H7F`.

Realtime WebSocket backend:

- Files under `voice-coach-ws/src/*` do not ship through Vercel.
- Production route is `wss://ip.ipgongchang.xin/ws/voice-coach`.
- Runtime topology is ECS/Nginx -> `127.0.0.1:8080` -> PM2 app `voice-coach-ws`.
- A separate server/PM2 release is required before these realtime changes affect production.
- This was done on 2026-06-08 through Aliyun Workbench.
- `voice-coach-ws/scripts/deploy.sh` was not used because `/opt/ip-site` is not a git repository.
- The successful release used a direct tar package for canonical local `voice-coach-ws/src`, `package.json`, and `tsconfig.json`, then ran `sudo npm run build` and `sudo pm2 startOrReload`.

Supabase:

- No schema/data write is needed for this patch.
- Production Supabase access, if used for validation, should be read-only against voice session/turn/event tables.

## Ownership

- Release-prep thread owns final backend release integration, manifest, and deployment sequencing.
- Voice repair thread owns debugging and handoff evidence only.
- Voice repair thread must not deploy Vercel production, restart PM2, upload the mini-program, or write Supabase production without release-prep confirmation.

## Open Before Mini-program Upload

1. Run true-device smoke now that both HTTP and WS are released:
   - common knowledge-base flow 5+ turns without `胸部护理` drift,
   - project/customer flow 10+ turns without repeated safety loop, and with the new `推进决策` turn when replies remain vague,
   - no customer speech addressing the beautician as `徐老师`.
   - This must be a new session created after 2026-06-08 23:15 CST; current production read-only check found 0 post-follow-up sessions.
2. If the same voice issues still reproduce after this backend release, hand the new session evidence back to the voice repair thread.
3. Before mini-program upload, separately classify the current mini-program WXSS/font dirty batch so it does not get mixed into backend voice release decisions.
4. Commercial UI Product Design / Creative Production gates still need separate PASS if the upload is meant to include UI acceptance.
