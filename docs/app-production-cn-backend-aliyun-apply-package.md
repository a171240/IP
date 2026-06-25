# APP production-cn Aliyun backend apply package

Generated at: 2026-06-25T19:55:59.513Z

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
- P03: 购买或确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117，并创建/确认 namespace 和 repository。

本批明确不做：微信开放平台移动应用、Android release signing、Apple Team ID/AASA、docker login/push、SAE runtime 创建、全量 env import、DNS/HTTPS/ICP 变更、production deploy、postdeploy smoke、git push。

必须停手等用户确认的点：

- CloudShell 如出现性能型 NAS 费用提示，确认后才可点击开通。
- RDS 如涉及规格购买、实例费用、数据库账号密码或迁移执行，动作前确认。
- ACR 付款页必须再次确认规格、地域、1个月和 CNY117 金额。
- AccessKeySecret、STS token、registry password、DATABASE_URL_CN、数据库密码、Supabase service role key 只能进入受控 secret 通道，不能写文档、JSON、镜像、shell history 或 git。

授权口径：授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS，购买/确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理 RDS/OSS 所需的受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。

## Immediate Backend Steps After Confirmation

- BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP03_ACR_PURCHASE_AND_REPOSITORY

## Blocked Backend Steps

- BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE

## Action-Time Authorization Request

- required: true
- currentScope: backend_aliyun_only
- stepIds: BAP00_READONLY_INVENTORY_IDENTITY, BAP03_ACR_PURCHASE_AND_REPOSITORY, BAP02_OSS_RAM_STS_CLOSE, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE
- packetIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- recommendedUserReply: 授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS，购买/确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理 RDS/OSS 所需的受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。
- allowedActions: 恢复阿里云 CLI/CloudShell 只读盘点身份，只运行 allowlisted List/Describe/stat/get inventory 命令。; 创建或确认 cn-hangzhou RDS PostgreSQL、数据库、账号和网络访问策略，并只把 DATABASE_URL_CN 写入阿里云受控 secret env。; 确认 OSS bucket/CORS/service-records 前缀，绑定最小权限 RAM/STS 或运行时角色。; 购买或确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117，并记录 registry host、namespace、repository 等非密钥证据。
- explicitlyExcluded: 不创建微信开放平台移动应用，不处理 Android release signing，不读取 Apple Team ID/AASA。; 不执行 production-cn 部署、postdeploy smoke、DNS/HTTPS/ICP 变更或 git push。; 不执行 docker login/push，不配置 SAE 镜像拉取。; 不执行全量 SAE 环境变量导入；只允许本批 RDS/OSS 动作要求的受控 secret env 写入。; 不把 DATABASE_URL_CN、数据库密码、AccessKeySecret、STS token、registry password、Supabase service role key、cookie 或证书私钥写入 JSON、Markdown、Docker 镜像、App 包、小程序包、shell history 或 git。
- valueHandling: 只允许记录变量名、资源名、布尔值、时间戳、digest、控制台路径和非密钥 evidence handle。; 密钥和密码只进入阿里云 KMS/Secrets Manager/SAE secret env 或受控凭证通道。

## User Intervention

- requiredIds: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_ACR_PAID_PURCHASE, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE, USER_CONFIRM_PRODUCTION_DEPLOY
- paymentOrBillingConfirmations: RDS PostgreSQL instance/spec purchase or existing instance confirmation; ACR Enterprise Economic cn-hangzhou 1 month quoted CNY 117.00; SAE runtime/public ingress/SLS/certificate costs if prompted by Aliyun
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
- paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE
- controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- actionIds: S08_ALIYUN_RDS_DATABASE_URL, S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT, S04_ACR_REGISTRY_AUTH, S03_ACR_PAID_PURCHASE
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包
- DATABASE_URL_CN must come from Aliyun RDS PostgreSQL after schema/data migration validation and must only enter KMS/Secrets Manager/SAE secret env.
- Ready local secret variables still need controlled Aliyun secret-env import; names can be reported, values must not be copied into JSON, Markdown, Docker images, git, chat, or shell history.
- ACR purchase and registry/runtime pull credentials require action-time confirmation; registry password or pull secret must stay in Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings.

## Backend Credential Acquisition Queue

- queueScope: backend_aliyun_only
- missingCredentialNames: DATABASE_URL_CN
- onlyMissingBackendCredentialValue: DATABASE_URL_CN
- readySecretsPendingCloudImport: 17
- requiresActionTimeConfirmationIds: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT

| order | category | actionId | question | obtainFrom | destination | verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | 阿里云 ACR 是否需要购买和确认规格 | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence | corepack pnpm aliyun:image:plan; corepack pnpm aliyun:resources:matrix; corepack pnpm aliyun:user:actions |
| 2 | `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | 镜像推送和 SAE 拉取凭证放在哪里 | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke |
| 3 | `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | OSS/RAM/STS 密钥如何导入阿里云运行环境 | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke |
| 4 | `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | DATABASE_URL_CN 从哪里获得并导入到哪里 | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation | corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit |
| 5 | `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | 本机已有 API key 如何迁到阿里云 secret env | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport | corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:readiness:cloud-ready |

## Apply Steps

### BAP00_READONLY_INVENTORY_IDENTITY

