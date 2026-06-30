# 美业话镜 APP production-cn 阿里云证据回填清单

Generated: 2026-06-30T21:09:27.554Z

## 当前结论

- 现在还不能部署阿里云后端；微信/Android/Apple 发布项已后置，请先按本清单补齐 RDS/ACR/SAE/DNS/OSS/env/SLS/smoke 证据。
- currentScope: backend_aliyun_only
- verdict: blocked
- canDeployNow: false
- executionMode: writeback_checklist_only
- containsValues: false
- mutationPerformed: false
- cloudApiCalled: false

## 证据闭环摘要

- conclusion: 本地证据尚未闭环；部署前必须补齐本地 .local.json 证据并通过 strict 验证。
- evidenceWritebackReady: 1/4
- totalGaps: 40
- rdsMigrationGaps: 16
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- partiallyObservedResourceEvidenceIds: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json, deploy/aliyun-production-cn.cloud-inventory-results.local.json, deploy/aliyun-production-cn.cloud-confirmations.local.json, deploy/aliyun-production-cn.image-publish.local.json

## 按动作包排序的证据回填

- canStartNowPacketIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- blockedByDependencyPacketIds: P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS
- secretOrCredentialPacketIds: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P06_ENV_IMPORT

### P11_ALIYUN_RDS_DATA_MIGRATION

- status: can_start_after_action_time_confirmation
- nonSecretEvidenceOnly: false
- gapCount: 16
- groupKeys: rdsMigration
- jsonPaths: rdsPostgres.confirmed, rdsPostgres.databaseAccountReady, rdsPostgres.databaseUrlCnSecretImported, migration.schemaInventoryReviewed, migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved, migration.rdsExtensionSupportConfirmed, migration.dataAccessAdapterReady, migration.schemaMigrated, migration.dataMigrated, migration.rowCountValidationPassed, migration.criticalRecordValidationPassed, migration.appApiSmokeOnRdsPassed, migration.supabaseNoLongerFormalTarget, migration.rollbackRunbookReviewed, migration.rollbackValidationPassed
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.confirmed; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseAccountReady; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseUrlCnSecretImported; deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaInventoryReviewed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaCompatibilityReviewed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.supabaseSpecificSqlResolved; deploy/aliyun-production-cn.rds-migration.local.json -> migration.rdsExtensionSupportConfirmed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.dataAccessAdapterReady; deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaMigrated; deploy/aliyun-production-cn.rds-migration.local.json -> migration.dataMigrated; deploy/aliyun-production-cn.rds-migration.local.json -> migration.rowCountValidationPassed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.criticalRecordValidationPassed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.appApiSmokeOnRdsPassed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.supabaseNoLongerFormalTarget; deploy/aliyun-production-cn.rds-migration.local.json -> migration.rollbackRunbookReviewed; deploy/aliyun-production-cn.rds-migration.local.json -> migration.rollbackValidationPassed
- forbiddenValueClasses: AccessKeySecret, DATABASE_URL_CN value, Supabase service role key, customer data, database password, dump contents, token
- strictVerifyCommands: corepack pnpm aliyun:rds:migration:evidence:strict

### P05_OSS_RAM_STS

- status: can_start_after_action_time_confirmation
- nonSecretEvidenceOnly: false
- gapCount: 3
- groupKeys: cloudConfirmations
- jsonPaths: items.oss.confirmed, items.oss.corsConfigured, items.oss.ramLeastPrivilege
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
- forbiddenValueClasses: AccessKeySecret, AppSecret, RAM Secret, STS token, Supabase service role key, cookie, registry password, 证书私钥
- strictVerifyCommands: corepack pnpm aliyun:oss:runtime-access:strict; corepack pnpm aliyun:cloud:confirmations:strict

### P04_ACR_IMAGE_AND_PULL

