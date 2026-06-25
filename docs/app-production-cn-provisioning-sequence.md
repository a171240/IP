# 美业话镜 APP production-cn 阿里云 Provisioning Plan

Generated: 2026-06-25T08:20:25.005Z

## 结论

- Production-cn cannot be deployed now.
- Execution mode: plan_only
- executionMode=plan_only
- Current scope: backend_aliyun_only
- Full APP launch scope: deferred_after_backend_online
- Can Codex execute now: false
- canCodexExecuteNow=false
- canDeployNow=false
- provider=Aliyun SAE
- region=cn-hangzhou
- appName=meiye-huajing-app-api-production-cn
- runtime=custom-container
- containerPort=3000
- healthPath=/api/healthz
- strictHealthPath=/api/app/health?strict=1
- apiHost=api-cn.ipgongchang.xin
- assetHost=assets-cn.ipgongchang.xin
- ECS is a fallback only
- Aliyun RDS PostgreSQL as the formal data layer
- Cloud resource ready: 0/7
- User action ready: 0/11
- Ready phases: PH02_BASE_CLOUD_RESOURCES
- Blocked phases: PH01_EXTERNAL_APP_IDENTIFIERS, PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP, PH07_PRODUCTION_DEPLOY
- Required blocking env: DATABASE_URL_CN
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready authorization packets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- Deferred APP launch authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready console action packets: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- Blocked credential count: 8
- Ready secret env variable count: 17
- Resource evidence ready: 0/7
- Blocked resource evidence ids: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- Partially observed resource evidence ids: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS

## 目标闭环证据简表

- Conclusion: 现在不能部署；当前只推进阿里云后端，PH02 可进入动作时确认，微信移动 App、Android/iOS 发布凭证延期到后端上线后。
- Can deploy now: false
- Can Codex execute now: false
- Blocked credential count: 8
- Blocked credential names: APPLE_TEAM_ID, DATABASE_URL_CN, MEIYE_RELEASE_KEY_ALIAS, MEIYE_RELEASE_KEY_PASSWORD, MEIYE_RELEASE_STORE_FILE, MEIYE_RELEASE_STORE_PASSWORD, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
- Ready secret env variable count: 17
- Resource evidence ready: 0/7
- Blocked resource evidence ids: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- Partially observed resource evidence ids: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- Ready to start phases: PH02_BASE_CLOUD_RESOURCES
- Blocked phases: PH01_EXTERNAL_APP_IDENTIFIERS, PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP, PH07_PRODUCTION_DEPLOY
- Can start now authorization packets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Can start now console tasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- Next action-time confirmations: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION

## Ready Authorization Packets

### P03_ACR_PURCHASE 确认 ACR 企业版付费购买

- Action id: U03_ACR_PURCHASE_CONFIRMATION
- Sequence group: cloud_foundation
- Minimum user phrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- Non-secret evidence only: true
- Completion evidence:
  - acr.purchaseCandidate.confirmed=true
  - acr.registryHost actual aliyuncs.com host
  - acr.namespace created
  - repository=meiye-huajing-app-api
- Write targets:
  - deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- Explicitly excluded:
  - 未明确确认金额前不点击付款。
  - 不执行 docker login/push。
  - 不记录 registry password、RAM Secret 或 token。

### P05_OSS_RAM_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- Action id: U05_OSS_RAM_OR_STS
- Sequence group: cloud_foundation
- Minimum user phrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- Non-secret evidence only: false
- Completion evidence:
  - oss.confirmed=true
  - oss.ramLeastPrivilege=true
  - serviceRecordPrefix=service-records/production-cn
  - secret imported through Aliyun controlled secret env only
- Write targets:
  - deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss
  - ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- Explicitly excluded:
  - 不创建可提交的长期明文 Secret。
  - 不下载 OSS 对象内容。
  - 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- Action id: U11_ALIYUN_RDS_DATA_MIGRATION
- Sequence group: cloud_foundation
- Minimum user phrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- Non-secret evidence only: false
- Completion evidence:
  - Aliyun RDS PostgreSQL instance exists in cn-hangzhou
  - DATABASE_URL_CN imported through secret env only
  - backend production-cn data access no longer depends on Supabase as formal database target
  - migration and rollback validation pass
