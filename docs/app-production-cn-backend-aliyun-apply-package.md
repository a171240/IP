# APP production-cn Aliyun backend apply package

Generated at: 2026-06-26T16:44:11.490Z

## Scope

- currentScope: backend_aliyun_only
- canProceedWithoutWechat: true
- canDeployBackendNow: false
- canApplyBackendNowWithoutUserIntervention: false
- backendTargetReady: 0/8
- resourceEvidenceReady: 0/7

## Operator Quick Start

当前结论：不能部署；这不是微信移动应用阻塞，而是阿里云后端资源和证据还没有闭环。

- current backend scope: backend_aliyun_only
- resource evidence: 0/7
- deploy gate: canDeployBackendNow=false
- missing backend credential/password: DATABASE_URL_CN
- deferred app launch items: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_PLATFORM_MOBILE_APP, ANDROID_RELEASE_SIGNING, APPLE_TEAM_ID, IOS_UNIVERSAL_LINK_AASA

拿到动作时授权后，本批只做这四件事：

- P00: 恢复 Aliyun CLI/CloudShell 只读盘点，只运行 allowlisted List/Describe/stat/get inventory 命令，并只写非密钥 evidence。
- P11: 创建或确认 cn-hangzhou RDS PostgreSQL、数据库、账号和网络访问策略；先记录 Supabase SQL 兼容审查、Supabase-specific SQL 处理和 RDS extension 支持，再迁移 schema/data；DATABASE_URL_CN 只进入 KMS/Secrets Manager/SAE secret env。
- P05: 确认 OSS bucket/CORS/service-records 前缀，并绑定最小权限 RAM/STS 或运行时角色。
- P04: 在已确认的 ACR 仓库中推送或导入后端镜像，校验 remote sha256 digest，并配置 SAE 镜像拉取权限；registry 密码只走受控凭证通道。

本批明确不做：微信开放平台移动应用、Android release signing、Apple Team ID/AASA、再次购买 ACR、SAE runtime 创建、全量 env import、DNS/HTTPS/ICP 变更、production deploy、postdeploy smoke、git push。

必须停手等用户确认的点：

- CloudShell 如出现重启实例、性能型 NAS 费用或开通提示，确认后才可继续。
- RDS 如涉及规格购买、实例费用、数据库账号密码或迁移执行，动作前确认。
- ACR 购买证据已确认；P04 只处理镜像 push/import、digest 核对和 SAE 拉取配置，不再次付款。
- AccessKeySecret、STS token、registry password、DATABASE_URL_CN、数据库密码、Supabase service role key 只能进入受控 secret 通道，不能写文档、JSON、镜像、shell history 或 git。

授权口径：授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS；ACR 购买证据已确认，可另按 P04 推送后端镜像并配置 SAE 拉取，但 registry 密码只能走受控凭证通道；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理本批所需受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。

## Immediate Backend Steps After Confirmation

- BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL

## Blocked Backend Steps

- BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE

## Action-Time Authorization Request

- required: true
- currentScope: backend_aliyun_only
- stepIds: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- packetIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- recommendedUserReply: 授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS；ACR 购买证据已确认，可另按 P04 推送后端镜像并配置 SAE 拉取，但 registry 密码只能走受控凭证通道；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理本批所需受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。
- allowedActions: 恢复阿里云 CLI/CloudShell 只读盘点身份，只运行 allowlisted List/Describe/stat/get inventory 命令。; 创建或确认 cn-hangzhou RDS PostgreSQL、数据库、账号和网络访问策略，并只把 DATABASE_URL_CN 写入阿里云受控 secret env。; 确认 OSS bucket/CORS/service-records 前缀，绑定最小权限 RAM/STS 或运行时角色。; 把后端镜像推送到已确认的 ACR 仓库，校验 remote sha256 digest，并配置 SAE 运行时镜像拉取。
- explicitlyExcluded: 不创建微信开放平台移动应用，不处理 Android release signing，不读取 Apple Team ID/AASA。; 不执行 production-cn 部署、postdeploy smoke、DNS/HTTPS/ICP 变更或 git push。; 不购买 ACR，不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。; 不执行全量 SAE 环境变量导入；只允许本批 RDS/OSS 动作要求的受控 secret env 写入。; 不把 DATABASE_URL_CN、数据库密码、AccessKeySecret、STS token、registry password、Supabase service role key、cookie 或证书私钥写入 JSON、Markdown、Docker 镜像、App 包、小程序包、shell history 或 git。
- valueHandling: 只允许记录变量名、资源名、布尔值、时间戳、digest、控制台路径和非密钥 evidence handle。; 密钥和密码只进入阿里云 KMS/Secrets Manager/SAE secret env 或受控凭证通道。

