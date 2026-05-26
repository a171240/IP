# Release Manifest - XHS Cover Preview Hotfix V3

## Basic Info

- Release date: 2026-05-26
- Release thread: current Codex thread
- Operator: Codex, with user approval
- Version: `1.0.20260526.3`
- Backend repository: `a171240/IP`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Mini-program repository: `a171240/meiye-huajing-miniprogram`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, no schema change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次发布线程，可以执行生产发布".
- Are all other threads frozen from production deploy/upload? Not independently confirmed; this release is based on the current latest production branches to avoid rolling back the 13:57 deployment.
- Is this release allowed to touch production data or schema? No schema/data mutation needed.

## Workspace State

Backend status before edits:

```text
## codex/baibaitu-private-copy-release-20260526...origin/codex/baibaitu-private-copy-release-20260526
```

Mini-program status before edits:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
```

Untracked files that must be included:

```text
docs/release-manifest-2026-05-26-xhs-cover-preview-hotfix-v3.md
```

Dirty files intentionally excluded:

```text
none
```

## Included Changes

- Backend: add `Content-Length`, `Content-Disposition: inline`, and cache headers to `/api/mp/xhs/covers/[draftId]`.
- Mini-program: force generated XHS cover image preview URLs to use `https://www.ipnrgc.com`.

## Explicitly Not Included

- No schema changes.
- No payment, service-record, private-copy, or training logic changes.

## Database Changes

- Supabase migration files: none.
- Applied to production: none.
- Rollback/recovery plan: no DB rollback needed.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_DLzBAUfptqSDC8tQhnbUXn4siWah`
- Production deployment ID: pending
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `pnpm dlx vercel@latest deploy --prod --yes`

Backend smoke results:

```text
pnpm exec tsc --noEmit --pretty false -> pass
git diff --check -> pass
pnpm build -> pass, existing warnings only, 0 errors
```

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: `1.0.20260526.3`
- Upload description: `xhs-cover-preview-hotfix-v3-20260526`
- Upload command: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /Users/Admin/Documents/美业话镜小程序 --version 1.0.20260526.3 --desc xhs-cover-preview-hotfix-v3-20260526 --lang zh`
- Upload result: pending

Mini-program local checks:

```text
pending
```

## Risk Checklist

- Unknown dirty changes: none at start of this v3 patch.
- Deleted files: none expected.
- Route conflicts: limited to existing XHS cover image route.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: smoke only.
- Test data visibility: uses existing test draft `56a23b0a-fc9c-4521-b55e-fad2e0780807` for image route smoke only.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_DLzBAUfptqSDC8tQhnbUXn4siWah`
- Previous mini-program version: `1.0.20260526.2`
- Database rollback note: none.
- Who should be notified: user in this thread.

## Final Decision

- Release approved: yes, by user authorization in this thread.
- Released by: pending
- Release time: pending
- Follow-up items: ask user to close and reopen the test mini-program before testing preview.
