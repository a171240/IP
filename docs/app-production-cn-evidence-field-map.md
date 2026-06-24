# APP production-cn evidence field map

Date: 2026-06-24

This is the field-level, value-free map for the current production-cn evidence gaps. It is derived from:

```bash
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
```

It tells the operator which local evidence field to update after an authorized external action. It does not contain secret values and does not authorize cloud mutation.

## Current Gate

```text
Production-cn cannot be deployed now.
evidenceWritebackReady=1/4
totalGaps=56
rdsMigrationGaps=17
cloudInventoryResultGaps=0
cloudConfirmationGaps=27
imagePublishGaps=12
```

## Ready Evidence File

`deploy/aliyun-production-cn.cloud-inventory-results.local.json` is ready with `0` current blockers. It proves read-only inventory results only. It does not close the cloud confirmation or image publish gates.

## rds-migration.local.json

Target file:

```text
deploy/aliyun-production-cn.rds-migration.local.json
```

Current field blockers: `17`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `rdsPostgres.instanceId` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Record the non-secret RDS instance ID after the cn-hangzhou PostgreSQL instance exists. |
| `rdsPostgres.engineVersion` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Record the PostgreSQL version shown by RDS. |
| `rdsPostgres.networkAccess` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Record the VPC or SAE internal access evidence without connection strings. |
| `rdsPostgres.databaseName` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Record the database name only; never record account password or connection string. |
| `rdsPostgres.evidence` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Record a console path, screenshot ID, ticket ID, or other non-secret RDS evidence handle. |
| `rdsPostgres.confirmed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after RDS PostgreSQL exists and matches the production-cn target. |
| `rdsPostgres.databaseAccountReady` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after the database account and privileges are ready; never record the password. |
| `rdsPostgres.databaseUrlCnSecretImported` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after `DATABASE_URL_CN` is imported through Aliyun KMS, Secrets Manager, or SAE secret env. |
| `migration.dataAccessAdapterReady` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after first-version APP API production-cn data access no longer formally depends on Supabase. |
| `migration.schemaMigrated` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after schema migration is applied to RDS and validated without secret values. |
| `migration.dataMigrated` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after required data is migrated to RDS and validated without customer data in reports. |
| `migration.rowCountValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after required table row counts have been validated. |
| `migration.criticalRecordValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after profile, tenant, store, invite, customer, and service-record critical records validate. |
| `migration.appApiSmokeOnRdsPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after profile, tenant, invite, and service-record APP API smoke passes against RDS. |
| `migration.supabaseNoLongerFormalTarget` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after Supabase is migration source or legacy compatibility only, not the formal production-cn database target. |
| `migration.rollbackRunbookReviewed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after the rollback runbook is reviewed. |
| `migration.rollbackValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Set `true` only after rollback validation or recovery rehearsal passes. |

## cloud-confirmations.local.json

