# Release Manifest: company_admin role label production

## Basic Info

- Release date: 2026-06-15
- Release thread: current Codex thread
- Operator: Codex
- Version: company-admin-role-label-20260615
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, read-only verification only

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `允许本线程把曼贝莲 company_admin 正式界面显示文案改为“总管理员”，并部署到生产。`
- Are all other threads frozen from production deploy/upload? Not globally confirmed. This release uses a scoped clean backend package to avoid unrelated dirty worktree changes.
- Is this release allowed to touch production data or schema? No.

## Workspace State

Backend status before scoped edits:

```text
## codex/app-api-handoff-20260521...origin/codex/app-api-handoff-20260521 [ahead 14]
 M app/api/mp/service-records/sessions/[sessionId]/route.ts
 M lib/service-records/processing.server.ts
 M lib/service-records/server.ts
 M lib/voice-coach/training.server.ts
 M tests/service-record-minutes-v2.static.test.js
?? app/api/app/service-records/sessions/[sessionId]/audio/
?? app/api/app/store-admin/invites/[token]/qrcode/
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? app/api/mp/store-admin/invites/[token]/qrcode/
?? docs/release-manifest-2026-06-15-manbeilian-knowledge-space-access.md
?? docs/release-manifest-2026-06-15-store-admin-invite-qrcode-route.md
?? lib/service-records/audio-evidence.server.ts
?? lib/wechat/
?? supabase/migrations/20260615143000_seed_manbeilian_knowledge_space.sql
?? tests/manbeilian-knowledge-space.static.test.js
```

Mini-program status before scoped edits:

```text
## codex/app-migration-handoff-20260521...origin/codex/app-migration-handoff-20260521 [ahead 37]
 M pages/service-record/detail/index.js
 M pages/service-record/detail/index.wxml
 M pages/service-record/detail/index.wxss
 M pages/service-record/index.wxml
 M pages/service-record/index.wxss
 M pages/service-record/service-record-voice-coach-setup.js
 M pages/service-record/service-record-voice-coach-setup.test.js
 M pages/store-admin/service-records/detail/index.js
 M pages/store-admin/service-records/detail/index.wxml
 M pages/store-admin/service-records/detail/index.wxss
 M pages/voice-coach/index.wxss
 M project.config.json
 M tools/check-voice-coach-remote-images.js
?? docs/manbeilian-knowledge-space-training-dev-doc-2026-06-10.md
?? docs/manbeilian-mini-program-asset-audit-2026-06-12.md
?? docs/manbeilian-project-card-knowledge-base-dev-doc-2026-06-10.md
?? docs/manbeilian-web-driven-knowledge-base-dev-doc-2026-06-13.md
?? docs/professional-learning-full-knowledge-base-2026-06-09.md
?? docs/service-record-commercial-ui-dual-plugin-handoff-2026-06-15.md
?? docs/service-record-commercial-ui-framework-options-2026-06-15.md
?? docs/service-record-l12-real-device-test-card-2026-06-15.md
?? docs/service-record-real-chain-acceptance-checklist-2026-06-15.md
?? docs/service-record-smart-minutes-product-design-blueprint-2026-06-14.md
?? docs/service-record-world-class-ui-framework-2026-06-14.md
?? manbeilian-current-html-after-card-refresh.png
?? outputs/
?? tools/build-manbeilian-knowledge-package.js
?? tools/build-manbeilian-knowledge-preview.js
?? tools/inspect-ble-diagnostic.js
?? tools/inspect-ble-diagnostic.test.js
?? tools/inspect-service-record-real-chain.js
?? tools/inspect-service-record-test-packet.js
?? tools/inspect-service-record-test-packet.test.js
?? tools/service-record-real-chain-diagnostic-ui.test.js
?? utils/service-record-minutes-v2-contract.js
?? utils/service-record-minutes-v2-contract.test.js
?? utils/service-record-real-chain-evidence.js
?? utils/service-record-real-chain-evidence.test.js
?? utils/service-record-voice-coach-setup.js
```

Untracked files that must be included in backend deployment package:

```text
app/api/mp/store-admin/invites/[token]/qrcode/route.ts
app/api/app/store-admin/invites/[token]/qrcode/route.ts
lib/wechat/mini-program.server.ts
docs/release-manifest-2026-06-15-company-admin-role-label-production.md
```

Dirty files intentionally excluded:

```text
Existing service-record, voice-coach, Manbeilian knowledge-space migration, mini-program service-record UI, and unrelated tool files listed above.
```

## Included Changes

