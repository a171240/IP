# 美业话镜 APP production-cn 阿里云动作授权矩阵

Generated: 2026-06-25T23:28:58.814Z

## 结论

- 现在不能部署；当前只推进阿里云后端，微信/Apple/Android 发布项已延期，后端仍缺 RDS、ACR、OSS、SAE、DNS、env、SLS 和 smoke 证据。
- verdict: blocked
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canDeployNow: false
- mutationPerformed: false
- containsValues: false
- secretLeakCheck: true
- actionTimeConfirmationRequired: U00_ALIYUN_READONLY_INVENTORY_IDENTITY, U11_ALIYUN_RDS_DATA_MIGRATION, U05_OSS_RAM_OR_STS, U03_ACR_PURCHASE_CONFIRMATION, U04_ACR_RUNTIME_AUTH, U06_ENV_IMPORT, U07_DOMAIN_DNS_HTTPS_ICP, U08_SAE_RUNTIME_AND_SLS, U09_DEPLOY_AUTHORIZATION
- nextActionTimeConfirmations: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P03_ACR_PURCHASE
- blockedCredentialCount: 1
- readySecretEnvVariableCount: 17
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS

## 目标闭环证据简表

- conclusion: 现在不能部署；这些 packet 只是阿里云后端动作时确认入口，不能替代 RDS/ACR/OSS/SAE/DNS/env/SLS/smoke 证据闭环。
- canDeployNow: false
- canCodexProceedWithoutUser: false
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- canStartNowPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P03_ACR_PURCHASE
- deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- blockedByPacketDependencies: P04_ACR_IMAGE_AND_PULL, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, P09_PRODUCTION_DEPLOY

## 允许的本地工作

- 运行本地检查和 smoke。
- 生成不含 value 的 env checklist、user action brief、console runbook、operator handoff 和 release artifacts。
- 把已从控制台只读确认到的资源名、布尔状态、digest 或截图编号写入 ignored 的 .local.json。
- 更新 release manifest、脚本和测试，提交本地安全门禁改动。

## 未获动作时确认前禁止

- 购买 ACR 或任何付费资源。
- 创建/修改 SAE、SLS、OSS、RAM、KMS、Secrets Manager、DNS、证书、CDN 或公网入口。
- 读取、复制、粘贴、导入或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。
- 推送镜像到 ACR、部署 production-cn、修改正式域名解析、git push。
- 创建微信开放平台移动应用或读取审核通过后的 AppSecret，除非用户在动作时明确授权并提供相应账号上下文。

## 当前可开始的动作时确认

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- actionId: U00_ALIYUN_READONLY_INVENTORY_IDENTITY
- owner: 用户/阿里云只读盘点操作员
- sequenceGroup: readonly_inventory
- minimumUserPhrase: 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- allowedActions: 如 CloudShell 页面要求开通，先确认性能型 NAS 费用提示，再进入只读盘点。; 使用阿里云官方 CLI 或 CloudShell 的只读身份。; 只运行本仓库生成的 List/Describe/stat/get inventory 命令。; 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 除用户明确确认 CloudShell 开通页的性能型 NAS 费用提示外，不做任何 production-cn deploy、env import、资源创建或计费动作。
- completionEvidence: cloudInventoryResults.localReady=true; readyLocalOperations=9/9; executedCommandResults=9/9; mutationPerformedCommandResults=0
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend
- nonSecretEvidenceOnly: true

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- actionId: U11_ALIYUN_RDS_DATA_MIGRATION
- owner: 阿里云 RDS/后端数据迁移操作员
- sequenceGroup: cloud_foundation
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- allowedActions: 创建或确认 cn-hangzhou RDS PostgreSQL 实例、数据库、账号和网络白名单/内网访问策略。; 先生成并核对 docs/app-production-cn-rds-migration-package.md，关闭 compatibilityReviewChecklist 6 类 Supabase SQL 兼容审查。; 执行 Supabase 到 RDS/PostgreSQL 的 schema/data 迁移与回滚验收。; 只把 DATABASE_URL_CN 导入 KMS/Secrets Manager/SAE secret env，并记录非密钥迁移证据。
- explicitlyExcluded: 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。; 不把 Supabase 当作正式 production-cn 数据库目标。; 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; database account and least-privilege access are ready; DATABASE_URL_CN imported through secret env only; compatibilityReviewChecklistItemCount=6 is reviewed and closed before schema apply; supabase_auth_uid/supabase_storage_schema/supabase_service_role/row_level_security/policy_statement/extension_review dispositions are recorded without secrets; migration.schemaCompatibilityReviewed=true; migration.supabaseSpecificSqlResolved=true; migration.rdsExtensionSupportConfirmed=true; schema/data/APP API smoke/rollback validation passed; backend production-cn no longer depends on Supabase as formal database target
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy
- nonSecretEvidenceOnly: false