- Write targets:
  - DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env
  - RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告
- Explicitly excluded:
  - 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。
  - 不把 Supabase 当作正式 production-cn 数据库目标。
  - 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。


## Phases

### PH01_EXTERNAL_APP_IDENTIFIERS 补齐微信移动应用、Android release 签名和 Apple Team ID

- Status: deferred_after_backend_online
- Can start now: false
- Deferred after backend online: true
- Requires action-time confirmation: true
- Authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Console tasks: none
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: deferredAfterBackendOnline:P01_WECHAT_OPEN_MOBILE_APP, deferredAfterBackendOnline:P10_ANDROID_RELEASE_SIGNING, deferredAfterBackendOnline:P02_APPLE_TEAM_ID
- Current blockers: dependsOn:deferredAfterBackendOnline:P01_WECHAT_OPEN_MOBILE_APP; dependsOn:deferredAfterBackendOnline:P10_ANDROID_RELEASE_SIGNING; dependsOn:deferredAfterBackendOnline:P02_APPLE_TEAM_ID
- Verify commands: none
- Current action acceptance evidence:
  - none
- Deferred actions:
  - none
- Completion evidence:
  - 微信开放平台移动应用审核通过后 only 记录 AppID ready；AppSecret 只导入 secret env。
  - Android release 包必须用受控 release keystore 签名，并只记录微信 Android 签名非密钥证据。
  - APPLE_TEAM_ID 从 Apple Developer 读取并导入 plain env。
- Explicitly excluded:
  - 不使用小程序 AppID/Secret 替代移动应用凭证。
  - 不把 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。
  - 不做小程序上传或 APP 商店提交。
  - 不使用 debug.keystore、debug APK 或 debug 签名。
  - 不把 keystore 文件、store password、key password、证书私钥或微信 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。
  - 不创建微信开放平台移动应用、不提交审核；这些必须由 P01 单独授权。
  - 不猜测 Team ID。
  - 不创建/修改证书、描述文件或 App Store Connect 记录。

### PH02_BASE_CLOUD_RESOURCES 确认 ACR、RDS PostgreSQL 和 OSS/RAM/STS 基础资源

- Status: ready_for_action_time_confirmation
- Can start now: true
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- Console tasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- Current action scopes: C02_ACR_IMAGE_AND_PULL=purchase_and_repository_only
- Current action scope handles: currentActionScope=purchase_and_repository_only
- Blocking dependencies: none
- Current blockers: imagePublishLocal:todo:acr.registryHost; imagePublishLocal:todo:acr.namespace; imagePublishLocal:todo:acr.remoteImage; imagePublishLocal:todo:acr.remoteDigest; imagePublishLocal:todo:acr.evidence; imagePublishLocal:acr.confirmed; imagePublishLocal:acr.imagePushed; imagePublishLocal:acr.digestVerified; imagePublishLocal:acr.remoteDigest=sha256; imagePublishLocal:runtime.confirmed; imagePublishLocal:runtime.remoteImageConfigured; imagePublishLocal:runtime.imagePullConfigured; S03_ACR_PAID_PURCHASE:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured; oss:confirmed; oss:ramLeastPrivilege; S05_OSS_RAM_SECRET_OR_STS:blocked; R05_OSS_AUDIO_STORAGE:oss:confirmed; R05_OSS_AUDIO_STORAGE:oss:ramLeastPrivilege
- Verify commands: `corepack pnpm aliyun:image:plan`; `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:docker:build`; `corepack pnpm aliyun:container:smoke`; `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:app-api:smoke`; `postdeploy service-records upload smoke after API deployment`
- Current action acceptance evidence:
  - acr.purchaseCandidate.confirmed=true
  - acr.registryHost actual aliyuncs.com host
  - acr.namespace created
  - repository=meiye-huajing-app-api
  - region=cn-hangzhou
  - corsConfigured=true
  - ramLeastPrivilege=true
  - serviceRecordPrefix=service-records/production-cn
  - confirmed=true
- Deferred actions:
  - P04_ACR_IMAGE_AND_PULL 依赖 P03_ACR_PURCHASE 完成后再执行。
  - 当前确认包不执行 docker login/push。
  - 当前确认包不配置 SAE runtime image pull credentials。
  - imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true 都属于后置验收。