- Backend: change `company_admin` display label from `公司管理员` to `总管理员` in `lib/mp/account-context.server.ts`.
- Backend: change AI/profile account role label for `company_admin` from `公司账号` to `总管理员` in `lib/mp/ai-points.server.ts`.
- Backend deploy package also preserves the existing production store-admin invite qrcode route from the previous release.
- Mini-program source fallback labels updated locally in:
  - `utils/account-context.js`
  - `utils/ai-points.js`
  - `pages/store-admin/members/index.js`

## Explicitly Not Included

- No role value change. The persisted permission remains `company_admin`.
- No invite regeneration.
- No existing membership rebinding.
- No Supabase schema or data mutation.
- No WeChat DevTools upload in this release.
- No unrelated service-record or voice-coach changes.

## Database Changes

- Supabase migration files: none
- Applied to production: no
- Rollback/recovery plan: no database rollback required.

## Backend Deployment

- Vercel project: `ip` (`prj_8SL1t8fEXw9QeQxScrvlroGio8TC`)
- Preview deployment URL: not used
- Production deployment ID: `dpl_HM3TeXHP8jLsjh9pLeiiStgdf9cP`
- Production deployment URL: `https://ip-n0dfogxuz-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `npx -y vercel@50.28.0 deploy --prod --yes --cwd /tmp/ip-company-admin-label-release-20260615164827`

Backend smoke results:

```text
Local clean worktree:
- `node --check lib/mp/account-context.server.ts`: PASS
- `node --check lib/mp/ai-points.server.ts`: PASS
- `node --check app/api/mp/store-admin/invites/[token]/qrcode/route.ts`: PASS
- `node --check lib/wechat/mini-program.server.ts`: PASS
- `pnpm install --frozen-lockfile --offline`: PASS
- `pnpm build`: PASS
- Next route list includes `/api/mp/store-admin/invites/[token]/qrcode` and `/api/app/store-admin/invites/[token]/qrcode`.

Mini-program local fallback checks:
- `node --check utils/account-context.js`: PASS
- `node --check utils/ai-points.js`: PASS
- `node --check pages/store-admin/members/index.js`: PASS

Vercel production deploy:
- Deployment READY.
- Alias completed for `https://www.ipnrgc.com`.
- Remote build package check passed 4/4.
- Remote build completed successfully.

Production smoke:
- `GET /api/mp/store-admin/invites/[token]/preview`: 200, ok true, usable false, company_name `曼贝莲`, role `company_admin`, role_label `总管理员`, store_id null, used_count 1, max_uses 1.
- `GET /api/mp/store-admin/invites/[token]/qrcode?env_version=release&width=430`: 410, `invite_expired`, route exists and used-token boundary is intact.
- Runtime error scan for deployment `dpl_HM3TeXHP8jLsjh9pLeiiStgdf9cP` over last 10 minutes: no error/fatal logs found.
```

Required backend checks:

- `/api/mp/profile`: 401 `auth_required`, route exists and auth boundary intact
- `/api/mp/virtual-pay/products`: 200, product JSON returned
- `/api/mp/service-records/sessions`: 401 `auth_required`, route exists and auth boundary intact
- Changed admin/store route: `/api/mp/store-admin/invites/[token]/preview`, role_label `总管理员`

## Mini-program Upload

- WeChat AppID: not uploaded in this release
- DevTools CLI path: not used
- Upload version: not uploaded
- Upload description: not uploaded
- Upload command: not run
- Upload result: not run

Mini-program local checks:

```text
node --check utils/account-context.js
node --check utils/ai-points.js
node --check pages/store-admin/members/index.js
```

Required mini-program checks:

- `app.json` routes exist: not changed
- Mine page loads: not uploaded in this release
- Store workspace loads: not uploaded in this release
- Staff training page loads: not changed
- Pay/service package page loads: not changed
- Service record entry behaves as expected: not changed

## Risk Checklist

- Unknown dirty changes: present in both repos, excluded from scoped deploy package.
- Deleted files: none observed in startup status.
- Route conflicts: qrcode route explicitly preserved in clean deploy package.
- Product/point display conflicts: `company_admin` display now `总管理员`.
- Store account permission conflicts: no permission value changes.
- Service-record backend availability: not touched.
- Test data visibility: invite token is not printed in this manifest.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_B6myudtJzJwCzgNcVQC3ve4n9yge`
- Previous mini-program version: unchanged
- Database rollback note: no schema/data change in this release
- Who should be notified: store-admin release owner

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-06-15 16:52 CST
- Follow-up items: a future mini-program upload can carry the local fallback wording changes, but production backend role labels are live now.
