# 美业话镜 APP production-cn 用户动作简报

Generated: 2026-06-25T10:57:06.589Z

## 结论

- 现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，本简报只列用户/操作员还要做什么、从哪里取得、写到哪里，不输出任何密钥值。
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canDeployNow: false
- ready: 0 / 9
- blocked: 9
- nextActionTimeConfirmations: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- deferredAppLaunchConfirmations: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- blockedCredentialCount: 1
- readySecretEnvVariableCount: 17
- containsValues: false
- secretLeakCheck: true
- mutationPerformed: false

## 密钥/密码/受控变量获取摘要

- canCodexProceedWithoutUser: false
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- actionTimeConfirmationRequiredIds: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

| 类别 | 动作 ID | 状态 | 缺失变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | blocked | none | none | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | blocked | none | none | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only |
| `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | blocked | none | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | blocked | DATABASE_URL_CN | none | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation |
| `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | none | ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport |

### 已 ready 但仍需导入阿里云 secret env 的变量组

| 类别 | owner | 导入目标 | 变量名 |
| --- | --- | --- | --- |
| `legacy_database_migration_source` | Vercel/Supabase 操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `app_auth` | 后端发布操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | WECHAT_LOGIN_SECRET |
| `aliyun_oss` | 阿里云 OSS/RAM 操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET |
| `bailian_asr` | 阿里云百炼/DashScope 操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | DASHSCOPE_API_KEY |
| `deepseek_summary` | DeepSeek/API 操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY |
| `volc_speech` | 火山引擎语音操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY |
| `backend_ops` | 后端运维/管理员 | 阿里云 KMS/Secrets Manager/SAE secret env | ADMIN_USER_IDS, CREDITS_IP_SALT |
| `legacy_content_provider` | 旧内容供应商/API 操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | APIMART_API_KEY |
| `mini_program_compat` | 微信公众平台小程序操作员 | 阿里云 KMS/Secrets Manager/SAE secret env | WECHAT_MINI_APPID, WECHAT_MINI_SECRET |

### 处理规则

- blockedVariableNames 只说明还缺哪些变量名，不包含 value。
- readySecretEnvVariableNames 表示本机已有 ready 状态但仍只能通过 KMS/Secrets Manager/SAE secret env 导入。
- AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、keystore password 和 Supabase service role key 不能写入 JSON、Markdown、Docker 镜像或 git。

## 当前可开始的动作时确认

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- actionId: U00_ALIYUN_READONLY_INVENTORY_IDENTITY
- owner: 用户/阿里云只读盘点操作员
- minimumUserPhrase: 授权重新连接阿里云 CloudShell 或配置 Aliyun CLI，只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- allowedActions: 使用阿里云官方 CLI 或 CloudShell 的只读身份。; 只运行本仓库生成的 List/Describe/stat/get inventory 命令。; 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 不做 production-cn deploy、env import、资源创建或计费动作。
- completionEvidence: cloudInventoryResults.localReady=true; readyLocalOperations=9/9; executedCommandResults=9/9; mutationPerformedCommandResults=0
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend
- nonSecretEvidenceOnly: true

### P03_ACR_PURCHASE 确认 ACR 企业版付费购买

- actionId: U03_ACR_PURCHASE_CONFIRMATION
- owner: 用户/阿里云 ACR 操作员
- minimumUserPhrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- allowedActions: 在阿里云 ACR 企业版购买页确认规格、地域、时长和金额。; 完成购买后创建或确认实例、namespace 和 repository。; 只记录 registry host、namespace、repository 和非密钥购买证据。
- explicitlyExcluded: 未明确确认金额前不点击付款。; 不执行 docker login/push。; 不记录 registry password、RAM Secret 或 token。
- completionEvidence: acr.purchaseCandidate.confirmed=true; acr.registryHost actual aliyuncs.com host; acr.namespace created; repository=meiye-huajing-app-api
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- verifyCommands: corepack pnpm aliyun:image:plan
- nonSecretEvidenceOnly: true