- status: can_start_after_action_time_confirmation
- nonSecretEvidenceOnly: true
- gapCount: 7
- groupKeys: imagePublish
- jsonPaths: acr.remoteDigest, acr.imagePushed, acr.digestVerified, acr.pushNetworkPath, runtime.remoteImageConfigured, runtime.imagePullConfigured
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr; deploy/aliyun-production-cn.image-publish.local.json -> runtime
- forbiddenValueClasses: AccessKeySecret, RAM Secret, STS token, cookie, docker login output, registry password
- strictVerifyCommands: corepack pnpm aliyun:image:plan:strict

### P06_ENV_IMPORT

- status: blocked_by_dependency
- nonSecretEvidenceOnly: false
- gapCount: 1
- groupKeys: cloudConfirmations
- jsonPaths: items.envImport.confirmed
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
- forbiddenValueClasses: AccessKeySecret, AppSecret, RAM Secret, STS token, Supabase service role key, cookie, registry password, 证书私钥
- strictVerifyCommands: corepack pnpm aliyun:oss:runtime-access:strict; corepack pnpm aliyun:cloud:confirmations:strict

### P07_DOMAIN_DNS_HTTPS

- status: blocked_by_dependency
- nonSecretEvidenceOnly: true
- gapCount: 8
- groupKeys: cloudConfirmations
- jsonPaths: items.apiDomainHttps.confirmed, items.apiDomainHttps.dnsResolvedToAliyun, items.apiDomainHttps.httpsEnabled, items.apiDomainHttps.icpReady, items.assetDomainHttps.confirmed, items.assetDomainHttps.dnsResolvedToAliyun, items.assetDomainHttps.httpsEnabled, items.assetDomainHttps.icpReady
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- forbiddenValueClasses: AccessKeySecret, AppSecret, RAM Secret, STS token, Supabase service role key, cookie, registry password, 证书私钥
- strictVerifyCommands: corepack pnpm aliyun:oss:runtime-access:strict; corepack pnpm aliyun:cloud:confirmations:strict

### P08_SAE_RUNTIME_SLS

- status: blocked_by_dependency
- nonSecretEvidenceOnly: true
- gapCount: 5
- groupKeys: cloudConfirmations, imagePublish
- jsonPaths: items.runtime.confirmed, items.slsAlerts.confirmed, items.slsAlerts.healthAlertConfigured, items.slsAlerts.serverErrorAlertConfigured, runtime.confirmed
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts; deploy/aliyun-production-cn.image-publish.local.json -> runtime
- forbiddenValueClasses: AccessKeySecret, AppSecret, RAM Secret, STS token, Supabase service role key, cookie, docker login output, registry password, 证书私钥
- strictVerifyCommands: corepack pnpm aliyun:oss:runtime-access:strict; corepack pnpm aliyun:cloud:confirmations:strict; corepack pnpm aliyun:image:plan:strict


## 已观测但未闭环的资源证据

- R01_SAE_RUNTIME: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R02_ACR_IMAGE_REGISTRY: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R03_API_DOMAIN_HTTPS: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R04_ASSET_DOMAIN_HTTPS: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R05_OSS_AUDIO_STORAGE: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R06_ENV_IMPORT: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。
- R07_SLS_ALERTS: observed=pending_backend_evidence, readiness=blocked
  - currentEvidence: none
  - missingEvidence: none
  - writeTargets: none
  - nextEvidenceAction: 补齐对应阿里云后端非密钥证据后重新运行 evidence writeback。

## 汇总

- files: 4
- readyFiles: 1/4
- totalGaps: 40
- rdsMigrationGaps: 16
- cloudInventoryResultGaps: 0
- cloudConfirmationGaps: 16
- imagePublishGaps: 8
- forbiddenValueClasses: AccessKeySecret, AppSecret, DATABASE_URL_CN value, RAM Secret, STS token, Supabase service role key, cookie, customer data, database password, docker login output, dump contents, registry password, token, 证书私钥
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION, P08_SAE_RUNTIME_SLS, P07_DOMAIN_DNS_HTTPS, P05_OSS_RAM_STS, P06_ENV_IMPORT, P04_ACR_IMAGE_AND_PULL

## rdsMigration

- file: deploy/aliyun-production-cn.rds-migration.local.json
- exists: true
- ready: false
- totalBlockers: 16
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockedUntil: RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env; compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- strictVerifyCommands: corepack pnpm aliyun:rds:migration:evidence:strict