### P05_OSS_RAM_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- actionId: U05_OSS_RAM_OR_STS
- owner: 阿里云 OSS/RAM 操作员
- sequenceGroup: cloud_foundation
- minimumUserPhrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- allowedActions: 确认 bucket、region、CORS 和 service-records/production-cn 前缀。; 绑定最小权限 RAM 策略或配置 STS/运行时角色。; 只把 AccessKeySecret 或 STS token 导入 KMS/Secrets Manager/SAE secret env。
- explicitlyExcluded: 不创建可提交的长期明文 Secret。; 不下载 OSS 对象内容。; 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。
- completionEvidence: oss.confirmed=true; oss.ramLeastPrivilege=true; serviceRecordPrefix=service-records/production-cn; secret imported through Aliyun controlled secret env only
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke
- nonSecretEvidenceOnly: false

### P03_ACR_PURCHASE 确认 ACR 企业版付费购买

- actionId: U03_ACR_PURCHASE_CONFIRMATION
- owner: 用户/阿里云 ACR 操作员
- sequenceGroup: cloud_foundation
- minimumUserPhrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- allowedActions: 在阿里云 ACR 企业版购买页确认规格、地域、时长和金额。; 完成购买后创建或确认实例、namespace 和 repository。; 只记录 registry host、namespace、repository 和非密钥购买证据。
- explicitlyExcluded: 未明确确认金额前不点击付款。; 不执行 docker login/push。; 不记录 registry password、RAM Secret 或 token。
- completionEvidence: acr.purchaseCandidate.confirmed=true; acr.registryHost actual aliyuncs.com host; acr.namespace created; repository=meiye-huajing-app-api
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- verifyCommands: corepack pnpm aliyun:image:plan
- nonSecretEvidenceOnly: true

## 动作分类

### U00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- status: blocked
- automationPolicy: readonly_inventory_identity_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: readonly_cloud_inventory_identity
- why: 严格云证据必须来自 allowlisted Aliyun CLI/CloudShell 只读盘点；浏览器已登录不能直接等同于 cloudInventory strict ready。
- owner: 用户/阿里云只读盘点操作员
- obtainFrom: 本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- variableNames: none
- currentBlockers: readonly_inventory_strict_ready=0/9; cloudInventory:I01_SAE_RUNTIME; cloudInventory:I02_ACR_IMAGE; cloudInventory:I03_DNS_API_DOMAIN; cloudInventory:I04_DNS_ASSET_DOMAIN; cloudInventory:I05_OSS_AUDIO_BUCKET; cloudInventory:I06_SLS_ALERTS; cloudInventory:I07_CERT_HTTPS; cloudInventory:I08_RDS_POSTGRES; cloudInventory:I09_TAIR_REDIS
- currentEvidence: cloudInventoryResults.templateReady=true; cloudInventoryResults.localExists=true; cloudInventoryResults.localReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cloudApiCalledCommandResults=9; mutationPerformedCommandResults=0
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### U11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- status: blocked
- automationPolicy: rds_creation_and_database_migration_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: database_secret_and_migration
- why: 正式国内 production-cn 数据库目标必须是阿里云 RDS PostgreSQL；创建实例、关闭 Supabase SQL 兼容审查、导入 DATABASE_URL_CN 和迁移数据都需要动作时确认。
- owner: 阿里云 RDS/后端数据迁移操作员
- obtainFrom: 阿里云控制台 -> RDS PostgreSQL -> cn-hangzhou 实例；后端 Supabase 到 RDS/PostgreSQL 迁移 runbook
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- variableNames: DATABASE_URL_CN
- currentBlockers: requiredEnv:DATABASE_URL_CN; DATABASE_URL_CN_status:todo; rdsMigrationIncludedInThisRelease=false
- currentEvidence: bridgeDataLayer.current=Supabase migration source / legacy compatibility only; bridgeDataLayer.target=Aliyun RDS PostgreSQL; databaseUrlCnStatus=todo; rdsMigrationIncludedInThisRelease=false; rdsMigrationRequiredForFinalProductionCn=true
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy

### U05_OSS_RAM_OR_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- status: blocked
- automationPolicy: oss_ram_or_sts_secret_channel_required
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: ram_secret_or_sts_import
- why: OSS 最小权限绑定需要选择受控 AccessKey、STS 或运行时角色；Secret 只能进 KMS/Secrets Manager/SAE secret env。
- owner: 阿里云 OSS/RAM 操作员
- obtainFrom: 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- variableNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- currentBlockers: S05_OSS_RAM_SECRET_OR_STS:blocked; R05_OSS_AUDIO_STORAGE:oss:confirmed; R05_OSS_AUDIO_STORAGE:oss:ramLeastPrivilege; oss:confirmed; oss:ramLeastPrivilege
- currentEvidence: oss.confirmed=false; oss.bucket=meiye-huajing-service-records-production-cn; oss.region=cn-hangzhou; oss.corsConfigured=true; oss.ramLeastPrivilege=false; oss.serviceRecordPrefix=service-records/production-cn; R05_OSS_AUDIO_STORAGE:chrome_oss_bucket_2026-06-25T19:47_CST_bucket_exists_meiye-huajing-service-records-production-cn_visible_oss-cn-hangzhou_overview_object_page_prefix_service-records-production-cn_ram_sts_not_confirmed; R05_OSS_AUDIO_STORAGE:observedResourceStatus=bucket_visible_unconfirmed; R05_OSS_AUDIO_STORAGE:observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke

### U03_ACR_PURCHASE_CONFIRMATION 确认 ACR 企业版付费购买

- status: blocked
- automationPolicy: paid_purchase_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: paid_purchase
- why: ACR 企业版购买是付费动作；当前只可记录报价候选，付款前必须确认金额和规格。
- owner: 用户/阿里云 ACR 操作员
- obtainFrom: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- variableNames: none
- currentBlockers: S03_ACR_PAID_PURCHASE:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=ready; R02_ACR_IMAGE_REGISTRY:localDockerImage.repoDigest=meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_instances_2026-06-25T19:47_CST_enterprise_instance_list_visible_create_enterprise_instance_entry_visible_no_meiye_target_instance_or_repository_confirmed_not_purchased_action_time_confirmation_required; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=purchase_candidate_visible_not_purchased; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:image:plan

### U04_ACR_RUNTIME_AUTH 配置 ACR 镜像推送和 SAE 镜像拉取权限

- status: blocked
- automationPolicy: registry_auth_requires_runtime_secret_channel
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: registry_password_or_runtime_pull_secret
- why: 镜像推送和 SAE 拉取配置会涉及 registry 凭证或 RAM/运行时 Secret，不能写入仓库或报告。
- owner: 阿里云 ACR/SAE 操作员
- obtainFrom: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- variableNames: none
- currentBlockers: S04_ACR_REGISTRY_AUTH:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=ready; R02_ACR_IMAGE_REGISTRY:localDockerImage.repoDigest=meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_instances_2026-06-25T19:47_CST_enterprise_instance_list_visible_create_enterprise_instance_entry_visible_no_meiye_target_instance_or_repository_confirmed_not_purchased_action_time_confirmation_required; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=purchase_candidate_visible_not_purchased; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke

### U06_ENV_IMPORT 把 ready 环境变量导入 SAE/KMS/Secrets Manager

- status: blocked
- automationPolicy: secret_import_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: ready_sensitive_env_need_cloud_import
- why: 本地已有部分 ready 变量，但真实 value 只能导入阿里云受控环境，不能输出到文档、JSON、镜像或 git。
- owner: 阿里云运行环境/密钥操作员
- obtainFrom: 现有 Vercel/Supabase/阿里云/DeepSeek/火山/微信平台变量源；只由有权限的操作员导入，不在报告中显示值
- writeTargets: 阿里云 SAE 环境变量 / KMS / Secrets Manager; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
- variableNames: NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, ADMIN_USER_IDS, CREDITS_IP_SALT, APIMART_API_KEY, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- currentBlockers: S06_READY_SENSITIVE_ENV_IMPORT:blocked; R06_ENV_IMPORT:missing_required_env:DATABASE_URL_CN; R06_ENV_IMPORT:envImport:confirmed; R06_ENV_IMPORT:envImport:secretNotInImage; R06_ENV_IMPORT:envImport:placeholder:importedAt; R06_ENV_IMPORT:envImport:placeholder:evidence; envImport:confirmed; envImport:secretNotInImage; requiredEnv:DATABASE_URL_CN
- currentEvidence: envImport.confirmed=false; envImport.target=SAE; envImport.secretNotInImage=false
- verifyCommands: corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:readiness:cloud-ready

