# APP production-cn action authorization packets

Date: 2026-06-24

This file is derived from:

```bash
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:completion:audit
```

It records the action-time authorization packets required before APP production-cn can be deployed. It is local evidence only. It does not authorize Aliyun purchase, cloud mutation, WeChat Open Platform mutation, Android signing secret access, Apple Developer changes, secret import, image push, production deployment, mini-program upload, app store submission, or git push.

## Current Verdict

Production-cn cannot be deployed now.

Current gate:

```text
canDeployNow=false
canCodexProceedWithoutUser=[]
authorizationPackets=10
userActionReady=0/10
cloudResourceReady=0/7
resourceEvidenceReady=0/7
blockedCredentialCount=8
readySecretEnvVariableCount=17
mutationPerformed=false
containsValues=false
secretLeakCheck.ok=true
```

Required APP login blockers:

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
```

The WeChat mini-program AppID/Secret cannot be reused as APP login credentials. APP login needs a WeChat Open Platform mobile application that is created, configured, reviewed, and approved.

## Packets That Can Start After Fresh Confirmation

These packets have no packet dependency, but each still needs explicit action-time confirmation before any external action.

| Packet | Action | Scope | Write targets | Verification |
| --- | --- | --- | --- | --- |
| `P01_WECHAT_OPEN_MOBILE_APP` | `U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE` | Create or complete the WeChat Open Platform mobile application and submit review. Do not read or output AppSecret. | `WECHAT_OPEN_APP_ID -> SAE plain env`; `WECHAT_OPEN_APP_SECRET -> KMS/Secrets Manager/SAE secret env`; `.local.json -> items.wechatOpenPlatform` | `corepack pnpm aliyun:wechat-state:test`; `corepack pnpm aliyun:readiness` |
| `P10_ANDROID_RELEASE_SIGNING` | `U10_ANDROID_RELEASE_SIGNING` | Use controlled Android release signing, build the release artifact, and read the WeChat Android app signature. Do not output keystore passwords. | signing secret store; WeChat Open Platform Android signature; `.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured` | `./gradlew assembleRelease`; `apksigner verify --print-certs`; `corepack pnpm aliyun:wechat-open:package`; `corepack pnpm aliyun:app-native:check` |
| `P02_APPLE_TEAM_ID` | `U02_APPLE_TEAM_ID` | Read Apple Developer Team ID for iOS Universal Link AASA. Do not guess it. | `APPLE_TEAM_ID -> SAE plain env` | `corepack pnpm aliyun:aasa:check`; `corepack pnpm aliyun:app-native:check` |
| `P03_ACR_PURCHASE` | `U03_ACR_PURCHASE_CONFIRMATION` | Confirm ACR Enterprise Economic purchase candidate, cn-hangzhou, 1 month, quoted amount CNY 117.00. | `deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence` | `corepack pnpm aliyun:image:plan` |
| `P05_OSS_RAM_STS` | `U05_OSS_RAM_OR_STS` | Confirm OSS audio bucket, CORS, and least-privilege RAM/STS or runtime role. | `.local.json -> items.oss`; OSS AccessKey/STS material only through KMS/Secrets Manager/SAE secret env | `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:health:smoke` |

## Packets Blocked By Dependencies

These packets must not be started until their dependencies are closed and the user gives fresh action-time confirmation.

| Packet | Action | Depends on | Why blocked now |
| --- | --- | --- | --- |
| `P04_ACR_IMAGE_AND_PULL` | `U04_ACR_RUNTIME_AUTH` | `P03_ACR_PURCHASE` | ACR instance/repository purchase confirmation is not closed. Do not run docker login/push or configure SAE pull credentials yet. |
| `P06_ENV_IMPORT` | `U06_ENV_IMPORT` | `P01_WECHAT_OPEN_MOBILE_APP`, `P02_APPLE_TEAM_ID`, `P05_OSS_RAM_STS` | WeChat mobile APP credentials, Apple Team ID, and OSS/RAM/STS closure are still missing. Do not import env values yet. |
| `P07_DOMAIN_DNS_HTTPS` | `U07_DOMAIN_DNS_HTTPS_ICP` | `P08_SAE_RUNTIME_SLS` | There is no confirmed Aliyun runtime public entry for DNS/HTTPS to target. |
| `P08_SAE_RUNTIME_SLS` | `U08_SAE_RUNTIME_AND_SLS` | `P03_ACR_PURCHASE`, `P04_ACR_IMAGE_AND_PULL`, `P05_OSS_RAM_STS`, `P06_ENV_IMPORT` | Runtime depends on image registry/pull, OSS/RAM/STS, and env import evidence. Do not create or mutate SAE/SLS here without confirmation. |
| `P09_PRODUCTION_DEPLOY` | `U09_DEPLOY_AUTHORIZATION` | `P01_WECHAT_OPEN_MOBILE_APP`, `P10_ANDROID_RELEASE_SIGNING`, `P02_APPLE_TEAM_ID`, `P03_ACR_PURCHASE`, `P04_ACR_IMAGE_AND_PULL`, `P05_OSS_RAM_STS`, `P06_ENV_IMPORT`, `P07_DOMAIN_DNS_HTTPS`, `P08_SAE_RUNTIME_SLS` | All strict cloud, image, domain, readiness, and postdeploy gates must pass first. This packet does not include git push, mini-program upload, or app store submission. |

## Current Resource Evidence Blockers

```text
R01_SAE_RUNTIME
R02_ACR_IMAGE_REGISTRY
R03_API_DOMAIN_HTTPS
R04_ASSET_DOMAIN_HTTPS
R05_OSS_AUDIO_STORAGE
R06_ENV_IMPORT
R07_SLS_ALERTS
```

Partially observed but not ready:

```text
R05_OSS_AUDIO_STORAGE
R07_SLS_ALERTS
```

## Secret And Credential Boundary

Blocked credential names:

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

Ready secret env variable names observed locally, but not imported to production-cn:

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

These names are not values. No secret value belongs in Markdown, JSON, Docker images, shell history, app bundles, or git.

## Verification Order After Any Authorized Action

Run the narrow check for the completed packet first, then re-run the overall authorization and completion gates:

```bash
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:resources:matrix
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
```

Before production deployment can be considered, these strict gates must pass:

```bash
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:predeploy
```

## Forbidden Without Fresh Confirmation

```text
Do not purchase ACR or any paid resource.
Do not create or modify SAE, SLS, OSS, RAM, KMS, Secrets Manager, DNS, certificate, CDN, or public ingress.
Do not read, copy, paste, import, or output AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, cookie, certificate private key, Android keystore password, or Supabase service role key.
Do not run docker login or docker push.
Do not deploy production-cn.
Do not git push.
Do not create the WeChat Open Platform mobile app, submit app review, or read AppSecret unless the user explicitly confirms that exact action at action time.
```
