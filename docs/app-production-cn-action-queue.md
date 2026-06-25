# 阿里云控制台动作包

生成时间：2026-06-24T16:51:36.339Z

## 结论

- packageId: C00_ALIYUN_CLOUD_ACTIONS
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canDeployNow: false
- canProceedWithoutWechat: true
- backendTargetReady: 0/8
- verdict: blocked
- cloudConfirmationsReady: 0/7
- operatorTasksReady: 1/9
- canReadCloudNow: false
- cloudInventoryResultsReady: false
- cloudInventoryReadyLocalOperations: 0/9
- cloudInventoryExecutedCommandResults: 9/9
- cliConfigProbeFailureCategory: aliyun_cli_profile_not_configured
- containsValues: false
- mutationPerformed: false
- cloudApiCalled: false
- blockedCredentialCount: 2
- readySecretEnvVariableCount: 17
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS

## 目标闭环证据简表

- conclusion: 现在不能部署；本动作包当前只覆盖阿里云后端，能进入 C02/C05/P11 的动作时确认，其余 ACR push/SAE/DNS/env/SLS/smoke 仍未闭环。
- canDeployNow: false
- blockedCredentialCount: 2
- blockedCredentialNames: ALIYUN_OSS_SECURITY_TOKEN, DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- resourceEvidenceReady: 0/7
- blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- strictReadonlyInventoryReady: false
- cloudInventoryReadyLocalOperations: 0/9
- cloudInventoryExecutedCommandResults: 9/9
- mutationPerformedCommandResults: 0
- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- cloudConsolePackets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION
- externalAppPackets: none
- deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- blockedByDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C06_ENV_IMPORT, C07_SLS_ALERTS
- imagePublishWritebackBlockingGroups: acrPurchaseAndRepository, imagePushAndDigest, saeRuntimeImagePull

## 下一步执行队列

- canStartNow: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- externalAppPrerequisites: none
- deferredAppLaunchPrerequisites: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- blockedByDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C06_ENV_IMPORT, C07_SLS_ALERTS
- C02_ACR_IMAGE_AND_PULL: kind=aliyun_console_task; scope=purchase_and_repository_only; phrase=授权购买/确认 ACR 企业版实例和镜像仓库基础信息；不执行 docker login/push，不记录 registry password。
- C05_OSS_AUDIO_RAM_STS: kind=aliyun_console_task; scope=full_task; phrase=授权确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色；Secret 只进阿里云受控密钥环境。
- externalAppPrerequisiteItems: none

## 只读盘点解锁

- status: blocked_until_cli_or_cloudshell_identity_ready
- currentBlocker: aliyun_cli_profile_not_configured
- currentEvidence: none
- minimumAuthorizationPhrase: 授权在本机 Aliyun CLI 或阿里云 CloudShell 中配置只读身份，并只运行 allowlisted production-cn inventory 命令；不输出 AccessKeySecret、STS token、cookie、registry password 或证书私钥。
- whyConsoleLoginIsNotEnough: 浏览器控制台登录、ECS Workbench 终端可见、或 OSS/SLS 页面可见，只能作为人工观察证据；严格云证据必须来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令结果，且不记录原始敏感输出。
- unlockCommands:
  - corepack pnpm aliyun:cloud:access
  - MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json
  - corepack pnpm aliyun:cloud:inventory-results:strict
  - corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
  - corepack pnpm aliyun:completion:audit
- forbidden:
  - 不要把 AccessKeySecret、STS token、cookie、registry password、RAM Secret、Supabase service role key 或证书私钥写入 JSON、Markdown、Docker 镜像、截图、聊天或 git。
  - 不要运行 Create/Update/Delete/Deploy/Start/Stop/GetAuthorizationToken/docker login/docker push/oss cp/oss cat/oss sign。
  - 不要把控制台页面可见或 Workbench 已连接误标记成 cloudInventory strict ready。

## 当前可先做

### C02_ACR_IMAGE_AND_PULL 购买/确认 ACR 企业版实例和镜像仓库基础信息

- consolePath: 阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页
- minimumAuthorizationPhrase: 授权购买/确认 ACR 企业版实例和镜像仓库基础信息；不执行 docker login/push，不记录 registry password。
- currentActionScope: purchase_and_repository_only
- currentActionAcceptanceEvidence: acr.purchaseCandidate.confirmed=true；acr.registryHost actual aliyuncs.com host；acr.namespace created；repository=meiye-huajing-app-api
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json: acr.confirmed=true；deploy/aliyun-production-cn.image-publish.local.json: acr.registryHost=<cn-hangzhou aliyuncs.com host>；deploy/aliyun-production-cn.image-publish.local.json: acr.namespace=<actual namespace>
- verifyCommands: corepack pnpm aliyun:image:plan
- deferredActions: P04_ACR_IMAGE_AND_PULL 依赖 P03_ACR_PURCHASE 完成后再执行。；当前确认包不执行 docker login/push。；当前确认包不配置 SAE runtime image pull credentials。；imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true 都属于后置验收。；imagePushAndDigest 需等待 P04_ACR_IMAGE_AND_PULL；当前 blockers: todo:acr.remoteImage, todo:acr.remoteDigest, todo:acr.evidence, acr.imagePushed, acr.digestVerified, acr.remoteDigest=sha256；saeRuntimeImagePull 需等待 P08_SAE_RUNTIME_SLS, P04_ACR_IMAGE_AND_PULL；当前 blockers: runtime.confirmed, runtime.remoteImageConfigured, runtime.imagePullConfigured

### C05_OSS_AUDIO_RAM_STS 确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色

