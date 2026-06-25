# APP production-cn resource evidence matrix

Date: 2026-06-24

This file is a value-free resource evidence snapshot derived from:

```bash
corepack pnpm aliyun:resources:matrix
```

It records only Aliyun resource IDs, observed readiness, blockers, write targets, and verification commands. It does not authorize resource creation, paid purchase, DNS changes, secret import, image push, deployment, or git push.

Current scope is `backend_aliyun_only`. WeChat Open Platform mobile app, Apple, and Android release-signing variables are deferred until after the Aliyun backend is online; they are not current Aliyun backend blockers.

## Current Verdict

Production-cn cannot be deployed now.

Current resource gate:

```text
total=7
ready=0
blocked=7
resourceEvidenceReady=0/7
cloudConfirmationsTotalBlockers=27
imagePublishTotalBlockers=12
cloudAccessCanReadNow=false
observedReady=0
observedPartial=2
observedBlocked=5
```

Partially observed resources:

```text
R05_OSS_AUDIO_STORAGE
R07_SLS_ALERTS
```

Action-time confirmation is required before mutating or confirming these resource groups:

```text
R02_ACR_IMAGE_REGISTRY
R03_API_DOMAIN_HTTPS
R04_ASSET_DOMAIN_HTTPS
R06_ENV_IMPORT
```

## Resource Rows

| ID | Resource | Current status | Observed status | Current blockers | Write target | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `R01_SAE_RUNTIME` | Aliyun SAE production-cn custom container app | pending cloud | `not_created_or_not_confirmed` | `runtime:confirmed` | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime` | `corepack pnpm aliyun:runtime:plan`; `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:docker:check`; `corepack pnpm aliyun:health:smoke` |
| `R02_ACR_IMAGE_REGISTRY` | Aliyun ACR image registry, remote digest, and SAE pull config | pending cloud | `purchase_candidate_visible_not_purchased` | registry host, namespace, remote image, digest, push/import evidence, ACR confirmed, image pushed, digest verified, SAE remote image and pull config | `deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime` | `corepack pnpm aliyun:image:plan`; `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:docker:build`; `corepack pnpm aliyun:container:smoke` |
| `R03_API_DOMAIN_HTTPS` | `api-cn.ipgongchang.xin` DNS, HTTPS, and ICP evidence | blocked | `domain_visible_records_missing` | DNS special-use wildcard IP, HTTPS `ECONNRESET`, `apiDomainHttps.confirmed`, DNS to Aliyun, HTTPS enabled, ICP ready | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps` | `corepack pnpm aliyun:domain:check`; `corepack pnpm aliyun:domain:strict`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin` |
| `R04_ASSET_DOMAIN_HTTPS` | `assets-cn.ipgongchang.xin` DNS, HTTPS, and ICP evidence | blocked | `domain_visible_records_missing` | DNS special-use wildcard IP, HTTPS `ECONNRESET`, `assetDomainHttps.confirmed`, DNS to Aliyun, HTTPS enabled, ICP ready | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps` | `corepack pnpm aliyun:domain:check`; `corepack pnpm aliyun:domain:strict`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin` |
| `R05_OSS_AUDIO_STORAGE` | Service-record audio OSS, CORS, and least-privilege RAM/STS | pending cloud | `bucket_visible_unconfirmed` / partial | `oss:confirmed`, `oss:ramLeastPrivilege` | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss` | `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:app-api:smoke`; postdeploy service-record upload smoke |
| `R06_ENV_IMPORT` | SAE/KMS/Secrets Manager production-cn env import | blocked | `cloudshell_disconnected_or_config_missing` | missing `DATABASE_URL_CN`, `envImport.confirmed`, `envImport.secretNotInImage`, placeholder import time/evidence | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport`; Aliyun SAE env / KMS / Secrets Manager | `corepack pnpm aliyun:env:handoff:backend`; `corepack pnpm aliyun:sensitive:blockers:backend`; `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:readiness:strict` |
| `R07_SLS_ALERTS` | SLS logs, `/api/healthz`, and 5xx alerting | pending cloud | `project_logstore_visible_alerts_pending` / partial | `slsAlerts.confirmed`, `slsAlerts.healthAlertConfigured`, `slsAlerts.serverErrorAlertConfigured` | `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts` | `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin`; `corepack pnpm aliyun:cloud:check` |

## Interpretation

The current resource matrix proves that all seven Aliyun-side resource evidence groups are still blocked. OSS and SLS are only partially observed: a visible bucket or logstore is not enough to mark the production resource ready.

`cloudAccessCanReadNow=false` means the current local CLI/OpenAPI identity still cannot be treated as a fresh strict cloud-read proof. Existing `cloud-inventory-results.local.json` evidence is useful, but it does not replace `cloud-confirmations.local.json` or `image-publish.local.json`.

## Strict Closure Order

After any authorized resource action, run the narrow strict gate first:

```bash
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
```

Then run the full release gates:

```bash
corepack pnpm aliyun:resources:matrix
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

## Forbidden Without Fresh Confirmation

```text
Do not purchase ACR or any paid resource.
Do not create or modify SAE, SLS, OSS, RAM, KMS, Secrets Manager, DNS, certificate, CDN, or public ingress.
Do not import environment variables.
Do not run docker login or docker push.
Do not write AppSecret, AccessKeySecret, registry password, RAM Secret, STS token, Supabase service role key, Android keystore password, or certificate private key into JSON, Markdown, Docker images, shell history, app bundles, or git.
Do not deploy production-cn until resourceEvidenceReady=7/7 and strict gates pass.
```
