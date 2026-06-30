# APP production-cn evidence field map

Date: 2026-06-30

This is the value-free field map for the current `backend_aliyun_only` production-cn evidence state. It is derived from:

```bash
node scripts/generate-aliyun-evidence-writeback-checklist.mjs --backend-only --skip-vercel-env-coverage --env-file tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture --cloud-confirmations tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json --cloud-inventory-results tests/fixtures/aliyun-user-action-brief/cloud-inventory-results.fixture.json --rds-migration tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json --image-publish tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json
```

It tells the operator which local evidence fields remain after authorized external actions. It does not contain secret values and does not authorize cloud mutation.

## Current Gate

```text
Production-cn backend cannot be deployed now.
evidenceWritebackReady=1/4
totalGaps=40
rdsMigrationGaps=16
cloudInventoryResultGaps=0
cloudConfirmationGaps=16
imagePublishGaps=8
```

Current scope is `backend_aliyun_only`. WeChat Open Platform mobile app, Apple, and Android release-signing evidence fields are deferred and are not current Aliyun backend blockers.

## Ready Evidence Files

Fixture-backed strict-ready evidence groups: `cloudInventoryResults`.

Production local evidence still needs authorized writeback before deployment; this document only maps non-secret target fields.

## rdsMigration

Target file:

```text
deploy/aliyun-production-cn.rds-migration.local.json
```

Current field blockers: `16`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `rdsPostgres.confirmed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | RDS PostgreSQL 实例确认存在后填 true。 |
| `rdsPostgres.databaseAccountReady` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 数据库账号和权限就绪后填 true，不记录密码。 |
| `rdsPostgres.databaseUrlCnSecretImported` | `P11_ALIYUN_RDS_DATA_MIGRATION` | DATABASE_URL_CN 已只导入阿里云 KMS/Secrets Manager/SAE secret env 后填 true。 |
| `migration.schemaInventoryReviewed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 填真实非密钥证据，不能保留 TODO、pending 或 TBD 占位值。 |
| `migration.schemaCompatibilityReviewed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查完成并记录非密钥处置结果后填 true。 |
| `migration.supabaseSpecificSqlResolved` | `P11_ALIYUN_RDS_DATA_MIGRATION` | supabase_auth_uid / storage / service_role / RLS / policy 等 Supabase-specific SQL 已改写或明确处置后填 true。 |
| `migration.rdsExtensionSupportConfirmed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Aliyun RDS PostgreSQL extension 支持和替代方案已确认后填 true。 |
| `migration.dataAccessAdapterReady` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 第一版 APP API 正式 production-cn 数据访问不再依赖 Supabase 后填 true。 |
| `migration.schemaMigrated` | `P11_ALIYUN_RDS_DATA_MIGRATION` | schema 已迁到 RDS/PostgreSQL 并通过非密钥验收后填 true。 |
| `migration.dataMigrated` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 数据已按迁移计划进入 RDS/PostgreSQL 并通过非密钥验收后填 true。 |
| `migration.rowCountValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 关键表 row count 校验通过后填 true。 |
| `migration.criticalRecordValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 关键记录、租户/门店/服务记录关系校验通过后填 true。 |
| `migration.appApiSmokeOnRdsPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | profile / tenant / invite / service-record APP API 在 RDS 上冒烟通过后填 true。 |
| `migration.supabaseNoLongerFormalTarget` | `P11_ALIYUN_RDS_DATA_MIGRATION` | Supabase 已仅作为迁移来源或旧兼容，不再作为 production-cn 正式数据库目标后填 true。 |
| `migration.rollbackRunbookReviewed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 回滚 runbook 已评审后填 true。 |
| `migration.rollbackValidationPassed` | `P11_ALIYUN_RDS_DATA_MIGRATION` | 回滚演练或可恢复性验证通过后填 true。 |

## cloudInventoryResults

Target file:

```text
deploy/aliyun-production-cn.cloud-inventory-results.local.json
```

Current field blockers: `0`.

- none

## cloudConfirmations