Target file:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json
```

Current field blockers: `27`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `items.runtime.confirmed` | `P08_SAE_RUNTIME_SLS` | Set `true` only after SAE runtime is confirmed. |
| `items.apiDomainHttps.confirmed` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after the API domain evidence is complete. |
| `items.apiDomainHttps.dnsResolvedToAliyun` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after DNS resolves to the Aliyun public entry. |
| `items.apiDomainHttps.httpsEnabled` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after HTTPS is enabled and reachable. |
| `items.apiDomainHttps.icpReady` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after ICP is ready for domestic production access. |
| `items.assetDomainHttps.confirmed` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after the asset domain evidence is complete. |
| `items.assetDomainHttps.dnsResolvedToAliyun` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after DNS resolves to the Aliyun public entry. |
| `items.assetDomainHttps.httpsEnabled` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after HTTPS is enabled and reachable. |
| `items.assetDomainHttps.icpReady` | `P07_DOMAIN_DNS_HTTPS_ICP` | Set `true` only after ICP is ready for domestic production access. |
| `items.oss.confirmed` | `P05_OSS_RAM_STS` | Set `true` only after OSS bucket, CORS, and runtime access are confirmed. |
| `items.oss.ramLeastPrivilege` | `P05_OSS_RAM_STS` | Set `true` only after RAM, STS, or runtime role access is limited to the service-record prefix. |
| `items.wechatOpenPlatform.androidSignature` | `P10_ANDROID_RELEASE_SIGNING` | Record Android release signature evidence or evidence ID; never use debug keystore evidence. |
| `items.wechatOpenPlatform.confirmed` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `true` only after the WeChat Open Platform mobile app evidence is complete. |
| `items.wechatOpenPlatform.mobileAppCreated` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `true` only after the "美业话镜" mobile app exists in WeChat Open Platform. |
| `items.wechatOpenPlatform.mobileAppSubmitted` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `true` only after the mobile app is submitted for review. |
| `items.wechatOpenPlatform.reviewStatus` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `approved` only after the WeChat Open Platform mobile app review passes. |
| `items.wechatOpenPlatform.mobileAppIdReady` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `true` only after the reviewed mobile app AppID is ready. |
| `items.wechatOpenPlatform.mobileAppSecretReady` | `P01_WECHAT_OPEN_MOBILE_APP` | Set `true` only after the reviewed mobile app AppSecret has been imported through secret env. |
| `items.wechatOpenPlatform.androidConfigured` | `P10_ANDROID_RELEASE_SIGNING` | Set `true` only after Android package name and release signature are configured in WeChat Open Platform. |
| `items.wechatOpenPlatform.iosConfigured` | `P01_WECHAT_OPEN_MOBILE_APP`, `P02_APPLE_TEAM_ID` | Set `true` only after iOS Bundle ID, Apple Team ID, Universal Link, and AASA evidence are complete. |
| `items.envImport.importedAt` | `P06_ENV_IMPORT` | Record the import time or a non-secret console evidence ID. |
| `items.envImport.evidence` | `P06_ENV_IMPORT` | Record a console path, screenshot ID, ticket ID, or other non-secret evidence handle. |
| `items.envImport.confirmed` | `P06_ENV_IMPORT` | Set `true` only after production-cn env values are imported into Aliyun runtime env. |
| `items.envImport.secretNotInImage` | `P06_ENV_IMPORT` | Set `true` only after secrets are confirmed to live in SAE, KMS, or Secrets Manager, not in the image. |
| `items.slsAlerts.confirmed` | `P08_SAE_RUNTIME_SLS` | Set `true` only after SLS alert evidence is complete. |
| `items.slsAlerts.healthAlertConfigured` | `P08_SAE_RUNTIME_SLS` | Set `true` or record a non-secret alert evidence ID only after the health alert is configured. |
| `items.slsAlerts.serverErrorAlertConfigured` | `P08_SAE_RUNTIME_SLS` | Set `true` or record a non-secret alert evidence ID only after the 5xx alert is configured. |

## image-publish.local.json

Target file:

```text
deploy/aliyun-production-cn.image-publish.local.json
```

Current field blockers: `12`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `acr.registryHost` | `P03_ACR_PURCHASE` | Record the actual Aliyun ACR registry host after purchase or confirmed instance selection. |
| `acr.namespace` | `P03_ACR_PURCHASE` | Record the actual Aliyun ACR namespace after purchase or confirmed instance selection. |
| `acr.remoteImage` | `P04_ACR_IMAGE_AND_PULL` | Record the full production-cn remote image address after image push or import. |
| `acr.remoteDigest` | `P04_ACR_IMAGE_AND_PULL` | Record the remote `sha256:<64 hex>` image digest after verification. |
| `acr.evidence` | `P04_ACR_IMAGE_AND_PULL` | Record a non-secret ACR push, import, or digest-verification evidence handle. |
| `acr.confirmed` | `P03_ACR_PURCHASE` | Set `true` only after the ACR repository is confirmed. |
| `acr.imagePushed` | `P04_ACR_IMAGE_AND_PULL` | Set `true` only after the image is pushed or imported into ACR. |
| `acr.digestVerified` | `P04_ACR_IMAGE_AND_PULL` | Set `true` only after the remote digest is verified. |
| `acr.remoteDigest` | `P04_ACR_IMAGE_AND_PULL` | The digest must use the `sha256:<64 hex>` format; this is a second blocker on the same field. |
| `runtime.confirmed` | `P08_SAE_RUNTIME_SLS` | Set `true` only after the SAE runtime is confirmed. |
| `runtime.remoteImageConfigured` | `P04_ACR_IMAGE_AND_PULL` | Set `true` only after SAE points to the ACR remote image. |
| `runtime.imagePullConfigured` | `P04_ACR_IMAGE_AND_PULL` | Set `true` only after SAE image-pull permission is configured. |

## Forbidden Values

Never write these values into JSON, Markdown, Docker images, app bundles, shell history, or git:

```text
AppSecret
AccessKeySecret
DATABASE_URL_CN value
database password
dump contents
customer data
registry password
RAM Secret
STS token
cookie
Supabase service role key
Android keystore password
certificate private key
```

## Verification After Any Field Update

Run the strict command for the touched file first, then the completion gates:

```bash
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
corepack pnpm aliyun:completion:audit
corepack pnpm aliyun:predeploy
```

Do not deploy production-cn until all four evidence files are ready and the strict gates pass.
