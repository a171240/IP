# APP production-cn backend-only secret env import batches

Generated: 2026-06-26T05:21:14.950Z

Source command: `corepack pnpm aliyun:sensitive:blockers:backend`

This file is the backend-only import batching guide for the current `backend_aliyun_only` target. It lists variable names, owners, and allowed import targets only. It does not contain secret values and does not authorize Aliyun env import, resource creation, image push, DNS changes, or production deployment.

## Current Backend Verdict

Production-cn backend cannot be deployed now.

Current backend-only sensitive gate:

```text
blockedCredentialCount=1
readySecretEnvVariableCount=17
readySecretEnvVariableGroupCount=9
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
actionTimeConfirmationRequiredIds=S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
```

## Status Source Consistency

- Deployment gate: `corepack pnpm aliyun:backend-cn:status`
- Credential gate: `corepack pnpm aliyun:sensitive:blockers:backend`
- Shared credential fields: `blockedCredentialNames`, `readySecretEnvVariableCount`, `actionTimeConfirmationRequiredIds`, `deferredAppLaunchSensitiveActionIds`
- Backend-only credential conclusion: blockedCredentialNames=DATABASE_URL_CN; readySecretEnvVariableCount=17; actionTimeConfirmationRequiredIds=S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
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
| `DATABASE_URL_CN` | `S08_ALIYUN_RDS_DATABASE_URL` | 阿里云 RDS/后端数据迁移操作员 | 阿里云 KMS/Secrets Manager/SAE secret env |

- ACR purchase evidence is confirmed locally; S04_ACR_REGISTRY_AUTH remains blocked until docker push, digest verification, and SAE runtime image pull configuration are closed without storing registry secret material in docs, JSON, images, or git.
- Supabase variables in legacy_database_migration_source are migration source / legacy compatibility only; formal production-cn database target is Aliyun RDS PostgreSQL.
- WeChat Open Platform mobile app, Apple Team ID, and Android release signing variables are deferred full App launch items, not current backend import blockers.

## Machine-Readable Import Batches

The JSON output includes `importBatches`, `blockedSecretImportBatches`, and `readySecretImportBatches`. Every batch has `canImportNow=false` until the named action-time confirmation and dependency evidence are complete.

| Batch | Phase | Can import now | Variables | Blocked credentials | Import target | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `BLOCKED_SECRET_BATCH_01_OSS_RAM_STS` | `blocked_until_oss_ram_sts_and_runtime_role_confirmed` | false | `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET`, `ALIYUN_OSS_SECURITY_TOKEN` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:cloud:confirmations`<br>`corepack pnpm aliyun:health:smoke` |
| `BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION` | `blocked_until_rds_postgres_and_migration_evidence_ready` | false | `DATABASE_URL_CN` | `DATABASE_URL_CN` | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:rds:migration:package`<br>`corepack pnpm aliyun:rds:migration:evidence:strict`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:backend-cn:status`<br>`corepack pnpm aliyun:completion:audit` |
| `READY_SECRET_BATCH_01_LEGACY_DATABASE_MIGRATION_SOURCE` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | none | migration source / legacy compatibility only; formal database target is Aliyun RDS PostgreSQL | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_02_APP_AUTH` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `WECHAT_LOGIN_SECRET` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_03_ALIYUN_OSS` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_04_BAILIAN_ASR` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `DASHSCOPE_API_KEY` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_05_DEEPSEEK_SUMMARY` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `DEEPSEEK_API_KEY`, `SERVICE_RECORD_DEEPSEEK_API_KEY` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_06_VOLC_SPEECH` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `VOLC_SPEECH_ACCESS_TOKEN`, `VOLC_SPEECH_APP_ID`, `VOLC_SPEECH_SECRET_KEY` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_07_BACKEND_OPS` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `ADMIN_USER_IDS`, `CREDITS_IP_SALT` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_08_LEGACY_CONTENT_PROVIDER` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `APIMART_API_KEY` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |
| `READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT` | `ready_by_name_blocked_until_authorized_aliyun_secret_env_import` | false | `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET` | none | 阿里云 KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:env:handoff:backend`<br>`corepack pnpm aliyun:sensitive:blockers:backend`<br>`corepack pnpm aliyun:env:checklist`<br>`corepack pnpm aliyun:readiness:cloud-ready` |

## Conditional OSS STS Token

`ALIYUN_OSS_SECURITY_TOKEN` is optional. Import it only when the OSS runtime path uses temporary STS credentials. If the backend uses a least-privilege RAM AccessKey or an SAE runtime role path that does not issue an STS session token to the app, leave this variable empty and do not count it as a backend-only blocked credential.

## Ready Secret Env Import Batches

These variables are ready by name, but their values still must be imported only during an authorized backend secret-env action. They must not be written to JSON, Markdown, Docker images, App bundles, shell history, or git.

| Batch | Owner | Count | Import target | Variable names |
| --- | --- | ---: | --- | --- |
| `legacy_database_migration_source` | Vercel/Supabase 操作员 | 3 | migration source / legacy compatibility only; formal database target is Aliyun RDS PostgreSQL | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `app_auth` | 后端发布操作员 | 1 | 阿里云 KMS/Secrets Manager/SAE secret env | `WECHAT_LOGIN_SECRET` |
| `aliyun_oss` | 阿里云 OSS/RAM 操作员 | 2 | 阿里云 KMS/Secrets Manager/SAE secret env | `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET` |
| `bailian_asr` | 阿里云百炼/DashScope 操作员 | 1 | 阿里云 KMS/Secrets Manager/SAE secret env | `DASHSCOPE_API_KEY` |
| `deepseek_summary` | DeepSeek/API 操作员 | 2 | 阿里云 KMS/Secrets Manager/SAE secret env | `DEEPSEEK_API_KEY`, `SERVICE_RECORD_DEEPSEEK_API_KEY` |
| `volc_speech` | 火山引擎语音操作员 | 3 | 阿里云 KMS/Secrets Manager/SAE secret env | `VOLC_SPEECH_ACCESS_TOKEN`, `VOLC_SPEECH_APP_ID`, `VOLC_SPEECH_SECRET_KEY` |
| `backend_ops` | 后端运维/管理员 | 2 | 阿里云 KMS/Secrets Manager/SAE secret env | `ADMIN_USER_IDS`, `CREDITS_IP_SALT` |
| `legacy_content_provider` | 旧内容供应商/API 操作员 | 1 | 阿里云 KMS/Secrets Manager/SAE secret env | `APIMART_API_KEY` |
| `mini_program_compat` | 微信公众平台小程序操作员 | 2 | 阿里云 KMS/Secrets Manager/SAE secret env | `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET` |

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
