# 美业话镜 APP production-cn 用户动作简报

Generated: 2026-06-26T17:02:50.758Z

## 结论

- 现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，本简报只列用户/操作员还要做什么、从哪里取得、写到哪里，不输出任何密钥值。
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canDeployNow: false
- ready: 1 / 9
- blocked: 8
- nextActionTimeConfirmations: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- deferredAppLaunchConfirmations: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- blockedCredentialCount: 1
- readySecretEnvVariableCount: 17
- containsValues: false
- secretLeakCheck: true
- mutationPerformed: false

## 动作时授权请求

- required: true
- currentScope: backend_aliyun_only
- packetIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- recommendedUserReply: 授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS；ACR 购买证据已确认，镜像推送/SAE 拉取配置需另按 P04 动作时确认；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理 RDS/OSS 所需的受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。
- valueHandling: 只允许记录变量名、资源名、布尔值、时间戳、digest、控制台路径和非密钥 evidence handle。; DATABASE_URL_CN、数据库密码、AccessKeySecret、STS token、registry password、Supabase service role key、cookie 和证书私钥不得写入 JSON、Markdown、Docker 镜像、App 包、小程序包、shell history 或 git。
- explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 除用户明确确认 CloudShell 重启实例提示外，不做任何 production-cn deploy、env import、资源创建、购买或 DNS 变更。; 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。; 不把 Supabase 当作正式 production-cn 数据库目标。; 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。; 不创建可提交的长期明文 Secret。; 不下载 OSS 对象内容。; 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。; 不购买 ACR。; 不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。; 不部署 production-cn，除非 U09 单独授权。; 不创建微信开放平台移动应用，不处理 Android release signing，不读取 Apple Team ID/AASA。; 不执行 production-cn 部署、postdeploy smoke、DNS/HTTPS/ICP 变更或 git push。; 不执行全量 SAE 环境变量导入；只允许本批 RDS/OSS 动作要求的受控 secret env 写入。

## 密钥/密码/受控变量获取摘要

- canCodexProceedWithoutUser: false
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- actionTimeConfirmationRequiredIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

| 类别 | 动作 ID | 状态 | 缺失变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | blocked | none | none | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | Docker credential helper or short-lived docker login session -> local operator machine only; do not persist in repo; deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only |
| `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | blocked | none | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | blocked | DATABASE_URL_CN | none | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation |
| `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | none | ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport |

### 后端-only 获取/导入队列

- queueScope: backend_aliyun_only
- missingCredentialNames: DATABASE_URL_CN
- onlyMissingBackendCredentialValue: DATABASE_URL_CN
- readySecretsPendingCloudImport: 17
- requiresActionTimeConfirmationIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT

| 顺序 | 类别 | 动作 ID | 要回答的问题 | 获取位置 | 导入/写入目标 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | 镜像推送和 SAE 拉取凭证放在哪里 | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | Docker credential helper or short-lived docker login session -> local operator machine only; do not persist in repo; deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke |
| 2 | `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | OSS/RAM/STS 密钥如何导入阿里云运行环境 | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke |
| 3 | `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | DATABASE_URL_CN 从哪里获得并导入到哪里 | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation | corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit |
| 4 | `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | 本机已有 API key 如何迁到阿里云 secret env | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport | corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:readiness:cloud-ready |

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
- minimumUserPhrase: 授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- allowedActions: 动作时确认 CloudShell 重启实例提示后恢复会话；若不确认，则改用已安全配置的 Aliyun CLI profile。; 只运行本仓库生成的 List/Describe/stat/get inventory 命令。; 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- explicitlyExcluded: 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。; 不执行 docker login/push。; 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。; 除用户明确确认 CloudShell 重启实例提示外，不做任何 production-cn deploy、env import、资源创建、购买或 DNS 变更。
- completionEvidence: cloudInventoryResults.localReady=true; readyLocalOperations=9/9; executedCommandResults=9/9; mutationPerformedCommandResults=0
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend
- nonSecretEvidenceOnly: true
- cloudShellCurrentStatus: disconnected_restart_instance_confirmation_required
- cloudShellConnecting: false
- cloudShellTerminalInputVisible: true
- cloudShellCanRunReadOnlyInventory: false

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- actionId: U11_ALIYUN_RDS_DATA_MIGRATION
- owner: 阿里云 RDS/后端数据迁移操作员
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- allowedActions: 创建或确认 cn-hangzhou RDS PostgreSQL 实例、数据库、账号和网络白名单/内网访问策略。; 先生成并核对 docs/app-production-cn-rds-migration-package.md，关闭 compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查。; 执行 Supabase 到 RDS/PostgreSQL 的 schema/data 迁移与回滚验收。; 只把 DATABASE_URL_CN 导入 KMS/Secrets Manager/SAE secret env，并记录非密钥迁移证据。
- explicitlyExcluded: 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。; 不把 Supabase 当作正式 production-cn 数据库目标。; 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; database account and least-privilege access are ready; DATABASE_URL_CN imported through secret env only; compatibilityReviewChecklistItemCount=7 is reviewed and closed before schema apply; supabase_auth_schema/supabase_auth_uid/supabase_storage_schema/supabase_service_role/row_level_security/policy_statement/extension_review dispositions are recorded without secrets; migration.schemaCompatibilityReviewed=true; migration.supabaseSpecificSqlResolved=true; migration.rdsExtensionSupportConfirmed=true; schema/data/APP API smoke/rollback validation passed; backend production-cn no longer depends on Supabase as formal database target
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy
- nonSecretEvidenceOnly: false

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

### P04_ACR_IMAGE_AND_PULL 配置 ACR 镜像推送和 SAE 镜像拉取权限

- actionId: U04_ACR_RUNTIME_AUTH
- owner: 阿里云 ACR/SAE 操作员
- minimumUserPhrase: 授权把后端镜像推送到已创建的 ACR，并配置 SAE 拉取该镜像；不输出 registry 密码。
- allowedActions: 构建并 smoke 本地 Docker 镜像。; 通过受控 docker credential helper、RAM 或阿里云运行时配置完成镜像推送/拉取。; 在 image-publish.local.json 记录 remote image、sha256 digest 和布尔证据。
- explicitlyExcluded: 不购买 ACR。; 不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。; 不部署 production-cn，除非 U09 单独授权。
- completionEvidence: acr.imagePushed=true; acr.digestVerified=true; runtime.remoteImageConfigured=true; runtime.imagePullConfigured=true; remoteDigest sha256 verified
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke
- nonSecretEvidenceOnly: true

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
- currentEvidence: cloudInventoryResults.templateReady=true; cloudInventoryResults.localExists=true; cloudInventoryResults.localReady=false; readyLocalOperations=0/9; executedCommandResults=9/9; cloudApiCalledCommandResults=9; mutationPerformedCommandResults=0; cloudShellCurrentStatus=disconnected_restart_instance_confirmation_required; cloudShellConnecting=false; cloudShellTerminalInputVisible=true; cloudShellCanRunReadOnlyInventory=false; cloudShellRequiresOpenConfirmation=false; cloudShellRequiresRestartConfirmation=true; cloudShellBlockers=cloudshell_disconnected_restart_instance_confirmation_required
- requiresActionTimeConfirmation: true
- requiredUserAction: 授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- unblockCondition: cloudInventoryResults.localReady=true，readyLocalOperations=9/9，executedCommandResults=9/9，mutationPerformedCommandResults=0。
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend

### U11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- status: blocked
- owner: 阿里云 RDS/后端数据迁移操作员
- obtainFrom: 阿里云控制台 -> RDS PostgreSQL -> cn-hangzhou 实例；后端 Supabase 到 RDS/PostgreSQL 迁移 runbook
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- variableNames: DATABASE_URL_CN
- currentBlockers: requiredEnv:DATABASE_URL_CN; DATABASE_URL_CN_status:todo; rdsMigrationIncludedInThisRelease=false
- currentEvidence: bridgeDataLayer.current=Supabase migration source / legacy compatibility only; bridgeDataLayer.target=Aliyun RDS PostgreSQL; databaseUrlCnStatus=todo; rdsMigrationIncludedInThisRelease=false; rdsMigrationRequiredForFinalProductionCn=true
- requiresActionTimeConfirmation: true
- requiredUserAction: 创建或确认阿里云 RDS PostgreSQL；先生成 RDS 迁移包并关闭 compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查，再生成受控连接串，完成 Supabase 到 RDS/PostgreSQL 的代码、schema、数据、APP API smoke 和回滚迁移验收。
- unblockCondition: DATABASE_URL_CN ready，compatibilityReviewChecklist 7 类已关闭，migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true，RDS PostgreSQL 迁移和回滚验收通过，production-cn 后端正式数据库目标不再是 Supabase。
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy

### U05_OSS_RAM_OR_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- status: blocked
- owner: 阿里云 OSS/RAM 操作员
- obtainFrom: 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- variableNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- currentBlockers: S05_OSS_RAM_SECRET_OR_STS:blocked; R05_OSS_AUDIO_STORAGE:oss:confirmed; R05_OSS_AUDIO_STORAGE:oss:ramLeastPrivilege; oss:confirmed; oss:ramLeastPrivilege
- currentEvidence: oss.confirmed=false; oss.bucket=meiye-huajing-service-records-production-cn; oss.region=cn-hangzhou; oss.corsConfigured=true; oss.ramLeastPrivilege=false; oss.serviceRecordPrefix=service-records/production-cn; R05_OSS_AUDIO_STORAGE:chrome_oss_bucket_2026-06-27T00:17_CST_bucket_exists_cn-hangzhou_private_acl_standard_storage_zero_files_external_endpoint_oss-cn-hangzhou_internal_endpoint_oss-cn-hangzhou-internal_zero_files_ram_sts_not_confirmed_cors_not_reverified_on_overview; R05_OSS_AUDIO_STORAGE:oss.accessPlan.selectedMode=pending_choose_sae_runtime_role_or_sts; R05_OSS_AUDIO_STORAGE:oss.accessPlan.selectedReady=false; R05_OSS_AUDIO_STORAGE:oss.accessPlan.selectedBlockers=oss.confirmed,oss.ramLeastPrivilege; R05_OSS_AUDIO_STORAGE:oss.accessPlan.recommendedModeIds=sae_runtime_role,sts_assume_role; R05_OSS_AUDIO_STORAGE:oss.accessPlan.policyFile=deploy/aliyun-production-cn.oss-ram-policy.json; R05_OSS_AUDIO_STORAGE:oss.accessPlan.policyName=MeiyeHuajingServiceRecordsOssPolicy; R05_OSS_AUDIO_STORAGE:oss.accessPlan.allowedActions=oss:GetObject,oss:PutObject,oss:PostObject; R05_OSS_AUDIO_STORAGE:oss.accessPlan.resourceScope=acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*; R05_OSS_AUDIO_STORAGE:oss.runtimePrefixContract.requiredEnvName=SERVICE_RECORD_OSS_PREFIX; R05_OSS_AUDIO_STORAGE:oss.runtimePrefixContract.expectedValue=service-records/production-cn; R05_OSS_AUDIO_STORAGE:oss.runtimePrefixContract.policyScopeCoversExpectedPrefix=true; R05_OSS_AUDIO_STORAGE:oss.runtimePrefixContract.currentConfirmationPrefixReady=true; R05_OSS_AUDIO_STORAGE:oss.accessPlan.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; R05_OSS_AUDIO_STORAGE:oss.execution.canStartP05AfterActionTimeConfirmation=true; R05_OSS_AUDIO_STORAGE:oss.execution.resourceReadyForP05=true; R05_OSS_AUDIO_STORAGE:oss.execution.accessGrantReady=false; R05_OSS_AUDIO_STORAGE:oss.execution.preferredModeId=sae_runtime_role; R05_OSS_AUDIO_STORAGE:oss.execution.preferredModeAvoidsLongLivedSecret=true; R05_OSS_AUDIO_STORAGE:oss.execution.fallbackSecretModeIds=sts_assume_role,least_privilege_ram_user_secret_env; R05_OSS_AUDIO_STORAGE:oss.execution.fallbackSecretEnvNames=ALIYUN_OSS_ACCESS_KEY_ID,ALIYUN_OSS_ACCESS_KEY_SECRET,ALIYUN_OSS_SECURITY_TOKEN; R05_OSS_AUDIO_STORAGE:oss.execution.nextOperatorDecision=choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy; R05_OSS_AUDIO_STORAGE:observedResourceStatus=bucket_visible_unconfirmed; R05_OSS_AUDIO_STORAGE:observedResourceReadiness=partial
- requiresActionTimeConfirmation: true
- requiredUserAction: 把已创建的 OSS 最小权限策略绑定到实际运行身份，并选择受限 AccessKey 或 STS/运行时角色注入方案。
- unblockCondition: oss.ramLeastPrivilege=true，且对应 secret/token 只通过阿里云密钥环境注入。
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke

### U03_ACR_PURCHASE_CONFIRMATION 确认 ACR 企业版购买/仓库证据

- status: ready
- owner: 用户/阿里云 ACR 操作员
- obtainFrom: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版实例/命名空间/镜像仓库
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- variableNames: none
- currentBlockers: none
- currentEvidence: R02_ACR_IMAGE_REGISTRY:chrome_acr_repository_2026-06-27T00:11_CST_repo_meiye-huajing-app-api_private_local_normal_cn-hangzhou_repo_id_crr-k3xw5jyl3glkm1vs; chrome_acr_images_2026-06-27T00:13_CST_no_production_cn_tag_or_sha256_digest_visible_on_images_page; R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:dockerContext.status=ready; R02_ACR_IMAGE_REGISTRY:dockerContext.ok=true; R02_ACR_IMAGE_REGISTRY:dockerContext.checkedFiles=7; R02_ACR_IMAGE_REGISTRY:dockerContext.sensitiveEnvExcluded=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=docker_daemon_unavailable_or_timeout; R02_ACR_IMAGE_REGISTRY:localDockerImage.dockerClientInstalled=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.dockerServerAvailable=false; R02_ACR_IMAGE_REGISTRY:localDockerImage.nextEvidenceAction=Start Docker Desktop/daemon for local smoke, or use ACR import/VPC runner without relying on this machine's Docker daemon.; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_2026-06-26T11:33_CST_instance_meiye-huajing-app-api_cri-imlf4amccfw6m6sa_running_economic_cn-hangzhou_expires_2026-07-27_namespace_meiye-huajing-app-api_normal_repo_meiye-huajing-app-api_private_local_repo_created; chrome_acr_repo_detail_2026-06-26T12:40_CST_public_address_requires_access_control_network_entrance_vpc_registry_host_visible; user_confirmed_acr_paid_success_2026-06-26T21:18_CST; user_confirmed_acr_paid_success_2026-06-27T00:36_CST; R02_ACR_IMAGE_REGISTRY:acr.publicNetworkEntranceEnabled=false; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.selectedPath=pending_choose_vpc_registry_or_enable_public_network_entrance; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.selectedReady=false; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.recommendedPathIds=vpc_registry_from_aliyun_network,acr_import_task; R02_ACR_IMAGE_REGISTRY:acr.execution.canStartP04AfterActionTimeConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.execution.p04StrictReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.selectedTransferPathReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.localPublicPushReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.dockerDaemonReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.recommendedTransferPathIds=vpc_registry_from_aliyun_network,acr_import_task; R02_ACR_IMAGE_REGISTRY:acr.execution.forbiddenTransferPathIds=public_registry; R02_ACR_IMAGE_REGISTRY:acr.execution.nextOperatorDecision=choose_vpc_registry_from_aliyun_network_or_acr_import_task; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=acr_repository_confirmed_image_push_pending; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=partial
- requiresActionTimeConfirmation: false
- requiredUserAction: P03 已确认；下一步不要再次付款，转到 P04 镜像 push/import、digest 核对和 SAE 拉取配置。
- unblockCondition: acr.purchaseCandidate.confirmed=true、registryHost/namespace/repository 已记录非密钥证据。
- verifyCommands: corepack pnpm aliyun:image:plan

### U04_ACR_RUNTIME_AUTH 配置 ACR 镜像推送和 SAE 镜像拉取权限

- status: blocked
- owner: 阿里云 ACR/SAE 操作员
- obtainFrom: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime
- variableNames: none
- currentBlockers: S04_ACR_REGISTRY_AUTH:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.pushNetworkPath; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured
- currentEvidence: R02_ACR_IMAGE_REGISTRY:chrome_acr_repository_2026-06-27T00:11_CST_repo_meiye-huajing-app-api_private_local_normal_cn-hangzhou_repo_id_crr-k3xw5jyl3glkm1vs; chrome_acr_images_2026-06-27T00:13_CST_no_production_cn_tag_or_sha256_digest_visible_on_images_page; R02_ACR_IMAGE_REGISTRY:imagePublish.localExists=true; R02_ACR_IMAGE_REGISTRY:imagePublish.localReady=false; R02_ACR_IMAGE_REGISTRY:image.localDigestReady=true; R02_ACR_IMAGE_REGISTRY:dockerContext.status=ready; R02_ACR_IMAGE_REGISTRY:dockerContext.ok=true; R02_ACR_IMAGE_REGISTRY:dockerContext.checkedFiles=7; R02_ACR_IMAGE_REGISTRY:dockerContext.sensitiveEnvExcluded=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.status=docker_daemon_unavailable_or_timeout; R02_ACR_IMAGE_REGISTRY:localDockerImage.dockerClientInstalled=true; R02_ACR_IMAGE_REGISTRY:localDockerImage.dockerServerAvailable=false; R02_ACR_IMAGE_REGISTRY:localDockerImage.nextEvidenceAction=Start Docker Desktop/daemon for local smoke, or use ACR import/VPC runner without relying on this machine's Docker daemon.; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.edition=ACR Enterprise Economic; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.region=cn-hangzhou; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.duration=1 month; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.confirmed=true; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=false; R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.evidence=chrome_acr_2026-06-26T11:33_CST_instance_meiye-huajing-app-api_cri-imlf4amccfw6m6sa_running_economic_cn-hangzhou_expires_2026-07-27_namespace_meiye-huajing-app-api_normal_repo_meiye-huajing-app-api_private_local_repo_created; chrome_acr_repo_detail_2026-06-26T12:40_CST_public_address_requires_access_control_network_entrance_vpc_registry_host_visible; user_confirmed_acr_paid_success_2026-06-26T21:18_CST; user_confirmed_acr_paid_success_2026-06-27T00:36_CST; R02_ACR_IMAGE_REGISTRY:acr.publicNetworkEntranceEnabled=false; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.selectedPath=pending_choose_vpc_registry_or_enable_public_network_entrance; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.selectedReady=false; R02_ACR_IMAGE_REGISTRY:acr.pushNetworkPlan.recommendedPathIds=vpc_registry_from_aliyun_network,acr_import_task; R02_ACR_IMAGE_REGISTRY:acr.execution.canStartP04AfterActionTimeConfirmation=true; R02_ACR_IMAGE_REGISTRY:acr.execution.p04StrictReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.selectedTransferPathReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.localPublicPushReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.dockerDaemonReady=false; R02_ACR_IMAGE_REGISTRY:acr.execution.recommendedTransferPathIds=vpc_registry_from_aliyun_network,acr_import_task; R02_ACR_IMAGE_REGISTRY:acr.execution.forbiddenTransferPathIds=public_registry; R02_ACR_IMAGE_REGISTRY:acr.execution.nextOperatorDecision=choose_vpc_registry_from_aliyun_network_or_acr_import_task; R02_ACR_IMAGE_REGISTRY:runtime.target=SAE; R02_ACR_IMAGE_REGISTRY:runtime.appName=meiye-huajing-app-api-production-cn; R02_ACR_IMAGE_REGISTRY:runtime.remoteImageConfigured=false; R02_ACR_IMAGE_REGISTRY:runtime.imagePullConfigured=false; R02_ACR_IMAGE_REGISTRY:observedResourceStatus=acr_repository_confirmed_image_push_pending; R02_ACR_IMAGE_REGISTRY:observedResourceReadiness=partial
- requiresActionTimeConfirmation: true
- requiredUserAction: ACR 实例 ready 后，通过 docker credential helper、RAM、或 SAE 运行时镜像拉取配置完成认证。
- unblockCondition: imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true。
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke

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
- currentEvidence: apiDomainHttps.confirmed=false; apiDomainHttps.host=api-cn.ipgongchang.xin; apiDomainHttps.dnsResolvedToAliyun=false; apiDomainHttps.httpsEnabled=false; apiDomainHttps.icpReady=false; assetDomainHttps.confirmed=false; assetDomainHttps.host=assets-cn.ipgongchang.xin; assetDomainHttps.dnsResolvedToAliyun=false; assetDomainHttps.httpsEnabled=false; assetDomainHttps.icpReady=false; R03_API_DOMAIN_HTTPS:chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_api-cn_no_data_total_0_existing_api_A_106.14.241.129_no_sae_endpoint_no_https_icp_ready; R03_API_DOMAIN_HTTPS:domainHttpsPlan.ready=false; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.selectedMode=pending_sae_runtime_public_endpoint; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.targetHost=api-cn.ipgongchang.xin; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.ready=false; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.blockers=apiDomainHttps.confirmed,apiDomainHttps.dnsResolvedToAliyun,apiDomainHttps.httpsEnabled,apiDomainHttps.icpReady; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.recommendedModeIds=api_sae_custom_domain; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps; R03_API_DOMAIN_HTTPS:domainHttpsPlan.apiDomainHttps.candidateIds=api_sae_custom_domain; R03_API_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R03_API_DOMAIN_HTTPS:observedResourceReadiness=blocked; R04_ASSET_DOMAIN_HTTPS:chrome_dns_console_2026-06-25T19:47_CST_ipgongchang_xin_exact_search_assets-cn_no_data_total_0_no_cdn_or_oss_custom_domain_no_https_icp_ready; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.ready=false; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.selectedMode=pending_choose_cdn_or_oss_custom_domain; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.targetHost=assets-cn.ipgongchang.xin; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.ready=false; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.blockers=assetDomainHttps.confirmed,assetDomainHttps.dnsResolvedToAliyun,assetDomainHttps.httpsEnabled,assetDomainHttps.icpReady; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.recommendedModeIds=asset_cdn_custom_domain; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps; R04_ASSET_DOMAIN_HTTPS:domainHttpsPlan.assetDomainHttps.candidateIds=asset_cdn_custom_domain,asset_oss_custom_domain; R04_ASSET_DOMAIN_HTTPS:observedResourceStatus=domain_visible_records_missing; R04_ASSET_DOMAIN_HTTPS:observedResourceReadiness=blocked
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
- currentEvidence: runtime.confirmed=false; runtime.provider=SAE; runtime.region=cn-hangzhou; runtime.appName=meiye-huajing-app-api-production-cn; runtime.containerPort=3000; runtime.healthPath=/api/healthz; slsAlerts.confirmed=false; slsAlerts.slsProject=meiye-huajing-app-prod-cn; slsAlerts.healthAlertConfigured=false; slsAlerts.serverErrorAlertConfigured=false; R01_SAE_RUNTIME:chrome_sae_overview_2026-06-27T00:41_CST_cn-hangzhou_huadong1_hangzhou_app_list_empty_no_target_app_meiye-huajing-app-api-production-cn_runtime_not_created; R01_SAE_RUNTIME:runtimePlan.dataLayerTarget=Aliyun RDS PostgreSQL; R01_SAE_RUNTIME:runtimePlan.dataLayerConnectionEnvName=DATABASE_URL_CN; R01_SAE_RUNTIME:runtimePlan.predeployDependencyIds=RDS_POSTGRES_MIGRATION,ACR_IMAGE_DIGEST_AND_PULL,OSS_RUNTIME_ACCESS,BACKEND_ENV_IMPORT; R01_SAE_RUNTIME:runtimeSlsPlan.ready=false; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.selectedMode=pending_create_sae_custom_container_runtime; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.targetAppName=meiye-huajing-app-api-production-cn; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.ready=false; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.blockers=runtime.confirmed; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.recommendedModeIds=sae_custom_container_runtime; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime; R01_SAE_RUNTIME:runtimeSlsPlan.runtime.candidateIds=sae_custom_container_runtime; R01_SAE_RUNTIME:observedResourceStatus=not_created_or_not_confirmed; R01_SAE_RUNTIME:observedResourceReadiness=blocked; R07_SLS_ALERTS:chrome_sls_2026-06-25T19:47_CST_project_meiye-huajing-app-prod-cn_logstore_app-api_visible_logstore_empty_index_not_enabled_health_5xx_alerts_not_configured; R07_SLS_ALERTS:runtimeSlsPlan.ready=false; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.selectedMode=pending_bind_sae_logs_and_alerts; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.targetProject=meiye-huajing-app-prod-cn; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.targetLogstore=app-api; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.ready=false; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.blockers=slsAlerts.confirmed,slsAlerts.healthAlertConfigured,slsAlerts.serverErrorAlertConfigured; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.recommendedModeIds=sls_health_5xx_alerts; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts; R07_SLS_ALERTS:runtimeSlsPlan.slsAlerts.candidateIds=sls_health_5xx_alerts; R07_SLS_ALERTS:observedResourceStatus=project_logstore_visible_alerts_pending; R07_SLS_ALERTS:observedResourceReadiness=partial
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
