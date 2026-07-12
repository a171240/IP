# Backend production-cn RDS gate closure release manifest

## Authorization and target

- Authorized by the user on 2026-07-12: continue until the complete RDS release gate can pass.
- Target: Aliyun SAE application `meiye-huajing-app-api-production-cn` in `cn-hangzhou`.
- Source branch: `codex/app-api-five-tab-controller-20260710`.
- Production database: existing Aliyun RDS PostgreSQL 16 database `meiye_huajing_app`.
- Git scope: local commit and push of this Backend branch are included.

## Included

- The 15 committed G1-G3D Backend integration commits ending at `2cc8199`.
- Health-route deployment identity response required by the postdeploy provenance gate.
- The focused deployment-identity regression test.
- The non-secret Supabase-to-RDS migration plan and gate evidence updates.
- A new production image built from the committed release candidate, ACR push, SAE image deployment, non-secret deployment identity env injection, authenticated APP API smoke, and rollback rehearsal.

## Explicitly excluded

- The dirty G3E React Native App worktree and all other App documentation worktrees.
- Mini-program upload, App Store/Android distribution, true-device microphone/L12/long-recording work, and WeChat Open Platform review.
- Supabase schema/data writes, customer-record deletion, and RDS destructive changes.
- Vercel production deployment; production-cn Backend runs on Aliyun SAE.
- Secrets, tokens, database URLs, passwords, and customer response bodies in Git or release evidence.

## Pre-release state

- Existing SAE application status: `RUNNING`, one instance.
- Existing image tag: `production-cn`.
- Pre-release production digest: `sha256:8325124bac4b4eda004feda7f66d0a81a85fdb799a841f5d479f461778d6506b`.
- Existing deployment change order observed before this release: `4af418b8-a223-402d-a1a0-32f4134d91ac`.
- Baseline remote health: passed.
- Baseline unauthenticated APP API smoke: 35 probes passed.
- Baseline postdeploy suite blocker: `REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE` because the health route did not expose the identity required by the gate.

## Rollback

1. Before replacing `production-cn`, create a new immutable ACR rollback tag from the pre-release digest.
2. Verify that rollback tag resolves to the recorded pre-release digest.
3. If the new deployment fails health, auth, tenant, or data checks, redeploy SAE from that rollback tag.
4. Verify `/api/healthz?strict=1`, the APP API smoke suite, and running instance count after rollback.
5. The RDS migration is insert-only; rollback does not delete migrated rows. Supabase remains available as the legacy identity/migration source.

## Required verification

- `git diff --check`
- focused deployment-identity test
- Backend typecheck and production build
- `corepack pnpm release:preflight`
- fresh ACR digest and SAE change-order verification
- remote health and 35-probe APP API smoke
- authenticated employee/store-admin/company-admin/unbound tenant smoke against RDS
- rollback tag verification and controlled rollback rehearsal
- `corepack pnpm aliyun:rds:migration:evidence:strict`
- Backend production-cn completion audit

## Post-release evidence

This section is updated only after deployment and every required verification have completed. Until then the verdict is `BLOCKED`.
