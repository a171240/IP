# 美业话镜 APP production-cn 密钥/密码/token/付款/受控标识符阻塞项

Generated: 2026-06-25T23:06:37.514Z

## 结论

- 当前阿里云后端-only 仍有付款、secret/token 或受控运行环境类人工介入项；微信/Apple/Android 发布密钥已从当前后端范围延期。
- currentScope: backend_aliyun_only
- ok: true
- containsValues: false
- blocked: 5 / 5
- actionTimeConfirmationRequired: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- deferredAppLaunchSensitiveActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- secretLeakCheck: true
- canCodexProceedWithoutUser: false
- blockedVariableNames: DATABASE_URL_CN
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET

## 用户介入密钥/密码简表

- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

## 密钥/密码介入拆解

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

## 后端-only 动作顺序口径

- currentScope: backend_aliyun_only
- nonCredentialCanStartPacketIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- credentialCanStartAfterActionTimeConfirmationIds: S03_ACR_PAID_PURCHASE, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL
- credentialBlockedByDependencyIds: S04_ACR_REGISTRY_AUTH, S06_READY_SENSITIVE_ENV_IMPORT
- deferredAppLaunchSensitiveActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- firstBatchVerificationCommands: corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:evidence:writeback:backend

- S04_ACR_REGISTRY_AUTH waits for ACR instance/namespace/repository evidence before docker login/push or SAE image pull can be configured.
- S06_READY_SENSITIVE_ENV_IMPORT waits for RDS DATABASE_URL_CN, OSS RAM/STS, image/runtime evidence, and the selected Aliyun secret-env target.

## 后端-only 获取/导入队列

- queueScope: backend_aliyun_only
- missingCredentialNames: DATABASE_URL_CN
- onlyMissingBackendCredentialValue: DATABASE_URL_CN
- readySecretsPendingCloudImport: 17
- requiresActionTimeConfirmationIds: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT

| 顺序 | 类别 | 动作 ID | 要回答的问题 | 获取位置 | 导入/写入目标 | 验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | 阿里云 ACR 是否需要购买和确认规格 | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence | corepack pnpm aliyun:image:plan; corepack pnpm aliyun:resources:matrix; corepack pnpm aliyun:user:actions |
| 2 | `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | 镜像推送和 SAE 拉取凭证放在哪里 | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke |
| 3 | `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | OSS/RAM/STS 密钥如何导入阿里云运行环境 | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss | corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke |
| 4 | `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | DATABASE_URL_CN 从哪里获得并导入到哪里 | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation | corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit |
| 5 | `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | 本机已有 API key 如何迁到阿里云 secret env | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport | corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:readiness:cloud-ready |

| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | blocked | none | none | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | blocked | none | none | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only |
| `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | blocked | none | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | blocked | DATABASE_URL_CN | none | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation |
| `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | none | ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport |

## 用户介入分层

- paid_purchase_confirmation: S03_ACR_PAID_PURCHASE
- controlled_secret_channel: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT

## 按类型汇总

- paid_purchase_confirmation: 1
- registry_password_or_runtime_pull_secret: 1
- ram_secret_or_sts_import: 1
- database_secret_and_migration: 1
- ready_sensitive_env_need_cloud_import: 1

## 变量名

- ADMIN_USER_IDS
- ALIYUN_OSS_ACCESS_KEY_ID
- ALIYUN_OSS_ACCESS_KEY_SECRET
- ALIYUN_OSS_SECURITY_TOKEN
- APIMART_API_KEY
- CREDITS_IP_SALT
- DASHSCOPE_API_KEY
- DATABASE_URL_CN
- DEEPSEEK_API_KEY
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_URL
- SERVICE_RECORD_DEEPSEEK_API_KEY
- SUPABASE_SERVICE_ROLE_KEY
- VOLC_SPEECH_ACCESS_TOKEN
- VOLC_SPEECH_APP_ID
- VOLC_SPEECH_SECRET_KEY
- WECHAT_LOGIN_SECRET
- WECHAT_MINI_APPID
- WECHAT_MINI_SECRET

## 人工介入项

### S03_ACR_PAID_PURCHASE