### P05_OSS_RAM_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- actionId: U05_OSS_RAM_OR_STS
- owner: 阿里云 OSS/RAM 操作员
- minimumUserPhrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- allowedActions: 确认 bucket、region、CORS 和 service-records/production-cn 前缀。; 绑定最小权限 RAM 策略或配置 STS/运行时角色。; 只把 AccessKeySecret 或 STS token 导入 KMS/Secrets Manager/SAE secret env。
- explicitlyExcluded: 不创建可提交的长期明文 Secret。; 不下载 OSS 对象内容。; 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。
- completionEvidence: oss.confirmed=true; oss.ramLeastPrivilege=true; serviceRecordPrefix=service-records/production-cn; secret imported through Aliyun controlled secret env only
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke
- nonSecretEvidenceOnly: false

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- actionId: U11_ALIYUN_RDS_DATA_MIGRATION
- owner: 阿里云 RDS/后端数据迁移操作员
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- allowedActions: 创建或确认 cn-hangzhou RDS PostgreSQL 实例、数据库、账号和网络白名单/内网访问策略。; 执行 Supabase 到 RDS/PostgreSQL 的 schema/data 迁移与回滚验收。; 只把 DATABASE_URL_CN 导入 KMS/Secrets Manager/SAE secret env，并记录非密钥迁移证据。
- explicitlyExcluded: 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。; 不把 Supabase 当作正式 production-cn 数据库目标。; 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; DATABASE_URL_CN imported through secret env only; backend production-cn data access no longer depends on Supabase as formal database target; migration and rollback validation pass
- writeTargets: DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env; RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告
- verifyCommands: corepack pnpm aliyun:readiness; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy
- nonSecretEvidenceOnly: false

## 延期的完整 APP 发布项

- 微信开放平台移动应用、Android release signing 和 Apple Team ID 已延期到阿里云后端上线后处理；本 backend-only 输出不列这些延期项的密钥、密码或签名环境变量。
- deferredAppLaunchConfirmations: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID

## 动作清单

### U00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- status: blocked
- owner: 用户/阿里云只读盘点操作员
- obtainFrom: 本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- variableNames: none
- currentBlockers: readonly_inventory_strict_ready=0/9; cloudInventory:I01_SAE_RUNTIME; cloudInventory:I02_ACR_IMAGE; cloudInventory:I03_DNS_API_DOMAIN; cloudInventory:I04_DNS_ASSET_DOMAIN; cloudInventory:I05_OSS_AUDIO_BUCKET; cloudInventory:I06_SLS_ALERTS; cloudInventory:I07_CERT_HTTPS; cloudInventory:I08_RDS_POSTGRES; cloudInventory:I09_TAIR_REDIS
- currentEvidence: cloudInventoryResults.templateReady=true; cloudInventoryResults.localExists=true; cloudInventoryResults.localReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cloudApiCalledCommandResults=9; mutationPerformedCommandResults=0
- requiresActionTimeConfirmation: true
- requiredUserAction: 授权重新连接阿里云 CloudShell 或配置 Aliyun CLI，只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- unblockCondition: cloudInventoryResults.localReady=true，readyLocalOperations=9/9，executedCommandResults=9/9，mutationPerformedCommandResults=0。
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### U03_ACR_PURCHASE_CONFIRMATION 确认 ACR 企业版付费购买

- status: blocked
- owner: 用户/阿里云 ACR 操作员
- obtainFrom: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- variableNames: none
- currentBlockers: S03_ACR_PAID_PURCHASE:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=ready; R02_ACR_IMAGE_REGISTRY:localDockerImage.repoDigest=meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_buy_page_2026-06-22T19:08_CST_enterprise_economic_cn-hangzhou_instance_meiye-huajing_duration_1month_payable_cny117_not_purchased_action_time_confirmation_required; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=purchase_candidate_visible_not_purchased; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=blocked
- requiresActionTimeConfirmation: true
- requiredUserAction: 确认是否购买 ACR Enterprise Economic / cn-hangzhou / 1 month / CNY 117.00。
- unblockCondition: 完成 ACR 企业版实例购买并创建 namespace/repository 后，填入非密钥 registry/image/digest 证据。
- verifyCommands: corepack pnpm aliyun:image:plan

