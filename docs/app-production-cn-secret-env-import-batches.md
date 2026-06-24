# APP production-cn secret env import batches

Date: 2026-06-24

This file is a value-free import batching guide derived from:

```bash
corepack pnpm aliyun:sensitive:blockers
```

It lists variable names, owners, and allowed import targets only. It does not contain secret values and does not authorize Aliyun env import.

## Current Verdict

Production-cn cannot be deployed now.

Current sensitive gate:

```text
blockedCredentialCount=8
readySecretEnvVariableCount=17
readySecretEnvVariableGroupCount=9
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
```

## Not Yet Importable

These names are still blocked by external review, controlled identifier lookup, release signing material, or controlled STS/token decisions. Do not mark them ready until their owner action is complete.

| Variable | Blocking action | Owner | Import target after unblock |
| --- | --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | `S01_WECHAT_OPEN_APP_LOGIN` | WeChat Open Platform operator | Aliyun SAE plain env |
| `WECHAT_OPEN_APP_SECRET` | `S01_WECHAT_OPEN_APP_LOGIN` | WeChat Open Platform operator | Aliyun KMS / Secrets Manager / SAE secret env |
| `APPLE_TEAM_ID` | `S02_APPLE_TEAM_ID` | Apple Developer / iOS release operator | Aliyun SAE plain env |
| `ALIYUN_OSS_SECURITY_TOKEN` | `S05_OSS_RAM_SECRET_OR_STS` | Aliyun OSS/RAM operator | Aliyun KMS / Secrets Manager / SAE secret env |
| `MEIYE_RELEASE_STORE_FILE` | `S07_ANDROID_RELEASE_SIGNING` | Android release operator | Local or CI Android signing secret store |
| `MEIYE_RELEASE_STORE_PASSWORD` | `S07_ANDROID_RELEASE_SIGNING` | Android release operator | Local or CI Android signing secret store |
| `MEIYE_RELEASE_KEY_ALIAS` | `S07_ANDROID_RELEASE_SIGNING` | Android release operator | Local or CI Android signing secret store |
| `MEIYE_RELEASE_KEY_PASSWORD` | `S07_ANDROID_RELEASE_SIGNING` | Android release operator | Local or CI Android signing secret store |

## Ready Secret Env Import Batches

These variables are ready by name, but their values still must be imported only during an authorized secret-env action. They must not be written to JSON, Markdown, Docker images, app bundles, shell history, or git.

| Batch | Owner | Count | Import target | Variable names |
| --- | --- | ---: | --- | --- |
| `bridge_database` | Vercel/Supabase operator | 3 | Aliyun KMS / Secrets Manager / SAE secret env | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `app_auth` | Backend release operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `WECHAT_LOGIN_SECRET` |
| `aliyun_oss` | Aliyun OSS/RAM operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET` |
| `bailian_asr` | Aliyun Bailian / DashScope operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `DASHSCOPE_API_KEY` |
| `deepseek_summary` | DeepSeek/API operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `DEEPSEEK_API_KEY`, `SERVICE_RECORD_DEEPSEEK_API_KEY` |
| `volc_speech` | Volcengine speech operator | 3 | Aliyun KMS / Secrets Manager / SAE secret env | `VOLC_SPEECH_ACCESS_TOKEN`, `VOLC_SPEECH_APP_ID`, `VOLC_SPEECH_SECRET_KEY` |
| `backend_ops` | Backend ops / admin | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `ADMIN_USER_IDS`, `CREDITS_IP_SALT` |
| `legacy_content_provider` | Legacy content provider/API operator | 1 | Aliyun KMS / Secrets Manager / SAE secret env | `APIMART_API_KEY` |
| `mini_program_compat` | WeChat mini-program operator | 2 | Aliyun KMS / Secrets Manager / SAE secret env | `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET` |

## APP WeChat Login Boundary

`WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` may remain necessary for old mini-program or compatibility paths. They do not unblock native APP WeChat login.

Native APP WeChat login still requires:

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
WECHAT_OPEN_APP_REVIEW_STATUS=approved
```

`WECHAT_OPEN_APP_SECRET` must be imported only through Aliyun KMS, Secrets Manager, or SAE secret env after the WeChat Open Platform mobile app is created and approved.

## Import Evidence To Record

After an authorized import action, record only non-secret evidence:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.importedAt
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.evidence
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.confirmed=true
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport.secretNotInImage=true
```

## Verification After Import

Run:

```bash
corepack pnpm aliyun:env:checklist
corepack pnpm aliyun:sensitive:blockers
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

The import is not production-ready until `envImport.confirmed=true`, `envImport.secretNotInImage=true`, and the strict gates pass.

## Forbidden

```text
Do not output, paste, or commit secret values.
Do not import env values without action-time authorization.
Do not store AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, Supabase service role key, Android keystore password, or certificate private key in JSON, Markdown, Docker images, app bundles, shell history, or git.
Do not deploy production-cn after env import alone; cloud confirmations and image publish evidence must also pass strict gates.
```