- type: paid_purchase_confirmation
- status: blocked
- owner: 用户/阿里云 ACR 操作员
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- obtainFrom: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence
- verifyCommands: corepack pnpm aliyun:image:plan; corepack pnpm aliyun:resources:matrix; corepack pnpm aliyun:user:actions
- requiresActionTimeConfirmation: true
- completionEvidence: acr.purchaseCandidate.confirmed=true; acr.registryHost is the actual aliyuncs.com registry host; acr.namespace is the created namespace; acr.evidence contains a non-secret purchase/instance evidence handle
- variableNames: none
- requiredUserAction: 确认是否购买 ACR Enterprise Economic / cn-hangzhou / 1 month / CNY 117.00。
- unblockCondition: 完成 ACR 企业版实例购买并创建 namespace/repository 后，填入非密钥 registry/image/digest 证据。
- forbidden: 未获得动作前确认时，不点击付款，不把 registry 密码写入 JSON、文档或 git。

### S04_ACR_REGISTRY_AUTH

- type: registry_password_or_runtime_pull_secret
- status: blocked
- owner: 阿里云 ACR/SAE 操作员
- consolePath: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- obtainFrom: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only
- verifyCommands: corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke
- requiresActionTimeConfirmation: true
- completionEvidence: acr.imagePushed=true; acr.digestVerified=true; runtime.remoteImageConfigured=true; runtime.imagePullConfigured=true; remoteDigest is sha256:<64 hex chars>
- variableNames: none
- requiredUserAction: ACR 实例 ready 后，通过 docker credential helper、RAM、或 SAE 运行时镜像拉取配置完成认证。
- unblockCondition: imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true。
- forbidden: registry username/password、RAM Secret、token 不能写入 image-publish.local.json、Docker 镜像、文档或 git。

### S05_OSS_RAM_SECRET_OR_STS

- type: ram_secret_or_sts_import
- status: blocked
- owner: 阿里云 OSS/RAM 操作员
- consolePath: 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager
- obtainFrom: 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager
- writeTargets: ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke
- requiresActionTimeConfirmation: true
- completionEvidence: oss.confirmed=true; oss.ramLeastPrivilege=true; secret/token imported only through Aliyun controlled secret env
- variableNames: ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN
- requiredUserAction: 把已创建的 OSS 最小权限策略绑定到实际运行身份，并选择受限 AccessKey 或 STS/运行时角色注入方案。
- unblockCondition: oss.ramLeastPrivilege=true，且对应 secret/token 只通过阿里云密钥环境注入。
- forbidden: 不创建可提交的长期明文 Secret；不把 AccessKeySecret 或 STS token 写入仓库、文档或镜像。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 是 | ready | identifier_or_connection | aliyun_oss | 阿里云控制台 -> OSS Bucket / RAM 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 是 | ready | secret | aliyun_oss | 阿里云控制台 -> OSS Bucket / RAM 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `ALIYUN_OSS_SECURITY_TOKEN` | 否 | empty | secret | aliyun_oss | 阿里云 RAM / STS / SAE 运行时角色 | 阿里云 KMS/Secrets Manager/SAE secret env | 可后置；功能启用或正式迁移时再补齐 |

### S08_ALIYUN_RDS_DATABASE_URL

- type: database_secret_and_migration
- status: blocked
- owner: 阿里云 RDS/后端数据迁移操作员
- consolePath: 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager
- obtainFrom: 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env
- writeTargets: DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit
- requiresActionTimeConfirmation: true
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; database account and least-privilege access are ready; DATABASE_URL_CN imported through secret env only; compatibilityReviewChecklistItemCount=6 is reviewed and closed before schema apply; supabase_auth_uid/supabase_storage_schema/supabase_service_role/row_level_security/policy_statement/extension_review dispositions are recorded without secrets; migration.schemaCompatibilityReviewed=true; migration.supabaseSpecificSqlResolved=true; migration.rdsExtensionSupportConfirmed=true; schema/data/APP API smoke/rollback validation passed; backend production-cn no longer depends on Supabase as formal database target
- variableNames: DATABASE_URL_CN
- requiredUserAction: 创建或确认 production-cn RDS PostgreSQL、数据库账号和网络访问策略；先关闭 RDS compatibilityReviewChecklist 6 类 Supabase SQL 兼容审查；完成 Supabase 到 RDS/PostgreSQL 的迁移验收；只把 DATABASE_URL_CN 导入阿里云 secret env。
- unblockCondition: rdsPostgres.databaseUrlCnSecretImported=true，compatibilityReviewChecklist 6 类已处理，migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true，且 APP 首版后端数据访问不再把 Supabase 作为正式 production-cn 数据库目标。
- forbidden: 不能把 DATABASE_URL_CN、数据库密码、dump 内容、Supabase service role key、AccessKeySecret 或 token 写入 JSON、Markdown、Docker 镜像、APP 包、小程序包或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | 是 | todo | identifier_or_connection | aliyun_rds_postgresql | 阿里云控制台 -> RDS PostgreSQL -> 数据库连接 | 阿里云 KMS/Secrets Manager/SAE secret env | 补齐后才能进入 production-cn 发布门禁 |