- consolePath: 阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份
- minimumAuthorizationPhrase: 授权确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色；Secret 只进阿里云受控密钥环境。
- currentActionScope: full_task
- currentActionAcceptanceEvidence: none
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss；ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- verifyCommands: corepack pnpm aliyun:cloud:confirmations；corepack pnpm aliyun:health:smoke；corepack pnpm aliyun:app-api:smoke；postdeploy service-records upload smoke after API deployment
- deferredActions: none

## 必须暂缓

- C01_SAE_RUNTIME: dependsOn=C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS, C06_ENV_IMPORT; blockers=runtime:confirmed, R01_SAE_RUNTIME:runtime:confirmed, R07_SLS_ALERTS:slsAlerts:confirmed, R07_SLS_ALERTS:slsAlerts:healthAlertConfigured, R07_SLS_ALERTS:slsAlerts:serverErrorAlertConfigured, slsAlerts:confirmed
- C03_API_DOMAIN_HTTPS_ICP: dependsOn=C01_SAE_RUNTIME; blockers=APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET
- C04_ASSET_DOMAIN_HTTPS_ICP: dependsOn=C05_OSS_AUDIO_RAM_STS; blockers=APP_API_BASE_URL:dns_special_use_wildcard_ip, APP_API_BASE_URL:https_not_ready:ECONNRESET, NEXT_PUBLIC_SITE_URL:dns_special_use_wildcard_ip, NEXT_PUBLIC_SITE_URL:https_not_ready:ECONNRESET, APP_ASSET_BASE_URL:dns_special_use_wildcard_ip, APP_ASSET_BASE_URL:https_not_ready:ECONNRESET
- C06_ENV_IMPORT: dependsOn=C05_OSS_AUDIO_RAM_STS; blockers=missing_required_env:DATABASE_URL_CN, envImport:confirmed, envImport:secretNotInImage, envImport:placeholder:importedAt, envImport:placeholder:evidence, S06_READY_SENSITIVE_ENV_IMPORT:blocked
- C07_SLS_ALERTS: dependsOn=C01_SAE_RUNTIME; blockers=slsAlerts:confirmed, slsAlerts:healthAlertConfigured, slsAlerts:serverErrorAlertConfigured, R01_SAE_RUNTIME:runtime:confirmed, R07_SLS_ALERTS:slsAlerts:confirmed, R07_SLS_ALERTS:slsAlerts:healthAlertConfigured

## 云侧动作授权包

- P03_ACR_PURCHASE: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- P05_OSS_RAM_STS: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- P11_ALIYUN_RDS_DATA_MIGRATION: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。

## 延期的外部 App 前置项

- P01_WECHAT_OPEN_MOBILE_APP: 授权在微信开放平台创建/补全美业话镜移动应用资料并提交审核；不读取或输出 AppSecret。
- P10_ANDROID_RELEASE_SIGNING: 授权使用受控 Android release keystore 构建/签名 release 包并读取微信开放平台 Android 应用签名；不输出 keystore 密码。
- P02_APPLE_TEAM_ID: 授权读取 Apple Developer Team ID 并导入阿里云 plain env。

## 严格验证顺序

- corepack pnpm aliyun:cloud:access
- corepack pnpm aliyun:cloud:inventory-results:strict
- corepack pnpm aliyun:cloud:confirmations:strict
- corepack pnpm aliyun:image:plan:strict
- corepack pnpm aliyun:completion:audit
- corepack pnpm aliyun:predeploy

## 禁止项

- 本命令只读本地无值报告，不调用阿里云 API。
- 不购买 ACR，不创建或修改 SAE/SLS/OSS/RAM/KMS/Secrets Manager/DNS/证书/CDN。
- 不读取、复制、粘贴或导入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。
- 不推送镜像、不部署 production-cn、不 git push。
- 所有 .local.json 只能写资源名、布尔值、时间、控制台路径、digest 和非密钥 evidence handle。
- 购买 ACR 或任何付费资源。
- 创建/修改 SAE、SLS、OSS、RAM、KMS、Secrets Manager、DNS、证书、CDN 或公网入口。
- 读取、复制、粘贴、导入或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。
- 推送镜像到 ACR、部署 production-cn、修改正式域名解析、git push。
- 当前后端-only 目标不创建微信开放平台移动应用；微信/Apple/Android 发布项延期到后端上线后单独处理。

## 当前阻塞

- backendRequired:ACR_IMAGE_REGISTRY_NOT_READY
- backendRequired:API_DOMAIN_HTTPS_ICP_NOT_READY
- backendRequired:ASSET_DOMAIN_HTTPS_ICP_NOT_READY
- backendRequired:DATABASE_URL_CN
- backendRequired:ENV_IMPORT_NOT_READY
- backendRequired:OSS_RAM_STS_NOT_READY
- backendRequired:POSTDEPLOY_SMOKE_NOT_RUN
- backendRequired:RDS_MIGRATION_EVIDENCE_NOT_READY
- backendRequired:SAE_RUNTIME_NOT_READY
- backendRequired:SLS_ALERTS_NOT_READY
- blockedConsoleTask:C01_SAE_RUNTIME
- blockedConsoleTask:C03_API_DOMAIN_HTTPS_ICP
- blockedConsoleTask:C04_ASSET_DOMAIN_HTTPS_ICP
- blockedConsoleTask:C06_ENV_IMPORT
- blockedConsoleTask:C07_SLS_ALERTS
- aliyun_cli_config_missing_or_unread
- aliyun_cli_profile_not_configured
- cloudshell_cli_config_missing_or_unread
- cloudInventory:readonly_inventory_strict_ready=0/9
