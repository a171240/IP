# Voice Coach Dialogue Repair Handoff - 2026-06-08

## Purpose

This is the handoff packet for the dedicated voice-dialogue repair thread.

The mini-program release thread has blocked upload because true-device voice-chain smoke returned `RETURN`. The next thread should fix the voice-dialogue backend path only, then hand back patch + verification evidence. Do not upload the mini-program, deploy production, restart WS/PM2, or write Supabase without release-thread approval.

## Canonical Repositories

Mini-program evidence source:

```text
path: /Users/Admin/Documents/美业话镜小程序
branch: codex/app-migration-handoff-20260521
```

Canonical backend to patch:

```text
path: /Users/Admin/Documents/美业话镜APP/handoff/IP
branch: codex/app-api-handoff-20260521
```

Do not use this old worktree as release source:

```text
/Users/Admin/Documents/.repo-search-private-domain/a171240__IP.worktrees/feat__voice-coach-realtime
```

Reason: it is not the canonical backend worktree for this release.

## True-device Failure Evidence

Source record:

```text
/Users/Admin/Documents/美业话镜小程序/docs/release-true-device-smoke-run-2026-06-08.md
```

Preview package used:

```text
QR: /Users/Admin/Documents/美业话镜小程序/.tmp-preview/voice-chain-smoke-20260608.png
AppID: wx2fab2dc6ebe442c4
```

Automated preconditions before true-device test:

```text
node --check changed voice-coach JS/tools/config: PASS
git diff --check: PASS
API contract: PASS 12/12
voice-coach images: PASS 120/120
professional-learning images: PASS 397/397
WeChat preview: PASS, TOTAL 2.7 MB, main 1.8 MB
```

User true-device results:

```text
Round 1, common knowledge base flow:
- Conversation reached about the 3rd or 4th round.
- Customer reply drifted again into 胸部护理.

Round 2, project/customer setup flow:
- Conversation ran roughly 10+ rounds.
- No 胸部护理 drift appeared in this flow.
- The simulated customer kept circling around project safety questions.
- Every round still addressed the beautician as 徐老师, while 徐老师 is the customer name.
```

Current mini-program production endpoints used by preview:

```text
HTTP: https://ip.ipgongchang.xin
WS: wss://ip.ipgongchang.xin/ws/voice-coach
```

## Root-cause Leads

### 1. Training-task context is not reliably entering session prompt context

Mini-program `pages/voice-coach/chat.js` sends these fields when a training task is started:

```text
training_task_id
training_pack_id
training_brand_code
training_knowledge_space_id
training_context
```

Backend route:

```text
app/api/voice-coach/sessions/route.ts
```

Observed issue:

```text
The POST route builds sessionSnapshot only when customer profile, scene card, live notes, or followup exists.
If the user starts from common knowledge base training and only training_context is present, sessionSnapshot can be null.
Then getVoiceCoachSessionPromptContext(sessionSnapshot) returns empty text.
Then buildTopicLock() / buildDialoguePolicy() have no active_service.
This can explain common knowledge base drift into 胸部护理 by the 3rd or 4th round.
```

Required fix:

```text
Make training_context a first-class source for scenario_snapshot_json.prompt_context_text and session_context_json.
Derive active service/topic from training_context fields and task preview fields even when no scene_card_id exists.
Do not require a user-created scene card for topic lock.
```

### 2. Customer name must be a hard output invariant

Failure:

```text
Customer name used: 徐老师
The simulated customer repeatedly addressed the beautician as 徐老师.
```

Existing local candidate already partially handles this in:

```text
lib/voice-coach/session-context.ts
lib/voice-coach/llm.server.ts
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/pipeline/orchestrator.ts
```

Required fix:

```text
Keep customer display name as UI/report metadata only.
Never let generated customer speech address the beautician by customer_name.
Apply this invariant in:
- first turn generation,
- HTTP fallback generation,
- HTTP analyze + next_customer generation,
- WS streaming sentence chunks before TTS,
- WS final customer text before database persistence.
```

Implementation expectation:

```text
If output starts with customer_name, strip the address prefix if the remaining text is useful.
If output still treats customer_name as an addressee or becomes empty, replace with policy fallback.
Tests must cover 徐老师您好 / 徐老师，我想问... / 徐老师老师...
```

### 3. Topic guard must cover both project/customer and common knowledge-base flows

Failure:

```text
Common knowledge base flow drifted into 胸部护理.
Project/customer flow did not drift into 胸部护理 after 10+ turns.
```

Interpretation:

```text
The project/customer path likely has a scene card or service name, so topic lock can work.
The common knowledge base path likely lacks a service name in prompt_context_text, so current topic lock can be null.
```