- `rdsPostgres.confirmed`
  - blocker: rdsPostgres.confirmed
  - source: 阿里云控制台 -> RDS PostgreSQL / SAE secret env
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.confirmed
  - expected: RDS PostgreSQL 实例确认存在后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env 的非密钥证据; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查已关闭
  - blockedUntil: RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env; compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true
- `rdsPostgres.databaseAccountReady`
  - blocker: rdsPostgres.databaseAccountReady
  - source: 阿里云控制台 -> RDS PostgreSQL / SAE secret env
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseAccountReady
  - expected: 数据库账号和权限就绪后填 true，不记录密码。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env 的非密钥证据; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查已关闭
  - blockedUntil: RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env; compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true
- `rdsPostgres.databaseUrlCnSecretImported`
  - blocker: rdsPostgres.databaseUrlCnSecretImported
  - source: 阿里云控制台 -> RDS PostgreSQL / SAE secret env
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseUrlCnSecretImported
  - expected: DATABASE_URL_CN 已只导入阿里云 KMS/Secrets Manager/SAE secret env 后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env 的非密钥证据; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查已关闭
  - blockedUntil: RDS PostgreSQL 已创建，数据库账号 ready，DATABASE_URL_CN 已只导入 secret env; compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true
- `migration.schemaInventoryReviewed`
  - blocker: migration.schemaInventoryReviewed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaInventoryReviewed
  - expected: 填真实非密钥证据，不能保留 TODO、pending 或 TBD 占位值。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.schemaCompatibilityReviewed`
  - blocker: migration.schemaCompatibilityReviewed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaCompatibilityReviewed
  - expected: compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查完成并记录非密钥处置结果后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.supabaseSpecificSqlResolved`
  - blocker: migration.supabaseSpecificSqlResolved
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.supabaseSpecificSqlResolved
  - expected: supabase_auth_uid / storage / service_role / RLS / policy 等 Supabase-specific SQL 已改写或明确处置后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.rdsExtensionSupportConfirmed`
  - blocker: migration.rdsExtensionSupportConfirmed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.rdsExtensionSupportConfirmed
  - expected: Aliyun RDS PostgreSQL extension 支持和替代方案已确认后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.dataAccessAdapterReady`
  - blocker: migration.dataAccessAdapterReady
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.dataAccessAdapterReady
  - expected: 第一版 APP API 正式 production-cn 数据访问不再依赖 Supabase 后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.schemaMigrated`
  - blocker: migration.schemaMigrated
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.schemaMigrated
  - expected: schema 已迁到 RDS/PostgreSQL 并通过非密钥验收后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.dataMigrated`
  - blocker: migration.dataMigrated
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.dataMigrated
  - expected: 数据已按迁移计划进入 RDS/PostgreSQL 并通过非密钥验收后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.rowCountValidationPassed`
  - blocker: migration.rowCountValidationPassed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.rowCountValidationPassed
  - expected: 关键表 row count 校验通过后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.criticalRecordValidationPassed`
  - blocker: migration.criticalRecordValidationPassed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.criticalRecordValidationPassed
  - expected: 关键记录、租户/门店/服务记录关系校验通过后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.appApiSmokeOnRdsPassed`
  - blocker: migration.appApiSmokeOnRdsPassed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.appApiSmokeOnRdsPassed
  - expected: profile / tenant / invite / service-record APP API 在 RDS 上冒烟通过后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.supabaseNoLongerFormalTarget`
  - blocker: migration.supabaseNoLongerFormalTarget
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.supabaseNoLongerFormalTarget
  - expected: Supabase 已仅作为迁移来源或旧兼容，不再作为 production-cn 正式数据库目标后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.rollbackRunbookReviewed`
  - blocker: migration.rollbackRunbookReviewed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.rollbackRunbookReviewed
  - expected: 回滚 runbook 已评审后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成
- `migration.rollbackValidationPassed`
  - blocker: migration.rollbackValidationPassed
  - source: Supabase 到 Aliyun RDS/PostgreSQL 迁移报告、APP API smoke 和 rollback 验收
  - writeTo: deploy/aliyun-production-cn.rds-migration.local.json -> migration.rollbackValidationPassed
  - expected: 回滚演练或可恢复性验证通过后填 true。
  - forbidden: database password, DATABASE_URL_CN value, Supabase service role key, dump contents, customer data, AccessKeySecret, token
  - requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
  - requiredEvidence: docs/app-production-cn-rds-migration-package.md 已生成并核对; compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查处置结果; Supabase 到 RDS/PostgreSQL schema、data、row count、critical record、APP API smoke 和 rollback 验收证据
  - blockedUntil: compatibilityReviewChecklist 7 类已关闭，且 migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true; schema/data 迁移、RDS API smoke 和 rollback 验收已完成

## cloudInventoryResults

- file: deploy/aliyun-production-cn.cloud-inventory-results.local.json
- exists: true
- ready: true
- totalBlockers: 0
- checkedOperations: 9
- requiredAuthorizationPackets: none
- blockedUntil: none
- strictVerifyCommands: corepack pnpm aliyun:cloud:inventory-results:strict

- none

## cloudConfirmations

- file: deploy/aliyun-production-cn.cloud-confirmations.local.json
- exists: true
- ready: false
- totalBlockers: 16
- requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS, P07_DOMAIN_DNS_HTTPS, P05_OSS_RAM_STS, P06_ENV_IMPORT
- blockedUntil: SAE runtime 与 SLS 告警已确认; 域名 DNS、HTTPS 和 ICP 均就绪; OSS 与最小权限 RAM/STS 已配置; 密钥类环境变量已导入运行时密钥系统且未写入镜像
- strictVerifyCommands: corepack pnpm aliyun:oss:runtime-access:strict; corepack pnpm aliyun:cloud:confirmations:strict

- `items.runtime.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> SAE -> meiye-huajing-app-api-production-cn
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
  - requiredEvidence: SAE runtime、健康检查和 SLS 告警的非密钥控制台证据
  - blockedUntil: SAE runtime 与 SLS 告警已确认
