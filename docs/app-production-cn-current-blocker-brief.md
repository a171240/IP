# 美业话镜 APP production-cn 当前阻塞简报

Generated: 2026-06-25T18:43:14.388Z

## 结论

- 现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，先补 RDS、ACR、OSS、SAE、DNS/HTTPS/ICP、env、SLS 和 smoke 证据。
- verdict: blocked
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- currentBackendScopeNote: 当前阿里云后端阻塞只看 requiredBlocking、machineBlocking、canStartNowConsoleTasks 和 canStartNowAuthorizationPackets；fullApp* 与 deferredAppLaunch* 只保留完整 App 发布延期上下文，不是当前后端部署阻塞。
- canDeployNow: false
- canProceedWithoutWechat: true
- backendTargetReady: 0/8
- containsValues: false
- mutationPerformed: false
- secretLeakCheck: true
- requiredEnv: 24/27
- requiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY, API_DOMAIN_HTTPS_ICP_NOT_READY, ASSET_DOMAIN_HTTPS_ICP_NOT_READY, DATABASE_URL_CN, ENV_IMPORT_NOT_READY, OSS_RAM_STS_NOT_READY, POSTDEPLOY_SMOKE_NOT_RUN, RDS_MIGRATION_EVIDENCE_NOT_READY, SAE_RUNTIME_NOT_READY, SLS_ALERTS_NOT_READY
- fullAppRequiredBlocking: DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- deferredAppLaunchBlocking: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_PLATFORM_MOBILE_APP, ANDROID_RELEASE_SIGNING, APPLE_TEAM_ID, IOS_UNIVERSAL_LINK_AASA
- localCodeReady: false
- releaseEvidenceUsable: true
- machineBlocking: missing_required_env:DATABASE_URL_CN
- fullAppMachineBlocking: missing_required_env:DATABASE_URL_CN, missing_required_env:WECHAT_OPEN_APP_ID, missing_required_env:WECHAT_OPEN_APP_SECRET, wechat_open_platform_mobile_app_not_ready, invalid_app_universal_link_config, app_universal_link:apple_team_id_missing
- manualBlockingCount: 8
- bridgeDataLayerCurrent: Supabase migration source / legacy compatibility only
- bridgeDataLayerTarget: Aliyun RDS PostgreSQL
- bridgeDataLayerStatus: blocked_until_aliyun_rds_postgresql_migration_ready
- rdsMigrationIncludedInThisRelease: false
- rdsMigrationRequiredForFinalProductionCn: true
- cloudResourceEvidenceReady: 0/7
- cloudResourceObserved: ready 0/7, partial 2, blocked 5
- cloudResourceBlockedIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- cloudResourceObservedPartialIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- cloudResourceObservedBlockedIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT
- cloudResourceActionTimeConfirmations: R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT
- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- canStartNowWritebackTaskCount: 2
- blockedByConsoleTaskDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C06_ENV_IMPORT, C07_SLS_ALERTS
- canStartNowAuthorizationPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- blockedByAuthorizationPacketDependencies: P04_ACR_IMAGE_AND_PULL, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, P09_PRODUCTION_DEPLOY
- cloudConfirmationsReady: 0/7
- operatorTasksReady: 0/7
- completion: proved 1/11, blocked 7, partial 1
- sensitiveBlocked: 5/5
- sensitiveBlockedIds: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- deferredAppLaunchSensitiveBlockedIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING
- blockedCredentialCount: 1
- readySecretEnvVariableCount: 17
- blockedVariableAcquisitionCount: 1
- deferredAppLaunchVariableAcquisitionCount: 7
- readySecretEnvImportGroupCount: 9
- cloudInventoryStrictReady: 0/9
- cloudInventoryInterpretation: strict_inventory_incomplete_and_fresh_read_unavailable
- canReadCloudNow: false
- cliConfigProbeFailureCategory: aliyun_cli_profile_not_configured
- currentBrowserCanUseCurrentConsole: true
- currentBrowserAliyunConsoleTabCount: 1
- wechatOpenAccountVerified: true
- wechatOpenMobileAppCreated: false
- wechatOpenCanCreateDraft: true
- wechatOpenReadyToSubmitForReview: false
- wechatAppLoginCredentialSource: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
- wechatMiniProgramCredentialsReusableForAppLogin: false
- wechatMiniProgramCompatVariableNames: WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET
- envSourceVercelRequiredCovered: 17/27
- envSourceCanMigrateFromVercelProduction: 46
- envSourceAppAliyunOwnedNotInVercel: 10
- envSourceBlockedExternalRequired: DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, APPLE_TEAM_ID
- envSourceReadyLocalButMissingFromVercel: SERVICE_RECORD_DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_BASE_URL, SERVICE_RECORD_DEEPSEEK_MODEL
- envSourceSecretOrSensitiveToImport: 17

