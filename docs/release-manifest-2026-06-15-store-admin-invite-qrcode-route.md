# Release Manifest: store-admin invite qrcode route

## Basic Info

- Release date: 2026-06-15
- Release thread: current Codex thread
- Operator: Codex
- Version: store-admin-invite-qrcode-route-20260615
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`
- Mini-program branch: `codex/app-migration-handoff-20260521`
- Supabase project/environment: production, existing data only

## Permission Confirmation

- Has the user explicitly named this thread as the release thread? Yes. User said: `授权本线程作为 release 线程，部署 store-admin invite qrcode 路由到生产`
- Are all other threads frozen from production deploy/upload? Not globally confirmed. This release uses a scoped clean backend package to avoid unrelated dirty worktree changes.
- Is this release allowed to touch production data or schema? No schema or production data change is included in this deployment.

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
?? app/api/mp/service-records/sessions/[sessionId]/audio/
?? docs/release-manifest-2026-06-15-manbeilian-knowledge-space-access.md
?? lib/service-records/audio-evidence.server.ts
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

Untracked files that must be included:

```text
app/api/mp/store-admin/invites/[token]/qrcode/route.ts
app/api/app/store-admin/invites/[token]/qrcode/route.ts
lib/wechat/mini-program.server.ts
docs/release-manifest-2026-06-15-store-admin-invite-qrcode-route.md
```

Dirty files intentionally excluded:

```text
Existing service-record, voice-coach, Manbeilian knowledge-space migration, mini-program UI, and tool files listed above.
```

## Included Changes

- Add production backend route `GET /api/mp/store-admin/invites/[token]/qrcode`.
- Add app API compatibility route `GET /api/app/store-admin/invites/[token]/qrcode`.
- Add WeChat mini-program code helper using `wxa/getwxacodeunlimit`.
- Generate release mini-program code for active invites only: `status = active`, not expired, and `used_count < max_uses`.
- Default QR target is the release mini-program page `pages/store-admin/invite-accept/index`.

## Explicitly Not Included

- No WeChat DevTools upload.
- No mini-program source edit.
- No Supabase schema change or migration.
- No unrelated service-record or voice-coach backend changes.
- No invite creation or permission-data mutation as part of this deployment.

## Database Changes

- Supabase migration files: none
- Applied to production: no
- Rollback/recovery plan: no database rollback required.

## Backend Deployment

- Vercel project: `ip` (`prj_8SL1t8fEXw9QeQxScrvlroGio8TC`)
- Preview deployment URL: not used; local clean worktree build passed before production deploy
- Production deployment ID: `dpl_B6myudtJzJwCzgNcVQC3ve4n9yge`
- Production deployment URL: `https://ip-ovnakxqsg-a171240s-projects.vercel.app`
- Production alias/domain: `https://www.ipnrgc.com`
- Deploy command: `npx -y vercel@50.28.0 deploy --prod --yes --cwd /tmp/ip-store-admin-qrcode-release-20260615162138`

Backend smoke results:

```text
Local clean worktree:
- `pnpm install --frozen-lockfile --offline`: PASS
- `pnpm build`: PASS
- Next route list includes `/api/mp/store-admin/invites/[token]/qrcode` and `/api/app/store-admin/invites/[token]/qrcode`.

Vercel production deploy:
- Deployment READY.
- Alias completed for `https://www.ipnrgc.com`.
- Remote build package check passed 4/4.
- Remote build completed successfully.

Production smoke:
- `GET /api/mp/store-admin/invites/[token]/preview`: 200, ok true, usable true, company_name `曼贝莲`, role `company_admin`, store_id null, used_count 0, max_uses 1, expires_at `2026-06-22T08:09:04.656+00:00`.
- `GET /api/mp/store-admin/invites/[token]/qrcode?env_version=release&width=430`: 200, image/jpeg, 112455 bytes.
- Saved official code: `/Users/Admin/Desktop/曼贝莲-总管理员-正式小程序码-20260615.png`.
- Image check: JPEG, 430x430.
- Runtime error scan for deployment `dpl_B6myudtJzJwCzgNcVQC3ve4n9yge` over last 15 minutes: no error/fatal logs found.
```

Required backend checks:

- `/api/mp/profile`: 401 `auth_required`, route exists and auth boundary intact
- `/api/mp/virtual-pay/products`: 200, product JSON returned
- `/api/mp/service-records/sessions`: 401 `auth_required`, route exists and auth boundary intact
- Changed admin/store route: `/api/mp/store-admin/invites/[token]/qrcode`, 200 image/jpeg for active invite token

## Mini-program Upload

- WeChat AppID: not uploaded in this release
- DevTools CLI path: not used
- Upload version: not uploaded
- Upload description: not uploaded
- Upload command: not run
- Upload result: not run

Mini-program local checks:

```text
No mini-program source files changed in this release.
```

Required mini-program checks:

- `app.json` routes exist: not changed
- Mine page loads: not changed
- Store workspace loads: not changed
- Staff training page loads: not changed
- Pay/service package page loads: not changed
- Service record entry behaves as expected: not changed

## Risk Checklist

- Unknown dirty changes: present in both repos, excluded from scoped deploy package.
- Deleted files: none observed in startup status.
- Route conflicts: new route under existing store-admin invite namespace.
- Product/point display conflicts: not touched.
- Store account permission conflicts: route only exposes QR for active invite tokens after token-hash lookup.
- Service-record backend availability: not touched.
- Test data visibility: QR can expose only the invite activation path encoded by an active token.

## Rollback / Recovery

- Previous backend deployment ID: `dpl_4g1TirF7SLHP9tzqqgbuc2c3KEV6`
- Previous mini-program version: unchanged
- Database rollback note: no schema/data change in this release
- Who should be notified: store-admin release owner

## Final Decision

- Release approved: yes
- Released by: Codex
- Release time: 2026-06-15 16:25 CST
- Follow-up items: production WeChat mini-program env vars are confirmed indirectly by successful qrcode image generation.