- `items.apiDomainHttps.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> 云解析 DNS / SAE 自定义域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.apiDomainHttps.dnsResolvedToAliyun`
  - blocker: dnsResolvedToAliyun
  - source: 阿里云控制台 -> 云解析 DNS / SAE 自定义域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
  - expected: 域名已解析到阿里云公网入口后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.apiDomainHttps.httpsEnabled`
  - blocker: httpsEnabled
  - source: 阿里云控制台 -> 云解析 DNS / SAE 自定义域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
  - expected: HTTPS 证书已启用并可访问后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.apiDomainHttps.icpReady`
  - blocker: icpReady
  - source: 阿里云控制台 -> 云解析 DNS / SAE 自定义域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps
  - expected: 备案状态满足国内正式访问要求后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.assetDomainHttps.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> 云解析 DNS / CDN 或 OSS 域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.assetDomainHttps.dnsResolvedToAliyun`
  - blocker: dnsResolvedToAliyun
  - source: 阿里云控制台 -> 云解析 DNS / CDN 或 OSS 域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
  - expected: 域名已解析到阿里云公网入口后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.assetDomainHttps.httpsEnabled`
  - blocker: httpsEnabled
  - source: 阿里云控制台 -> 云解析 DNS / CDN 或 OSS 域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
  - expected: HTTPS 证书已启用并可访问后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.assetDomainHttps.icpReady`
  - blocker: icpReady
  - source: 阿里云控制台 -> 云解析 DNS / CDN 或 OSS 域名 / SSL / ICP
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
  - expected: 备案状态满足国内正式访问要求后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
  - requiredEvidence: 域名解析到阿里云入口、HTTPS 证书启用、ICP备案满足国内正式访问要求的证据
  - blockedUntil: 域名 DNS、HTTPS 和 ICP 均就绪
- `items.oss.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> OSS / RAM / STS / SAE runtime role
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P05_OSS_RAM_STS
  - requiredEvidence: OSS bucket/CORS、服务记录前缀最小权限 RAM 或 STS/role 证据; 如选择 sae_runtime_role：SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE 可用，且 credentialBoundary=runtime_role_no_long_lived_secret; 如选择 STS/RAM fallback：ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN 只进入 KMS/Secrets Manager/SAE secret env
  - blockedUntil: OSS 与最小权限 RAM/STS 已配置