## 当前口径说明

- 当前目标只补阿里云后端：RDS/ACR/OSS/SAE/DNS/HTTPS/ICP/env/SLS/smoke。
- 当前后端阻塞只看 `requiredBlocking`、`machineBlocking`、`canStartNowConsoleTasks`、`canStartNowAuthorizationPackets`。
- `fullAppRequiredBlocking`、`fullAppMachineBlocking`、`deferredAppLaunchBlocking` 是完整 App 发布延期上下文；微信开放平台移动应用、Android 签名、Apple Team ID 不属于当前阿里云后端补齐目标。

## 微信开放平台移动应用链路

- accountVerified: true
- mobileAppCreated: false
- mobileAppSubmitted: false
- reviewStatus: not_started
- canCreateDraftInWechatOpenPlatform: true
- readyToSubmitForReview: false
- mobileAppCredentialsAvailable: false
- submissionBlockers: android_release_wechat_signature_missing, wechat_android_package_signature_not_recorded, wechat_ios_bundle_universal_link_not_recorded, apple_team_id_missing_for_aasa
- androidPackageName: com.ipgongchang.meiyehuajing
- androidReleaseSigningConfigReady: true
- androidReleaseUsesDebugSigning: false
- androidSignatureStatus: missing_release_wechat_signature
- androidReleaseArtifactReady: false
- androidWechatSignatureRecorded: false
- iosBundleId: com.ipgongchang.meiyehuajing
- iosUniversalLink: https://api-cn.ipgongchang.xin/app/wechat/
- iosAssociatedDomain: applinks:api-cn.ipgongchang.xin
- appleTeamIdMissing: true
- actionPacketId: P01_WECHAT_OPEN_MOBILE_APP
- minimumAuthorizationPhrase: 授权在微信开放平台创建“美业话镜”移动应用草稿，填写 Android 包名、iOS Bundle ID 和 Universal Link；审核通过前不读取或输出 AppSecret。
- createDraftFields:
  - appName: 美业话镜
  - appType: 移动应用，不是小程序
  - androidPackageName: com.ipgongchang.meiyehuajing
  - androidReleaseSignature: missing_release_wechat_signature
  - iosBundleId: com.ipgongchang.meiyehuajing
  - iosUniversalLink: https://api-cn.ipgongchang.xin/app/wechat/
  - iosAssociatedDomain: applinks:api-cn.ipgongchang.xin
- backendWriteTargetsAfterApproval:
  - WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env
  - WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env
  - WECHAT_OPEN_APP_REVIEW_STATUS=approved -> 阿里云 SAE plain env

## APP 微信登录凭证边界

- purpose: APP 微信登录服务端凭证边界
- appLoginCredentialSource: 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息
- appLoginVariableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS
- appLoginImportTargets: WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env; WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env; WECHAT_OPEN_APP_REVIEW_STATUS -> 阿里云 SAE plain env
- miniProgramCredentialSource: 微信公众平台小程序 -> 开发管理 -> 开发设置
- miniProgramCompatVariableNames: WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET
- miniProgramCredentialsReusableForAppLogin: false
- miniProgramCompatibilityUse: 仅用于旧小程序/兼容后端链路，不能用于 React Native APP 微信开放平台移动应用登录。
- aliyunRuntimeUse: 阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID/AppSecret 调微信登录接口；React Native APP 包内不内置 AppSecret。
- whyNotReusable:
  - 微信开放平台移动应用和微信小程序是不同应用类型，AppID/AppSecret 不是同一套凭证。
  - 小程序 WECHAT_MINI_* 可以保留给旧小程序 API 兼容，但不能解除 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 阻塞。
  - 移动应用审核通过前不能把 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 标记为 ready。
