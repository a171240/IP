# APP production-cn credential acquisition runbook

Date: 2026-06-24

This runbook is derived from:

```bash
corepack pnpm aliyun:sensitive:blockers
corepack pnpm aliyun:env:source-map -- --skip-vercel-env-coverage
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:completion:audit
```

It answers where each missing credential, controlled identifier, password, token, or paid confirmation comes from, where it may be imported, and how to verify it. It does not contain secret values and does not authorize any external write action.

## Current Backend-Only Scope

As of 2026-06-25, the active target is `backend_aliyun_only`: only the Aliyun backend is being completed now. WeChat Open Platform mobile app credentials, Android release signing, and Apple Team ID are deferred until after the Aliyun backend is online.

Use the backend-only handoffs for the current work:

```bash
corepack pnpm aliyun:sensitive:blockers:backend
node scripts/summarize-aliyun-user-action-brief.mjs --backend-only
```

Current backend-only credential gate:

```text
blockedCredentialCount=2
blockedCredentialNames=ALIYUN_OSS_SECURITY_TOKEN, DATABASE_URL_CN
readySecretEnvVariableCount=17
deferredAppLaunchSensitiveActionIds=S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
```

Backend-only docs:

```text
docs/app-production-cn-backend-sensitive-blockers.md
docs/app-production-cn-backend-user-action-brief.md
docs/app-production-cn-backend-secret-env-import-batches.md
```

## Current Verdict

Production-cn cannot be deployed now.

Full App launch credential gate, including deferred WeChat/Android/Apple launch items:

```text
blockedCredentialCount=9
readySecretEnvVariableCount=17
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
canDeployNow=false
```

阿里云不是 APP 的创建平台。阿里云只负责 APP 后端容器、域名、OSS、日志和运行时环境变量。原生 APP 微信登录所需的 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 来自微信开放平台移动应用，不来自阿里云，也不能用小程序 AppID/Secret 替代。

## Action-Time Rule

If a console is already logged in, the operator may navigate and inspect non-secret state. The operator still must not click purchase, create resources, submit review, import secrets, run docker login/push, read AppSecret, read keystore passwords, deploy production-cn, or git push without fresh action-time confirmation for that exact action.

## Credentials And Controlled Actions

