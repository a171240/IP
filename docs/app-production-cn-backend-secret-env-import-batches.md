# APP production-cn backend-only secret env import batches

Generated: 2026-06-29T05:20:09.481Z

Source command: `corepack pnpm aliyun:sensitive:blockers:backend`

This file is the backend-only import batching guide for the current `backend_aliyun_only` target. It lists variable names, owners, and allowed import targets only. It does not contain secret values and does not authorize Aliyun env import, resource creation, image push, DNS changes, or production deployment.

## Current Backend Verdict

Production-cn backend cannot be deployed now.

Current backend-only sensitive gate:

```text
blockedCredentialCount=0
readySecretEnvVariableCount=0
readySecretEnvVariableGroupCount=0
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
actionTimeConfirmationRequiredIds=
```

## Status Source Consistency

- Deployment gate: `corepack pnpm aliyun:backend-cn:status`
- Credential gate: `corepack pnpm aliyun:sensitive:blockers:backend`
- Shared credential fields: `blockedCredentialNames`, `readySecretEnvVariableCount`, `actionTimeConfirmationRequiredIds`, `deferredAppLaunchSensitiveActionIds`
- Backend-only credential conclusion: blockedCredentialNames=none; readySecretEnvVariableCount=0; actionTimeConfirmationRequiredIds=none
- Production database decision: Aliyun RDS PostgreSQL is the production-cn database target; Supabase variables are migration source / legacy compatibility inputs only.
- App launch decision: WeChat Open Platform mobile app login, Apple Team ID, and Android release signing are deferred full App launch items, not current backend-only blockers.

Deferred full App launch sensitive actions:

```text
S01_WECHAT_OPEN_APP_LOGIN
S02_APPLE_TEAM_ID
S07_ANDROID_RELEASE_SIGNING
```

## Not Yet Importable For Current Backend

These names are still blocked by Aliyun backend resource or credential decisions. Do not mark them ready until their owner action is complete.

| Variable | Blocking action | Owner | Import target after unblock |
| --- | --- | --- | --- |

- ACR purchase evidence is confirmed locally; S04_ACR_REGISTRY_AUTH remains blocked until docker push, digest verification, and SAE runtime image pull configuration are closed without storing registry secret material in docs, JSON, images, or git.
- OSS P05 now prefers SAE RRSA/OIDC runtime role. ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE are runtime env/file-path inputs when accessMode=sae_runtime_role; ALIYUN_OSS_ACCESS_KEY_ID/SECRET/SECURITY_TOKEN are fallback-only secret env names.
- Supabase variables in legacy_database_migration_source are migration source / legacy compatibility only; formal production-cn database target is Aliyun RDS PostgreSQL.
- WeChat Open Platform mobile app, Apple Team ID, and Android release signing variables are deferred full App launch items, not current backend import blockers.

## Machine-Readable Import Batches

The JSON output includes `importBatches`, `blockedSecretImportBatches`, and `readySecretImportBatches`. Every batch has `canImportNow=false` until the named action-time confirmation and dependency evidence are complete.

| Batch | Phase | Can import now | Variables | Blocked credentials | Import target | Verification |
| --- | --- | --- | --- | --- | --- | --- |

## Conditional OSS Credential Path

Preferred path is SAE RRSA/OIDC runtime role: configure `ALIBABA_CLOUD_ROLE_ARN`, `ALIBABA_CLOUD_OIDC_PROVIDER_ARN`, and `ALIBABA_CLOUD_OIDC_TOKEN_FILE` through SAE RRSA/OIDC, bind the least-privilege OSS policy to that role, and let the backend exchange the runtime OIDC token for temporary STS credentials. `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET`, and `ALIYUN_OSS_SECURITY_TOKEN` are fallback-only secret env names; import them only when the selected access mode is STS or a dedicated least-privilege RAM user.

## Ready Secret Env Import Batches

These variables are ready by name, but their values still must be imported only during an authorized backend secret-env action. They must not be written to JSON, Markdown, Docker images, App bundles, shell history, or git.

| Batch | Owner | Count | Import target | Variable names |
| --- | --- | ---: | --- | --- |

## Deferred Full App Launch Variables

The following names are not current backend import blockers. They remain deferred until the App launch phase.

| Variable | Deferred action | Current backend meaning |
| --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | `S01_WECHAT_OPEN_APP_LOGIN` | deferred_until_wechat_open_mobile_app_created_and_approved |
| `WECHAT_OPEN_APP_SECRET` | `S01_WECHAT_OPEN_APP_LOGIN` | deferred_until_wechat_open_mobile_app_created_and_approved |
| `APPLE_TEAM_ID` | `S02_APPLE_TEAM_ID` | deferred_until_ios_universal_link_aasa_work_resumes |
| `MEIYE_RELEASE_STORE_FILE` | `S07_ANDROID_RELEASE_SIGNING` | deferred_until_android_release_signing_work_resumes |
| `MEIYE_RELEASE_STORE_PASSWORD` | `S07_ANDROID_RELEASE_SIGNING` | deferred_until_android_release_signing_work_resumes |
| `MEIYE_RELEASE_KEY_ALIAS` | `S07_ANDROID_RELEASE_SIGNING` | deferred_until_android_release_signing_work_resumes |
| `MEIYE_RELEASE_KEY_PASSWORD` | `S07_ANDROID_RELEASE_SIGNING` | deferred_until_android_release_signing_work_resumes |

`WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` may remain necessary for old mini-program or compatibility paths. They do not unblock native APP WeChat login.

## Import Evidence To Record

After an authorized backend import action, record only non-secret evidence:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.importedAt
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.evidence
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.confirmed=true
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.secretNotInImage=true
deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseUrlCnSecretImported=true
deploy/aliyun-production-cn.rds-migration.local.json -> migration.* non-secret validation handles
```

## Verification After Import

Run the backend-only checks first, then strict production gates before deployment:

```bash
corepack pnpm aliyun:sensitive:blockers:backend
corepack pnpm aliyun:env:checklist
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:predeploy
```

## Forbidden

```text
Do not output, paste, or commit secret values.
Do not import env values without action-time authorization.
Do not store AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, database password, DATABASE_URL_CN value, Supabase service role key, Android keystore password, or certificate private key in JSON, Markdown, Docker images, App bundles, shell history, or git.
Do not deploy production-cn after env import alone; RDS migration, cloud confirmations, image publish, domain, and smoke evidence must also pass strict gates.
```