- forbidden:
  - 不能用小程序 AppID/Secret 替代移动应用 AppID/AppSecret。
  - 不能把 WECHAT_OPEN_APP_SECRET 写入 App 包、JSON、Markdown、Docker 镜像或 git。
  - 不能在移动应用未审核通过前把 APP 登录凭证导入为生产 ready。

## 环境变量来源与 Vercel 覆盖

- total: 63
- requiredReady: 24/27
- requiredBlocking: DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- appLaunchBlocking: APPLE_TEAM_ID
- vercelCoverageStatus: checked
- vercelCoverageOk: true
- vercelProject: ip
- vercelEnvironment: production
- vercelProductionNames: 130
- vercelRequiredCovered: 17/27
- requiredMissingInVercelProduction: APP_ENV, APP_REGION, APP_API_BASE_URL, APP_ASSET_BASE_URL, NEXT_PUBLIC_SITE_URL, PRIVACY_POLICY_URL, TERMS_URL, DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- appSpecificKeysMissingInVercelProduction: APP_ENV, APP_REGION, APP_API_BASE_URL, APP_ASSET_BASE_URL, NEXT_PUBLIC_SITE_URL, PRIVACY_POLICY_URL, TERMS_URL, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- bridgeKeysPresentInVercelProduction: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET, ALIYUN_OSS_REGION, SERVICE_RECORD_OSS_PREFIX, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, VOLC_SPEECH_APP_ID, VOLC_SPEECH_ACCESS_TOKEN
- canMigrateFromVercelProduction: 46
- appAliyunOwnedNotInVercel: 10
- blockedExternalRequired: DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, APPLE_TEAM_ID
- readyLocalButMissingFromVercel: SERVICE_RECORD_DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_BASE_URL, SERVICE_RECORD_DEEPSEEK_MODEL
- miniProgramCompatOnly: WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- deferredOptional: 8
- secretOrSensitiveToImport: 17

### 可按同名从 Vercel Production 迁移

- count: 46
- variableNames: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET, ALIYUN_OSS_REGION, SERVICE_RECORD_OSS_PREFIX, DASHSCOPE_API_KEY, BAILIAN_ASR_MODEL, SERVICE_RECORD_ASR_PROVIDER, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, VOLC_SPEECH_APP_ID, VOLC_SPEECH_ACCESS_TOKEN, BAILIAN_ASR_LANGUAGE_HINTS, BAILIAN_ASR_DIARIZATION_ENABLED, BAILIAN_ASR_SPEAKER_COUNT, BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS, VOLC_SPEECH_SECRET_KEY, VOLC_ASR_RESOURCE_ID, VOLC_ASR_FLASH_RESOURCE_ID, VOLC_TTS_CLUSTER, VOLC_TTS_VOICE_TYPE, VOLC_TTS_LANGUAGE, VOICE_COACH_ENABLED, VOICE_COACH_ALLOW_USER_IDS, VOICE_COACH_MAX_TURNS, VOICE_COACH_REPLY_PROVIDER, VOICE_COACH_ANALYSIS_PROVIDER, VOICE_COACH_FIRST_TURN_MODE, VOICE_COACH_FIRST_TTS_MODE, CRON_SECRET, CREDITS_IP_SALT, ADMIN_EMAILS, ADMIN_USER_IDS, APIMART_API_KEY, APIMART_BASE_URL, APIMART_MODEL, APIMART_IMAGE_API_KEY, APIMART_IMAGE_BASE_URL, APIMART_IMAGE_MODEL, WECHAT_MINI_APPID, WECHAT_MINI_SECRET

### APP/阿里云新增或云侧确认值

- count: 10
- variableNames: APP_ENV, APP_REGION, APP_API_BASE_URL, APP_ASSET_BASE_URL, NEXT_PUBLIC_SITE_URL, PRIVACY_POLICY_URL, TERMS_URL, REDIS_URL_CN, ALIYUN_OSS_SECURITY_TOKEN, WECHAT_OPEN_APP_REVIEW_STATUS

### 外部阻塞值