- title: Restore Aliyun CLI or CloudShell read-only inventory evidence
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: readonly_inventory_identity_and_non_secret_writeback
- requiredAuthorizationPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- consolePath: 本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell
- currentEvidence: cloudInventoryStrictReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cliConfigProbeFailureCategory=aliyun_cli_profile_not_configured
- currentBlockers: cloudInventory:readonly_inventory_strict_ready=0/9, aliyun_cli_profile_not_configured
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- userMustHandle: Aliyun CLI default profile or CloudShell logged-in read-only identity; If CloudShell shows an 开通 page with a performance NAS usage-fee warning, confirm that warning before clicking 开通.; If the current CloudShell tab is disconnected, reconnecting it still requires action-time confirmation.; AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history
- actionTimeConfirmation.minimumUserPhrase: 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- actionTimeConfirmation.allowedActions: If CloudShell requires service activation, confirm the performance NAS usage-fee warning before clicking 开通.; Reconnect the existing Aliyun CloudShell session or configure the official Aliyun CLI profile.; Run only the generated List/Describe/stat/get inventory commands.; Write only resource names, booleans, timestamps, command status, digest handles, and non-secret evidence handles.
- actionTimeConfirmation.explicitlyExcluded: No Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation commands.; No docker login/push, registry password, AccessKeySecret, STS token, cookie, or certificate private key capture.; No production-cn deploy, env import, business resource creation, or billing action beyond the explicitly confirmed CloudShell activation warning.
- nonSecretEvidenceToRecord: readyLocalOperations count; executedCommandResults count; cloudApiCalledCommandResults count; mutationPerformedCommandResults=0; observed/not_found/blocked operation ids; timestamp and evidence handles only
- verifyCommands: corepack pnpm aliyun:cloudshell:handoff; corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE

- title: Create Aliyun RDS PostgreSQL and close Supabase-to-RDS migration
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: paid_resource_create_and_data_migration
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- consolePath: 阿里云控制台 -> 云数据库 RDS -> PostgreSQL -> cn-hangzhou
- currentEvidence: inventory.rdsPostgres=observed_or_unknown; rdsLocalExists=true; rdsLocalReady=false; appApiRoutesTouchingSupabaseCompatibility=29/31; appApiRoutesWithSupabaseDataAccess=4/31; firstVersionRdsRoutesTouchingSupabaseCompatibility=23/25; firstVersionRdsRoutesWithSupabaseDataAccess=0/25; postgresDataAccessAdapterDetected=true; rdsMigrationPackageHandoff=docs/app-production-cn-rds-migration-package.md
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
- currentEvidence: inventory.ossAudioBucket=not_observed; ossResource.observedStatus=bucket_visible_unconfirmed; ossResource.observedReadiness=partial; ossResource.currentEvidence1=chrome_oss_bucket_2026-06-25T19:47_CST_bucket_exists_meiye-huajing-service-records-production-cn_visible_oss-cn-hangzhou_overview_object_page_prefix_service-records-production-cn_ram_sts_not_confirmed; ossResource.currentEvidence2=observedResourceStatus=bucket_visible_unconfirmed; ossResource.currentEvidence3=observedResourceReadiness=partial; ossResource.missing=oss:confirmed; ossResource.missing=oss:ramLeastPrivilege; ossResource.missing=observed:bucket_visible_unconfirmed; bucket=meiye-huajing-service-records-production-cn; serviceRecordPrefix=service-records/production-cn
- currentBlockers: OSS_RAM_STS_NOT_READY
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_SECRET / STS token -> KMS/Secrets Manager/SAE secret env only if runtime role is not used
- userMustHandle: AccessKeySecret or STS token if runtime role is not selected; RAM policy attachment or runtime role authorization
- nonSecretEvidenceToRecord: confirmed=true; ramLeastPrivilege=true; runtime role or STS path selected; serviceRecordPrefix=service-records/production-cn
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:backend-cn:status

### BAP03_ACR_PURCHASE_AND_REPOSITORY

- title: Confirm ACR Enterprise instance, namespace, and repository
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: paid_resource_purchase_or_confirmation
- requiredAuthorizationPackets: P03_ACR_PURCHASE
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版实例/命名空间/镜像仓库
- currentEvidence: inventory.acrImage=observed_or_unknown; edition=ACR Enterprise Economic; region=cn-hangzhou; term=1 month; quotedAmount=CNY 117.00; repository=meiye-huajing-app-api
- currentBlockers: ACR_IMAGE_REGISTRY_NOT_READY
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.confirmed/registryHost/namespace/repository
- userMustHandle: ACR paid purchase confirmation; registry password only later through docker login or controlled credential helper
- nonSecretEvidenceToRecord: acr.purchaseCandidate.confirmed=true; actual registryHost; actual namespace; repository created
- verifyCommands: corepack pnpm aliyun:image:plan; corepack pnpm aliyun:backend-cn:status

### BAP04_ACR_IMAGE_PUSH_AND_PULL

- title: Push backend image to ACR and configure SAE pull evidence
- canStartAfterActionTimeConfirmation: false
- blockedUntil: BAP03_ACR_PURCHASE_AND_REPOSITORY
- mutationType: docker_login_push_and_runtime_pull_secret
- requiredAuthorizationPackets: P04_ACR_IMAGE_AND_PULL
- consolePath: 本机 Docker + 阿里云 ACR + SAE runtime image pull
- currentEvidence: localDockerImage.status=ready
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
- currentEvidence: inventory.slsProject=not_observed; slsResource.observedStatus=project_logstore_visible_alerts_pending; slsResource.observedReadiness=partial; slsResource.currentEvidence1=chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; slsResource.currentEvidence2=observedResourceStatus=project_logstore_visible_alerts_pending; slsResource.currentEvidence3=observedResourceReadiness=partial; slsResource.missing=slsAlerts:confirmed; slsResource.missing=slsAlerts:healthAlertConfigured; slsResource.missing=slsAlerts:serverErrorAlertConfigured; slsResource.missing=observed:project_logstore_visible_alerts_pending; alerts=0
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
