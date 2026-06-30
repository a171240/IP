# APP production-cn credential acquisition runbook

Date: 2026-07-01

This runbook records the conservative `backend_aliyun_only` credential and controlled-action boundary for the current production-cn docs-tools gate. It is aligned with the fixture-backed evidence writeback state:

```text
canDeployNow=false
evidenceWritebackReady=1/4
totalGaps=40
rdsMigrationGaps=16
cloudInventoryResultGaps=0
cloudConfirmationGaps=16
imagePublishGaps=8
```

It does not contain secret values and does not authorize cloud mutation, credential import, Docker push, DNS changes, deployment, upload, git push, or Supabase production writes.

## Current Backend-Only Scope

The active target remains `backend_aliyun_only`: only the Aliyun backend is being prepared now. WeChat Open Platform mobile app credentials, Android release signing, and Apple Team ID remain deferred until after the Aliyun backend is online.

Use these backend-only handoffs for the current work:

```bash
corepack pnpm aliyun:sensitive:blockers:backend
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:evidence:writeback:backend
node scripts/summarize-aliyun-user-action-brief.mjs --backend-only
```

Current conservative credential gate:

```text
blockedCredentialCount=1
blockedCredentialNames=DATABASE_URL_CN
readySecretEnvVariableCount=17
deferredAppLaunchSensitiveActionIds=S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
```

Do not use a sensitive-only a zero-blocked-credentials sensitive-only snapshot snapshot as deployment proof. The release gate remains blocked until RDS migration evidence, cloud confirmations, image publish/runtime pull evidence, and post-deploy checks are closed.

## 后端-only 动作顺序口径

```text
fixtureReadyEvidenceGroupIds: cloudInventoryResults
nonCredentialCanStartPacketIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
credentialCanStartAfterActionTimeConfirmationIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL
credentialBlockedByDependencyIds: S06_READY_SENSITIVE_ENV_IMPORT
blockedDeploymentGate: backend:supabase / lib/supabase/server.ts requires separate authorization
```

`P00` read-only inventory evidence can be represented by tracked fixtures for static docs. It is not a production deploy authorization and may still need fresh read-only inventory before any real release action.

Short answer for the current backend-only run:

```text
Only missing backend credential/password item: DATABASE_URL_CN.
Where to get it: Aliyun Console -> RDS PostgreSQL -> cn-hangzhou instance -> database/account/connection information, after the RDS instance and database account are created or confirmed.
Where to put it: Aliyun KMS / Secrets Manager / SAE secret env only.
Required before treating it as complete: close RDS schema/data migration, APP API smoke on RDS, rollback validation, and non-secret evidence writeback.
What not to do: do not write DATABASE_URL_CN value, database password, dump contents, Supabase service role key, AccessKeySecret, token, screenshots with values, shell history, JSON, Markdown, Docker image, App bundle, mini-program package, or git.
```

CloudShell is not a credential source. It is only an inventory surface. If CloudShell shows an `开通` or restart instance warning, do not click it unless the user gives action-time authorization for that exact warning, and then run only allowlisted read-only inventory commands.

## Current Verdict

Production-cn cannot be deployed or uploaded now.

Full App launch credential gate, including deferred WeChat/Android/Apple launch items:

```text
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
canDeployNow=false
backendSupabaseGate=blocked_release
```

Aliyun is not the App creation platform. Aliyun only hosts the backend container, domains, OSS, logs, and runtime environment variables. Native App WeChat login requires `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` from WeChat Open Platform mobile app approval; mini-program credentials cannot replace them.

## Action-Time Rule

If a console is already logged in, the operator may inspect non-secret state. The operator still must not click purchase, create resources, submit review, import secrets, run docker login/push, read AppSecret, read keystore passwords, deploy production-cn, upload, git push, or write Supabase production without fresh action-time authorization for that exact action.

CloudShell read-only inventory phrase, only if the inventory must be refreshed:

```text
授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence；不创建业务资源、不购买 ACR、不导入密钥、不部署。
```

## Credentials And Controlled Actions