| 变量 | 状态 | 敏感等级 | 来源分类 | 来源判断 | 获取位置 | 导入目标 | 禁止事项 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | todo | identifier_or_connection | aliyun_rds_postgresql | blocked_external_value_required | 阿里云控制台 -> RDS PostgreSQL -> 数据库连接 | 阿里云 KMS/Secrets Manager/SAE secret env | 真实 value 只能进入阿里云 secret env，不能写入 JSON、Markdown、Docker 镜像或 git。 |
| `WECHAT_OPEN_APP_ID` | todo | identifier_or_connection | wechat_open_platform | blocked_external_value_required | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 SAE plain env | 不能用小程序 AppID 替代；不能写进 App 包。 |
| `WECHAT_OPEN_APP_SECRET` | todo | secret | wechat_open_platform | blocked_external_value_required | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 阿里云 KMS/Secrets Manager/SAE secret env | 不能用小程序 Secret 替代；不能写入文档、镜像、App 包或 git。 |
| `APPLE_TEAM_ID` | empty | public | ios_universal_link | blocked_external_value_required | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | 阿里云 SAE plain env | 不要把真实 value 写入文档或 git。 |

### 本机 ready 但 Vercel Production 名称缺失

| 变量 | 状态 | 敏感等级 | 来源分类 | 来源判断 | 获取位置 | 导入目标 | 禁止事项 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SERVICE_RECORD_DEEPSEEK_API_KEY` | ready | secret | deepseek_summary | ready_locally_but_not_in_vercel_production_names | DeepSeek 控制台 / 现有 Vercel production 环境变量 | 阿里云 KMS/Secrets Manager/SAE secret env | 真实 value 只能进入阿里云 secret env，不能写入 JSON、Markdown、Docker 镜像或 git。 |
| `SERVICE_RECORD_DEEPSEEK_BASE_URL` | ready | public | deepseek_summary | ready_locally_but_not_in_vercel_production_names | DeepSeek 控制台 / 现有 Vercel production 环境变量 | 阿里云 SAE plain env | 不要把真实 value 写入文档或 git。 |
| `SERVICE_RECORD_DEEPSEEK_MODEL` | ready | public | deepseek_summary | ready_locally_but_not_in_vercel_production_names | DeepSeek 控制台 / 现有 Vercel production 环境变量 | 阿里云 SAE plain env | 不要把真实 value 写入文档或 git。 |

### 小程序兼容变量

| 变量 | 状态 | 敏感等级 | 来源分类 | 来源判断 | 获取位置 | 导入目标 | 禁止事项 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `WECHAT_MINI_APPID` | ready | identifier_or_connection | mini_program_compat | migrate_from_vercel_production_by_name | 微信公众平台 -> 小程序后台 -> 开发管理 -> 开发设置 | 阿里云 KMS/Secrets Manager/SAE secret env | 仅兼容旧小程序链路，不能用于原生 APP 微信登录。 |
| `WECHAT_MINI_SECRET` | ready | secret | mini_program_compat | migrate_from_vercel_production_by_name | 微信公众平台 -> 小程序后台 -> 开发管理 -> 开发设置 | 阿里云 KMS/Secrets Manager/SAE secret env | 仅兼容旧小程序链路，不能用于原生 APP 微信登录。 |

## 数据层边界

- current: Supabase migration source / legacy compatibility only
- target: Aliyun RDS PostgreSQL
- status: blocked_until_aliyun_rds_postgresql_migration_ready
- firstBridgeDeploymentUses: not_allowed_for_final_production_cn
- supabaseBridgeReady: false
- supabaseKeys: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- databaseUrlCnStatus: todo
- redisUrlCnStatus: todo
- rdsMigrationIncludedInThisRelease: false
- rdsMigrationRequiredForFinalProductionCn: true
- notes:
  - 正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL；Supabase 只能作为迁移来源或旧链路兼容，不是正式数据库。
  - DATABASE_URL_CN 是正式全阿里云数据层的必填阻塞项；首版 APP 业务数据访问代码侧已切到 RDS repository，但仅填写连接串仍不等于完成 RDS 实例、schema/data、smoke 和 rollback 验收。
  - REDIS_URL_CN 只有在 production-cn 队列/缓存实现明确依赖 Tair/Redis 时才升级为必填阻塞项。

## 阿里云资源观察结果

- evidenceReady: 0/7
- matrixReady: 0/7
- matrixBlocked: 7
- observedReady: 0/7
- observedPartial: 2
- observedBlocked: 5
- observedPartialIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- observedBlockedIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT
- observedNotReadyIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- observedCount: 7
- notObservedCount: 0
- cloudConfirmationsTotalBlockers: 27
- imagePublishTotalBlockers: 12
- actionTimeConfirmationRequired: R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT

| 资源 | ready | 观察状态 | 观察成熟度 | 动作时确认 | 下一步 | 写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `R01_SAE_RUNTIME` | false | not_created_or_not_confirmed | blocked | false | 创建或确认 cn-hangzhou SAE 应用 meiye-huajing-app-api-production-cn，容器端口 3000，健康检查 /api/healthz。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime |
| `R02_ACR_IMAGE_REGISTRY` | false | purchase_candidate_visible_not_purchased | blocked | true | 动作时确认 ACR Enterprise Economic / cn-hangzhou / 1 month / CNY 117.00 后，购买实例并创建 namespace/repository。 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `R03_API_DOMAIN_HTTPS` | false | domain_visible_records_missing | blocked | true | 补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps |
| `R04_ASSET_DOMAIN_HTTPS` | false | domain_visible_records_missing | blocked | true | 补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps |
| `R05_OSS_AUDIO_STORAGE` | false | bucket_visible_unconfirmed | partial | false | 继续确认 CORS、RAM 最小权限和 service-records/production-cn 前缀；只记录 bucket/region/布尔证据。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `R06_ENV_IMPORT` | false | cloudshell_disconnected_restart_confirmation_required | blocked | true | 只有 Cloud Shell/CLI 配置 ready 后，才运行受控只读 inventory runner；否则继续用控制台人工证据。 | deploy/aliyun-production-cn.cloud-inventory-results.local.json |
| `R07_SLS_ALERTS` | false | project_logstore_visible_alerts_pending | partial | false | SAE runtime ready 后配置日志采集、/api/healthz 健康告警和 5xx 告警。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts |

## 下一步动作排序

- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- blockedByConsoleTaskDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C06_ENV_IMPORT, C07_SLS_ALERTS
- canStartNowAuthorizationPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- blockedByAuthorizationPacketDependencies: P04_ACR_IMAGE_AND_PULL, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, P09_PRODUCTION_DEPLOY

| 授权包 | 动作 | owner | 最小确认语 | 非密钥证据 |
| --- | --- | --- | --- | --- |
| `P00_ALIYUN_READONLY_INVENTORY_IDENTITY` | 恢复阿里云 CLI/CloudShell 只读盘点身份 | 用户/阿里云只读盘点操作员 | 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。 | true |
| `P03_ACR_PURCHASE` | 确认 ACR 企业版付费购买 | 用户/阿里云 ACR 操作员 | 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。 | true |
| `P05_OSS_RAM_STS` | 绑定 OSS RAM 最小权限或 STS/运行时角色方案 | 阿里云 OSS/RAM 操作员 | 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。 | false |
| `P11_ALIYUN_RDS_DATA_MIGRATION` | 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移 | 阿里云 RDS/后端数据迁移操作员 | 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。 | false |

## 当前可做动作回填清单

### C02_ACR_IMAGE_AND_PULL

- title: 购买/确认 ACR 企业版实例和镜像仓库基础信息
- currentActionScope: purchase_and_repository_only
- requiresActionTimeConfirmation: true
- nonSecretEvidenceOnly: true
- consolePath: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- targetFields:
  - edition: ACR Enterprise Economic (image publish plan)
  - region: cn-hangzhou (image publish plan)
  - duration: 1 month (image publish plan)
  - quotedAmount: CNY 117.00 (read-only console evidence)
  - repository: meiye-huajing-app-api (image publish plan)
  - remoteTag: production-cn (image publish plan)
  - localImage: meiye-huajing-app-api:production-cn (image publish plan)
  - localDigest: meiye-huajing-app-api@sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d (local docker evidence)
  - runtimeAppName: meiye-huajing-app-api-production-cn (image publish plan)
- writeTargets:
  - deploy/aliyun-production-cn.image-publish.local.json: acr.confirmed=true
  - deploy/aliyun-production-cn.image-publish.local.json: acr.registryHost=<cn-hangzhou aliyuncs.com host>
  - deploy/aliyun-production-cn.image-publish.local.json: acr.namespace=<actual namespace>
- acceptanceEvidence:
  - ACR Enterprise Economic / cn-hangzhou / 1 month 购买或已开通确认
  - registryHost 必须是真实 aliyuncs.com host，不能保留 TODO
  - namespace 和 repository=meiye-huajing-app-api 已确认
- currentBlockers:
  - todo:acr.registryHost
  - todo:acr.namespace
  - acr.confirmed
- deferredWritebackGroups:
  - imagePushAndDigest: waits=P04_ACR_IMAGE_AND_PULL; blockers=todo:acr.remoteImage, todo:acr.remoteDigest, todo:acr.evidence, acr.imagePushed, acr.digestVerified, acr.remoteDigest=sha256
  - saeRuntimeImagePull: waits=P08_SAE_RUNTIME_SLS, P04_ACR_IMAGE_AND_PULL; blockers=runtime.confirmed, runtime.remoteImageConfigured, runtime.imagePullConfigured
- deferredActions:
  - P04_ACR_IMAGE_AND_PULL 依赖 P03_ACR_PURCHASE 完成后再执行。
  - 当前确认包不执行 docker login/push。
  - 当前确认包不配置 SAE runtime image pull credentials。
  - imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true 都属于后置验收。
- forbidden:
  - 不要写入 ACR 用户名、密码、临时 token 或 RAM Secret
  - 当前动作不执行 docker login、docker push 或 SAE 镜像拉取配置
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key
- verifyCommands:
  - corepack pnpm aliyun:image:plan

### C05_OSS_AUDIO_RAM_STS

- title: 确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色
- currentActionScope: full_task
- requiresActionTimeConfirmation: true
- nonSecretEvidenceOnly: false
- consolePath: 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份
- targetFields:
  - bucket: meiye-huajing-service-records-production-cn (local cloud evidence)
  - region: cn-hangzhou (local cloud evidence)
  - serviceRecordPrefix: service-records/production-cn (runtime plan)
  - ramPolicyTemplate: deploy/aliyun-production-cn.oss-ram-policy.json (tracked policy)
  - secretImportTarget: KMS/Secrets Manager/SAE secret env 或 STS/运行时角色 (security policy)
- writeTargets:
  - deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  - ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- acceptanceEvidence:
  - region=cn-hangzhou
  - corsConfigured=true
  - ramLeastPrivilege=true
  - serviceRecordPrefix=service-records/production-cn
  - confirmed=true
- currentBlockers:
  - oss:confirmed
  - oss:ramLeastPrivilege
  - S05_OSS_RAM_SECRET_OR_STS:blocked
  - R05_OSS_AUDIO_STORAGE:oss:confirmed
  - R05_OSS_AUDIO_STORAGE:oss:ramLeastPrivilege
- deferredWritebackGroups:
  - none
- deferredActions:
  - none
- forbidden:
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key
- verifyCommands:
  - corepack pnpm aliyun:cloud:confirmations
  - corepack pnpm aliyun:health:smoke
  - corepack pnpm aliyun:app-api:smoke
  - postdeploy service-records upload smoke after API deployment

## 当前可开始但必须动作时确认

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY

- title: 恢复阿里云 CLI/CloudShell 只读盘点身份
- owner: 用户/阿里云只读盘点操作员
- minimumUserPhrase: 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend
- nonSecretEvidenceOnly: true

### P03_ACR_PURCHASE

- title: 确认 ACR 企业版付费购买
- owner: 用户/阿里云 ACR 操作员
- minimumUserPhrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- verifyCommands: corepack pnpm aliyun:image:plan
- nonSecretEvidenceOnly: true

### P05_OSS_RAM_STS

- title: 绑定 OSS RAM 最小权限或 STS/运行时角色方案
- owner: 阿里云 OSS/RAM 操作员
- minimumUserPhrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke
- nonSecretEvidenceOnly: false

### P11_ALIYUN_RDS_DATA_MIGRATION

- title: 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移
- owner: 阿里云 RDS/后端数据迁移操作员
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- writeTargets: DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env; RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告
- verifyCommands: corepack pnpm aliyun:readiness; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy
- nonSecretEvidenceOnly: false

## 密钥/密码/token/付款/受控标识符阻塞项

| ID | 状态 | 类型 | owner | 变量名 |
| --- | --- | --- | --- | --- |
| `S03_ACR_PAID_PURCHASE` | blocked | paid_purchase_confirmation | 用户/阿里云 ACR 操作员 | none |
| `S04_ACR_REGISTRY_AUTH` | blocked | registry_password_or_runtime_pull_secret | 阿里云 ACR/SAE 操作员 | none |
| `S05_OSS_RAM_SECRET_OR_STS` | blocked | ram_secret_or_sts_import | 阿里云 OSS/RAM 操作员 | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_SECURITY_TOKEN |
| `S08_ALIYUN_RDS_DATABASE_URL` | blocked | database_secret_and_migration | 阿里云 RDS/后端数据迁移操作员 | DATABASE_URL_CN |
| `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | ready_sensitive_env_need_cloud_import | 阿里云运行环境/密钥操作员 | NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WECHAT_LOGIN_SECRET, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_API_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, ADMIN_USER_IDS, CREDITS_IP_SALT, APIMART_API_KEY, WECHAT_MINI_APPID, WECHAT_MINI_SECRET |

