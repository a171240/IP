# APP production-cn action queue

Date: 2026-06-24

This file is a value-free operator queue derived from:

```bash
corepack pnpm aliyun:cloud-actions:package -- --markdown /tmp/meiye-cloud-actions-package-current.md
```

It records what can be prepared next, what is still blocked, and which local evidence fields must be updated after an authorized external action. It does not authorize Aliyun purchase, cloud mutation, WeChat Open Platform mutation, secret import, image push, deployment, or git push.

## Current Verdict

Production-cn cannot be deployed now.

Current gate:

```text
canDeployNow=false
productionReady=false
cloudConfirmationsReady=0/7
operatorTasksReady=1/9
requiredEnv=24/26
requiredBlocking=WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
resourceEvidenceReady=0/7
strictReadonlyInventoryReady=true
cloudInventoryReadyLocalOperations=9/9
cloudInventoryExecutedCommandResults=12/12
mutationPerformedCommandResults=0
```

The read-only CloudShell inventory is already strict-ready. That evidence proves current resource state only; it does not replace cloud confirmations, ACR image publish evidence, secret import evidence, or production deploy authorization.

## Can Start After Action-Time Confirmation

These are the only Aliyun console tasks that can be started next, and each still requires explicit action-time confirmation.

### C02_ACR_IMAGE_AND_PULL

Current scope: purchase and repository only.

Authorization phrase:

```text
Authorize purchase/confirmation of the ACR Enterprise instance and base image repository information; do not run docker login/push and do not record registry password.
```

Allowed in this current step:

```text
ACR Enterprise Economic
region=cn-hangzhou
term=1 month
quoted price=CNY 117.00
repository=meiye-huajing-app-api
record non-secret registry host and namespace
```

Write back only non-secret evidence:

```text
deploy/aliyun-production-cn.image-publish.local.json -> acr.confirmed=true
deploy/aliyun-production-cn.image-publish.local.json -> acr.registryHost=<actual cn-hangzhou aliyuncs.com host>
deploy/aliyun-production-cn.image-publish.local.json -> acr.namespace=<actual namespace>
```

Verify:

```bash
corepack pnpm aliyun:image:plan
```

Deferred to a separate later authorization:

```text
P04_ACR_IMAGE_AND_PULL
docker login
docker push
remote image digest
runtime.remoteImageConfigured=true
runtime.imagePullConfigured=true
SAE image pull credential configuration
```

### C05_OSS_AUDIO_RAM_STS

Current scope: OSS runtime access closure.

Authorization phrase:

```text
Authorize confirmation of the OSS audio bucket, CORS, and least-privilege RAM/STS or runtime role; secrets must enter only Aliyun controlled secret env.
```

Already observed as partial evidence:

```text
bucket=meiye-huajing-service-records-production-cn
region=oss-cn-hangzhou
acl=private
CORS origins include https://api-cn.ipgongchang.xin and https://assets-cn.ipgongchang.xin
CORS methods include GET, POST, PUT, HEAD
RAM policy MeiYeHuajingServiceRecordsOssPolicy exists
AttachmentCount=0
```

Missing closure evidence:

```text
ramLeastPrivilege=true
runtime role or restricted RAM/STS injection path selected
serviceRecordPrefix=service-records/production-cn
confirmed=true
```

Write back only non-secret evidence:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS, Secrets Manager, or SAE secret env only
```

Verify:

```bash
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
```

Post-deploy service-record upload smoke is required later; it cannot be proven before the API is deployed.

## External App Prerequisites

These are outside Aliyun and still require action-time confirmation.

```text
P01_WECHAT_OPEN_MOBILE_APP
  Create or complete the WeChat Open Platform mobile app "美业话镜" and submit for review.
  Do not read or output AppSecret.

P10_ANDROID_RELEASE_SIGNING
  Use controlled Android release keystore to build/sign the release artifact and read the WeChat Android app signature.
  Do not output keystore password or store password.

P02_APPLE_TEAM_ID
  Read the Apple Developer Team ID and import only as plain env for AASA.
```

Current WeChat state:

```text
accountVerified=true
mobileAppCreated=false
mobileAppSubmitted=false
reviewStatus=not_started
mobileAppIdReady=false
mobileAppSecretReady=false
miniProgramCredentialsReusableForAppLogin=false
```

## Blocked Until Dependencies Close

```text
C01_SAE_RUNTIME
  depends on C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS, C06_ENV_IMPORT

C03_API_DOMAIN_HTTPS_ICP
  depends on C01_SAE_RUNTIME

C04_ASSET_DOMAIN_HTTPS_ICP
  depends on C05_OSS_AUDIO_RAM_STS

C06_ENV_IMPORT
  depends on C05_OSS_AUDIO_RAM_STS and WeChat Open Platform mobile app credentials

C07_SLS_ALERTS
  depends on C01_SAE_RUNTIME
```

## Strict Verification Order

After any authorized external action, run the relevant checks in this order:

```bash
corepack pnpm aliyun:cloud:access
corepack pnpm aliyun:cloud:inventory-results:strict
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

## Forbidden Without Fresh Confirmation

```text
Do not purchase ACR or any paid resource.
Do not create or modify SAE, SLS, OSS, RAM, KMS, Secrets Manager, DNS, certificate, CDN, or public ingress.
Do not read, copy, paste, import, or output AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, cookie, or Supabase service role key.
Do not run docker login or docker push.
Do not deploy production-cn.
Do not modify production DNS.
Do not git push.
Do not create the WeChat Open Platform mobile app unless the user explicitly confirms at action time.
```

## Current Blockers

```text
requiredEnv:WECHAT_OPEN_APP_ID
requiredEnv:WECHAT_OPEN_APP_SECRET
blockedConsoleTask:C01_SAE_RUNTIME
blockedConsoleTask:C03_API_DOMAIN_HTTPS_ICP
blockedConsoleTask:C04_ASSET_DOMAIN_HTTPS_ICP
blockedConsoleTask:C06_ENV_IMPORT
blockedConsoleTask:C07_SLS_ALERTS
```
