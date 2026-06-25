# 美业话镜 APP production-cn 密钥/密码/token/付款/受控标识符阻塞项

Generated: 2026-06-25T14:04:33.183Z

## 结论

- 当前仍有密钥、密码、token、付款或受控标识符类人工介入项；本报告只列变量名和控制台路径，不输出任何 value。
- currentScope: full_app_launch
- ok: true
- containsValues: false
- blocked: 8 / 8
- actionTimeConfirmationRequired: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT, S07_ANDROID_RELEASE_SIGNING
- deferredAppLaunchSensitiveActionIds: none
- secretLeakCheck: true
- canCodexProceedWithoutUser: false
- blockedVariableNames: APPLE_TEAM_ID, DATABASE_URL_CN, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET

## 用户介入密钥/密码简表

- blockedCredentialCount: 8
- blockedCredentialNames: APPLE_TEAM_ID, DATABASE_URL_CN, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

## 密钥/密码介入拆解

- required: true
- missingCredentialValues: APPLE_TEAM_ID, DATABASE_URL_CN, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- missingCredentialValueActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S08_ALIYUN_RDS_DATABASE_URL, S07_ANDROID_RELEASE_SIGNING
- readySecretsPendingCloudImport: 17
- readySecretsPendingCloudImportActionIds: S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT
- paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE
- controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- actionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S08_ALIYUN_RDS_DATABASE_URL, S07_ANDROID_RELEASE_SIGNING, S05_OSS_RAM_SECRET_OR_STS, S06_READY_SENSITIVE_ENV_IMPORT, S04_ACR_REGISTRY_AUTH, S03_ACR_PAID_PURCHASE
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包
- DATABASE_URL_CN must come from Aliyun RDS PostgreSQL after schema/data migration validation and must only enter KMS/Secrets Manager/SAE secret env.
- Ready local secret variables still need controlled Aliyun secret-env import; names can be reported, values must not be copied into JSON, Markdown, Docker images, git, chat, or shell history.
- ACR purchase and registry/runtime pull credentials require action-time confirmation; registry password or pull secret must stay in Docker credential helper, RAM/KMS/Secrets Manager, or Aliyun runtime secret settings.

| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `wechat_open_mobile_app` | `S01_WECHAT_OPEN_APP_LOGIN` | blocked | WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET | none | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息 | WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform |
| `ios_universal_link` | `S02_APPLE_TEAM_ID` | blocked | APPLE_TEAM_ID | none | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | APPLE_TEAM_ID -> 阿里云 SAE plain env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence |
| `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | blocked | none | none | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | blocked | none | none | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only |
| `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | blocked | none | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | blocked | DATABASE_URL_CN | none | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation |
| `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | none | ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport |
| `android_release_signing` | `S07_ANDROID_RELEASE_SIGNING` | blocked | MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD | none | Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名 | MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store; 微信开放平台 -> 移动应用 -> Android 应用签名; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured |

## 用户介入分层

- external_review_then_app_credentials: S01_WECHAT_OPEN_APP_LOGIN
- external_identifier_lookup: S02_APPLE_TEAM_ID
- paid_purchase_confirmation: S03_ACR_PAID_PURCHASE
- controlled_secret_channel: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- android_release_signing_secret: S07_ANDROID_RELEASE_SIGNING

## 按类型汇总

- external_credential_after_review: 1
- external_identifier: 1
- paid_purchase_confirmation: 1
- registry_password_or_runtime_pull_secret: 1
- ram_secret_or_sts_import: 1
- database_secret_and_migration: 1
- ready_sensitive_env_need_cloud_import: 1
- android_keystore_password_or_signature: 1

## 变量名

- ADMIN_USER_IDS
- ALIYUN_OSS_ACCESS_KEY_ID
- ALIYUN_OSS_ACCESS_KEY_SECRET
- ALIYUN_OSS_SECURITY_TOKEN
- APIMART_API_KEY
- APPLE_TEAM_ID
- CREDITS_IP_SALT
- DASHSCOPE_API_KEY
- DATABASE_URL_CN
- DEEPSEEK_API_KEY
- MEIYE_RELEASE_KEY_ALIAS
- MEIYE_RELEASE_KEY_PASSWORD
- MEIYE_RELEASE_STORE_FILE
- MEIYE_RELEASE_STORE_PASSWORD
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
- WECHAT_OPEN_APP_ID
- WECHAT_OPEN_APP_REVIEW_STATUS
- WECHAT_OPEN_APP_SECRET

## 人工介入项

### S01_WECHAT_OPEN_APP_LOGIN

- type: external_credential_after_review
- status: blocked
- owner: 用户/微信开放平台操作员
- consolePath: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App
- obtainFrom: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
- writeTargets: WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform
- verifyCommands: corepack pnpm aliyun:readiness; corepack pnpm aliyun:health:smoke; corepack pnpm aliyun:app-api:smoke
- requiresActionTimeConfirmation: true
- completionEvidence: reviewStatus=approved; mobileAppCreated=true; mobileAppSubmitted=true; mobileAppIdReady=true; mobileAppSecretReady=true; confirmed=true
- variableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS
- requiredUserAction: 先在微信开放平台创建“美业话镜”移动应用并提交审核；审核通过后读取 AppID/AppSecret；AppID 只导入阿里云 SAE 服务端 plain env，AppSecret 只导入 KMS/Secrets Manager/SAE secret env。
- unblockCondition: reviewStatus=approved 且 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET ready。
- forbidden: 不能用小程序 AppID/Secret 替代，不能把 AppID 写进 App 包，也不能把 AppSecret 写入文档、镜像或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | 是 | todo | identifier_or_connection | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 SAE plain env | 等待微信开放平台移动应用审核通过后获取并导入 |
| `WECHAT_OPEN_APP_SECRET` | 是 | todo | secret | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 KMS/Secrets Manager/SAE secret env | 等待微信开放平台移动应用审核通过后获取并导入 |
| `WECHAT_OPEN_APP_REVIEW_STATUS` | 否 | ready | public | wechat_open_platform | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 SAE plain env | 导入阿里云运行环境变量 |

### S02_APPLE_TEAM_ID

- type: external_identifier
- status: blocked
- owner: Apple Developer / iOS 发布操作员
- consolePath: Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID
- obtainFrom: Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID
- writeTargets: APPLE_TEAM_ID -> 阿里云 SAE plain env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform / iOS evidence
- verifyCommands: corepack pnpm aliyun:aasa:check; corepack pnpm aliyun:app-native:check
- requiresActionTimeConfirmation: true
- completionEvidence: APPLE_TEAM_ID=ready; aliyun:aasa:check no longer reports apple_team_id_missing
- variableNames: APPLE_TEAM_ID
- requiredUserAction: 从 Apple Developer 确认 10 位 Team ID 后导入阿里云 plain env，用于 AASA appID。
- unblockCondition: APPLE_TEAM_ID ready 且 aliyun:aasa:check 不再报 apple_team_id_missing。
- forbidden: 不要猜测 Team ID；需与 iOS Bundle ID com.ipgongchang.meiyehuajing 一致。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `APPLE_TEAM_ID` | 否 | empty | public | ios_universal_link | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | 阿里云 SAE plain env | APP 发布/AASA 阻塞：从 Apple Developer 获取 10 位 Team ID 后导入阿里云 SAE plain env |

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
- verifyCommands: corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit
- requiresActionTimeConfirmation: true
- completionEvidence: Aliyun RDS PostgreSQL instance exists in cn-hangzhou; database account and least-privilege access are ready; DATABASE_URL_CN imported through secret env only; schema/data/APP API smoke/rollback validation passed; backend production-cn no longer depends on Supabase as formal database target
- variableNames: DATABASE_URL_CN
- requiredUserAction: 创建或确认 production-cn RDS PostgreSQL、数据库账号和网络访问策略；完成 Supabase 到 RDS/PostgreSQL 的迁移验收；只把 DATABASE_URL_CN 导入阿里云 secret env。
- unblockCondition: rdsPostgres.databaseUrlCnSecretImported=true，migration.* 验收通过，且 APP 首版后端数据访问不再把 Supabase 作为正式 production-cn 数据库目标。
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

### S07_ANDROID_RELEASE_SIGNING

- type: android_keystore_password_or_signature
- status: blocked
- owner: Android 发布操作员 / 微信开放平台操作员
- consolePath: 本机 Android release signing / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名
- obtainFrom: Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名
- writeTargets: MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store; 微信开放平台 -> 移动应用 -> Android 应用签名; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured
- verifyCommands: cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew assembleRelease; ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk; corepack pnpm aliyun:wechat-open:package; corepack pnpm aliyun:app-native:check
- requiresActionTimeConfirmation: true
- completionEvidence: Android release build succeeds with signingConfigs.release; release APK/AAB exists and is not signed with debug.keystore; wechatOpenPlatform.androidSignature records release signature evidence only; wechatOpenPlatform.androidConfigured=true
- variableNames: MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD
- requiredUserAction: 提供或确认 Android release keystore、store password、key alias、key password；用 release APK/AAB 生成微信开放平台 Android 应用签名并回填。
- unblockCondition: assembleRelease 成功，release 包不是 debug keystore 签名，微信开放平台记录 release 签名且 androidConfigured=true。
- forbidden: 不能使用 debug.keystore；不能把 keystore 文件、store password、key password、证书私钥或微信 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。

#### 变量获取和导入明细

| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MEIYE_RELEASE_STORE_FILE` | 是 | required_at_build_time | controlled_identifier | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_STORE_PASSWORD` | 是 | required_at_build_time | secret | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_KEY_ALIAS` | 是 | required_at_build_time | controlled_identifier | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |
| `MEIYE_RELEASE_KEY_PASSWORD` | 是 | required_at_build_time | secret | android_release_signing | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。 |

## 安全边界

- 本报告不创建资源、不付款、不修改 DNS、不导入环境变量、不调用阿里云写 API。
- 本报告不读取或打印 secret value；只复用 operator tasks 的变量名、控制台路径和动作说明。
- 不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。