### U04_ACR_RUNTIME_AUTH 配置 ACR 镜像推送和 SAE 镜像拉取权限

- status: blocked
- owner: 阿里云 ACR/SAE 操作员
- obtainFrom: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- variableNames: none
- currentBlockers: S04_ACR_REGISTRY_AUTH:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=ready; R02_ACR_IMAGE_REGISTRY:localDockerImage.repoDigest=meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_buy_page_2026-06-22T19:08_CST_enterprise_economic_cn-hangzhou_instance_meiye-huajing_duration_1month_payable_cny117_not_purchased_action_time_confirmation_required; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=purchase_candidate_visible_not_purchased; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=blocked
- requiresActionTimeConfirmation: true
- requiredUserAction: ACR 实例 ready 后，通过 docker credential helper、RAM、或 SAE 运行时镜像拉取配置完成认证。
- unblockCondition: imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true。
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke

### U05_OSS_RAM_OR_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- status: blocked
- owner: 阿里云 OSS/RAM 操作员
- obtainFrom: 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- variableNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- currentBlockers: S05_OSS_RAM_SECRET_OR_STS:blocked; R05_OSS_AUDIO_STORAGE:oss:confirmed; R05_OSS_AUDIO_STORAGE:oss:ramLeastPrivilege; oss:confirmed; oss:ramLeastPrivilege
- currentEvidence: oss.confirmed=false; oss.bucket=meiye-huajing-service-records-production-cn; oss.region=cn-hangzhou; oss.corsConfigured=true; oss.ramLeastPrivilege=false; oss.serviceRecordPrefix=service-records/production-cn; R05_OSS_AUDIO_STORAGE:cloudshell_oss_cors_ram_2026-06-24T01:30_CST_bucket_exists_acl_private_cors_allowed_origins_api-cn_assets-cn_methods_GET_POST_PUT_HEAD_policy_MeiyeHuajingServiceRecordsOssPolicy_exists_attachmentCount_0_ram_least_privilege_not_bound; R05_OSS_AUDIO_STORAGE:observedResourceStatus=bucket_visible_unconfirmed; R05_OSS_AUDIO_STORAGE:observedResourceReadiness=partial
- requiresActionTimeConfirmation: true
- requiredUserAction: 把已创建的 OSS 最小权限策略绑定到实际运行身份，并选择受限 AccessKey 或 STS/运行时角色注入方案。
- unblockCondition: oss.ramLeastPrivilege=true，且对应 secret/token 只通过阿里云密钥环境注入。
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke

### U11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- status: blocked
- owner: 阿里云 RDS/后端数据迁移操作员
- obtainFrom: 阿里云控制台 -> RDS PostgreSQL -> cn-hangzhou 实例；后端 Supabase 到 RDS/PostgreSQL 迁移 runbook
- writeTargets: DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env; RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告
- variableNames: DATABASE_URL_CN
- currentBlockers: requiredEnv:DATABASE_URL_CN; DATABASE_URL_CN_status:todo; rdsMigrationIncludedInThisRelease=false
- currentEvidence: bridgeDataLayer.current=Supabase migration source / legacy compatibility only; bridgeDataLayer.target=Aliyun RDS PostgreSQL; databaseUrlCnStatus=todo; rdsMigrationIncludedInThisRelease=false; rdsMigrationRequiredForFinalProductionCn=true
- requiresActionTimeConfirmation: true
- requiredUserAction: 创建或确认阿里云 RDS PostgreSQL，生成受控连接串，完成 Supabase 到 RDS/PostgreSQL 的代码、schema、数据和回滚迁移验收。
- unblockCondition: DATABASE_URL_CN ready，RDS PostgreSQL 迁移和回滚验收通过，production-cn 后端正式数据库目标不再是 Supabase。
- verifyCommands: corepack pnpm aliyun:readiness; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy

### U06_ENV_IMPORT 把 ready 环境变量导入 SAE/KMS/Secrets Manager

