# Release Manifest: APIMart image restore

## Basic Info

- Release date: 2026-05-20
- Release thread: current Codex thread, user requested APIMart restore
- Operator: Codex
- Version: backend environment-only restore
- Mini-program repository: `E:/beauty-salon-mini-program`
- Mini-program branch: `main`
- Backend repository: `D:/IP-backend`
- Backend branch: `codex/backend-main-checkpoint-20260514`
- Supabase project/environment: production, no database changes

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Prior hotfix release permission exists in this thread; user requested APIMart restore.
- Are all other threads frozen from production deploy/upload? Not confirmed.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Mini-program status:

```text
## main...origin/main [ahead 8]
dirty; not included
```

Backend status:

```text
## codex/backend-main-checkpoint-20260514...origin/codex/backend-main-checkpoint-20260514
dirty; current dirty code files intentionally excluded from deployment by using Vercel redeploy of the current production deployment
```

Dirty files intentionally excluded:

```text
Mini-program dirty files in E:/beauty-salon-mini-program
Backend current unstaged files in D:/IP-backend
```

## Included Changes

- Production environment restore: set `EVOLINK_IMAGE_PRIMARY=0` so APIMart is tried before Evolink.
- Production timeout restore: set `APIMART_IMAGE_POLL_TIMEOUT_MS=120000` so APIMart has enough time for real mini-program cover prompts before fallback.
- Redeploy current production deployment source after environment change.
- Keep Evolink configured as fallback.

## Explicitly Not Included

- No mini-program upload.
- No backend code edits in the deployment payload.
- No Supabase schema or data changes.

## Backend Deployment

- Vercel project: `a171240s-projects/ip`
- Previous production deployment: `dpl_QHbv3amyzPDkq8gy3XY3qt2yxLrp`
- Intermediate production deployment: `dpl_AdSGHHRjvT1LFTFUCoxmjvotzfDT`
- Current production deployment: `dpl_H3LRBPkkukhXnWEdXKCfkR81jCy2`
- Production domain: `https://www.ipnrgc.com`
- Deploy command: Vercel redeploy of current production deployment after env update

Backend smoke results:

```text
APIMart direct test: ok, model=gpt-image-2, imageHost=upload.apimart.ai, elapsedMs=20433.
First production smoke after EVOLINK_IMAGE_PRIMARY=0: ok, but model=evolink:gpt-image-2, imageHost=files.evolink.ai, elapsedMs=83031.
Root cause: production APIMART_IMAGE_POLL_TIMEOUT_MS was still 30000, so real mini-program prompts could fall back before APIMart completed.
Second production smoke after APIMART_IMAGE_POLL_TIMEOUT_MS=120000: ok, model=gpt-image-2, imageHost=upload.apimart.ai, elapsedMs=48886.
Full chain smoke after restore: /api/mp/profile, /api/mp/virtual-pay/products, /api/mp/service-records/sessions, /api/mp/xhs/generate-v4, /api/mp/xhs/generate-cover-image, and cover fetch all passed.
Full chain smoke confirmed staff account with 0 personal points inherits store-owner unlimited package.
Full chain cover result: model=gpt-image-2, internal cover endpoint returned image/png, 1943920 bytes.
Latest error/point audit: Vercel error logs empty for the checked window, and no recent insufficient_ai_points blocked rows.
```

## Rollback / Recovery

- Set `EVOLINK_IMAGE_PRIMARY=1` and redeploy current production deployment to make Evolink primary again.

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-05-20 08:25 CST
