# APP production-cn backend-only secret env import batches

Date: 2026-06-25

This file is the backend-only import batching guide for the current `backend_aliyun_only` target. It is derived from:

```bash
corepack pnpm aliyun:sensitive:blockers:backend
node scripts/summarize-aliyun-user-action-brief.mjs --backend-only
```

It lists variable names, owners, and allowed import targets only. It does not contain secret values and does not authorize Aliyun env import, resource creation, image push, DNS changes, or production deployment.

## Current Backend Verdict

Production-cn backend cannot be deployed now.

Current backend-only sensitive gate:

```text
blockedCredentialCount=2
readySecretEnvVariableCount=17
readySecretEnvVariableGroupCount=9
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
```

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
| `ALIYUN_OSS_SECURITY_TOKEN` | `S05_OSS_RAM_SECRET_OR_STS` | Aliyun OSS/RAM operator | Aliyun KMS / Secrets Manager / SAE secret env |
| `DATABASE_URL_CN` | `S08_ALIYUN_RDS_DATABASE_URL` | Aliyun RDS / backend data migration operator | Aliyun KMS / Secrets Manager / SAE secret env |

`S03_ACR_PAID_PURCHASE` and `S04_ACR_REGISTRY_AUTH` are still backend blockers, but their secret material must stay in ACR/Docker credential helper, RAM/KMS/Secrets Manager, or SAE runtime pull settings. They do not add commit-ready env variable names.

## Ready Secret Env Import Batches

These variables are ready by name, but their values still must be imported only during an authorized backend secret-env action. They must not be written to JSON, Markdown, Docker images, App bundles, shell history, or git.

| Batch | Owner | Count | Import target | Variable names |
| --- | --- | ---: | --- | --- |
| `legacy_database_migration_source` | Vercel/Supabase operator | 3 | migration source / legacy compatibility only; formal database target is Aliyun RDS PostgreSQL | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `app_auth` | Backend release operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `WECHAT_LOGIN_SECRET` |
| `aliyun_oss` | Aliyun OSS/RAM operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET` |
| `bailian_asr` | Aliyun Bailian / DashScope operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `DASHSCOPE_API_KEY` |
| `deepseek_summary` | DeepSeek/API operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `DEEPSEEK_API_KEY`, `SERVICE_RECORD_DEEPSEEK_API_KEY` |
| `volc_speech` | Volcengine speech operator | 3 | Aliyun KMS / Secrets Manager / SAE secret env | `VOLC_SPEECH_ACCESS_TOKEN`, `VOLC_SPEECH_APP_ID`, `VOLC_SPEECH_SECRET_KEY` |
| `backend_ops` | Backend ops / admin | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `ADMIN_USER_IDS`, `CREDITS_IP_SALT` |
| `legacy_content_provider` | Legacy content provider/API operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `APIMART_API_KEY` |
| `mini_program_compat` | WeChat mini-program operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET` |

## Deferred Full App Launch Variables

The following names are not current backend import blockers. They remain deferred until the App launch phase.

| Variable or group | Deferred action | Current backend meaning |
| --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | `S01_WECHAT_OPEN_APP_LOGIN` | Defer until WeChat Open Platform mobile app is created and approved. |
| `WECHAT_OPEN_APP_SECRET` | `S01_WECHAT_OPEN_APP_LOGIN` | Defer until WeChat Open Platform mobile app is created and approved; never store in App bundle, JSON, Markdown, Docker image, or git. |
| `APPLE_TEAM_ID` | `S02_APPLE_TEAM_ID` | Defer until iOS Universal Link/AASA launch work resumes. |
| `MEIYE_RELEASE_STORE_FILE`, `MEIYE_RELEASE_STORE_PASSWORD`, `MEIYE_RELEASE_KEY_ALIAS`, `MEIYE_RELEASE_KEY_PASSWORD` | `S07_ANDROID_RELEASE_SIGNING` | Defer until Android release signing work resumes; keep in local/CI signing secret store only. |

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

Run the backend-only checks first:

```bash
corepack pnpm aliyun:sensitive:blockers:backend
corepack pnpm aliyun:env:checklist
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:rds:migration:evidence:strict
```

Before production deployment can be considered:

```bash
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
