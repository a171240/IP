# Release Manifest - XHS Cover Preview Hotfix V4

## Basic Info

- Release date: 2026-05-26
- Release thread: current Codex thread
- Operator: Codex, with user approval
- Version: `1.0.20260526.4`
- Backend repository: `a171240/IP`
- Backend branch: `codex/baibaitu-private-copy-release-20260526`
- Mini-program repository: `a171240/meiye-huajing-miniprogram`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, no schema change

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: "这个线程是本次发布线程，可以执行生产发布".
- Are all other threads frozen from production deploy/upload? Not independently confirmed.
- Is this release allowed to touch production data or schema? No schema/data mutation needed.

## Workspace State

Backend status before commit:

```text
## codex/baibaitu-private-copy-release-20260526...origin/codex/baibaitu-private-copy-release-20260526
 M app/api/mp/xhs/generate-cover-image/route.ts
?? docs/release-manifest-2026-05-26-xhs-cover-preview-hotfix-v4.md
```

Mini-program status before commit:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521
 M pages/voice-coach/training-map/index.js
 M pages/voice-coach/training-map/index.wxml
 M pages/voice-coach/training-map/index.wxss
 M pages/xiaohongshu/index.js
 M pages/xiaohongshu/index.wxml
?? assets/voice-coach/training-map-visual.jpg
?? docs/release-manifest-2026-05-26-xhs-cover-preview-hotfix-v4.md
```

Untracked files that must be included:

```text
docs/release-manifest-2026-05-26-xhs-cover-preview-hotfix-v4.md
```

Dirty files intentionally excluded:

```text
pages/voice-coach/training-map/index.js
pages/voice-coach/training-map/index.wxml
pages/voice-coach/training-map/index.wxss
assets/voice-coach/training-map-visual.jpg
```

## Included Changes

- Backend: add stage timing logs for XHS cover generation to separate APIMart generation, reference assets, and storage upload time.
- Mini-program: force XHS cover image URLs to use `https://www.ipnrgc.com` without preferred-host cache override.
- Mini-program: preview cover via local temp image path from `wx.getImageInfo`.
- Mini-program: add cover image load/fail tracking.

## Explicitly Not Included

- No schema changes.
- No payment, service-record, private-copy, training-map, or training logic changes.
- No DNS change for `ip.ipgongchang.xin`.

## Database Changes

- Supabase migration files: none.
- Applied to production: none.
- Rollback/recovery plan: no DB rollback needed.

## Backend Deployment

- Vercel project: `ip`
- Previous production deployment ID: `dpl_Fma4HDEkJYdqjLfkwA8y8cdDArMp`
- Production deployment ID: pending
- Production alias/domain: `https://www.ipnrgc.com`, `https://ip.ipgongchang.xin`
- Deploy command: `pnpm dlx vercel@latest deploy --prod --yes`

Backend smoke results:

```text
pnpm exec tsc --noEmit --pretty false -> pass
git diff --check -- app/api/mp/xhs/generate-cover-image/route.ts -> pass
pnpm build -> pass, existing warnings only, 0 errors
```

## Mini-program Upload

- WeChat AppID: `wx2fab2dc6ebe442c4`
- DevTools CLI path: `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Upload version: `1.0.20260526.4`
- Upload description: `xhs-cover-preview-hotfix-v4-20260526`
- Upload command: pending
- Upload result: pending

Mini-program local checks:

```text
node --check pages/xiaohongshu/index.js -> pass
git diff --check -- pages/xiaohongshu/index.js pages/xiaohongshu/index.wxml -> pass
simulated preferred_http_base_url=ip.ipgongchang.xin -> cover URL still rewrites to https://www.ipnrgc.com
```

## Risk Checklist

- Unknown dirty changes: training-map files are present in the mini-program working tree and intentionally excluded from this release.
- Deleted files: none expected.
- Route conflicts: limited to XHS cover generation endpoint and XHS mini-program page.
- Product/point display conflicts: none.
- Store account permission conflicts: none.
- Service-record backend availability: smoke only.
- Test data visibility: uses existing test draft `1d6fcb2b-603b-4c0b-b2a4-03d092318a04` for cover URL checks.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_Fma4HDEkJYdqjLfkwA8y8cdDArMp`
- Previous mini-program version: `1.0.20260526.3`
- Database rollback note: none.
- Who should be notified: user in this thread.

## Final Decision

- Release approved: yes, by user authorization in this thread.
- Released by: pending
- Release time: pending
- Follow-up items: fix DNS for `ip.ipgongchang.xin` separately by setting `A ip.ipgongchang.xin 76.76.21.21`.
