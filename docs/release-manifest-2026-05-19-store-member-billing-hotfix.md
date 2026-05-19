# Release Manifest - Store Member Billing Hotfix

## Basic Info

- Release date: 2026-05-19
- Release thread: yes, user requested production data grant and backend fix for store-member AI point access
- Operator: Codex
- Version: backend production hotfix for store-member shared AI billing and image timeout hardening
- Backend repository: `D:\IP网站`
- Backend branch: `codex/backend-main-checkpoint-20260514`
- Mini-program repository: `E:\美业话镜`
- Mini-program branch: `main`
- Supabase project/environment: production

## Permission Confirmation

- User explicitly requested: first grant points to the affected user, then fix the cause.
- Allowed production data mutation: yes, targeted AI point grant for the affected account.
- Allowed backend production deploy: yes, required to fix the live mini-program behavior.
- WeChat mini-program upload: not included.

## Workspace State

Backend dirty files before deploy:

```text
M app/api/mp/posters/generate/route.ts
M app/api/mp/service-records/sessions/[sessionId]/segments/route.ts
M app/api/mp/xhs/generate-cover-image/route.ts
M lib/mp/ai-points.server.ts
M lib/posters/gpt-image-2.server.ts
M lib/service-records/processing.server.ts
M tests/xhs-cover-style.static.test.js
?? docs/release-manifest-2026-05-19-evolink-image-fallback.md
?? docs/release-manifest-2026-05-19-store-member-billing-hotfix.md
```

Dirty files intentionally excluded:

```text
app/api/mp/service-records/sessions/[sessionId]/segments/route.ts
lib/service-records/processing.server.ts
```

## Included Changes

- `lib/mp/ai-points.server.ts`: for `staff` / `employee` accounts with active store membership, resolve a store/company billing owner before charging AI points.
- `lib/mp/ai-points.server.ts`: prefer same-store `store_owner` / `store_admin`; fall back to company-level owner/admin roles.
- `lib/mp/ai-points.server.ts`: when billing owner is unlimited, member requests are allowed as unlimited; when finite, charges/refunds apply to the billing owner while the ledger still records the actor.
- `lib/xhs/proxy.server.ts`: route legacy XHS/proxy billing context through the same member-aware billing resolver so old `/api/xhs/*` and mini-program helper routes do not fall back to personal-only balance checks.
- Keeps current image hotfix files in the clean deployment so Evolink image generation remains active.

## Production Data Change

- Target: affected account from the `2026-05-19 18:17-18:18 CST` blocked text-generation window.
- Change: added `200` AI points.
- Before: `0`
- After: `200`
- Audit: inserted `mp_ai_point_ledger` row with `action_code=admin.ai_points.adjust`.

## Backend Deployment

- Vercel project: `ip`
- Production deployment ID: `dpl_BDveu9rgLp54TAn8x6JmRaz12uBJ`
- Production alias/domain: `https://www.ipnrgc.com`, `https://ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `npx vercel --prod --yes` from detached clean temporary worktree

Backend checks before deploy:

```text
corepack pnpm build
- passed locally
- existing ESLint warnings only, 0 errors

membership-billing-static-check
- passed
```

Backend smoke after deploy:

```text
GET https://www.ipnrgc.com/api/mp/profile without auth
- 401 auth_required, expected

temporary staff account in affected company/store, personal balance=0
- GET /api/mp/profile: 200
- profile.ai_points_unlimited=true
- profile.billing_scope=store
- profile.plan_label=门店不限量服务包

POST /api/mp/xhs/generate-v4 with the same temporary staff account
- 200 ok
- billing.cost_points=0
- billing.ai_points_unlimited=true
- draft created, then cleaned up with the temporary user/profile/membership

POST /api/xhs/content/danger-check with the same temporary staff account
- 200 success
- verifies the legacy proxy auth/billing context still works after delegation

Image timeout hardening
- EVOLINK_IMAGE_POLL_TIMEOUT_MS=180000
- APIMART_IMAGE_POLL_TIMEOUT_MS=30000
- APIMART_IMAGE_REQUEST_TIMEOUT_MS=10000
- still below the mini-program LONG_GENERATION_TIMEOUT / REQUEST_TIMEOUT of 240000ms

POST /api/mp/xhs/generate-cover-image after timeout hardening
- 200 ok
- elapsed_ms=37316
- model=evolink:gpt-image-2
- image result present

Affected 18:17-18:18 account grant verification
- e7ecbf01...527d received +200 at 2026-05-19T10:25:30Z
- current balance after later use: 190

Production account audit after fix
- Active memberships checked: 10
- Active staff memberships checked: 6
- Staff with personal zero balance but usable store owner/admin package: 4
- Staff with personal zero balance and no usable billing owner: 0
- New insufficient_ai_points ledger rows after 2026-05-19T10:50:00Z: 0
- New fail/error/timeout analytics events after 2026-05-19T11:02:00Z: 0
```

## Mini-program Upload

- Upload command: none
- Upload result: not uploaded
- Reason: backend-only fix; existing released mini-program calls the same production API.

## Rollback / Recovery

- Previous production deployment before the image-timeout hardening deploy: `dpl_B3DUJyVF39tM6QVAihG3K5H1k6xo`
- Recovery path: roll production alias back to `dpl_B3DUJyVF39tM6QVAihG3K5H1k6xo` if the image-timeout hardening causes unexpected behavior.

## Final Decision

- Release approved: yes, deployed and smoke-passed
- Follow-up: continue watching `mp_ai_point_ledger` for new `insufficient_ai_points` rows from active store members and `analytics_events` for `mp_xhs_cover_gpt_image_fail` / `xhs_cover_fail`.