### S06_READY_SENSITIVE_ENV_IMPORT

- type: ready_sensitive_env_need_cloud_import
- status: blocked
- owner: 阿里云运行环境/密钥操作员
- consolePath: 阿里云 SAE 应用 -> 环境变量 / KMS / Secrets Manager
- obtainFrom: 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台
- writeTargets: SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport
- verifyCommands: corepack pnpm aliyun:env:checklist; corepack pnpm aliyun:sensitive:blockers; corepack pnpm aliyun:readiness:cloud-ready
- requiresActionTimeConfirmation: true
- completionEvidence: envImport.confirmed=true; envImport.secretNotInImage=true; importedAt records a non-secret timestamp/evidence handle
- variableNames: NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, ADMIN_USER_IDS, CREDITS_IP_SALT, APIMART_API_KEY, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- requiredUserAction: 这些敏感或连接类变量名在本地已有 ready 值，但仍需导入阿里云运行环境；脚本只输出变量名，不输出值。
- unblockCondition: envImport.confirmed=true 且 envImport.secretNotInImage=true。
- forbidden: 不要把任何 value 复制到文档、release manifest、Dockerfile、image 或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | ready | identifier_or_connection | legacy_database_migration_source | Vercel 项目 ip -> Settings -> Environment Variables；Supabase 项目 -> Settings -> API | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | ready | identifier_or_connection | legacy_database_migration_source | Vercel 项目 ip -> Settings -> Environment Variables；Supabase 项目 -> Settings -> API | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | ready | secret | legacy_database_migration_source | Vercel 项目 ip -> Settings -> Environment Variables；Supabase 项目 -> Settings -> API | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `WECHAT_LOGIN_SECRET` | 是 | ready | secret | app_auth | 本机安全随机生成 / 阿里云 KMS 或 Secrets Manager | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 是 | ready | identifier_or_connection | aliyun_oss | 阿里云控制台 -> OSS Bucket / RAM 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 是 | ready | secret | aliyun_oss | 阿里云控制台 -> OSS Bucket / RAM 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `DASHSCOPE_API_KEY` | 是 | ready | secret | bailian_asr | 阿里云控制台 -> 百炼 / DashScope -> API Key 与模型配置 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `DEEPSEEK_API_KEY` | 是 | ready | secret | deepseek_summary | DeepSeek 控制台 / 现有 Vercel production 环境变量 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `SERVICE_RECORD_DEEPSEEK_API_KEY` | 否 | ready | secret | deepseek_summary | DeepSeek 控制台 / 现有 Vercel production 环境变量 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `VOLC_SPEECH_ACCESS_TOKEN` | 是 | ready | secret | volc_speech | 火山引擎控制台 -> 语音技术 / 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `VOLC_SPEECH_APP_ID` | 是 | ready | identifier_or_connection | volc_speech | 火山引擎控制台 -> 语音技术 / 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `VOLC_SPEECH_SECRET_KEY` | 否 | ready | secret | volc_speech | 火山引擎控制台 -> 语音技术 / 访问控制 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `ADMIN_USER_IDS` | 否 | ready | identifier_or_connection | backend_ops | 现有 Vercel production 环境变量 / 管理员名单 / 阿里云 KMS | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `CREDITS_IP_SALT` | 否 | ready | secret | backend_ops | 现有 Vercel production 环境变量 / 管理员名单 / 阿里云 KMS | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `APIMART_API_KEY` | 否 | ready | secret | legacy_content_provider | APIMART 控制台 / 现有 Vercel production 环境变量 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `WECHAT_MINI_APPID` | 否 | ready | identifier_or_connection | mini_program_compat | 微信公众平台 -> 小程序后台 -> 开发管理 -> 开发设置 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |
| `WECHAT_MINI_SECRET` | 否 | ready | secret | mini_program_compat | 微信公众平台 -> 小程序后台 -> 开发管理 -> 开发设置 | 阿里云 KMS/Secrets Manager/SAE secret env | 通过阿里云 KMS/Secrets Manager/SAE 密钥环境变量导入 |

## 安全边界

- 本报告不创建资源、不付款、不修改 DNS、不导入环境变量、不调用阿里云写 API。
- 本报告不读取或打印 secret value；只复用 operator tasks 的变量名、控制台路径和动作说明。
- 不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。