- Completion evidence:
  - ACR 只记录 registry host、namespace、repository、remote tag 和购买证据。
  - RDS PostgreSQL 必须完成实例、DATABASE_URL_CN secret env、schema/data 迁移、APP API smoke 和回滚验收；首版业务数据访问代码侧已切到 RDS repository。
  - OSS 只记录 bucket、region、CORS、RAM/STS 最小权限布尔证据。
- Explicitly excluded:
  - 未明确确认金额前不点击付款。
  - 不执行 docker login/push。
  - 不记录 registry password、RAM Secret 或 token。
  - 不创建可提交的长期明文 Secret。
  - 不下载 OSS 对象内容。
  - 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。
  - 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。
  - 不把 Supabase 当作正式 production-cn 数据库目标。
  - 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key

### PH03_IMAGE_PUSH_AND_PULL 推送后端镜像并配置 SAE 镜像拉取

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P04_ACR_IMAGE_AND_PULL
- Console tasks: C02_ACR_IMAGE_AND_PULL
- Current action scopes: C02_ACR_IMAGE_AND_PULL=purchase_and_repository_only
- Current action scope handles: currentActionScope=purchase_and_repository_only
- Blocking dependencies: P03_ACR_PURCHASE, notReadyForCurrentScope:P04_ACR_IMAGE_AND_PULL
- Current blockers: imagePublishLocal:todo:acr.registryHost; imagePublishLocal:todo:acr.namespace; imagePublishLocal:todo:acr.remoteImage; imagePublishLocal:todo:acr.remoteDigest; imagePublishLocal:todo:acr.evidence; imagePublishLocal:acr.confirmed; imagePublishLocal:acr.imagePushed; imagePublishLocal:acr.digestVerified; imagePublishLocal:acr.remoteDigest=sha256; imagePublishLocal:runtime.confirmed; imagePublishLocal:runtime.remoteImageConfigured; imagePublishLocal:runtime.imagePullConfigured; S03_ACR_PAID_PURCHASE:blocked; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.namespace; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteImage; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.remoteDigest; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.evidence; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.imagePushed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.digestVerified; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:acr.remoteDigest=sha256; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.confirmed; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.remoteImageConfigured; R02_ACR_IMAGE_REGISTRY:imagePublishLocal:runtime.imagePullConfigured; dependsOn:P03_ACR_PURCHASE; dependsOn:notReadyForCurrentScope:P04_ACR_IMAGE_AND_PULL
- Verify commands: `corepack pnpm aliyun:image:plan`; `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:docker:build`; `corepack pnpm aliyun:container:smoke`
- Current action acceptance evidence:
  - acr.purchaseCandidate.confirmed=true
  - acr.registryHost actual aliyuncs.com host
  - acr.namespace created
  - repository=meiye-huajing-app-api
- Deferred actions:
  - P04_ACR_IMAGE_AND_PULL 依赖 P03_ACR_PURCHASE 完成后再执行。
  - 当前确认包不执行 docker login/push。
  - 当前确认包不配置 SAE runtime image pull credentials。
  - imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true 都属于后置验收。
- Completion evidence:
  - image-publish.local.json 只记录 remote image、sha256 digest 和布尔状态。
  - registry password、RAM Secret 或 token 不进入 JSON、Markdown、镜像或 git。
- Explicitly excluded:
  - 不购买 ACR。
  - 不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。
  - 不部署 production-cn，除非 U09 单独授权。
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key

