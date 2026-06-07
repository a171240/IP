# Release Manifest: Private Copy Generate Fix

## Basic Info

- Release date: 2026-05-22
- Release thread: Current Codex thread, authorized by user after the production 500 diagnosis
- Operator: Codex
- Version: private-copy-generate-fix-20260522
- Backend repository: `D:\IP网站`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `E:\美业话镜`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, no schema/data change planned in this release

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? User said "开始吧,开始" after being told production deploy was required.
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this manifest scopes the backend release to private-copy runtime files only.
- Is this release allowed to touch production data or schema? No production data/schema mutation is included.

## Workspace State

Backend status:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521
 M lib/mp/ai-points.server.ts
?? app/api/mp/private-copy/
?? lib/private-copy/
?? supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql
?? supabase/migrations/20260521_add_private_copy_drafts.sql
```

Mini-program status:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M app.json
 M utils/ai-points.js
?? .tmp-upload/
?? assets/private-copy/
?? assets/tabbar/private-active.png
?? assets/tabbar/private.png
?? docs/private-copy-assistant-dev-plan.md
?? docs/private-copy-assistant-dev-spec.md
?? docs/private-copy-assistant-prompt-review.md
?? docs/release-manifest-2026-05-21-private-copy-assistant-draft.md
?? pages/private-copy/
```

Untracked files that must be included:

```text
app/api/mp/private-copy/drafts/[draftId]/route.ts
app/api/mp/private-copy/drafts/route.ts
app/api/mp/private-copy/generate/route.ts
lib/private-copy/generate.server.ts
lib/private-copy/guardrails.ts
lib/private-copy/llm.server.ts
lib/private-copy/prompts.ts
lib/private-copy/schema.ts
```

Dirty files intentionally included:

```text
lib/mp/ai-points.server.ts
```

Dirty files intentionally excluded from runtime actions:

```text
supabase/migrations/20260521111500_harden_private_copy_drafts_grants.sql
supabase/migrations/20260521_add_private_copy_drafts.sql
E:\美业话镜 mini-program local UI changes and .tmp-upload output
```

## Included Changes

- Harden `/api/mp/private-copy/generate` against DeepSeek JSON drift where optional fields such as `privateMessageSuggestion` are returned as `null`.
- Normalize model output into exactly three private-copy variants before strict result validation.
- Reuse existing DeepSeek XHS base URL/model fallbacks for the private-copy assistant.
- Add structured backend logging for private-copy generation failures without logging user copy text.
- Include private-copy AI point action codes required by the route.

## Explicitly Not Included

- No WeChat mini-program upload.
- No Supabase production migration execution.
- No payment, entitlement, service-record, store-admin, or app-route behavior change.

## Database Changes

- Supabase migration files: present locally for private-copy drafts.
- Applied to production: no action in this release.
- Rollback/recovery plan: backend rollback to previous Vercel deployment `dpl_2D4TZxW4Q3Mdk56ogTt4ea1j9xPk`; database unchanged.

## Backend Deployment

- Vercel project: `ip` (`prj_8SL1t8fEXw9QeQxScrvlroGio8TC`)
- Previous production deployment ID: `dpl_2D4TZxW4Q3Mdk56ogTt4ea1j9xPk`
- Production aliases/domains: `ip.ipgongchang.xin`, `www.ipnrgc.com`, `ipnrgc.com`
- Deploy command/tool: `corepack pnpm dlx vercel@latest deploy --prod --yes`
- Production deployment ID: `dpl_DjiD4YzjxSZpEyo1UUW6CRGkQ9tL`

Backend smoke results:

```text
corepack pnpm build: passed locally before deployment
vercel production build: passed during deployment
POST https://ip.ipgongchang.xin/api/mp/private-copy/generate without auth: 401 auth_required
POST https://www.ipnrgc.com/api/mp/private-copy/generate without auth: 401 auth_required
GET https://ip.ipgongchang.xin/api/mp/virtual-pay/products: 200
authenticated generation smoke: pending user/device token-bearing request after deployment
```

Required backend checks:

- `/api/mp/profile`: pending if auth token is available
- `/api/mp/virtual-pay/products`: pending
- `/api/mp/service-records/sessions`: not changed, no smoke planned without auth
- Changed route `/api/mp/private-copy/generate`: route existence checked by unauthenticated 401; authenticated generation pending

## Mini-program Upload

- WeChat AppID: not used
- DevTools CLI path: not used
- Upload version: not used
- Upload description: not used
- Upload command: none
- Upload result: no upload

Mini-program local checks:

```text
No mini-program publish in this release.
```

## Risk Checklist

- Unknown dirty changes: backend has private-copy untracked runtime files and `lib/mp/ai-points.server.ts`; mini-program has separate local UI changes.
- Deleted files: none observed.
- Route conflicts: private-copy route only.
- Product/point display conflicts: private-copy actions cost 1 AI point; no payment package change.
- Store account permission conflicts: not touched.
- Service-record backend availability: not touched.
- Test data visibility: failed private-copy drafts exist in production from previous attempts.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_2D4TZxW4Q3Mdk56ogTt4ea1j9xPk`
- Previous mini-program version: unchanged
- Database rollback note: no database change in this release
- Who should be notified: user/operator

## Final Decision

- Release approved: yes
- Released by: Codex via Vercel CLI
- Release time: 2026-05-22
- Follow-up items: confirm authenticated mini-program generation succeeds after deployment