| ID | What is needed | Obtain from | Where it may go | Verify | Hard boundary |
| --- | --- | --- | --- | --- | --- |
| `S01_WECHAT_OPEN_APP_LOGIN` | `WECHAT_OPEN_APP_ID`, `WECHAT_OPEN_APP_SECRET`, `WECHAT_OPEN_APP_REVIEW_STATUS` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | AppID -> Aliyun SAE plain env; AppSecret -> KMS/Secrets Manager/SAE secret env; non-secret evidence -> `items.wechatOpenPlatform` | `corepack pnpm aliyun:wechat-state:test`; `corepack pnpm aliyun:app-native:check` | Deferred. Do not use mini-program credentials. Do not output or store AppSecret in Markdown, JSON, Docker images, app bundles, or git. |
| `S07_ANDROID_RELEASE_SIGNING` | `MEIYE_RELEASE_STORE_FILE`, `MEIYE_RELEASE_STORE_PASSWORD`, `MEIYE_RELEASE_KEY_ALIAS`, `MEIYE_RELEASE_KEY_PASSWORD`, WeChat Android release signature evidence | Local or CI Android release signing secret store; WeChat Open Platform -> mobile app -> Android signature | Signing material -> local/CI signing secret store only; signature evidence -> WeChat Open Platform and non-secret `.local.json` fields | `./gradlew assembleRelease`; `apksigner verify --print-certs`; `corepack pnpm aliyun:app-native:check` | Deferred. Do not use `debug.keystore`. Do not commit keystore files or passwords. |
| `S02_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | Apple Developer -> Membership or Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | Aliyun SAE plain env; AASA / iOS evidence handles | `corepack pnpm aliyun:aasa:check`; `corepack pnpm aliyun:app-native:check` | Deferred. Do not guess the Team ID. Do not create certificates or provisioning profiles in this step. |
| `S04_ACR_REGISTRY_AUTH` | Registry push and SAE pull credential path | 阿里云控制台 -> ACR namespace/repository; SAE app -> image pull configuration | Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings only; non-secret digest evidence -> image-publish local file | `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:container:smoke` | Do not store registry username/password, RAM Secret, or token in files, images, reports, shell history, or git. |
| `S05_OSS_RAM_SECRET_OR_STS` | `ALIBABA_CLOUD_ROLE_ARN`, `ALIBABA_CLOUD_OIDC_PROVIDER_ARN`, `ALIBABA_CLOUD_OIDC_TOKEN_FILE`; `ALIYUN_OSS_SECURITY_TOKEN` only if STS fallback is selected | 阿里云控制台 -> OSS Bucket / RAM / SAE RRSA/OIDC runtime identity / Secrets Manager | SAE RRSA/OIDC runtime env for non-secret role/provider/file-path inputs; fallback AccessKey/STS material -> KMS/Secrets Manager/SAE secret env only; non-secret evidence -> `items.oss` | `corepack pnpm aliyun:oss:runtime-access:strict`; `corepack pnpm aliyun:cloud:confirmations` | Do not create commit-ready long-lived plaintext secrets. Do not copy OIDC token file contents. Do not download OSS object contents. |
| `S08_ALIYUN_RDS_DATABASE_URL` | `DATABASE_URL_CN` plus RDS PostgreSQL schema/data/API smoke/rollback migration evidence | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | `DATABASE_URL_CN` -> KMS/Secrets Manager/SAE secret env only; non-secret migration evidence -> `rds-migration.local.json` and `items.envImport` | `corepack pnpm aliyun:rds:migration:package`; `corepack pnpm aliyun:rds:migration:evidence:strict`; `corepack pnpm aliyun:backend-cn:status` | Do not store DATABASE_URL_CN, database password, dump contents, customer data, Supabase service role key, AccessKeySecret, token, reports, images, shell history, or git. |
| `S06_READY_SENSITIVE_ENV_IMPORT` | Ready local/Vercel/Supabase/API provider env values imported into Aliyun runtime | Existing Vercel production, Supabase, Aliyun Bailian/DashScope, DeepSeek, Volcengine, WeChat mini-program consoles | Plain env only for public identifiers; KMS/Secrets Manager/SAE secret env for secret values; non-secret evidence -> `items.envImport` | `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:sensitive:blockers`; `corepack pnpm aliyun:readiness:cloud-ready` | Do not paste any value into reports. Do not import WECHAT_OPEN_APP_ID/SECRET before the WeChat mobile app is approved and separately authorized. |

## DATABASE_URL_CN Acquisition Steps

`DATABASE_URL_CN` is still the current backend-only blocked credential. It becomes complete only after the Aliyun RDS PostgreSQL target is real enough to produce a production connection string and the value has been imported directly into the Aliyun controlled secret channel.

Required sequence:

```text
1. Confirm or create an Aliyun RDS PostgreSQL instance in cn-hangzhou.
2. Create or confirm the production database name and least-privilege database account.
3. Close schema inventory and compatibility review before schema apply.
4. Confirm VPC/network access from the SAE runtime path; do not expose a broad public database endpoint unless separately approved.
5. Import the DATABASE_URL_CN value directly into Aliyun KMS / Secrets Manager / SAE secret env.
6. Record only non-secret evidence in deploy/aliyun-production-cn.rds-migration.local.json.
7. Run schema/data migration, APP API smoke on RDS, and rollback validation.
```

Do not count `DATABASE_URL_CN` as solved just because an RDS page is visible or because a fixture names the field. It is solved only when the secret is imported through the Aliyun controlled secret channel and the RDS migration evidence passes strict verification.

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

## Backend-Only Actions That Can Start Next

After fresh action-time confirmation, these backend-only packets can be started because they are current evidence blockers:

```text
P00_ALIYUN_READONLY_INVENTORY_IDENTITY
P04_ACR_IMAGE_AND_PULL
P05_OSS_RAM_STS
P11_ALIYUN_RDS_DATA_MIGRATION
```

`P03_ACR_PURCHASE` is historical purchase evidence and does not authorize any new purchase or deployment. `P00` fixture-backed inventory status is not a release authorization; refresh it only through the read-only action-time rule if live evidence is needed.

These backend packets are still dependency-blocked:

```text
P06_ENV_IMPORT
P07_DOMAIN_DNS_HTTPS
P08_SAE_RUNTIME_SLS
P09_PRODUCTION_DEPLOY
```

Full App launch packets remain deferred until after the Aliyun backend is online:

```text
P01_WECHAT_OPEN_MOBILE_APP
P10_ANDROID_RELEASE_SIGNING
P02_APPLE_TEAM_ID
```

## Evidence To Record After Authorized Actions

Only non-secret evidence may be written:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss / items.envImport / items.runtime / items.slsAlerts / domain items
deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
deploy/aliyun-production-cn.rds-migration.local.json -> RDS PostgreSQL migration non-secret evidence
deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields
release manifest -> action name, evidence handle, verification command, result
```

Valid evidence handles include console path, screenshot ID, ticket ID, resource name, digest, boolean readiness field, or timestamp. Secret values, passwords, tokens, AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, certificate private key, Android keystore password, and Supabase service role key values are forbidden.

## Verification After Any Credential Action

```bash
corepack pnpm aliyun:evidence:writeback:backend
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:blockers:brief:backend
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
```