### PH04_ENV_IMPORT 导入 production-cn 环境变量

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P06_ENV_IMPORT
- Console tasks: C06_ENV_IMPORT
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION, C05_OSS_AUDIO_RAM_STS, notReadyForCurrentScope:P06_ENV_IMPORT
- Current blockers: missing_required_env:DATABASE_URL_CN; envImport:confirmed; envImport:secretNotInImage; envImport:placeholder:importedAt; envImport:placeholder:evidence; S06_READY_SENSITIVE_ENV_IMPORT:blocked; R06_ENV_IMPORT:missing_required_env:DATABASE_URL_CN; R06_ENV_IMPORT:envImport:confirmed; R06_ENV_IMPORT:envImport:secretNotInImage; R06_ENV_IMPORT:envImport:placeholder:importedAt; R06_ENV_IMPORT:envImport:placeholder:evidence; requiredEnv:DATABASE_URL_CN; dependsOn:P05_OSS_RAM_STS; dependsOn:P11_ALIYUN_RDS_DATA_MIGRATION; dependsOn:C05_OSS_AUDIO_RAM_STS; dependsOn:notReadyForCurrentScope:P06_ENV_IMPORT
- Verify commands: `corepack pnpm aliyun:env:handoff:backend`; `corepack pnpm aliyun:sensitive:blockers:backend`; `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:env:check`; `corepack pnpm aliyun:readiness:strict`; `corepack pnpm aliyun:readiness:cloud-ready`
- Current action acceptance evidence:
  - secretNotInImage=true
  - importedAt=实际导入时间
  - currentBackendRequiredBlocking=DATABASE_URL_CN
- Deferred actions:
  - none
- Completion evidence:
  - plain env 只放非密钥标识符和公开 URL。
  - secret env 只通过 KMS/Secrets Manager/SAE secret env 导入。
  - cloud-confirmations.local.json 只记录 importedAt、target、secretNotInImage=true 和 evidence handle。
- Explicitly excluded:
  - 不把任何 value 粘贴到 Markdown、JSON、Dockerfile、镜像或 git。
  - 不导入 WECHAT_OPEN_APP_ID/SECRET，除非移动应用审核已通过并单独授权。
  - 不部署 production-cn。
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key

### PH05_SAE_RUNTIME_AND_SLS 创建/确认 SAE runtime 和 SLS 告警

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P08_SAE_RUNTIME_SLS
- Console tasks: C01_SAE_RUNTIME, C07_SLS_ALERTS
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P06_ENV_IMPORT, C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS, C06_ENV_IMPORT, C01_SAE_RUNTIME, notReadyForCurrentScope:P08_SAE_RUNTIME_SLS
- Current blockers: runtime:confirmed; R01_SAE_RUNTIME:runtime:confirmed; R07_SLS_ALERTS:slsAlerts:confirmed; R07_SLS_ALERTS:slsAlerts:healthAlertConfigured; R07_SLS_ALERTS:slsAlerts:serverErrorAlertConfigured; slsAlerts:confirmed; slsAlerts:healthAlertConfigured; slsAlerts:serverErrorAlertConfigured; dependsOn:P03_ACR_PURCHASE; dependsOn:P04_ACR_IMAGE_AND_PULL; dependsOn:P05_OSS_RAM_STS; dependsOn:P06_ENV_IMPORT; dependsOn:C02_ACR_IMAGE_AND_PULL; dependsOn:C05_OSS_AUDIO_RAM_STS; dependsOn:C06_ENV_IMPORT; dependsOn:C01_SAE_RUNTIME; dependsOn:notReadyForCurrentScope:P08_SAE_RUNTIME_SLS
- Verify commands: `corepack pnpm aliyun:runtime:plan`; `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:docker:check`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:cloud:confirmations:strict`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin`; `corepack pnpm aliyun:cloud:check`
- Current action acceptance evidence:
  - provider=SAE
  - containerPort=3000
  - healthPath=/api/healthz
  - confirmed=true
  - healthAlertConfigured=true
  - serverErrorAlertConfigured=true
- Deferred actions:
  - none
- Completion evidence:
  - SAE cn-hangzhou 自定义容器应用名为 meiye-huajing-app-api-production-cn，端口 3000，健康检查 /api/healthz。
  - SLS 配置 health 和 5xx 告警后只记录布尔证据。
- Explicitly excluded:
  - 不购买 ACR。
  - 不导入环境变量 value。
  - 不推送镜像、不执行生产部署。
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key