### U07_DOMAIN_DNS_HTTPS_ICP 配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据

- status: blocked
- automationPolicy: dns_https_icp_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: public_domain_mutation
- why: DNS/HTTPS/ICP 会改变 APP production-cn 公网入口，动作时必须确认目标入口和证书。
- owner: 阿里云域名/证书操作员
- obtainFrom: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 OSS/CDN 入口
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- variableNames: none
- currentBlockers: R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:apiDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:apiDomainHttps:icpReady; R03_API_DOMAIN_HTTPS:assetDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:assetDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:icpReady; apiDomainHttps:confirmed; apiDomainHttps:dnsResolvedToAliyun; apiDomainHttps:httpsEnabled; apiDomainHttps:icpReady; assetDomainHttps:confirmed; assetDomainHttps:dnsResolvedToAliyun; assetDomainHttps:httpsEnabled; assetDomainHttps:icpReady
- currentEvidence: apiDomainHttps.confirmed=false; apiDomainHttps.host=api-cn.ipgongchang.xin; apiDomainHttps.dnsResolvedToAliyun=false; apiDomainHttps.httpsEnabled=false; apiDomainHttps.icpReady=false; assetDomainHttps.confirmed=false; assetDomainHttps.host=assets-cn.ipgongchang.xin; assetDomainHttps.dnsResolvedToAliyun=false; assetDomainHttps.httpsEnabled=false; assetDomainHttps.icpReady=false; R03_API_DOMAIN_HTTPS:chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_api-cn_no_data_total_0_existing_api_A_106.14.241.129_no_sae_endpoint_no_https_icp_ready; R03_API_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R03_API_DOMAIN_HTTPS:observedResourceReadiness=blocked; R04_ASSET_DOMAIN_HTTPS:chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_assets-cn_no_data_total_0_no_cdn_or_oss_custom_domain_no_https_icp_ready; R04_ASSET_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R04_ASSET_DOMAIN_HTTPS:observedResourceReadiness=blocked
- verifyCommands: corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin

### U08_SAE_RUNTIME_AND_SLS 确认 SAE runtime 和 SLS health/5xx 告警

- status: pending_cloud
- automationPolicy: cloud_resource_creation_requires_action_time_confirmation
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: cloud_resource_mutation
- why: SAE/SLS 创建或配置是阿里云写操作，可能产生资源和计费影响；本脚本只列目标字段和验收方式。
- owner: 阿里云操作员/运维操作员
- obtainFrom: 阿里云控制台 -> SAE / 日志服务 SLS / 应用监控告警
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- variableNames: none
- currentBlockers: R01_SAE_RUNTIME:runtime:confirmed; R07_SLS_ALERTS:slsAlerts:confirmed; R07_SLS_ALERTS:slsAlerts:healthAlertConfigured; R07_SLS_ALERTS:slsAlerts:serverErrorAlertConfigured; runtime:confirmed; slsAlerts:confirmed; slsAlerts:healthAlertConfigured; slsAlerts:serverErrorAlertConfigured
- currentEvidence: runtime.confirmed=false; runtime.provider=SAE; runtime.region=cn-hangzhou; runtime.appName=meiye-huajing-app-api-production-cn; runtime.containerPort=3000; runtime.healthPath=/api/healthz; slsAlerts.confirmed=false; slsAlerts.slsProject=meiye-huajing-app-prod-cn; slsAlerts.healthAlertConfigured=false; slsAlerts.serverErrorAlertConfigured=false; R01_SAE_RUNTIME:chrome_sae_app_list_2026-06-25T19:47_CST_cn-hangzhou_huadong1_hangzhou_no_instances_target_app_meiye-huajing-app-api-production-cn_not_present_runtime_not_confirmed; R01_SAE_RUNTIME:observedResourceStatus=not_created_or_not_confirmed; R01_SAE_RUNTIME:observedResourceReadiness=blocked; R07_SLS_ALERTS:chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; R07_SLS_ALERTS:observedResourceStatus=project_logstore_visible_alerts_pending; R07_SLS_ALERTS:observedResourceReadiness=partial
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations:strict