- status: blocked
- owner: 阿里云运行环境/密钥操作员
- obtainFrom: 现有 Vercel/Supabase/阿里云/DeepSeek/火山/微信平台变量源；只由有权限的操作员导入，不在报告中显示值
- writeTargets: 阿里云 SAE 环境变量 / KMS / Secrets Manager; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
- variableNames: NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, ADMIN_USER_IDS, CREDITS_IP_SALT, APIMART_API_KEY, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- currentBlockers: S06_READY_SENSITIVE_ENV_IMPORT:blocked; R06_ENV_IMPORT:missing_required_env:DATABASE_URL_CN; R06_ENV_IMPORT:envImport:confirmed; R06_ENV_IMPORT:envImport:secretNotInImage; R06_ENV_IMPORT:envImport:placeholder:importedAt; R06_ENV_IMPORT:envImport:placeholder:evidence; envImport:confirmed; envImport:secretNotInImage; requiredEnv:DATABASE_URL_CN
- currentEvidence: envImport.confirmed=false; envImport.target=SAE; envImport.secretNotInImage=false
- requiresActionTimeConfirmation: true
- requiredUserAction: 这些敏感或连接类变量名在本地已有 ready 值，但仍需导入阿里云运行环境；脚本只输出变量名，不输出值。
- unblockCondition: envImport.confirmed=true 且 envImport.secretNotInImage=true。
- verifyCommands: corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:readiness:cloud-ready

### U07_DOMAIN_DNS_HTTPS_ICP 配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据

- status: blocked
- owner: 阿里云域名/证书操作员
- obtainFrom: 阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 OSS/CDN 入口
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps
- variableNames: none
- currentBlockers: R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:apiDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:apiDomainHttps:icpReady; R03_API_DOMAIN_HTTPS:assetDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:assetDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:icpReady; apiDomainHttps:confirmed; apiDomainHttps:dnsResolvedToAliyun; apiDomainHttps:httpsEnabled; apiDomainHttps:icpReady; assetDomainHttps:confirmed; assetDomainHttps:dnsResolvedToAliyun; assetDomainHttps:httpsEnabled; assetDomainHttps:icpReady
- currentEvidence: apiDomainHttps.confirmed=false; apiDomainHttps.host=api-cn.ipgongchang.xin; apiDomainHttps.dnsResolvedToAliyun=false; apiDomainHttps.httpsEnabled=false; apiDomainHttps.icpReady=false; assetDomainHttps.confirmed=false; assetDomainHttps.host=assets-cn.ipgongchang.xin; assetDomainHttps.dnsResolvedToAliyun=false; assetDomainHttps.httpsEnabled=false; assetDomainHttps.icpReady=false; R03_API_DOMAIN_HTTPS:chrome_dns_console_2026-06-24T00:05_CST_ipgongchang_xin_search_api-cn_no_data_existing_api_A_106.14.241.129_public_dns_api-cn_198.18.0.30_https_ECONNRESET_no_sae_endpoint_no_https_icp_ready; R03_API_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R03_API_DOMAIN_HTTPS:observedResourceReadiness=blocked; R04_ASSET_DOMAIN_HTTPS:chrome_dns_console_2026-06-24T00:05_CST_ipgongchang_xin_search_assets-cn_no_data_public_dns_assets-cn_198.18.0.32_https_ECONNRESET_no_cdn_or_oss_custom_domain_no_https_icp_ready; R04_ASSET_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R04_ASSET_DOMAIN_HTTPS:observedResourceReadiness=blocked
- requiresActionTimeConfirmation: true
- requiredUserAction: 把 api-cn.ipgongchang.xin 和 assets-cn.ipgongchang.xin 指向阿里云公网入口，配置 HTTPS，并记录 ICP 证据。
- unblockCondition: apiDomainHttps 和 assetDomainHttps confirmed=true、dnsResolvedToAliyun=true、httpsEnabled=true、icpReady=true。
- verifyCommands: corepack pnpm aliyun:domain:strict; corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin

### U08_SAE_RUNTIME_AND_SLS 确认 SAE runtime 和 SLS health/5xx 告警

