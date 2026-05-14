# Backend Integration Handoff - 2026-05-14

This handoff records the clean backend integration result for the mini-program
store-account, service-package, and service-record work.

## Integration Workspace

- Path: `D:/IP网站/.tmp/worktrees/backend-integration-20260514`
- Branch: `codex/backend-integration-20260514`
- Recent local head before this follow-up: `60f96e6 Document backend integration handoff`
- Base service-package commit: `9925a78 Align store service package entitlements`
- Backup snapshot: `E:/CodexHome/codex-backups/IP网站/20260514-103934`

## Included

- Default personal trial credits are centralized as `DEFAULT_TRIAL_CREDITS = 20`.
- Store/company owner opening flows mark the responsible account as
  `credits_unlimited = true` with `service_plan_label = "门店不限量服务包"`.
- Staff accounts under a store use the store or company billing owner instead
  of requiring their own AI points.
- Staff accounts are blocked from buying their own service package.
- Mini-program virtual-pay product names are service-package names, not
  `Plus` / `Pro`.
- Service-record backend routes are integrated:
  - `/api/mp/service-records/sessions`
  - `/api/mp/service-records/sessions/[sessionId]`
  - `/api/mp/service-records/sessions/[sessionId]/segments`
  - `/api/mp/service-records/sessions/[sessionId]/end`
  - `/api/mp/service-records/sessions/[sessionId]/resume`
  - `/api/mp/service-records/sessions/[sessionId]/markers`
  - `/api/mp/service-records/sessions/[sessionId]/process`
  - `/api/mp/service-records/sessions/[sessionId]/asr/poll`
  - `/api/cron/service-records`
- Service-record migration is included:
  `supabase/migrations/20260513085315_add_service_record_sessions.sql`.
- Service-record ASR environment keys are documented in `.env.example`.

## Not Included

- No Vercel production deploy, promote, or alias change was run.
- No Supabase production migration or data mutation was run.
- No WeChat DevTools upload was run.
- The dirty source workspace `D:/IP网站` was not reset or overwritten. It still
  contains unrelated unstaged changes from earlier or other-thread work.
- The local endpoint smoke could not fully exercise auth-required routes because
  the new integration worktree has no `.env.local` Supabase config. Route
  existence was verified by the successful Next build route table instead.
- These source-worktree-only compatibility edits were intentionally deferred
  because the integration build already passes and the changes are not required
  for the service-package or service-record release candidate:
  - `app/activate/page.tsx`
  - `app/admin/funnel/page.tsx`
  - `app/admin/leads/page.tsx`
  - `app/auth/login/page.tsx`
  - `app/auth/register/page.tsx`
  - `app/demo/page.tsx`
  - `app/redeem/page.tsx`
  - `package.json`
  - `scripts/strict-build.mjs`

## Verification

- `git diff --check` passed before staging the service-package commit.
- `node --check scripts/service-record-smoke.js` passed.
- `corepack pnpm install --frozen-lockfile` completed without lockfile changes.
- `corepack pnpm build` completed successfully.
- After adding the service-record ASR env template keys, `corepack pnpm build`
  was run again and completed successfully.
- Build output listed `/api/mp/virtual-pay/products` and all
  `/api/mp/service-records/*` routes.
- Static search confirmed current product display names are `测试服务包`,
  `基础服务包`, and `专业服务包`.
- Static search confirmed profile creation paths use `DEFAULT_TRIAL_CREDITS`
  rather than hard-coded `30` for the integrated files.

Build warnings remain, mainly existing `@typescript-eslint/no-explicit-any` and
CommonJS test warnings. They did not block compilation.

## Release Next Steps

Before production release:

1. Fill `docs/release-manifest-template.md` for this version.
2. Use this integration branch as the backend release source.
3. Run preview deployment only first.
4. Smoke these preview endpoints:
   - `/api/mp/profile`
   - `/api/mp/virtual-pay/products`
   - `/api/mp/service-records/sessions`
   - changed admin/store routes
5. Apply Supabase migrations only from the explicit release thread.
6. Promote/deploy production only after the release thread is explicitly named.