### U09_DEPLOY_AUTHORIZATION 生产部署、镜像推送、DNS 变更、git push 的动作时授权

- status: blocked
- automationPolicy: production_release_requires_explicit_authorization
- canCodexProceedWithoutUser: false
- requiresActionTimeConfirmation: true
- blockerClass: production_release
- why: 生产部署、ACR push、DNS 变更和 git push 都必须在云侧严格门禁通过后再单独授权。
- owner: 用户/发布负责人
- obtainFrom: 本 Codex 线程的明确动作时授权
- writeTargets: release manifest / deployment log
- variableNames: none
- currentBlockers: canDeployNow=false; productionReady=false; requiredEnv:DATABASE_URL_CN; missing_required_env:DATABASE_URL_CN; manual:阿里云 ACR 镜像发布和运行时镜像拉取配置已确认; manual:阿里云 SAE 容器应用已创建，运行端口 3000; manual:api-cn 域名已备案、解析到阿里云入口并配置 HTTPS; manual:assets-cn 域名已备案、解析到阿里云入口并配置 HTTPS; manual:OSS Bucket CORS、RAM 最小权限和服务记录音频前缀已确认; manual:生产环境变量已通过阿里云控制台、KMS 或 Secrets Manager 导入，未把密钥写进镜像; manual:SLS 日志、健康检查失败告警和 5xx 告警已配置
- currentEvidence: verdict=blocked; canDeployNow=false; productionReady=false; cloudConfirmations=0/7
- verifyCommands: corepack pnpm aliyun:predeploy; corepack pnpm aliyun:cloud:confirmations:backend:strict

## 最小授权动作包

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- actionId: U00_ALIYUN_READONLY_INVENTORY_IDENTITY
- status: blocked
- owner: 用户/阿里云只读盘点操作员
- sequenceGroup: readonly_inventory
- dependsOn: none
- blockingDependencies: none
- canStartNow: true
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- allowedActions: 如 CloudShell 页面要求开通，先确认性能型 NAS 费用提示，再进入只读盘点。; 使用阿里云官方 CLI 或 CloudShell 的只读身份。; 只运行本仓库生成的 List/Describe/stat/get inventory 命令。; 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 除用户明确确认 CloudShell 开通页的性能型 NAS 费用提示外，不做任何 production-cn deploy、env import、资源创建或计费动作。
- completionEvidence: cloudInventoryResults.localReady=true; readyLocalOperations=9/9; executedCommandResults=9/9; mutationPerformedCommandResults=0
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- variableNames: none
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- actionId: U11_ALIYUN_RDS_DATA_MIGRATION
- status: blocked
- owner: 阿里云 RDS/后端数据迁移操作员
- sequenceGroup: cloud_foundation
- dependsOn: none
- blockingDependencies: none
- canStartNow: true
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- allowedActions: 创建或确认 cn-hangzhou RDS PostgreSQL 实例、数据库、账号和网络白名单/内网访问策略。; 先生成并核对 docs/app-production-cn-rds-migration-package.md，关闭 compatibilityReviewChecklist 6 类 Supabase SQL 兼容审查。; 执行 Supabase 到 RDS/PostgreSQL 的 schema/data 迁移与回滚验收。; 只把 DATABASE_URL_CN 导入 KMS/Secrets Manager/SAE secret env，并记录非密钥迁移证据。
- explicitlyExcluded: 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。; 不把 Supabase 当作正式 production-cn 数据库目标。; 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; database account and least-privilege access are ready; DATABASE_URL_CN imported through secret env only; compatibilityReviewChecklistItemCount=6 is reviewed and closed before schema apply; supabase_auth_uid/supabase_storage_schema/supabase_service_role/row_level_security/policy_statement/extension_review dispositions are recorded without secrets; migration.schemaCompatibilityReviewed=true; migration.supabaseSpecificSqlResolved=true; migration.rdsExtensionSupportConfirmed=true; schema/data/APP API smoke/rollback validation passed; backend production-cn no longer depends on Supabase as formal database target
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- variableNames: DATABASE_URL_CN
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy

### P05_OSS_RAM_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- actionId: U05_OSS_RAM_OR_STS
- status: blocked
- owner: 阿里云 OSS/RAM 操作员
- sequenceGroup: cloud_foundation
- dependsOn: none
- blockingDependencies: none
- canStartNow: true
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- allowedActions: 确认 bucket、region、CORS 和 service-records/production-cn 前缀。; 绑定最小权限 RAM 策略或配置 STS/运行时角色。; 只把 AccessKeySecret 或 STS token 导入 KMS/Secrets Manager/SAE secret env。
- explicitlyExcluded: 不创建可提交的长期明文 Secret。; 不下载 OSS 对象内容。; 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。
- completionEvidence: oss.confirmed=true; oss.ramLeastPrivilege=true; serviceRecordPrefix=service-records/production-cn; secret imported through Aliyun controlled secret env only
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- variableNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke

### P03_ACR_PURCHASE 确认 ACR 企业版付费购买

- actionId: U03_ACR_PURCHASE_CONFIRMATION
- status: blocked
- owner: 用户/阿里云 ACR 操作员
- sequenceGroup: cloud_foundation
- dependsOn: none
- blockingDependencies: none
- canStartNow: true
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- allowedActions: 在阿里云 ACR 企业版购买页确认规格、地域、时长和金额。; 完成购买后创建或确认实例、namespace 和 repository。; 只记录 registry host、namespace、repository 和非密钥购买证据。
- explicitlyExcluded: 未明确确认金额前不点击付款。; 不执行 docker login/push。; 不记录 registry password、RAM Secret 或 token。
- completionEvidence: acr.purchaseCandidate.confirmed=true; acr.registryHost actual aliyuncs.com host; acr.namespace created; repository=meiye-huajing-app-api
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- variableNames: none
- verifyCommands: corepack pnpm aliyun:image:plan

### P04_ACR_IMAGE_AND_PULL 配置 ACR 镜像推送和 SAE 镜像拉取权限

- actionId: U04_ACR_RUNTIME_AUTH
- status: blocked
- owner: 阿里云 ACR/SAE 操作员
- sequenceGroup: image_runtime
- dependsOn: P03_ACR_PURCHASE
- blockingDependencies: P03_ACR_PURCHASE
- canStartNow: false
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权把后端镜像推送到已创建的 ACR，并配置 SAE 拉取该镜像；不输出 registry 密码。
- allowedActions: 构建并 smoke 本地 Docker 镜像。; 通过受控 docker credential helper、RAM 或阿里云运行时配置完成镜像推送/拉取。; 在 image-publish.local.json 记录 remote image、sha256 digest 和布尔证据。
- explicitlyExcluded: 不购买 ACR。; 不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。; 不部署 production-cn，除非 U09 单独授权。
- completionEvidence: acr.imagePushed=true; acr.digestVerified=true; runtime.remoteImageConfigured=true; runtime.imagePullConfigured=true; remoteDigest sha256 verified
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- variableNames: none
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke

### P06_ENV_IMPORT 把 ready 环境变量导入 SAE/KMS/Secrets Manager

- actionId: U06_ENV_IMPORT
- status: blocked
- owner: 阿里云运行环境/密钥操作员
- sequenceGroup: runtime_config
- dependsOn: P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- blockingDependencies: P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- canStartNow: false
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权把已准备好的 production-cn 环境变量导入 SAE/KMS/Secrets Manager；不在报告中显示任何 value。
- allowedActions: 按 env handoff 清单导入 plain env 和 secret env。; plain env 只放非密钥标识符和公开配置。; secret env 通过 KMS/Secrets Manager/SAE secret env 导入。; 完成后只记录 importedAt、target 和 secretNotInImage=true。
- explicitlyExcluded: 不把任何 value 粘贴到 Markdown、JSON、Dockerfile、镜像或 git。; 不部署 production-cn。
- completionEvidence: envImport.confirmed=true; envImport.secretNotInImage=true; importedAt actual timestamp; corepack pnpm aliyun:readiness:cloud-ready no longer reports envImport blockers
- writeTargets: 阿里云 SAE 环境变量 / KMS / Secrets Manager; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
- variableNames: NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, ADMIN_USER_IDS, CREDITS_IP_SALT, APIMART_API_KEY, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- verifyCommands: corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:readiness:cloud-ready