- status: pending_cloud
- owner: 阿里云操作员/运维操作员
- obtainFrom: 阿里云控制台 -> SAE / 日志服务 SLS / 应用监控告警
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- variableNames: none
- currentBlockers: R01_SAE_RUNTIME:runtime:confirmed; R07_SLS_ALERTS:slsAlerts:confirmed; R07_SLS_ALERTS:slsAlerts:healthAlertConfigured; R07_SLS_ALERTS:slsAlerts:serverErrorAlertConfigured; runtime:confirmed; slsAlerts:confirmed; slsAlerts:healthAlertConfigured; slsAlerts:serverErrorAlertConfigured
- currentEvidence: runtime.confirmed=false; runtime.provider=SAE; runtime.region=cn-hangzhou; runtime.appName=meiye-huajing-app-api-production-cn; runtime.containerPort=3000; runtime.healthPath=/api/healthz; slsAlerts.confirmed=false; slsAlerts.slsProject=meiye-huajing-app-prod-cn; slsAlerts.healthAlertConfigured=false; slsAlerts.serverErrorAlertConfigured=false; R01_SAE_RUNTIME:chrome_sae_app_list_2026-06-24T00:00_CST_cn-hangzhou_huadong1_hangzhou_no_instances_target_app_meiye-huajing-app-api-production-cn_not_present_runtime_not_confirmed; R01_SAE_RUNTIME:observedResourceStatus=not_created_or_not_confirmed; R01_SAE_RUNTIME:observedResourceReadiness=blocked; R07_SLS_ALERTS:cloudshell_sls_2026-06-24T01:30_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_exists_alerts_0_dashboards_0_health_5xx_alerts_not_configured; R07_SLS_ALERTS:observedResourceStatus=project_logstore_visible_alerts_pending; R07_SLS_ALERTS:observedResourceReadiness=partial
- requiresActionTimeConfirmation: true
- requiredUserAction: 创建或确认 SAE 自定义容器应用，绑定日志采集，并配置 /api/healthz 和 5xx 告警。
- unblockCondition: runtime.confirmed=true，slsAlerts.confirmed=true，healthAlertConfigured=true，serverErrorAlertConfigured=true。
- verifyCommands: corepack pnpm aliyun:runtime:plan; corepack pnpm aliyun:cloud:confirmations:strict

### U09_DEPLOY_AUTHORIZATION 生产部署、镜像推送、DNS 变更、git push 的动作时授权

- status: blocked
- owner: 用户/发布负责人
- obtainFrom: 本 Codex 线程的明确动作时授权
- writeTargets: release manifest / deployment log
- variableNames: none
- currentBlockers: canDeployNow=false; productionReady=false; requiredEnv:DATABASE_URL_CN; missing_required_env:DATABASE_URL_CN; manual:阿里云 ACR 镜像发布和运行时镜像拉取配置已确认; manual:阿里云 SAE 容器应用已创建，运行端口 3000; manual:api-cn 域名已备案、解析到阿里云入口并配置 HTTPS; manual:assets-cn 域名已备案、解析到阿里云入口并配置 HTTPS; manual:OSS Bucket CORS、RAM 最小权限和服务记录音频前缀已确认; manual:生产环境变量已通过阿里云控制台、KMS 或 Secrets Manager 导入，未把密钥写进镜像; manual:SLS 日志、健康检查失败告警和 5xx 告警已配置
- currentEvidence: verdict=blocked; canDeployNow=false; productionReady=false; cloudConfirmations=0/7
- requiresActionTimeConfirmation: true
- requiredUserAction: 所有前置资源 ready 后，再明确授权生产部署、ACR push、DNS 修改或 git push；本简报不自动推断授权。
- unblockCondition: cloud confirmations strict、readiness cloud-ready、image plan strict、domain strict 和 predeploy 全部通过后，由用户明确授权对应外部动作。
- verifyCommands: corepack pnpm aliyun:predeploy; corepack pnpm aliyun:cloud:confirmations:backend:strict

## 安全边界

- 本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署、不 git push。
- 本命令不读取或输出 secret value；只输出变量名、资源名、控制台路径、写入目标和解除条件。
- AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 和 Supabase service role key 不能写入文档、镜像或 git。
