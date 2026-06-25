# APP production-cn Aliyun backend apply package

Generated at: 2026-06-25T06:57:36.653Z

## Scope

- currentScope: backend_aliyun_only
- canProceedWithoutWechat: true
- canDeployBackendNow: false
- canApplyBackendNowWithoutUserIntervention: false
- backendTargetReady: 0/8
- resourceEvidenceReady: 0/7

## Immediate Backend Steps After Confirmation

- BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP03_ACR_PURCHASE_AND_REPOSITORY

## Blocked Backend Steps

- BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE

## User Intervention

- requiredIds: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_ACR_PAID_PURCHASE, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE, USER_CONFIRM_PRODUCTION_DEPLOY
- paymentOrBillingConfirmations: RDS PostgreSQL instance/spec purchase or existing instance confirmation; ACR Enterprise Economic cn-hangzhou 1 month quoted CNY 117.00; SAE runtime/public ingress/SLS/certificate costs if prompted by Aliyun
- secretOrPasswordHandling: Aliyun CLI profile, CloudShell session, AccessKeySecret or STS token if needed for read-only inventory; DATABASE_URL_CN; database account password; ALIYUN_OSS_ACCESS_KEY_SECRET or STS token if runtime role is not used; ACR registry password or credential helper; ready secret env import values; SUPABASE_SERVICE_ROLE_KEY only for controlled migration/export compatibility
- blockedCredentialCount: 2
- blockedCredentialNames: ALIYUN_OSS_SECURITY_TOKEN, DATABASE_URL_CN
- backendNowExcludes: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_PLATFORM_MOBILE_APP, ANDROID_RELEASE_WECHAT_SIGNATURE

## Apply Steps

### BAP00_READONLY_INVENTORY_IDENTITY

- title: Restore Aliyun CLI or CloudShell read-only inventory evidence
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: readonly_inventory_identity_and_non_secret_writeback
- requiredAuthorizationPackets: P11_ALIYUN_READONLY_INVENTORY_IDENTITY
- consolePath: 本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell
- currentEvidence: cloudInventoryStrictReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cliConfigProbeFailureCategory=aliyun_cli_profile_not_configured
- currentBlockers: cloudInventory:readonly_inventory_strict_ready=0/9, aliyun_cli_profile_not_configured
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- userMustHandle: Aliyun CLI default profile or CloudShell logged-in read-only identity; If the current CloudShell tab is disconnected, reconnecting it still requires action-time confirmation.; AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history
- actionTimeConfirmation.minimumUserPhrase: 授权重新连接阿里云 CloudShell 或配置 Aliyun CLI，只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- actionTimeConfirmation.allowedActions: Reconnect the existing Aliyun CloudShell session or configure the official Aliyun CLI profile.; Run only the generated List/Describe/stat/get inventory commands.; Write only resource names, booleans, timestamps, command status, digest handles, and non-secret evidence handles.
- actionTimeConfirmation.explicitlyExcluded: No Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation commands.; No docker login/push, registry password, AccessKeySecret, STS token, cookie, or certificate private key capture.; No production-cn deploy, env import, resource creation, or billing action.
- nonSecretEvidenceToRecord: readyLocalOperations count; executedCommandResults count; cloudApiCalledCommandResults count; mutationPerformedCommandResults=0; observed/not_found/blocked operation ids; timestamp and evidence handles only
- verifyCommands: corepack pnpm aliyun:cloudshell:handoff; corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE

- title: Create Aliyun RDS PostgreSQL and close Supabase-to-RDS migration
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: paid_resource_create_and_data_migration
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- consolePath: 阿里云控制台 -> 云数据库 RDS -> PostgreSQL -> cn-hangzhou
- currentEvidence: inventory.rdsPostgres=observed_or_unknown; rdsLocalExists=true; rdsLocalReady=false; appApiRoutesTouchingSupabaseCompatibility=29/31; appApiRoutesWithSupabaseDataAccess=4/31; firstVersionRdsRoutesTouchingSupabaseCompatibility=23/25; firstVersionRdsRoutesWithSupabaseDataAccess=0/25; postgresDataAccessAdapterDetected=true
- currentBlockers: DATABASE_URL_CN, RDS_MIGRATION_EVIDENCE_NOT_READY, rdsEvidence:todo:rdsPostgres.instanceId, rdsEvidence:todo:rdsPostgres.engineVersion, rdsEvidence:todo:rdsPostgres.networkAccess, rdsEvidence:todo:rdsPostgres.databaseName, rdsEvidence:todo:rdsPostgres.evidence, rdsEvidence:rdsPostgres.confirmed, rdsEvidence:rdsPostgres.databaseAccountReady, rdsEvidence:rdsPostgres.databaseUrlCnSecretImported, rdsEvidence:migration.schemaMigrated, rdsEvidence:migration.dataMigrated, rdsEvidence:migration.rowCountValidationPassed, rdsEvidence:migration.criticalRecordValidationPassed, rdsEvidence:migration.appApiSmokeOnRdsPassed, rdsEvidence:migration.supabaseNoLongerFormalTarget, rdsEvidence:migration.rollbackRunbookReviewed, rdsEvidence:migration.rollbackValidationPassed
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres/sourceInventory/migration/security; DATABASE_URL_CN -> Aliyun KMS / Secrets Manager / SAE secret env only
- userMustHandle: RDS purchase/spec confirmation if billed; database account password; DATABASE_URL_CN secret value; Supabase export/import credentials during migration; migration rollback confirmation
- nonSecretEvidenceToRecord: RDS instance id/name/region/engine version; database name; database account ready=true; DATABASE_URL_CN secret imported=true without value; schema/data/row-count/critical-record/rollback validation handles
- verifyCommands: corepack pnpm aliyun:rds:migration:plan; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:backend-cn:status

### BAP02_OSS_RAM_STS_CLOSE

- title: Close OSS audio bucket RAM least privilege or STS/runtime role
- canStartAfterActionTimeConfirmation: true
- blockedUntil: none
- mutationType: ram_policy_binding_or_secret_runtime_role
- requiredAuthorizationPackets: P05_OSS_RAM_STS
- consolePath: 阿里云控制台 -> OSS / RAM / STS
- currentEvidence: inventory.ossAudioBucket=not_observed; bucket=meiye-huajing-service-records-production-cn; serviceRecordPrefix=service-records/production-cn
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
- currentEvidence: inventory.slsProject=not_observed; alerts=0
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