- `items.oss.corsConfigured`
  - blocker: corsConfigured
  - source: 阿里云控制台 -> OSS / RAM / STS / SAE runtime role
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  - expected: OSS CORS 已按 APP 上传/下载需求配置后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P05_OSS_RAM_STS
  - requiredEvidence: OSS bucket/CORS、服务记录前缀最小权限 RAM 或 STS/role 证据; 如选择 sae_runtime_role：SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE 可用，且 credentialBoundary=runtime_role_no_long_lived_secret; 如选择 STS/RAM fallback：ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN 只进入 KMS/Secrets Manager/SAE secret env
  - blockedUntil: OSS 与最小权限 RAM/STS 已配置
- `items.oss.ramLeastPrivilege`
  - blocker: ramLeastPrivilege
  - source: 阿里云控制台 -> OSS / RAM / STS / SAE runtime role
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  - expected: RAM 权限已限制到服务记录前缀后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P05_OSS_RAM_STS
  - requiredEvidence: OSS bucket/CORS、服务记录前缀最小权限 RAM 或 STS/role 证据; 如选择 sae_runtime_role：SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE 可用，且 credentialBoundary=runtime_role_no_long_lived_secret; 如选择 STS/RAM fallback：ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN 只进入 KMS/Secrets Manager/SAE secret env
  - blockedUntil: OSS 与最小权限 RAM/STS 已配置
