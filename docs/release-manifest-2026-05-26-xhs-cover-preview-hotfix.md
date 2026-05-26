# Release Manifest - XHS Cover Preview Hotfix

## Basic Info

- Release date: 2026-05-26
- Release thread: current Codex thread
- Operator: Codex, with user approval
- Version: `1.0.20260526.2`
- Backend repository: `a171240/IP`
- Backend branch: `codex/xhs-cover-preview-hotfix-20260526`
- Mini-program repository: `a171240/meiye-huajing-miniprogram`
- Mini-program branch: `codex/xhs-cover-preview-hotfix-20260526`
- Supabase project/environment: production, project host `topyedxzcdfswxdcucpl.supabase.co`

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次发布线程，可以执行生产发布".
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this hotfix uses clean worktrees so unrelated dirty work is excluded.
- Is this release allowed to touch production data or schema? No schema/data mutation needed.

## Workspace State

Backend status before edits:

```text
## codex/xhs-cover-preview-hotfix-20260526...origin/codex/baibaitu-private-copy-release-20260526
```

Mini-program status before edits:

```text
## codex/xhs-cover-preview-hotfix-20260526...origin/codex/app-migration-handoff-20260521
```

Untracked files that must be included:

```text
docs/release-manifest-2026-05-26-xhs-cover-preview-hotfix.md
```

Dirty files intentionally excluded:

```text
Main mini-program worktree has unrelated voice-coach / knowledge-space dirty files.
Main backend release worktree has unrelated voice-coach / knowledge-space dirty files.
This hotfix is built from clean worktrees only.
```

## Included Changes

- Mini-program: force generated XHS cover image preview URLs to use `https://www.ipnrgc.com` instead of the slower `https://ip.ipgongchang.xin` proxy domain.
- Backend: add `Content-Length`, `Content-Disposition: inline`, and cache headers to `/api/mp/xhs/covers/[draftId]` image responses.

## Explicitly Not Included

- No private-copy changes.
- No Baibaitu training changes.
- No knowledge-space changes.
- No payment, service-record, or Supabase schema changes.

## Database Changes

- Supabase migration files: none.
- Applied to production: none.
- Rollback/recovery plan: no DB rollback needed.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_2m3EMSZhLhxeJdKM8nKkLw82Cdso`
- Preview deployment URL: pending
- Production deployment ID: pending
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `pnpm dlx vercel@latest deploy --prod --yes`

Backend smoke results:

```text
Pre-fix timing check for existing generated cover:
https://www.ipnrgc.com/api/mp/xhs/covers/e094a7fb-475b-4842-92b7-7fa224fcae36?v=1779772836714 -> 200 image/png, 2.75s
https://ip.ipgongchang.xin/api/mp/xhs/covers/e094a7fb-475b-4842-92b7-7fa224fcae36?v=1779772836714 -> 200 image/png, 58.97s

pnpm exec tsc --noEmit --pretty false -> pass
pnpm build -> pass, 338 existing warnings, 0 errors
```

Required backend checks:

- `/api/mp/profile`
- `/api/mp/virtual-pay/products`
- `/api/mp/service-records/sessions`
- `/api/mp/xhs/covers/{draftId}` response headers and image download timing

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: `1.0.20260526.2`
- Upload description: `xhs-cover-preview-hotfix-20260526`
- Upload command: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /Users/Admin/Documents/.repo-search-private-domain/meiye-huajing-miniapp.worktrees/codex__xhs-cover-preview-hotfix-20260526 --version 1.0.20260526.2 --desc xhs-cover-preview-hotfix-20260526 --lang zh`
- Upload result: pending

Mini-program local checks:

```text
node --check pages/xiaohongshu/index.js -> pass
git diff --check -> pass
```

Required mini-program checks:

- `node --check pages/xiaohongshu/index.js`
- XHS cover generation should still submit to production backend.
- Generated cover preview URL should resolve under `https://www.ipnrgc.com`.

## Risk Checklist

- Unknown dirty changes: excluded by using clean worktrees.
- Deleted files: none expected.
- Route conflicts: limited to existing XHS cover image route.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: smoke only.
- Test data visibility: uses existing test draft `e094a7fb-475b-4842-92b7-7fa224fcae36` for image route smoke only.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_2m3EMSZhLhxeJdKM8nKkLw82Cdso`
- Previous mini-program version: `1.0.20260526.1`
- Database rollback note: none.
- Who should be notified: user in this thread.

## Final Decision

- Release approved: yes, by user authorization in this thread.
- Released by: pending
- Release time: pending
- Follow-up items: ask user to re-open the generated cover and tap preview on real device.