Target file:

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json
```

Current field blockers: `16`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `items.runtime.confirmed` | `P08_SAE_RUNTIME_SLS` | 确认完成后填 true。 |
| `items.apiDomainHttps.confirmed` | `P07_DOMAIN_DNS_HTTPS` | 确认完成后填 true。 |
| `items.apiDomainHttps.dnsResolvedToAliyun` | `P07_DOMAIN_DNS_HTTPS` | 域名已解析到阿里云公网入口后填 true。 |
| `items.apiDomainHttps.httpsEnabled` | `P07_DOMAIN_DNS_HTTPS` | HTTPS 证书已启用并可访问后填 true。 |
| `items.apiDomainHttps.icpReady` | `P07_DOMAIN_DNS_HTTPS` | 备案状态满足国内正式访问要求后填 true。 |
| `items.assetDomainHttps.confirmed` | `P07_DOMAIN_DNS_HTTPS` | 确认完成后填 true。 |
| `items.assetDomainHttps.dnsResolvedToAliyun` | `P07_DOMAIN_DNS_HTTPS` | 域名已解析到阿里云公网入口后填 true。 |
| `items.assetDomainHttps.httpsEnabled` | `P07_DOMAIN_DNS_HTTPS` | HTTPS 证书已启用并可访问后填 true。 |
| `items.assetDomainHttps.icpReady` | `P07_DOMAIN_DNS_HTTPS` | 备案状态满足国内正式访问要求后填 true。 |
| `items.oss.confirmed` | `P05_OSS_RAM_STS` | 确认完成后填 true。 |
| `items.oss.corsConfigured` | `P05_OSS_RAM_STS` | OSS CORS 已按 APP 上传/下载需求配置后填 true。 |
| `items.oss.ramLeastPrivilege` | `P05_OSS_RAM_STS` | RAM 权限已限制到服务记录前缀后填 true。 |
| `items.envImport.confirmed` | `P06_ENV_IMPORT` | 确认完成后填 true。 |
| `items.slsAlerts.confirmed` | `P08_SAE_RUNTIME_SLS` | 确认完成后填 true。 |
| `items.slsAlerts.healthAlertConfigured` | `P08_SAE_RUNTIME_SLS` | 填真实非密钥控制台证据，不能保留 TODO、pending 或 TBD 占位值。 |
| `items.slsAlerts.serverErrorAlertConfigured` | `P08_SAE_RUNTIME_SLS` | 填真实非密钥控制台证据，不能保留 TODO、pending 或 TBD 占位值。 |

## imagePublish

Target file:

```text
deploy/aliyun-production-cn.image-publish.local.json
```

Current field blockers: `8`.

| JSON path | Authorization packet | Expected non-secret evidence |
| --- | --- | --- |
| `acr.remoteDigest` | `P04_ACR_IMAGE_AND_PULL` | 填 sha256:<64 hex> 镜像 digest。 |
| `acr.imagePushed` | `P04_ACR_IMAGE_AND_PULL` | 镜像已推送或导入 ACR 后填 true。 |
| `acr.digestVerified` | `P04_ACR_IMAGE_AND_PULL` | 远端 digest 已核对后填 true。 |
| `acr.remoteDigest` | `P04_ACR_IMAGE_AND_PULL` | 填 sha256:<64 hex> 镜像 digest。 |
| `acr.pushNetworkPath` | `P04_ACR_IMAGE_AND_PULL` | 填 public_registry、vpc_registry_from_aliyun_network 或 acr_import_task。 |
| `runtime.confirmed` | `P08_SAE_RUNTIME_SLS` | SAE runtime 已确认后填 true。 |
| `runtime.remoteImageConfigured` | `P04_ACR_IMAGE_AND_PULL` | SAE 已指向 ACR remote image 后填 true。 |
| `runtime.imagePullConfigured` | `P04_ACR_IMAGE_AND_PULL` | SAE 镜像拉取权限配置完成后填 true。 |

## Forbidden Values

Never write these values into JSON, Markdown, Docker images, app bundles, shell history, or git:

```text
AccessKeySecret
AppSecret
DATABASE_URL_CN value
RAM Secret
STS token
Supabase service role key
cookie
customer data
database password
docker login output
dump contents
registry password
token
证书私钥
```

## Verification

Use these commands to preserve the backend evidence state:

```bash
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:inventory-results:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:evidence:writeback:backend
```

Do not run production deployment without P09 action-time authorization.