- `items.envImport.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> SAE 环境变量 / KMS / Secrets Manager
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P06_ENV_IMPORT
  - requiredEvidence: production-cn 环境变量已导入 SAE/KMS/Secrets Manager，且 secretNotInImage=true 的证据
  - blockedUntil: 密钥类环境变量已导入运行时密钥系统且未写入镜像
- `items.slsAlerts.confirmed`
  - blocker: confirmed
  - source: 阿里云控制台 -> 日志服务 SLS / 告警
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
  - expected: 确认完成后填 true。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
  - requiredEvidence: SAE runtime、健康检查和 SLS 告警的非密钥控制台证据
  - blockedUntil: SAE runtime 与 SLS 告警已确认
- `items.slsAlerts.healthAlertConfigured`
  - blocker: healthAlertConfigured
  - source: 阿里云控制台 -> 日志服务 SLS / 告警
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
  - expected: 填真实非密钥控制台证据，不能保留 TODO、pending 或 TBD 占位值。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
  - requiredEvidence: SAE runtime、健康检查和 SLS 告警的非密钥控制台证据
  - blockedUntil: SAE runtime 与 SLS 告警已确认
- `items.slsAlerts.serverErrorAlertConfigured`
  - blocker: serverErrorAlertConfigured
  - source: 阿里云控制台 -> 日志服务 SLS / 告警
  - writeTo: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
  - expected: 填真实非密钥控制台证据，不能保留 TODO、pending 或 TBD 占位值。
  - forbidden: AccessKeySecret, AppSecret, registry password, RAM Secret, STS token, cookie, 证书私钥, Supabase service role key
  - requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
  - requiredEvidence: SAE runtime、健康检查和 SLS 告警的非密钥控制台证据
  - blockedUntil: SAE runtime 与 SLS 告警已确认

## imagePublish

- file: deploy/aliyun-production-cn.image-publish.local.json
- exists: true
- ready: false
- totalBlockers: 8
- localDockerImage: skipped_by_explicit_flag
- requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL, P08_SAE_RUNTIME_SLS
- blockedUntil: 镜像已进入 ACR 且远端 digest 已核对; SAE runtime 已确认; SAE 镜像地址和拉取权限已配置
- strictVerifyCommands: corepack pnpm aliyun:image:plan:strict

- `acr.remoteDigest`
  - blocker: empty:acr.remoteDigest
  - source: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> acr
  - expected: 填 sha256:<64 hex> 镜像 digest。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据
  - blockedUntil: 镜像已进入 ACR 且远端 digest 已核对
- `acr.imagePushed`
  - blocker: acr.imagePushed
  - source: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> acr
  - expected: 镜像已推送或导入 ACR 后填 true。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据
  - blockedUntil: 镜像已进入 ACR 且远端 digest 已核对
- `acr.digestVerified`
  - blocker: acr.digestVerified
  - source: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> acr
  - expected: 远端 digest 已核对后填 true。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据
  - blockedUntil: 镜像已进入 ACR 且远端 digest 已核对
- `acr.remoteDigest`
  - blocker: acr.remoteDigest=sha256
  - source: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> acr
  - expected: 填 sha256:<64 hex> 镜像 digest。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据
  - blockedUntil: 镜像已进入 ACR 且远端 digest 已核对
- `acr.pushNetworkPath`
  - blocker: acr.pushNetworkPath
  - source: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> acr
  - expected: 填 public_registry、vpc_registry_from_aliyun_network 或 acr_import_task。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: ACR 远端镜像地址、sha256 digest、push/import 证据和 digest 核对证据
  - blockedUntil: 镜像已进入 ACR 且远端 digest 已核对
- `runtime.confirmed`
  - blocker: runtime.confirmed
  - source: 阿里云控制台 -> SAE -> cn-hangzhou -> 应用 -> 镜像部署 / 镜像拉取配置
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> runtime
  - expected: SAE runtime 已确认后填 true。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
  - requiredEvidence: SAE production-cn runtime 控制台非密钥证据
  - blockedUntil: SAE runtime 已确认
- `runtime.remoteImageConfigured`
  - blocker: runtime.remoteImageConfigured
  - source: 阿里云控制台 -> SAE -> cn-hangzhou -> 应用 -> 镜像部署 / 镜像拉取配置
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> runtime
  - expected: SAE 已指向 ACR remote image 后填 true。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: SAE 已指向 ACR 远端镜像并具备镜像拉取权限的非密钥证据
  - blockedUntil: SAE 镜像地址和拉取权限已配置
- `runtime.imagePullConfigured`
  - blocker: runtime.imagePullConfigured
  - source: 阿里云控制台 -> SAE -> cn-hangzhou -> 应用 -> 镜像部署 / 镜像拉取配置
  - writeTo: deploy/aliyun-production-cn.image-publish.local.json -> runtime
  - expected: SAE 镜像拉取权限配置完成后填 true。
  - forbidden: registry password, docker login output, RAM Secret, AccessKeySecret, STS token, cookie
  - requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
  - requiredEvidence: SAE 已指向 ACR 远端镜像并具备镜像拉取权限的非密钥证据
  - blockedUntil: SAE 镜像地址和拉取权限已配置

## Strict 验证顺序

- `corepack pnpm aliyun:rds:migration:evidence:strict`
- `corepack pnpm aliyun:cloud:inventory-results:strict`
- `corepack pnpm aliyun:cloud:confirmations:strict`
- `corepack pnpm aliyun:image:plan:strict`
- `corepack pnpm aliyun:domain:strict`
- `corepack pnpm aliyun:readiness:cloud-ready`
- `corepack pnpm aliyun:completion:audit`
- `corepack pnpm aliyun:predeploy`

## 安全边界

- 本命令只读取本地门禁报告并生成回填清单。
- 本命令不会改写 rds-migration.local.json、cloud-confirmations.local.json、cloud-inventory-results.local.json 或 image-publish.local.json。
- 本命令不会调用阿里云 API，不会购买 ACR，不会 push 镜像，不会部署 SAE，不会改 DNS/HTTPS/ICP。
- 回填本地证据时只能写资源名、布尔状态、时间戳、控制台路径、digest、row-count 结论和非密钥 evidence handle。
- 禁止写入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、证书私钥、DATABASE_URL_CN value、database password、dump contents、customer data 或 Supabase service role key。