## 用户介入密钥/密码简表

- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- readySecretEnvVariableNames: ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET
- forbiddenStorage: git, JSON/Markdown 报告, Docker image, App bundle, 小程序或 App 前端包

| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `acr_paid_purchase` | `S03_ACR_PAID_PURCHASE` | blocked | none | none | 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | blocked | none | none | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only |
| `oss_ram_sts` | `S05_OSS_RAM_SECRET_OR_STS` | blocked | none | ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET | 阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE 环境变量或 Secrets Manager | ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `rds_database_secret_and_migration` | `S08_ALIYUN_RDS_DATABASE_URL` | blocked | DATABASE_URL_CN | none | 阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager -> secret env | DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport non-secret confirmation |
| `ready_secret_env_import` | `S06_READY_SENSITIVE_ENV_IMPORT` | blocked | none | ADMIN_USER_IDS, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, APIMART_API_KEY, CREDITS_IP_SALT, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SERVICE_RECORD_DEEPSEEK_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VOLC_SPEECH_ACCESS_TOKEN, VOLC_SPEECH_APP_ID, VOLC_SPEECH_SECRET_KEY, WECHAT_LOGIN_SECRET, WECHAT_MINI_APPID, WECHAT_MINI_SECRET | 现有 Vercel production / Supabase / 阿里云百炼 / DeepSeek / 火山引擎 / 微信公众平台等控制台 | SAE plain env for non-secret identifiers only; KMS/Secrets Manager/SAE secret env for secret or connection values; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport |

## 必填/发布阻塞变量

| 变量 | 必填 | 状态 | 敏感等级 | 获取位置 | 获取方式 | 导入目标 | 处理规则 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | 是 | todo | identifier_or_connection | 阿里云控制台 -> RDS PostgreSQL -> 数据库连接 | 创建或确认 production-cn RDS PostgreSQL 后生成连接串，并配套完成数据迁移/回滚验收。 | 阿里云 KMS/Secrets Manager/SAE secret env | 只在动作时导入 KMS/Secrets Manager/SAE secret env；不要写入 JSON、Markdown、Docker 镜像或 git。 |

## 当前后端阻塞变量获取与导入计划

| 变量 | 授权包 | 获取位置 | 获取方式 | 导入目标 | 禁止写入 |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | P11_ALIYUN_RDS_DATA_MIGRATION | 阿里云控制台 -> RDS PostgreSQL -> 数据库连接 | 创建或确认 production-cn RDS PostgreSQL 后生成连接串，并配套完成数据迁移/回滚验收。 | 阿里云 KMS/Secrets Manager/SAE secret env | 只在动作时导入 KMS/Secrets Manager/SAE secret env；不要写入 JSON、Markdown、Docker 镜像或 git。 |

## 延期的完整 APP 发布变量

| 变量 | 授权包 | 获取位置 | 获取方式 | 导入目标 | 禁止写入 |
| --- | --- | --- | --- | --- | --- |
| `WECHAT_OPEN_APP_ID` | P01_WECHAT_OPEN_MOBILE_APP | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 移动应用审核通过后读取 AppID/AppSecret；审核状态填 WECHAT_OPEN_APP_REVIEW_STATUS。 | 阿里云 SAE plain env | 只记录标识符和非密钥证据，导入 SAE plain env；不要写入 App 包。 |
| `WECHAT_OPEN_APP_SECRET` | P01_WECHAT_OPEN_MOBILE_APP | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App | 移动应用审核通过后读取 AppID/AppSecret；审核状态填 WECHAT_OPEN_APP_REVIEW_STATUS。 | 阿里云 KMS/Secrets Manager/SAE secret env | 只在动作时导入 KMS/Secrets Manager/SAE secret env；不要写入 JSON、Markdown、Docker 镜像或 git。 |
| `APPLE_TEAM_ID` | P02_APPLE_TEAM_ID | Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers -> 美业话镜 App ID | 确认 10 位 Team ID，用于生成 apple-app-site-association 里的 appID；它不是密钥。 | 阿里云 SAE plain env | 只记录标识符和非密钥证据，导入 SAE plain env；不要写入 App 包。 |
| `MEIYE_RELEASE_STORE_FILE` | P10_ANDROID_RELEASE_SIGNING | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 从已有 Android release keystore 管理位置或发布负责人处确认；若尚未生成，需要按公司发布流程创建并安全保存。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 只保存在本机/CI signing secret store；不要写入 JSON、Markdown、Docker 镜像或 git。 |
| `MEIYE_RELEASE_STORE_PASSWORD` | P10_ANDROID_RELEASE_SIGNING | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 从已有 Android release keystore 管理位置或发布负责人处确认；若尚未生成，需要按公司发布流程创建并安全保存。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 只保存在本机/CI signing secret store；不要写入 JSON、Markdown、Docker 镜像或 git。 |
| `MEIYE_RELEASE_KEY_ALIAS` | P10_ANDROID_RELEASE_SIGNING | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 从已有 Android release keystore 管理位置或发布负责人处确认；若尚未生成，需要按公司发布流程创建并安全保存。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 只保存在本机/CI signing secret store；不要写入 JSON、Markdown、Docker 镜像或 git。 |
| `MEIYE_RELEASE_KEY_PASSWORD` | P10_ANDROID_RELEASE_SIGNING | 本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。 | 从已有 Android release keystore 管理位置或发布负责人处确认；若尚未生成，需要按公司发布流程创建并安全保存。 | 本机/CI Android signing secret store，不导入阿里云 SAE env。 | 只保存在本机/CI signing secret store；不要写入 JSON、Markdown、Docker 镜像或 git。 |

