# APP production-cn evidence writeback gaps

Date: 2026-06-24

This file is a value-free snapshot of the local evidence writeback gate. It is derived from:

```bash
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
```

It records only file readiness, gap counts, variable names, packet IDs, resource IDs, and verification commands. It does not authorize Aliyun purchase, cloud mutation, WeChat Open Platform mutation, secret import, image push, production deployment, or git push.

## Current Verdict

Production-cn cannot be deployed now.

Current evidence gate:

```text
canDeployNow=false
verdict=blocked
evidenceWritebackReady=1/4
files=4
readyFiles=1
totalGaps=56
rdsMigrationGaps=17
cloudInventoryResultGaps=0
cloudConfirmationGaps=27
imagePublishGaps=12
blockedCredentialCount=8
readySecretEnvVariableCount=17
resourceEvidenceReady=0/7
```

The read-only inventory results are now strict-ready, but that is only one of the four local evidence files. It does not replace RDS migration closure, cloud confirmations, ACR image publish evidence, WeChat Open Platform mobile-app credentials, Android release signing evidence, or secret-env import evidence.

## Evidence Files

| Evidence file | Current state | Gaps | Meaning |
| --- | --- | ---: | --- |
| `deploy/aliyun-production-cn.cloud-inventory-results.local.json` | ready | 0 | Read-only inventory summary is present and strict-ready. |
| `deploy/aliyun-production-cn.rds-migration.local.json` | not ready | 17 | RDS PostgreSQL instance, DATABASE_URL_CN secret import, schema/data migration, RDS APP API smoke, and rollback validation are not closed. |
| `deploy/aliyun-production-cn.cloud-confirmations.local.json` | not ready | 27 | Cloud runtime, domain, OSS, WeChat Open Platform, env import, and SLS confirmations are not closed. |
| `deploy/aliyun-production-cn.image-publish.local.json` | not ready | 12 | ACR registry, remote image digest, and SAE image-pull runtime evidence are not closed. |

## Required Authorization Packets

These packets are still required before the 56 gaps can close:

```text
P11_ALIYUN_RDS_DATA_MIGRATION
P08_SAE_RUNTIME_SLS
P07_DOMAIN_DNS_HTTPS_ICP
P05_OSS_RAM_STS
P10_ANDROID_RELEASE_SIGNING
P01_WECHAT_OPEN_MOBILE_APP
P02_APPLE_TEAM_ID
P06_ENV_IMPORT
P03_ACR_PURCHASE
P04_ACR_IMAGE_AND_PULL
```

The immediate cloud-side packets that can be prepared next still require action-time confirmation:

```text
P03_ACR_PURCHASE
P05_OSS_RAM_STS
P11_ALIYUN_RDS_DATA_MIGRATION
```

The immediate non-Aliyun APP release packets also require action-time confirmation:

```text
P01_WECHAT_OPEN_MOBILE_APP
P10_ANDROID_RELEASE_SIGNING
P02_APPLE_TEAM_ID
```

## Resource Evidence Closure

Current resource evidence is not ready:

```text
resourceEvidenceReady=0/7
blockedResourceEvidenceIds=R01_SAE_RUNTIME,R02_ACR_IMAGE_REGISTRY,R03_API_DOMAIN_HTTPS,R04_ASSET_DOMAIN_HTTPS,R05_OSS_AUDIO_STORAGE,R06_ENV_IMPORT,R07_SLS_ALERTS
partiallyObservedResourceEvidenceIds=R05_OSS_AUDIO_STORAGE,R07_SLS_ALERTS
```

Interpretation:

```text
R01_SAE_RUNTIME is blocked until SAE runtime, health check, and runtime evidence are confirmed.
R02_ACR_IMAGE_REGISTRY is blocked until ACR purchase/repository, remote image, digest, and pull evidence are confirmed.
R03_API_DOMAIN_HTTPS is blocked until api-cn DNS, HTTPS, ICP, and health evidence are confirmed.
R04_ASSET_DOMAIN_HTTPS is blocked until assets-cn DNS, HTTPS, ICP, and OSS-backed asset evidence are confirmed.
R05_OSS_AUDIO_STORAGE is partial only; bucket observations do not close RAM least privilege or runtime secret/STS injection.
R06_ENV_IMPORT is blocked until production-cn env values are imported into Aliyun runtime secret/plain env with secretNotInImage=true.
R07_SLS_ALERTS is partial only; project/logstore observations do not close health and 5xx alert configuration.
```

## Credential and Secret Boundary

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

Ready locally but still requiring controlled Aliyun secret-env import:

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

The mini-program variables are compatibility inputs for the old mini-program/backend path. They do not replace `WECHAT_OPEN_APP_ID` or `WECHAT_OPEN_APP_SECRET` for APP WeChat login.

RDS production-cn data layer values are controlled separately. `DATABASE_URL_CN`, database passwords, dump contents, customer data, and Supabase service role values must not be written to JSON, Markdown, Docker images, app bundles, shell history, or git. `DATABASE_URL_CN` can only be imported through Aliyun KMS / Secrets Manager / SAE secret env.

## Strict Verification Order

After any authorized external action, rerun:

```bash
corepack pnpm aliyun:cloud:inventory-results:strict
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

The deploy gate remains blocked until the four evidence files are ready and the strict commands pass.

## Forbidden Without Fresh Confirmation

```text
Do not purchase ACR or any paid resource.
Do not create or modify SAE, SLS, OSS, RAM, KMS, Secrets Manager, DNS, certificate, CDN, or public ingress.
Do not create or submit the WeChat Open Platform mobile app.
Do not read, copy, paste, import, or output AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, cookie, or Supabase service role key.
Do not read, copy, paste, import, or output DATABASE_URL_CN, database passwords, dump contents, or customer data into local reports.
Do not run docker login or docker push.
Do not import production-cn env values.
Do not build/sign release artifacts with keystore material.
Do not deploy production-cn.
Do not git push.
```