Required fix:

```text
For training tasks, derive active_service / active_topic from:
- training_context.service_name
- training_context.project
- training_context.focus
- training_context.title
- training_context.customer_line
- training_context.task_title
- training_task_preview.title / focus if present upstream
- pack/task metadata if loaded server-side
```

Guard behavior:

```text
If active_service is 胶原抗衰护理, forbid chest/private-care drift unless the selected service itself contains those terms.
Forbidden terms include at least:
胸, 胸部, 丰胸, 乳腺, 胸部护理, 私密, 私密护理
```

### 4. Long conversation must not loop on the same safety concern

Failure:

```text
Project/customer setup flow ran roughly 10+ turns without chest drift, but kept circling around project safety questions.
```

Existing local candidate has dialogue axes:

```text
safety, mechanism, evidence, boundary, expectation, value, process, trust
```

Risk:

```text
Current axis detection still tends to return safety when core concerns include safety or recent text mentions risk/safety.
This is not enough for 10+ turn conversations.
```

Required fix:

```text
Add anti-repetition / axis-rotation policy.
Track recent customer axes from history.
If the last 2 customer turns or last 2 next moves are safety, force the next axis to a different useful axis:
- evidence
- boundary
- mechanism
- expectation
- process
- value
- trust
```

Suggested behavior:

```text
After safety is answered once or twice, customer should naturally ask:
- evidence: 有检测报告/案例/成分依据吗？
- boundary: 哪些皮肤状态不适合？
- process: 做前怎么评估、做后怎么观察？
- expectation: 多久看到变化、什么算合理？
- value: 它和普通护理差异在哪里？
- trust: 后续会不会推销、服务怎么跟进？
```

## Scoped Files Allowed For Voice Repair

Backend HTTP path:

```text
app/api/voice-coach/sessions/route.ts
lib/voice-coach/session-context.ts
lib/voice-coach/llm.server.ts
tests/voice-coach-report.runtime.test.js
```

Realtime WS path:

```text
voice-coach-ws/src/shared/topic-guard.ts
voice-coach-ws/src/shared/prompts.ts
voice-coach-ws/src/pipeline/orchestrator.ts
voice-coach-ws/src/__tests__/topic-guard.test.ts
voice-coach-ws/src/__tests__/streaming-llm.test.ts
```

Add focused tests if needed.

Do not touch without new release-thread approval:

```text
supabase/migrations/*
vercel.json
app/api/mp/store-admin/*
app/api/mp/service-records/*
lib/voice-coach/training-packs/*.json
public/professional-learning-assets/
scripts/check-backend-release-package.mjs
scripts/required-professional-learning-rendered-assets.json
```

## Required Tests Before Handoff Back

Run in canonical backend:

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
git diff --check
corepack pnpm release:preflight
cd voice-coach-ws && npm run typecheck
cd voice-coach-ws && npm test
cd ..
NODE_PATH=voice-coach-ws/node_modules node --test tests/voice-coach-report.runtime.test.js
corepack pnpm build
```

Add or update tests proving:

```text
1. training_context-only session creates prompt_context_text with active training topic/service.
2. common knowledge base training task with 胶原抗衰护理 gets a non-null topic lock.
3. customer name 徐老师 is not used as addressee in first turn, HTTP next_customer, WS streaming final text.
4. forbidden chest/private-care terms are blocked for 胶原抗衰护理 but allowed when selected service itself is 胸部护理.
5. long dialogue rotates away from safety after repeated safety turns.
6. fallback text stays on active_service and does not always ask the same safety question.
```

## Release / Deployment Boundary

The repair thread should not deploy by itself unless the user explicitly grants production authority and the release-prep thread confirms.

Production release must cover both:

```text
HTTP/Vercel: lib/voice-coach/* and app/api/voice-coach/*
Realtime WS/ECS-PM2: voice-coach-ws/src/*
```

Vercel deploy alone does not update:

```text
wss://ip.ipgongchang.xin/ws/voice-coach
```

Before WS deploy, confirm:

```text
server repo path
branch/commit
PM2 app name
health check
websocket handshake check
rollback command
```

## Acceptance Criteria

The repair can be handed back only when:

```text
Local tests pass.
Backend release-prep thread can see a scoped diff.
No production deploy/upload/data write has happened without authorization.
New preview/production true-device smoke no longer shows:
- 徐老师 used as beautician address,
- 胸部护理 drift in common knowledge base,
- repeated safety-loop across 10+ turns.
```

Mini-program upload remains blocked until this repair is released and true-device smoke passes.
