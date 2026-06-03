# Codex Execution Standard

Last updated: 2026-05-13

This document is the working standard for Codex threads on the paired backend
and WeChat mini-program. Its purpose is to stop separate threads from
overwriting each other through dirty worktrees, production deploys, WeChat
uploads, or Supabase changes.

## 1. Core Principle

One version has one release thread.

All other threads may inspect, patch, test locally, or produce preview evidence,
but they must not publish to production targets.

Production targets include:

- Vercel production deployment, promote, or alias.
- Supabase production migrations, schema changes, or manual data changes.
- WeChat mini-program upload.
- Any command that changes public customer-facing state.

## 2. Thread Startup Standard

Before doing non-trivial work, every thread must identify the current workspace
state.

Required checks:

```powershell
git status --short --branch
git branch --show-current
```

The thread must summarize:

- Repository path.
- Current branch.
- Staged files.
- Unstaged files.
- Untracked files.
- Whether there are deleted files.
- Whether the task touches a known conflict file.

If the worktree is dirty, the thread must not assume those changes belong to it.
Dirty changes are treated as user or other-thread work unless proven otherwise.

## 3. Permission Levels

### Level 0: Read-only

Allowed:

- Read files.
- Run `git status`, `git diff`, `rg`, `Get-Content`, and other inspection
  commands.
- Produce a plan, risk list, or diff inventory.

Forbidden:

- Editing files.
- Deploying.
- Uploading.
- Running migrations.
- Discarding local changes.

### Level 1: Local implementation

Allowed:

- Make scoped code or documentation edits requested by the user.
- Add focused tests or local checks.
- Update docs that describe the work.

Required:

- State the intended edit scope before editing.
- Avoid unrelated refactors.
- Preserve unrelated dirty changes.

Forbidden:

- Production deploys.
- WeChat uploads.
- Supabase production changes.

### Level 2: Preview and smoke

Allowed:

- Local build.
- Local smoke tests.
- Preview-only deployment when needed.
- Browser or CLI verification against preview targets.

Required:

- Record commands and results in the release manifest or handoff note.
- State clearly that preview success is not production release.

Forbidden:

- Promoting preview to production without release-thread authorization.

### Level 3: Release thread

Only the user can grant this level by explicitly saying this thread is the
release thread for the current version.

Allowed:

- Vercel production deploy, promote, or alias.
- WeChat DevTools upload.
- Supabase production migration when included in the release manifest.

Required before release:

- Fill the release manifest.
- Confirm no unknown dirty changes are being published accidentally.
- Run the agreed smoke checks.
- Record deployment or upload evidence.
- State rollback or recovery path.

## 4. Forbidden Actions

Do not run these commands unless the user explicitly asks for that exact action
and the target has been verified:

```powershell
git reset --hard
git checkout -- .
git clean -fd
git restore .
vercel deploy --prod
vercel alias
vercel promote
```

Also forbidden by default:

- WeChat DevTools `upload`.
- Supabase production schema changes.
- Manual deletion of production data.
- Reverting files changed by another thread.

## 5. Dirty Worktree Handling

When a worktree is dirty:

1. List staged, unstaged, deleted, and untracked files.
2. Identify which files are relevant to the current task.
3. Ignore unrelated dirty files.
4. Work with related dirty files without reverting them.
5. If integration is needed, create a manifest and backup patch before merging.

Recommended backup commands:

```powershell
git diff > .codex-backup-working.patch
git diff --staged > .codex-backup-staged.patch
git ls-files --others --exclude-standard > .codex-backup-untracked.txt
```

Do not create these backup files unless the user asks or the current task needs
integration protection.

## 6. Integration Standard

For multi-thread work, do not choose an arbitrary dirty worktree as the final
version.

Use this order:

1. Freeze production actions.
2. Produce a status and diff inventory for each workspace.
3. Identify overlap and conflict files.
4. Create or choose a clean integration branch/worktree.
5. Apply changes by module, not by bulk overwrite.
6. Run local checks.
7. Run preview or smoke checks.
8. Fill release manifest.
9. Let the single release thread publish.

## 7. Known Conflict Areas

Backend:

- `lib/mp/ai-points.server.ts`
- `lib/wechatpay/products.ts`
- `app/api/mp/admin/*`
- `app/api/mp/store-admin/*`
- `app/api/mp/virtual-pay/*`
- `app/api/mp/service-records/*`
- `lib/service-records/*`
- `supabase/migrations/*`
- `vercel.json`

Mini-program:

- `app.json`
- `pages/mine/*`
- `pages/pay/*`
- `pages/platform-admin/*`
- `pages/store-admin/*`
- `pages/service-record/*`
- `pages/voice-coach/*`
- `utils/ai-points.js`
- `project.config.json`

## 8. Backend Verification

Prefer:

```powershell
corepack pnpm build
```

Preview or live endpoint checks must distinguish:

- `401` or auth-required responses can mean the route exists.
- `404` usually means the deployed artifact does not contain the route.
- Old product names or old point balances usually mean the production alias was
  overwritten by another deployment.

Important backend smoke checks:

- `/api/mp/profile`
- `/api/mp/virtual-pay/products`
- `/api/mp/service-records/sessions`
- VoiceCoach or knowledge-space training changes must run
  `corepack pnpm mp:voice-coach-invariants -- --base-url <preview-or-production-url>`
  and must not pass with `404` on training APIs or image assets.
- Changed admin/store routes
- Changed payment or entitlement routes

## 9. Mini-program Verification

Use the paired mini-program standard in `E:/美业话镜`.

Fast checks for mini-program page changes:

```powershell
node --check pages\mine\index.js
node --check pages\pay\index.js
node --check pages\store-admin\index.js
node --check utils\ai-points.js
```

WeChat upload is not allowed unless this thread is the release thread and the
release manifest is complete.

## 10. Handoff Standard

Every thread that does non-trivial work should leave a short handoff:

- What changed.
- What was verified.
- What was not verified.
- Which files are still dirty.
- Whether release is blocked.
- Which thread, if any, is allowed to publish.