### P07_DOMAIN_DNS_HTTPS 配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据

- actionId: U07_DOMAIN_DNS_HTTPS_ICP
- status: blocked
- owner: 阿里云域名/证书操作员
- sequenceGroup: public_entry
- dependsOn: P08_SAE_RUNTIME_SLS
- blockingDependencies: P08_SAE_RUNTIME_SLS
- canStartNow: false
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权配置 api-cn/assets-cn 的 DNS、HTTPS 和 ICP 证据，目标必须是阿里云公网入口。
- allowedActions: 把 api-cn.ipgongchang.xin 指向 SAE/SLB/API 公网入口。; 把 assets-cn.ipgongchang.xin 指向 OSS/CDN 静态资源入口。; 绑定 HTTPS 证书并记录 ICP ready 证据。
- explicitlyExcluded: 不指向 Vercel、localhost、example 或 198.18.0.x 特殊用途地址。; 不下载证书私钥。; 不部署 production-cn。
- completionEvidence: apiDomainHttps.dnsResolvedToAliyun=true; apiDomainHttps.httpsEnabled=true; apiDomainHttps.icpReady=true; assetDomainHttps.dnsResolvedToAliyun=true; assetDomainHttps.httpsEnabled=true; assetDomainHttps.icpReady=true
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- variableNames: none
- verifyCommands: corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin

### P08_SAE_RUNTIME_SLS 确认 SAE runtime 和 SLS health/5xx 告警

- actionId: U08_SAE_RUNTIME_AND_SLS
- status: pending_cloud
- owner: 阿里云操作员/运维操作员
- sequenceGroup: runtime_observability
- dependsOn: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P06_ENV_IMPORT
- blockingDependencies: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P06_ENV_IMPORT
- canStartNow: false
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权创建/确认 SAE production-cn 应用和 SLS health/5xx 告警；不导入密钥、不部署镜像。
- allowedActions: 创建或确认 cn-hangzhou SAE 自定义容器应用，端口 3000，健康检查 /api/healthz。; 绑定 SLS 日志采集。; 配置 /api/healthz 健康失败告警和 5xx 告警。; 只记录资源名、布尔状态和非密钥证据。
- explicitlyExcluded: 不购买 ACR。; 不导入环境变量 value。; 不推送镜像、不执行生产部署。
- completionEvidence: runtime.confirmed=true; runtime.containerPort=3000; runtime.healthPath=/api/healthz; slsAlerts.healthAlertConfigured=true; slsAlerts.serverErrorAlertConfigured=true
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- variableNames: none
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations:backend:strict

### P09_PRODUCTION_DEPLOY 生产部署、镜像推送、DNS 变更、git push 的动作时授权

- actionId: U09_DEPLOY_AUTHORIZATION
- status: blocked
- owner: 用户/发布负责人
- sequenceGroup: production_release
- dependsOn: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS
- blockingDependencies: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS
- canStartNow: false
- requiresActionTimeConfirmation: true
- minimumUserPhrase: 授权在所有 strict 门禁通过后执行 production-cn 部署；不包含 git push 或小程序上传。
- allowedActions: 确认 cloud confirmations、image plan、domain、readiness 和 predeploy strict 全部通过。; 执行 production-cn 后端部署。; 运行 postdeploy smoke 并记录部署证据。
- explicitlyExcluded: 不 git push，除非单独授权。; 不上传微信小程序或 APP 商店包。; 不修改 Supabase production schema/data。
- completionEvidence: corepack pnpm aliyun:cloud:confirmations:strict pass; corepack pnpm aliyun:image:plan:strict pass; corepack pnpm aliyun:domain:strict pass; corepack pnpm aliyun:readiness:cloud-ready pass; corepack pnpm aliyun:postdeploy:smoke pass
- writeTargets: release manifest / deployment log
- variableNames: none
- verifyCommands: corepack pnpm aliyun:predeploy; corepack pnpm aliyun:cloud:confirmations:backend:strict

## 下一组验证命令

- `corepack pnpm aliyun:action:authorization:backend`
- `corepack pnpm aliyun:user:actions:backend`
- `corepack pnpm aliyun:sensitive:blockers:backend`
- `corepack pnpm aliyun:env:handoff:backend`
- `corepack pnpm aliyun:operator:tasks:backend`
- `corepack pnpm aliyun:backend-cn:status`