## User Intervention

- requiredIds: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE, USER_CONFIRM_PRODUCTION_DEPLOY
- paymentOrBillingConfirmations: RDS PostgreSQL instance/spec purchase or existing instance confirmation; SAE runtime/public ingress/SLS/certificate costs if prompted by Aliyun
- completedPurchaseConfirmations: ACR Enterprise Economic cn-hangzhou 1 month CNY 117.00 paid and repository evidence recorded
- secretOrPasswordHandling: Aliyun CLI profile, CloudShell session, AccessKeySecret or STS token if needed for read-only inventory; DATABASE_URL_CN; database account password; ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used; ACR registry password or credential helper; ready secret env import values; SUPABASE_SERVICE_ROLE_KEY only for controlled migration/export compatibility
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- backendNowExcludes: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_PLATFORM_MOBILE_APP, ANDROID_RELEASE_WECHAT_SIGNATURE

## Credential / Password Intervention

- required: true
- missingCredentialValues: DATABASE_URL_CN
- missingCredentialValueActionIds: S08_ALIYUN_RDS_DATABASE_URL
- readySecretsPendingCloudImport: 17
- readySecretsPendingCloudImportActionIds: S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT
- paidPurchaseConfirmationActionIds: none
- controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- actionIds: S08_ALIYUN_RDS_DATABASE_URL, S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT, S04_ACR_REGISTRY_AUTH
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包
- DATABASE_URL_CN must come from Aliyun RDS PostgreSQL after schema/data migration validation and must only enter KMS/Secrets Manager/SAE secret env.
- Ready local secret variables still need controlled Aliyun secret-env import; names can be reported, values must not be copied into JSON, Markdown, Docker images, git, chat, or shell history.
- ACR purchase and registry/runtime pull credentials require action-time confirmation; registry password or pull secret must stay in Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings.

## Backend Credential Acquisition Queue

- queueScope: backend_aliyun_only
- missingCredentialNames: DATABASE_URL_CN
- onlyMissingBackendCredentialValue: DATABASE_URL_CN
- readySecretsPendingCloudImport: 17
- requiresActionTimeConfirmationIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT

| order | category | actionId | question | obtainFrom | destination | verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | 镜像推送和 SAE 拉取凭证放在哪里 | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | Docker credential helper or short-lived docker login session -> local operator machine only; do not persist in repo; deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke |
| 2 | `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | OSS/RAM/STS 密钥如何导入阿里云运行环境 | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke |
| 3 | `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | DATABASE_URL_CN 从哪里获得并导入到哪里 | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation | corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit |
| 4 | `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | 本机已有 API key 如何迁到阿里云 secret env | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport | corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:readiness:cloud-ready |

## Backend Resource Evidence Matrix

- rows: 10
- immediateRows: 4
- blockedRows: 6
- credentialOrPasswordRows: 6

| order | step | phase | packets | local evidence targets | secret/password handling | verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `BAP00_READONLY_INVENTORY_IDENTITY` | `first_batch_after_action_time_confirmation` | P00_ALIYUN_READONLY_INVENTORY_IDENTITY | deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries | AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history | corepack pnpm aliyun:cloudshell:handoff; corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend |
| 2 | `BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE` | `first_batch_after_action_time_confirmation` | P11_ALIYUN_RDS_DATA_MIGRATION | docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres/sourceInventory/migration/security | database account password; DATABASE_URL_CN secret value; Supabase export/import credentials during migration; DATABASE_URL_CN -> Aliyun KMS / Secrets Manager / SAE secret env only | corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:plan; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:backend-cn:status |
| 3 | `BAP02_OSS_RAM_STS_CLOSE` | `first_batch_after_action_time_confirmation` | P05_OSS_RAM_STS | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss | AccessKeySecret or STS token if runtime role is not selected; ALIYUN_OSS_ACCESS_KEY_SECRET / STS token -> KMS/Secrets Manager/SAE secret env only if runtime role is not used | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status |
| 4 | `BAP03_ACR_PURCHASE_AND_REPOSITORY` | `completed_evidence_recorded` | P03_ACR_PURCHASE | deploy/aliyun-production-cn.image-publish.local.json -> acr.confirmed/registryHost/namespace/repository | registry password only later through docker login or controlled credential helper | corepack pnpm aliyun:image:plan; corepack pnpm aliyun:backend-cn:status |
| 5 | `BAP04_ACR_IMAGE_PUSH_AND_PULL` | `first_batch_after_action_time_confirmation` | P04_ACR_IMAGE_AND_PULL | deploy/aliyun-production-cn.image-publish.local.json -> image/runtime | docker login / registry password or credential helper; SAE image pull credential if not using internal authorization | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:backend-cn:status |
| 6 | `BAP05_BACKEND_ENV_IMPORT` | `blocked_until_dependencies_close` | P06_ENV_IMPORT | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport | DATABASE_URL_CN; ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used | corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:backend-cn:status |
| 7 | `BAP06_SAE_RUNTIME_CREATE` | `blocked_until_dependencies_close` | P08_SAE_RUNTIME_SLS | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime | none | corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status |
| 8 | `BAP07_DOMAINS_HTTPS_ICP` | `blocked_until_dependencies_close` | P07_DOMAIN_DNS_HTTPS | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps | none | corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:backend-cn:status |
| 9 | `BAP08_SLS_ALERTS` | `blocked_until_dependencies_close` | P08_SAE_RUNTIME_SLS | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts | none | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status |
| 10 | `BAP09_POSTDEPLOY_SMOKE` | `blocked_until_dependencies_close` | P09_PRODUCTION_DEPLOY | release artifacts -> postdeploy smoke evidence | none | corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin |

## Apply Steps

### BAP00_READONLY_INVENTORY_IDENTITY

- title: Restore Aliyun CLI or CloudShell read-only inventory evidence
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: readonly_inventory_identity_and_non_secret_writeback
- requiredAuthorizationPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- consolePath: 本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell
- currentEvidence: cloudInventoryStrictReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cliConfigProbeFailureCategory=aliyun_cli_profile_not_configured; cloudShellCurrentStatus=disconnected_restart_instance_confirmation_required; cloudShellConnecting=false; cloudShellTerminalInputVisible=true; cloudShellCanRunReadOnlyInventory=false; cloudShellRequiresOpenConfirmation=false; cloudShellRequiresRestartConfirmation=true; cloudShellBlockers=cloudshell_disconnected_restart_instance_confirmation_required
- currentBlockers: cloudInventory:readonly_inventory_strict_ready=0/9, aliyun_cli_profile_not_configured
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- userMustHandle: If the current CloudShell tab is disconnected, reconnecting it still requires action-time confirmation.; Confirm that the restart-instance prompt may terminate the current session and create a new session before continuing.; AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history
- actionTimeConfirmation.minimumUserPhrase: 授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- actionTimeConfirmation.allowedActions: 动作时确认 CloudShell 重启实例提示后恢复会话；若不确认，则改用已安全配置的 Aliyun CLI profile。; 只运行本仓库生成的 List/Describe/stat/get inventory 命令。; 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- actionTimeConfirmation.explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 除用户明确确认 CloudShell 重启实例提示外，不做任何 production-cn deploy、env import、资源创建、购买或 DNS 变更。
- nonSecretEvidenceToRecord: readyLocalOperations count; executedCommandResults count; cloudApiCalledCommandResults count; mutationPerformedCommandResults=0; observed/not_found/blocked operation ids; timestamp and evidence handles only
- verifyCommands: corepack pnpm aliyun:cloudshell:handoff; corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE

- title: Create Aliyun RDS PostgreSQL and close Supabase-to-RDS migration
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: paid_resource_create_and_data_migration
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- consolePath: 阿里云控制台 -> 云数据库 RDS -> PostgreSQL -> cn-hangzhou
- currentEvidence: inventory.rdsPostgres=observed_or_unknown; rdsLocalExists=true; rdsLocalReady=false; appApiRoutesTouchingSupabaseCompatibility=29/31; appApiRoutesWithSupabaseDataAccess=4/31; firstVersionRdsRoutesTouchingSupabaseCompatibility=23/25; firstVersionRdsRoutesWithSupabaseDataAccess=0/25; postgresDataAccessAdapterDetected=true; schemaApplyCandidate.status=blocked_supabase_specific_sql_present; schemaApplyCandidate.readyToApplySchema=false; schemaApplyCandidate.findingCount=181; schemaApplyCandidate.categories=extension_review,policy_statement,row_level_security,supabase_auth_schema,supabase_auth_uid,supabase_service_role,supabase_storage_schema; rdsApplyCandidate.readyToApplySchema=false; rdsApplyCandidate.findingCount=22; rdsApplyCandidate.categories=extension_review; rdsApplyCandidate.removedStatementCount=97; rdsApplyCandidate.rewrittenStatementCount=12; rdsApplyCandidate.reviewPlanItemCount=1; rdsApplyCandidate.reviewPlanFindingCount=22; rdsApplyCandidate.reviewPlanCategories=extension_review; rdsMigrationPackageHandoff=docs/app-production-cn-rds-migration-package.md
- currentBlockers: DATABASE_URL_CN, RDS_MIGRATION_EVIDENCE_NOT_READY, rdsEvidence:todo:rdsPostgres.instanceId, rdsEvidence:todo:rdsPostgres.engineVersion, rdsEvidence:todo:rdsPostgres.networkAccess, rdsEvidence:todo:rdsPostgres.databaseName, rdsEvidence:todo:rdsPostgres.evidence, rdsEvidence:rdsPostgres.confirmed, rdsEvidence:rdsPostgres.databaseAccountReady, rdsEvidence:rdsPostgres.databaseUrlCnSecretImported, rdsEvidence:migration.schemaCompatibilityReviewed, rdsEvidence:migration.supabaseSpecificSqlResolved, rdsEvidence:migration.rdsExtensionSupportConfirmed, rdsEvidence:migration.schemaMigrated, rdsEvidence:migration.dataMigrated, rdsEvidence:migration.rowCountValidationPassed, rdsEvidence:migration.criticalRecordValidationPassed, rdsEvidence:migration.appApiSmokeOnRdsPassed, rdsEvidence:migration.supabaseNoLongerFormalTarget, rdsEvidence:migration.rollbackRunbookReviewed, rdsEvidence:migration.rollbackValidationPassed
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres/sourceInventory/migration/security; DATABASE_URL_CN -> Aliyun KMS / Secrets Manager / SAE secret env only
- userMustHandle: RDS purchase/spec confirmation if billed; database account password; DATABASE_URL_CN secret value; Supabase SQL compatibility review before applying schema to Aliyun RDS; Supabase-specific auth/storage/RLS/service_role SQL rewrite or explicit resolution; Aliyun RDS PostgreSQL extension support confirmation; Supabase export/import credentials during migration; migration rollback confirmation
- nonSecretEvidenceToRecord: RDS instance id/name/region/engine version; database name; database account ready=true; DATABASE_URL_CN secret imported=true without value; schemaCompatibilityReviewed=true; supabaseSpecificSqlResolved=true; rdsExtensionSupportConfirmed=true; schema/data/row-count/critical-record/rollback validation handles
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:plan; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:backend-cn:status

### BAP02_OSS_RAM_STS_CLOSE

- title: Close OSS audio bucket RAM least privilege or STS/runtime role
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: ram_policy_binding_or_secret_runtime_role
- requiredAuthorizationPackets: P05_OSS_RAM_STS
- consolePath: 阿里云控制台 -> OSS / RAM / STS
- currentEvidence: inventory.ossAudioBucket=not_observed; ossResource.observedStatus=bucket_visible_unconfirmed; ossResource.observedReadiness=partial; ossResource.currentEvidence1=chrome_oss_bucket_2026-06-27T00:17_CST_bucket_exists_cn-hangzhou_private_acl_standard_storage_zero_files_external_endpoint_oss-cn-hangzhou_internal_endpoint_oss-cn-hangzhou-internal_zero_files_ram_sts_not_confirmed_cors_not_reverified_on_overview; ossResource.currentEvidence2=oss.accessPlan.selectedMode=pending_choose_sae_runtime_role_or_sts; ossResource.currentEvidence3=oss.accessPlan.selectedReady=false; ossResource.missing=oss:confirmed; ossResource.missing=oss:ramLeastPrivilege; ossResource.missing=observed:bucket_visible_unconfirmed; bucket=meiye-huajing-service-records-production-cn; serviceRecordPrefix=service-records/production-cn
- currentBlockers: OSS_RAM_STS_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_SECRET / STS token -> KMS/Secrets Manager/SAE secret env only if runtime role is not used
- userMustHandle: AccessKeySecret or STS token if runtime role is not selected; RAM policy attachment or runtime role authorization
- nonSecretEvidenceToRecord: confirmed=true; ramLeastPrivilege=true; runtime role or STS path selected; serviceRecordPrefix=service-records/production-cn
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status

### BAP03_ACR_PURCHASE_AND_REPOSITORY

- title: Confirm ACR Enterprise instance, namespace, and repository
- canStartAfterActionTimeConfirmation: false
- blockedUntil: none
- mutationType: paid_resource_purchase_or_confirmation
- requiredAuthorizationPackets: P03_ACR_PURCHASE
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版实例/命名空间/镜像仓库
- currentEvidence: inventory.acrImage=observed_or_unknown; edition=ACR Enterprise Economic; region=cn-hangzhou; term=1 month; quotedAmount=CNY 117.00; acr.purchaseCandidate.confirmed=true; repository=meiye-huajing-app-api
- currentBlockers: none
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.confirmed/registryHost/namespace/repository
- userMustHandle: ACR paid purchase confirmation already recorded as non-secret evidence; registry password only later through docker login or controlled credential helper
- nonSecretEvidenceToRecord: acr.purchaseCandidate.confirmed=true; actual registryHost; actual namespace; repository created
- verifyCommands: corepack pnpm aliyun:image:plan; corepack pnpm aliyun:backend-cn:status

### BAP04_ACR_IMAGE_PUSH_AND_PULL

- title: Push backend image to ACR and configure SAE pull evidence
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: docker_login_push_and_runtime_pull_secret
- requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
- consolePath: 本机 Docker + 阿里云 ACR + SAE runtime image pull
- currentEvidence: image.localDigestReady=true; localDockerImage.status=docker_daemon_unavailable_or_timeout; acr.purchaseCandidate.confirmed=true; runtime.appName=meiye-huajing-app-api-production-cn; observedResourceStatus=acr_repository_confirmed_image_push_pending
- currentBlockers: ACR_IMAGE_REGISTRY_NOT_READY, SAE_RUNTIME_NOT_READY
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> image/runtime; SAE runtime image pull config
- userMustHandle: docker login / registry password or credential helper; SAE image pull credential if not using internal authorization
- nonSecretEvidenceToRecord: imagePushed=true; remoteImage; remoteDigest sha256; digestVerified=true; runtime.remoteImageConfigured=true; runtime.imagePullConfigured=true
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:backend-cn:status

### BAP05_BACKEND_ENV_IMPORT

- title: Import backend env into SAE/KMS/Secrets Manager
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- mutationType: secret_env_import
- requiredAuthorizationPackets: P06_ENV_IMPORT
- consolePath: 阿里云控制台 -> SAE 环境变量 / KMS / Secrets Manager
- currentEvidence: readySecretEnvVariableCount=17; wechatExcludedFromBackend=true
- currentBlockers: DATABASE_URL_CN, ENV_IMPORT_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport; Aliyun KMS / Secrets Manager / SAE secret env
- userMustHandle: DATABASE_URL_CN; ready secret env import; ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used; SUPABASE_SERVICE_ROLE_KEY only if migration compatibility remains temporarily needed
- nonSecretEvidenceToRecord: envImport.confirmed=true; target=SAE/KMS/SecretsManager; secretNotInImage=true; importedAt timestamp
- verifyCommands: corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:backend-cn:status

### BAP06_SAE_RUNTIME_CREATE

- title: Create SAE custom-container runtime
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT
- mutationType: runtime_create_or_update
- requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
- consolePath: 阿里云控制台 -> SAE -> cn-hangzhou
- currentEvidence: inventory.saeRuntime=observed_or_unknown
- currentBlockers: SAE_RUNTIME_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime
- userMustHandle: SAE paid/runtime resource confirmation if prompted; runtime env visibility check without exposing values
- nonSecretEvidenceToRecord: provider=SAE; region=cn-hangzhou; appName=meiye-huajing-app-api-production-cn; containerPort=3000; healthPath=/api/healthz; confirmed=true
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status

### BAP07_DOMAINS_HTTPS_ICP

- title: Bind api-cn/assets-cn DNS, HTTPS, and ICP-compliant public access
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP06_SAE_RUNTIME_CREATE, BAP02_OSS_RAM_STS_CLOSE
- mutationType: dns_https_certificate_binding
- requiredAuthorizationPackets: P07_DOMAIN_DNS_HTTPS
- consolePath: 阿里云控制台 -> 云解析 DNS / 数字证书 / SAE 或 OSS-CDN 自定义域名
- currentEvidence: api-cn.ipgongchang.xin=not_ready; assets-cn.ipgongchang.xin=not_ready
- currentBlockers: API_DOMAIN_HTTPS_ICP_NOT_READY, ASSET_DOMAIN_HTTPS_ICP_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- userMustHandle: DNS change confirmation; certificate issuance/binding confirmation; ICP compliance confirmation
- nonSecretEvidenceToRecord: dnsResolvedToAliyun=true; httpsEnabled=true; icpReady=true; confirmed=true
- verifyCommands: corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:backend-cn:status

### BAP08_SLS_ALERTS

- title: Configure SLS health and 5xx alerts
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP06_SAE_RUNTIME_CREATE
- mutationType: observability_alert_create
- requiredAuthorizationPackets: P08_SAE_RUNTIME_SLS
- consolePath: 阿里云控制台 -> 日志服务 SLS
- currentEvidence: inventory.slsProject=not_observed; slsResource.observedStatus=project_logstore_visible_alerts_pending; slsResource.observedReadiness=partial; slsResource.currentEvidence1=chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; slsResource.currentEvidence2=runtimeSlsPlan.ready=false; slsResource.currentEvidence3=runtimeSlsPlan.slsAlerts.selectedMode=pending_bind_sae_logs_and_alerts; slsResource.missing=slsAlerts:confirmed; slsResource.missing=slsAlerts:healthAlertConfigured; slsResource.missing=slsAlerts:serverErrorAlertConfigured; slsResource.missing=observed:project_logstore_visible_alerts_pending; alerts=0
- currentBlockers: SLS_ALERTS_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- userMustHandle: alert recipient/channel confirmation if needed
- nonSecretEvidenceToRecord: healthAlertConfigured=true; serverErrorAlertConfigured=true; confirmed=true
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status

### BAP09_POSTDEPLOY_SMOKE

- title: Run Aliyun backend health and APP API smoke
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP
- mutationType: production_deploy_and_smoke
- requiredAuthorizationPackets: P09_PRODUCTION_DEPLOY
- consolePath: Aliyun SAE deployment + local smoke commands
- currentEvidence: baseUrl=https://api-cn.ipgongchang.xin; expected unauthenticated business routes return 401
- currentBlockers: POSTDEPLOY_SMOKE_NOT_RUN
- writeTargets: release artifacts -> postdeploy smoke evidence
- userMustHandle: production deploy authorization; rollback decision if smoke fails
- nonSecretEvidenceToRecord: /api/healthz ready; APP API route smoke passed; service-record upload smoke passed after auth
- verifyCommands: corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin; corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin

## Verification Order

- corepack pnpm aliyun:backend-cn:status
- corepack pnpm aliyun:env:handoff:backend
- corepack pnpm aliyun:user:actions:backend
- corepack pnpm aliyun:action:authorization:backend
- corepack pnpm aliyun:cloudshell:handoff
- corepack pnpm aliyun:cloud:inventory-results:strict
- corepack pnpm aliyun:rds:migration:package
- corepack pnpm aliyun:rds:migration:evidence
- corepack pnpm aliyun:cloud:confirmations
- corepack pnpm aliyun:image:plan
- corepack pnpm aliyun:evidence:writeback:backend
- corepack pnpm aliyun:operator:tasks:backend
- corepack pnpm aliyun:operator:handoff:backend
- corepack pnpm aliyun:backend-cn:apply-package
- corepack pnpm aliyun:predeploy

## Safety Boundary

- This command does not create, modify, purchase, deploy, push images, import secrets, or mutate DNS.
- Every apply step still needs action-time confirmation before external mutation.
- Only non-secret evidence handles, resource names, booleans, timestamps, and digest strings may be written to .local.json files.
- DATABASE_URL_CN, database password, AccessKeySecret, AppSecret, RAM Secret, STS token, registry password, cookie, certificate private key, Android keystore password, and Supabase service role key must never be written to JSON, Markdown, Docker image, APP bundle, mini-program package, git, or shell history.
