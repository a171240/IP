# Codex Entry Standard

This repository is the paired Vercel/Next.js backend for the beauty-salon
mini-program. Every Codex thread must read this file before doing any work in
this repository.

## Must Read First

Before reading or editing product files, read:

1. `docs/codex-execution-standard.md`
2. `docs/release-manifest-template.md`

If the task also touches the mini-program, apply the same standard in:

- `E:/美业话镜/AGENTS.md`
- `E:/美业话镜/docs/codex-execution-standard.md`

## Default Permission

Every new thread starts as a non-release thread.

Allowed by default:

- Inspect files and current state.
- Run local read-only checks.
- Make scoped code or documentation edits when the user asks for implementation.
- Run local validation or preview-only checks.

Not allowed by default:

- Vercel production deploy, promote, or alias changes.
- Supabase production schema or data changes.
- WeChat DevTools upload from backend scripts.
- Git reset, checkout, clean, or other commands that discard local work.
- Reverting files that another thread or the user may have changed.

Production actions require the user to explicitly say this thread is the release
thread for the current version.

## Required Startup Check

At the start of any non-trivial task, report:

- Current repository path.
- Current branch.
- Staged files.
- Unstaged files.
- Untracked files.
- Whether the task may conflict with mini-program work.

Do not hide or overwrite dirty worktree state.

## High-Risk Files

Treat these files and folders as shared integration points:

- `lib/mp/ai-points.server.ts`
- `lib/wechatpay/products.ts`
- `app/api/mp/admin/*`
- `app/api/mp/store-admin/*`
- `app/api/mp/virtual-pay/*`
- `app/api/mp/service-records/*`
- `lib/service-records/*`
- `supabase/migrations/*`
- `vercel.json`

When touching these files, explain the scope before editing and verify the
affected route after editing.

## Release Rule

No production deployment, promotion, alias change, WeChat upload, or production
Supabase change is allowed unless a release manifest has been filled out for the
version being released.

Before any Vercel production deploy, run and record:

```bash
corepack pnpm release:preflight
```

This is a hard gate for backend release packages. It validates that required API
routes and static assets, including voice-coach and professional-learning image
assets, are present in the package being built. Do not bypass this by deploying
a static-only or partial folder.

After a production deploy that can affect static assets, run and record:

```bash
corepack pnpm release:verify:professional-images
```

This performs live GET checks against the professional-learning rendered image
URLs and must pass before the release is marked complete.
