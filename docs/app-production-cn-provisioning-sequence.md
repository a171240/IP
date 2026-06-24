# APP production-cn provisioning sequence

Date: 2026-06-24

This file is derived from:

```bash
corepack pnpm aliyun:provisioning:plan
corepack pnpm aliyun:cloud-actions:package
corepack pnpm aliyun:completion:audit
```

It records the Aliyun-side provisioning order for the first APP production-cn backend bridge. It is a plan-only local evidence file. It does not authorize purchase, resource creation, DNS changes, secret import, image push, production deploy, WeChat Open Platform mutation, Apple Developer mutation, mini-program upload, app store submission, or git push.

## Current Verdict

Production-cn cannot be deployed now.

Current provisioning gate:

```text
executionMode=plan_only
canCodexExecuteNow=false
canDeployNow=false
readyToStartPhases=PH01_EXTERNAL_APP_IDENTIFIERS, PH02_BASE_CLOUD_RESOURCES
blockedPhases=PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP, PH07_PRODUCTION_DEPLOY
canStartNowPackets=P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID, P03_ACR_PURCHASE, P05_OSS_RAM_STS
canStartNowConsoleTasks=C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
resourceEvidenceReady=0/7
blockedResourceEvidenceIds=R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
blockedCredentialCount=8
readySecretEnvVariableCount=17
```

## Deployment Target

The first APP production-cn backend bridge deploys the Next.js API container to Aliyun SAE:

```text
provider=Aliyun SAE
region=cn-hangzhou
runtime=custom-container
appName=meiye-huajing-app-api-production-cn
containerPort=3000
healthPath=/api/healthz
strictHealthPath=/api/app/health?strict=1
apiHost=api-cn.ipgongchang.xin
assetHost=assets-cn.ipgongchang.xin
imageRepository=meiye-huajing-app-api
imageTag=production-cn
```

ECS is a fallback only if SAE cannot satisfy runtime constraints. It is not the primary path for this bridge.

The first bridge still uses Supabase as the data layer. Aliyun RDS PostgreSQL/Tair migration is required for final full production-cn but is not included in this bridge deployment.

## Phase Sequence

| Phase | Status | Depends on | What closes the phase | Explicit boundary |
| --- | --- | --- | --- | --- |
| `PH01_EXTERNAL_APP_IDENTIFIERS` | `ready_for_action_time_confirmation` | none | WeChat Open mobile app approved; Android release signing evidence; Apple Team ID ready | Do not use mini-program credentials; do not use debug.keystore; do not read/output AppSecret or keystore passwords. |
| `PH02_BASE_CLOUD_RESOURCES` | `ready_for_action_time_confirmation` | none | ACR Enterprise purchase/repository evidence; OSS bucket/CORS/RAM/STS closure | Do not run docker login/push; do not record registry password, RAM Secret, STS token, or AccessKeySecret. |
| `PH03_IMAGE_PUSH_AND_PULL` | `blocked_by_dependencies` | `P03_ACR_PURCHASE` | ACR remote image pushed/imported, digest verified, SAE pull configured | Do not start before ACR purchase/repository evidence is closed. |
| `PH04_ENV_IMPORT` | `blocked_by_dependencies` | `P01_WECHAT_OPEN_MOBILE_APP`, `P02_APPLE_TEAM_ID`, `P05_OSS_RAM_STS`, `C05_OSS_AUDIO_RAM_STS` | Env imported into SAE/KMS/Secrets Manager with `secretNotInImage=true` | Do not import values before WeChat mobile app approval and OSS/RAM/STS closure. |
| `PH05_SAE_RUNTIME_AND_SLS` | `blocked_by_dependencies` | `P03_ACR_PURCHASE`, `P04_ACR_IMAGE_AND_PULL`, `P05_OSS_RAM_STS`, `P06_ENV_IMPORT`, `C02_ACR_IMAGE_AND_PULL`, `C05_OSS_AUDIO_RAM_STS`, `C06_ENV_IMPORT`, `C01_SAE_RUNTIME` | SAE app confirmed, port 3000, `/api/healthz`, SLS health and 5xx alerts | Do not create/mutate SAE/SLS before image, OSS, and env gates are ready and confirmed. |
| `PH06_DOMAIN_HTTPS_ICP` | `blocked_by_dependencies` | `P08_SAE_RUNTIME_SLS`, `C01_SAE_RUNTIME`, `C05_OSS_AUDIO_RAM_STS` | `api-cn` and `assets-cn` resolve to Aliyun entries with HTTPS and ICP evidence | Do not point to Vercel, localhost, example domains, old `ip.ipgongchang.xin`, or 198.18.0.x addresses. |
| `PH07_PRODUCTION_DEPLOY` | `blocked_by_dependencies` | `P01_WECHAT_OPEN_MOBILE_APP`, `P10_ANDROID_RELEASE_SIGNING`, `P02_APPLE_TEAM_ID`, `P03_ACR_PURCHASE`, `P04_ACR_IMAGE_AND_PULL`, `P05_OSS_RAM_STS`, `P06_ENV_IMPORT`, `P07_DOMAIN_DNS_HTTPS`, `P08_SAE_RUNTIME_SLS` | Strict gates pass, production-cn deploy completes, postdeploy smoke passes | Does not include git push, mini-program upload, Supabase production writes, or app store submission. |

## PH02 Current Scope

`C02_ACR_IMAGE_AND_PULL` is currently limited to purchase and repository evidence:

```text
currentActionScope=purchase_and_repository_only
requiredEvidence=acr.purchaseCandidate.confirmed=true
requiredEvidence=acr.registryHost actual aliyuncs.com host
requiredEvidence=acr.namespace created
repository=meiye-huajing-app-api
```

The following are deferred to `PH03_IMAGE_PUSH_AND_PULL`:

```text
P04_ACR_IMAGE_AND_PULL
docker login
docker push
imagePushed=true
digestVerified=true
runtime.remoteImageConfigured=true
runtime.imagePullConfigured=true
```

`C05_OSS_AUDIO_RAM_STS` can close only non-secret OSS/RAM/STS evidence:

```text
oss.confirmed=true
oss.ramLeastPrivilege=true
serviceRecordPrefix=service-records/production-cn
secret imported through Aliyun controlled secret env only
```

## Evidence Files

Only non-secret evidence may be written after an authorized action:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json
deploy/aliyun-production-cn.image-publish.local.json
deploy/aliyun-production-cn.cloud-inventory-results.local.json
release manifest / deployment log
```

Allowed evidence values are resource names, boolean readiness fields, timestamps, console paths, screenshot IDs, ticket IDs, and SHA-256 image digests. Secret values are forbidden.

## Verification

After each authorized phase:

```bash
corepack pnpm aliyun:provisioning:plan
corepack pnpm aliyun:cloud-actions:package
corepack pnpm aliyun:resources:matrix
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:completion:audit
```

Before production deploy can be considered:

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
```
