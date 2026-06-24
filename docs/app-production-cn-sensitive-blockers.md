# APP production-cn sensitive blockers

Date: 2026-06-24

This file is a value-free handoff for credential, password, token, paid-purchase, and controlled-identifier blockers. It is derived from:

```bash
corepack pnpm aliyun:sensitive:blockers
```

It records variable names, owners, allowed destinations, and forbidden storage locations only. It does not contain or request any secret value.

## Current Verdict

Production-cn cannot be deployed now.

Current sensitive gate:

```text
total=7
ready=0
blocked=7
blockedCredentialCount=8
readySecretEnvVariableCount=17
canCodexProceedWithoutUser=false
actionTimeConfirmationRequired=true
```

Blocked credential or controlled identifier names:

```text
ALIYUN_OSS_SECURITY_TOKEN
APPLE_TEAM_ID
MEIYE_RELEASE_KEY_ALIAS
MEIYE_RELEASE_KEY_PASSWORD
MEIYE_RELEASE_STORE_FILE
MEIYE_RELEASE_STORE_PASSWORD
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
```

Ready locally, but still requiring controlled Aliyun secret-env import:

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

## User-Intervention Groups

### S01_WECHAT_OPEN_APP_LOGIN

Type: external credential after review.

Owner: user / WeChat Open Platform operator.

Obtain from:

```text
微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
```

Variables:

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
WECHAT_OPEN_APP_REVIEW_STATUS
```

Write targets:

```text
WECHAT_OPEN_APP_ID -> Aliyun SAE plain env
WECHAT_OPEN_APP_SECRET -> Aliyun KMS / Secrets Manager / SAE secret env
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform
```

Unblock condition:

```text
reviewStatus=approved
mobileAppCreated=true
mobileAppSubmitted=true
WECHAT_OPEN_APP_ID ready
WECHAT_OPEN_APP_SECRET ready
```

The mini-program credentials `WECHAT_MINI_APPID`, `WECHAT_MINI_SECRET`, and `WECHAT_LOGIN_SECRET` do not unblock APP WeChat login.

### S02_APPLE_TEAM_ID

Type: external controlled identifier.

Owner: Apple Developer / iOS release operator.

Obtain from:

```text
Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID
```

Variable:

```text
APPLE_TEAM_ID
```

Write targets:

```text
APPLE_TEAM_ID -> Aliyun SAE plain env
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence
```

Do not guess this value. It must match the App ID for `com.ipgongchang.meiyehuajing`.

### S03_ACR_PAID_PURCHASE

Type: paid purchase confirmation.

Owner: user / Aliyun ACR operator.

Obtain from:

```text
阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
```

Current purchase candidate:

```text
ACR Enterprise Economic
region=cn-hangzhou
term=1 month
quoted price=CNY 117.00
```

Write target:

```text
deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence
```

Do not click purchase until the user confirms the amount and spec at action time.

### S04_ACR_REGISTRY_AUTH

Type: registry password or runtime pull secret.

Owner: Aliyun ACR / SAE operator.

Obtain from:

```text
阿里云控制台 -> ACR 命名空间/镜像仓库
SAE 应用 -> 镜像拉取配置
```

Write targets:

```text
deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields
SAE runtime image pull credentials -> Aliyun runtime secret settings only
```

Unblock condition:

```text
imagePushed=true
digestVerified=true
runtime.remoteImageConfigured=true
runtime.imagePullConfigured=true
```

Do not write registry username/password, RAM Secret, or token into JSON, Markdown, Docker image, shell history, or git.

### S05_OSS_RAM_SECRET_OR_STS

Type: RAM secret or STS import.

Owner: Aliyun OSS / RAM operator.

Obtain from:

```text
阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager
```

Variables:

```text
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
ALIYUN_OSS_SECURITY_TOKEN
```

Write targets:

```text
ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS / Secrets Manager / SAE secret env
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
```

Unblock condition:

```text
oss.ramLeastPrivilege=true
secret or STS token injected only through Aliyun controlled secret env
```

### S06_READY_SENSITIVE_ENV_IMPORT

Type: ready sensitive environment variable import.

Owner: Aliyun runtime / secret operator.

Obtain from:

```text
existing Vercel production / Supabase / Aliyun Bailian / DeepSeek / Volcengine / WeChat mini-program consoles
```

Write targets:

```text
SAE plain env for non-secret identifiers only
KMS / Secrets Manager / SAE secret env for secret or connection values
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
```

Unblock condition:

```text
envImport.confirmed=true
envImport.secretNotInImage=true
```

The values themselves must be imported only during an authorized cloud action. Reports and local docs should list names only.

### S07_ANDROID_RELEASE_SIGNING

Type: Android keystore password or signature.

Owner: Android release operator / WeChat Open Platform operator.

Obtain from:

```text
Android release keystore management location / CI Secret Store
微信开放平台 -> 移动应用 -> Android 应用签名
```

Variables:

```text
MEIYE_RELEASE_STORE_FILE
MEIYE_RELEASE_STORE_PASSWORD
MEIYE_RELEASE_KEY_ALIAS
MEIYE_RELEASE_KEY_PASSWORD
```

Write targets:

```text
MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> local or CI controlled signing secret store
微信开放平台 -> 移动应用 -> Android 应用签名
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured
```

Unblock condition:

```text
assembleRelease succeeds
release artifact is not signed with debug.keystore
WeChat Open Platform records release signing evidence
androidConfigured=true
```

Do not use `debug.keystore`. Do not write the keystore file, store password, key password, certificate private key, or WeChat AppSecret into JSON, Markdown, Docker image, or git.

## Value Handling Rules

```text
blockedCredentialNames only list missing names, not values.
readySecretEnvVariableNames means the local value is ready but must be imported through KMS / Secrets Manager / SAE secret env.
AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, keystore password, and Supabase service role key cannot be written into JSON, Markdown reports, Docker images, or git.
```

## Verification Commands

```bash
corepack pnpm aliyun:sensitive:blockers
corepack pnpm aliyun:env:checklist
corepack pnpm aliyun:readiness
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

## Forbidden Without Fresh Confirmation

```text
Do not read or output WECHAT_OPEN_APP_SECRET.
Do not paste AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, cookie, Supabase service role key, store password, key password, or certificate private key into any report.
Do not generate or use Android release signing material without action-time authorization.
Do not buy ACR, create secrets, import env values, run docker login/push, deploy production-cn, or git push.
```