| ID | What is needed | Obtain from | Where it may go | Verify | Hard boundary |
| --- | --- | --- | --- | --- | --- |
| `S01_WECHAT_OPEN_APP_LOGIN` | `WECHAT_OPEN_APP_ID`, `WECHAT_OPEN_APP_SECRET`, `WECHAT_OPEN_APP_REVIEW_STATUS` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | AppID -> Aliyun SAE plain env; AppSecret -> KMS/Secrets Manager/SAE secret env; non-secret evidence -> `items.wechatOpenPlatform` | `corepack pnpm aliyun:wechat-state:test`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:app-api:smoke`; `corepack pnpm aliyun:readiness` | Do not use mini-program credentials. Do not output or store AppSecret in Markdown, JSON, Docker images, app bundles, or git. |
| `S07_ANDROID_RELEASE_SIGNING` | `MEIYE_RELEASE_STORE_FILE`, `MEIYE_RELEASE_STORE_PASSWORD`, `MEIYE_RELEASE_KEY_ALIAS`, `MEIYE_RELEASE_KEY_PASSWORD`, WeChat Android release signature evidence | Local or CI Android release signing secret store; WeChat Open Platform -> mobile app -> Android signature | Signing material -> local/CI signing secret store only; signature evidence -> WeChat Open Platform and non-secret `.local.json` fields | `cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew assembleRelease`; `ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk`; `corepack pnpm aliyun:wechat-open:package`; `corepack pnpm aliyun:app-native:check` | Do not use `debug.keystore`. Do not commit keystore files or passwords. |
| `S02_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | Apple Developer -> Membership or Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | Aliyun SAE plain env; AASA / iOS evidence handles | `corepack pnpm aliyun:aasa:check`; `corepack pnpm aliyun:app-native:check` | Do not guess the Team ID. Do not create certificates or provisioning profiles in this step. |
| `S03_ACR_PAID_PURCHASE` | ACR Enterprise Economic purchase confirmation, registry host, namespace, repository | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | Non-secret purchase and repository evidence -> `deploy/aliyun-production-cn.image-publish.local.json` | `corepack pnpm aliyun:image:plan`; `corepack pnpm aliyun:resources:matrix`; `corepack pnpm aliyun:user:actions` | Do not click purchase until amount, region, edition, and term are confirmed at action time. Current candidate is cn-hangzhou, 1 month, CNY 117.00. |
| `S04_ACR_REGISTRY_AUTH` | Registry push and SAE pull credential path | 阿里云控制台 -> ACR namespace/repository; SAE app -> image pull configuration | Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings only; non-secret digest evidence -> image-publish local file | `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:container:smoke` | Do not store registry username/password, RAM Secret, or token in files, images, reports, shell history, or git. |
| `S05_OSS_RAM_SECRET_OR_STS` | `ALIYUN_OSS_SECURITY_TOKEN` if STS is selected; OSS bucket/CORS/prefix/RAM least privilege closure | 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE runtime identity / Secrets Manager | OSS AccessKey/STS material -> KMS/Secrets Manager/SAE secret env only; non-secret evidence -> `items.oss` | `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:health:smoke` | Do not create commit-ready long-lived plaintext secrets. Do not download OSS object contents. |
| `S08_ALIYUN_RDS_DATABASE_URL` | `DATABASE_URL_CN` plus RDS PostgreSQL schema/data/API smoke/rollback migration evidence | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | `DATABASE_URL_CN` -> KMS/Secrets Manager/SAE secret env only; non-secret migration evidence -> `rds-migration.local.json` and `items.envImport` | `corepack pnpm aliyun:rds:migration:evidence:strict`; `corepack pnpm aliyun:sensitive:blockers:backend`; `corepack pnpm aliyun:backend-cn:status`; `corepack pnpm aliyun:completion:audit` | Do not store DATABASE_URL_CN, database password, dump contents, customer data, Supabase service role key, AccessKeySecret, token, reports, images, shell history, or git. |
| `S06_READY_SENSITIVE_ENV_IMPORT` | Ready local/Vercel/Supabase/API provider env values imported into Aliyun runtime | Existing Vercel production, Supabase, Aliyun Bailian/DashScope, DeepSeek, Volcengine, WeChat mini-program consoles | Plain env only for public identifiers; KMS/Secrets Manager/SAE secret env for secret values; non-secret evidence -> `items.envImport` | `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:sensitive:blockers`; `corepack pnpm aliyun:readiness:cloud-ready` | Do not paste any value into reports. Do not import WECHAT_OPEN_APP_ID/SECRET before the WeChat mobile app is approved and separately authorized. |

## Ready Env Names Still Requiring Controlled Import

These names are ready by local/Vercel-side evidence, but their values still must be imported only during an authorized secret-env action:

```text
ADMIN_USER_IDS
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
APIMART_API_KEY
CREDITS_IP_SALT
DASHSCOPE_API_KEY
DEEPSEEK_API_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
SERVICE_RECORD_DEEPSEEK_API_KEY
SUPABASE_SERVICE_ROLE_KEY
VOLC_SPEECH_ACCESS_TOKEN
VOLC_SPEECH_APP_ID
VOLC_SPEECH_SECRET_KEY
WECHAT_LOGIN_SECRET
WECHAT_MINI_APPID
WECHAT_MINI_SECRET
```

`WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` are compatibility inputs for existing mini-program or legacy login paths. They do not unblock native APP WeChat login.

## What Can Be Started Next

After fresh action-time confirmation, these can be started because they have no packet dependency:

```text
P01_WECHAT_OPEN_MOBILE_APP
P10_ANDROID_RELEASE_SIGNING
P02_APPLE_TEAM_ID
P03_ACR_PURCHASE
P05_OSS_RAM_STS
P11_ALIYUN_RDS_DATA_MIGRATION
```

These are still dependency-blocked:

```text
P04_ACR_IMAGE_AND_PULL
P06_ENV_IMPORT
P07_DOMAIN_DNS_HTTPS
P08_SAE_RUNTIME_SLS
P09_PRODUCTION_DEPLOY
```

## Evidence To Record After Authorized Actions

Only non-secret evidence may be written:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields
release manifest -> action name, evidence handle, verification command, result
```

Valid evidence handles include console path, screenshot ID, ticket ID, resource name, digest, boolean readiness field, or timestamp. Secret values, passwords, tokens, AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, certificate private key, Android keystore password, and Supabase service role key values are forbidden.

## Verification After Any Credential Action

Run the narrow verifier first, then the full gate:

```bash
corepack pnpm aliyun:sensitive:blockers
corepack pnpm aliyun:env:source-map -- --skip-vercel-env-coverage
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:completion:audit
```

Before production deployment can be considered:

```bash
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:predeploy
```