## 已 ready 但仍需导入阿里云 secret env 的变量组

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

## CloudShell / CLI 只读盘点

- interpretation: strict_inventory_incomplete_and_fresh_read_unavailable
- strictInventoryEvidenceReady: false
- freshCloudReadAvailableNow: false
- currentCliProfileReady: false
- currentBrowserConsoleUsable: true
- notACloudResourceReadyProof: true
- proofScope: strict_cloud_inventory_evidence_incomplete
- nextEvidenceAction: configure_aliyun_cli_profile_or_use_cloudshell_for_fresh_readonly_inventory
- canReadCloudNow: false
- cliConfigProbeReady: false
- cliConfigProbeFailureCategory: aliyun_cli_profile_not_configured
- currentBrowserChecked: true
- currentBrowserRunning: true
- currentBrowserCanUseCurrentConsole: true
- currentBrowserAliyunConsoleTabCount: 1
- currentBrowserAliyunConsoleHostPaths: shell.aliyun.com
- currentBrowserCloudApiCalled: false
- currentBrowserCloudMutationPerformed: false
- currentBrowserBlockers: none
- workbenchTerminalConnected: true
- workbenchTerminalReadiness: connected_not_inventory_ready
- workbenchTerminalCliInventoryAttempted: false
- blockers: aliyun_cli_config_missing_or_unread, aliyun_cli_profile_not_configured
- safeConsoleOnly: false
- strictReadyOperations: 0/9
- consoleObservationOperations: 9
- executedCommandResults: 9

## Strict 验证顺序

- `corepack pnpm aliyun:cloud:access`
- `corepack pnpm aliyun:cloud:inventory-results:strict`
- `corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage`
- `corepack pnpm aliyun:cloud:confirmations:strict`
- `corepack pnpm aliyun:image:plan:strict`
- `corepack pnpm aliyun:completion:audit`
- `corepack pnpm aliyun:predeploy`

## 未获动作时确认前禁止

- 购买 ACR 或任何付费资源。
- 创建/修改 SAE、SLS、OSS、RAM、KMS、Secrets Manager、DNS、证书、CDN 或公网入口。
- 读取、复制、粘贴、导入或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。
- 推送镜像到 ACR、部署 production-cn、修改正式域名解析、git push。
- 创建微信开放平台移动应用或读取审核通过后的 AppSecret，除非用户在动作时明确授权并提供相应账号上下文。