### PH06_DOMAIN_HTTPS_ICP 配置 api-cn/assets-cn DNS、HTTPS、ICP

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P07_DOMAIN_DNS_HTTPS
- Console tasks: C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: P08_SAE_RUNTIME_SLS, C01_SAE_RUNTIME, C05_OSS_AUDIO_RAM_STS, notReadyForCurrentScope:P07_DOMAIN_DNS_HTTPS
- Current blockers: APP_API_BASE_URL:dns_special_use_wildcard_ip; APP_API_BASE_URL:https_not_ready:ECONNRESET; NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; apiDomainHttps:confirmed; apiDomainHttps:dnsResolvedToAliyun; apiDomainHttps:httpsEnabled; apiDomainHttps:icpReady; assetDomainHttps:confirmed; assetDomainHttps:dnsResolvedToAliyun; assetDomainHttps:httpsEnabled; assetDomainHttps:icpReady; R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R03_API_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R03_API_DOMAIN_HTTPS:apiDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:apiDomainHttps:icpReady; R03_API_DOMAIN_HTTPS:assetDomainHttps:confirmed; R03_API_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R03_API_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R03_API_DOMAIN_HTTPS:assetDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_API_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:dns_special_use_wildcard_ip; R04_ASSET_DOMAIN_HTTPS:APP_ASSET_BASE_URL:https_not_ready:ECONNRESET; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:apiDomainHttps:icpReady; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:confirmed; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:dnsResolvedToAliyun; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:httpsEnabled; R04_ASSET_DOMAIN_HTTPS:assetDomainHttps:icpReady; dependsOn:P08_SAE_RUNTIME_SLS; dependsOn:C01_SAE_RUNTIME; dependsOn:C05_OSS_AUDIO_RAM_STS; dependsOn:notReadyForCurrentScope:P07_DOMAIN_DNS_HTTPS
- Verify commands: `corepack pnpm aliyun:domain:check`; `corepack pnpm aliyun:domain:strict`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin`; `corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin`
- Current action acceptance evidence:
  - dnsResolvedToAliyun=true
  - httpsEnabled=true
  - icpReady=true
  - corepack pnpm aliyun:domain:strict pass
- Deferred actions:
  - none
- Completion evidence:
  - api-cn 指向阿里云后端公网入口，assets-cn 指向 OSS/CDN 资产入口。
  - 不能用旧 api/ip 记录、Vercel、localhost、example 或 198.18.0.x 作为 ready 证据。
- Explicitly excluded:
  - 不指向 Vercel、localhost、example 或 198.18.0.x 特殊用途地址。
  - 不下载证书私钥。
  - 不部署 production-cn。
  - AccessKeySecret
  - AppSecret
  - registry password
  - RAM Secret
  - token
  - cookie
  - Supabase service role key

### PH07_PRODUCTION_DEPLOY 执行 production-cn 部署和 postdeploy smoke

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P09_PRODUCTION_DEPLOY
- Console tasks: none
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, notReadyForCurrentScope:P09_PRODUCTION_DEPLOY
- Current blockers: dependsOn:P03_ACR_PURCHASE; dependsOn:P04_ACR_IMAGE_AND_PULL; dependsOn:P05_OSS_RAM_STS; dependsOn:P11_ALIYUN_RDS_DATA_MIGRATION; dependsOn:P06_ENV_IMPORT; dependsOn:P07_DOMAIN_DNS_HTTPS; dependsOn:P08_SAE_RUNTIME_SLS; dependsOn:notReadyForCurrentScope:P09_PRODUCTION_DEPLOY
- Verify commands: none
- Current action acceptance evidence:
  - none
- Deferred actions:
  - none
- Completion evidence:
  - 所有 strict 门禁通过后才执行生产部署。
  - 部署后运行 postdeploy smoke、remote smoke 和 app api smoke。
- Explicitly excluded:
  - 不 git push，除非单独授权。
  - 不上传微信小程序或 APP 商店包。
  - 不修改 Supabase production schema/data。

## Safety Boundary

- 本计划不执行任何阿里云、微信、Apple、Vercel 或 git 写操作。
- 本计划不读取或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、证书私钥或 Supabase service role key。
- 执行任一 phase 前必须有动作时确认，且确认范围只覆盖该 phase。
- 所有 .local.json 只能写资源名、布尔值、时间、控制台路径、digest 和非密钥 evidence handle。
- 当前后端-only 目标不创建微信开放平台移动应用，也不执行 Android release signing 或 Apple Team ID/AASA 操作。

本文件不包含任何密钥值，也不代表已执行任何云资源变更。
