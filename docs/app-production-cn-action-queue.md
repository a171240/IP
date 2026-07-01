# 阿里云控制台动作包

生成时间：2026-07-01T12:21:44.892Z

## 结论

- packageId: C00_ALIYUN_CLOUD_ACTIONS
- currentScope: backend_aliyun_only
- fullAppLaunchScope: deferred_after_backend_online
- canDeployNow: false
- canProceedWithoutWechat: true
- backendTargetReady: 7/8
- verdict: blocked
- cloudConfirmationsReady: 6/6
- operatorTasksReady: 6/8
- sensitiveActionReady: 0/1
- sensitiveActionBlocked: 1/1
- canReadCloudNow: true
- cloudInventoryResultsReady: true
- cloudInventoryReadyLocalOperations: 9/9
- cloudInventoryExecutedCommandResults: 9/9
- cliConfigProbeFailureCategory: none
- containsValues: false
- mutationPerformed: false
- cloudApiCalled: false
- blockedCredentialCount: 0
- readySecretEnvVariableCount: 0
- resourceEvidenceReady: 6/7
- blockedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY
- partiallyObservedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY
- backendCanStartNowSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- immediateBackendSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- blockedBackendSteps: BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE
- backendFirstUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL
- backendDeferredUserInterventionRequired: USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE
- onlyMissingBackendCredentialValue: n/a

## 目标闭环证据简表

- conclusion: 现在不能部署阿里云后端；微信开放平台移动应用、Android 签名和 Apple Team ID 已延期，当前必须先补齐 RDS/ACR/SAE/DNS/OSS/env/SLS/smoke 证据。
- canDeployNow: false
- blockedCredentialCount: 0
- blockedCredentialNames: none
- onlyMissingBackendCredentialValue: n/a
- credentialAcquisitionQueueActionIds: S04_ACR_REGISTRY_AUTH
- readySecretEnvVariableCount: 0
- resourceEvidenceReady: 6/7
- blockedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY
- partiallyObservedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY
- strictReadonlyInventoryReady: true
- cloudInventoryReadyLocalOperations: 9/9
- cloudInventoryExecutedCommandResults: 9/9
- mutationPerformedCommandResults: 0
- backendCanStartNowSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- backendBlockedByDependencies: BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE
- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL
- cloudConsolePackets: P04_ACR_IMAGE_AND_PULL
- externalAppPackets: none
- deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- blockedByDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C05_OSS_AUDIO_RAM_STS, C06_ENV_IMPORT, C07_SLS_ALERTS
- imagePublishWritebackBlockingGroups: imagePushAndDigest

## 后端 credential 获取/导入队列

- queueScope: backend_aliyun_only
- missingCredentialNames: none
- onlyMissingBackendCredentialValue: n/a
- readySecretsPendingCloudImport: 0
- requiresActionTimeConfirmationIds: S04_ACR_REGISTRY_AUTH

| order | category | actionId | question | obtainFrom | destination | verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `acr_registry_auth` | `S04_ACR_REGISTRY_AUTH` | 镜像推送和 SAE 拉取凭证放在哪里 | 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置 | Docker credential helper or short-lived docker login session -> local operator machine only; do not persist in repo; deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime non-secret fields; SAE runtime image pull credentials -> Aliyun runtime secret settings only | corepack pnpm aliyun:image:plan:strict; corepack pnpm aliyun:container:smoke |

## 后端优先执行顺序

- sourceCommand: corepack pnpm aliyun:backend-cn:status
- purpose: backend_first_apply_order_over_console_task_canStartNow
- note: Console canStartNow only means a console task can begin after action-time confirmation; backend-first apply order still starts with BAP00/BAP01 so RDS and read-only inventory are not skipped.
- immediateBackendSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- blockedBackendSteps: BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE
- actionTimeConfirmationRequired: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE
- immediateUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL
- blockedUserInterventionRequired: USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE
- userInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE
- BAP00_READONLY_INVENTORY_IDENTITY: status=ready_for_action_time_confirmation; packets=P00_ALIYUN_READONLY_INVENTORY_IDENTITY; dependsOn=none; order=0. Restore Aliyun CLI/CloudShell read-only inventory evidence and write non-secret summaries only.
- BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: status=ready_for_action_time_confirmation; packets=P11_ALIYUN_RDS_DATA_MIGRATION; dependsOn=none; order=1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou and close Supabase-to-RDS migration evidence.
- BAP02_OSS_RAM_STS_CLOSE: status=ready_for_action_time_confirmation; packets=P05_OSS_RAM_STS; dependsOn=none; order=2. Confirm OSS RAM/STS least-privilege runtime access.
- BAP03_ACR_PURCHASE_AND_REPOSITORY: status=completed; packets=P03_ACR_PURCHASE; dependsOn=none; order=3. Purchase/confirm ACR Enterprise instance, namespace, and repository.
- BAP04_ACR_IMAGE_PUSH_AND_PULL: status=ready_for_action_time_confirmation; packets=P04_ACR_IMAGE_AND_PULL; dependsOn=none; order=4. Push backend image to ACR, verify digest, and configure SAE image pull authorization.
- BAP05_BACKEND_ENV_IMPORT: status=blocked_by_dependencies; packets=P06_ENV_IMPORT; dependsOn=BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL; order=5. Import backend env through SAE/KMS/Secrets Manager, including DATABASE_URL_CN only as a secret env.
- BAP06_SAE_RUNTIME_CREATE: status=blocked_by_dependencies; packets=P08_SAE_RUNTIME_SLS; dependsOn=BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT; order=6. Create SAE runtime with container port 3000 and /api/healthz.
- BAP07_DOMAINS_HTTPS_ICP: status=blocked_by_dependencies; packets=P07_DOMAIN_DNS_HTTPS; dependsOn=BAP06_SAE_RUNTIME_CREATE; order=7. Bind api-cn/assets-cn DNS, HTTPS certificate, and ICP-compliant public access.
- BAP08_SLS_ALERTS: status=blocked_by_dependencies; packets=P08_SAE_RUNTIME_SLS; dependsOn=BAP06_SAE_RUNTIME_CREATE; order=8. Configure SLS health and 5xx alerts.
- BAP09_POSTDEPLOY_SMOKE: status=blocked_by_dependencies; packets=P09_PRODUCTION_DEPLOY; dependsOn=BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS; order=9. Run backend health and APP API smoke tests against Aliyun.

## 下一步执行队列

- backendCanStartNow: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL
- consoleCanStartNow: C02_ACR_IMAGE_AND_PULL
- canStartNow: C02_ACR_IMAGE_AND_PULL
- externalAppPrerequisites: none
- deferredAppLaunchPrerequisites: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- backendBlockedByDependencies: BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE, BAP07_DOMAINS_HTTPS_ICP, BAP08_SLS_ALERTS, BAP09_POSTDEPLOY_SMOKE
- blockedByDependencies: C01_SAE_RUNTIME, C03_API_DOMAIN_HTTPS_ICP, C04_ASSET_DOMAIN_HTTPS_ICP, C05_OSS_AUDIO_RAM_STS, C06_ENV_IMPORT, C07_SLS_ALERTS
- BAP00_READONLY_INVENTORY_IDENTITY: kind=backend_apply_step; packets=P00_ALIYUN_READONLY_INVENTORY_IDENTITY; userIntervention=USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY; order=0. Restore Aliyun CLI/CloudShell read-only inventory evidence and write non-secret summaries only.
- BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: kind=backend_apply_step; packets=P11_ALIYUN_RDS_DATA_MIGRATION; userIntervention=USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD; order=1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou and close Supabase-to-RDS migration evidence.
- BAP02_OSS_RAM_STS_CLOSE: kind=backend_apply_step; packets=P05_OSS_RAM_STS; userIntervention=USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE; order=2. Confirm OSS RAM/STS least-privilege runtime access.
- BAP04_ACR_IMAGE_PUSH_AND_PULL: kind=backend_apply_step; packets=P04_ACR_IMAGE_AND_PULL; userIntervention=USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL; order=4. Push backend image to ACR, verify digest, and configure SAE image pull authorization.
- C02_ACR_IMAGE_AND_PULL: kind=aliyun_console_task; scope=image_push_or_import_and_digest_verification; phrase=授权把后端镜像推送或导入已创建的 ACR，核对 sha256 digest，并配置 SAE 拉取该镜像；不输出 registry 密码，不部署 production-cn。
- externalAppPrerequisiteItems: none

## 只读盘点解锁

- status: strict_inventory_evidence_ready
- currentBlocker: none
- currentEvidence: readyLocalOperations=9/9；executedCommandResults=9/9；cloudApiCalledCommandResults=9；mutationPerformedCommandResults=0
- minimumAuthorizationPhrase: 授权在本机 Aliyun CLI 或阿里云 CloudShell 中配置只读身份，并只运行 allowlisted production-cn inventory 命令；不输出 AccessKeySecret、STS token、cookie、registry password 或证书私钥。
- whyConsoleLoginIsNotEnough: 严格云证据已来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令摘要；后续云资源创建、购买、DNS、密钥导入和部署仍需动作时确认。
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

### C02_ACR_IMAGE_AND_PULL 推送/导入后端镜像到 ACR 并配置 SAE 拉取

- consolePath: 阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置
- minimumAuthorizationPhrase: 授权把后端镜像推送或导入已创建的 ACR，核对 sha256 digest，并配置 SAE 拉取该镜像；不输出 registry 密码，不部署 production-cn。
- currentActionScope: image_push_or_import_and_digest_verification
- currentActionAcceptanceEvidence: acr.imagePushed=true；acr.digestVerified=true；acr.remoteDigest=sha256:<64 hex>；runtime.remoteImageConfigured=true；runtime.imagePullConfigured=true
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json: acr.remoteImage=<registryHost>/<namespace>/meiye-huajing-app-api:production-cn；deploy/aliyun-production-cn.image-publish.local.json: acr.remoteDigest=sha256:<64 hex>；deploy/aliyun-production-cn.image-publish.local.json: acr.imagePushed=true；deploy/aliyun-production-cn.image-publish.local.json: acr.digestVerified=true；deploy/aliyun-production-cn.image-publish.local.json: acr.pushNetworkPath=public_registry|vpc_registry_from_aliyun_network|acr_repo_sync_existing_source_tag；deploy/aliyun-production-cn.image-publish.local.json: acr.publicNetworkEntranceEnabled=true if pushing from local/public network；deploy/aliyun-production-cn.image-publish.local.json: acr.evidence=<non-secret evidence handle>；deploy/aliyun-production-cn.image-publish.local.json: acr.cloudBuildRunner.lastSuccessfulBuild.sourceCommit=<git HEAD used for the image>
- verifyCommands: corepack pnpm aliyun:container:smoke；corepack pnpm aliyun:image:plan:strict
- deferredActions: 不购买 ACR。；不把 docker login、registry password、RAM Secret 或 token 写入 JSON/Markdown/git。；不部署 production-cn，除非 P09_PRODUCTION_DEPLOY 单独授权。；acrPurchaseAndRepository 已完成；不再等待 P03_ACR_PURCHASE；当前 blockers: none；saeRuntimeImagePull 已完成；不再等待 P08_SAE_RUNTIME_SLS, P04_ACR_IMAGE_AND_PULL；当前 blockers: none

## 必须暂缓

- C01_SAE_RUNTIME: dependsOn=C02_ACR_IMAGE_AND_PULL; blockers=none
- C03_API_DOMAIN_HTTPS_ICP: dependsOn=none; blockers=none
- C04_ASSET_DOMAIN_HTTPS_ICP: dependsOn=none; blockers=none
- C05_OSS_AUDIO_RAM_STS: dependsOn=none; blockers=none
- C06_ENV_IMPORT: dependsOn=none; blockers=none
- C07_SLS_ALERTS: dependsOn=none; blockers=none

## 云侧动作授权包

- P04_ACR_IMAGE_AND_PULL: 授权把后端镜像推送到已创建的 ACR，并配置 SAE 拉取该镜像；不输出 registry 密码。

## 延期的外部 App 前置项

- P01_WECHAT_OPEN_MOBILE_APP: 创建微信开放平台移动应用并审核通过
- P10_ANDROID_RELEASE_SIGNING: 配置 Android release signing 并生成微信开放平台 Android 签名
- P02_APPLE_TEAM_ID: 确认 Apple Team ID 用于 iOS Universal Link AASA

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
- blockedConsoleTask:C01_SAE_RUNTIME
- blockedConsoleTask:C03_API_DOMAIN_HTTPS_ICP
- blockedConsoleTask:C04_ASSET_DOMAIN_HTTPS_ICP
- blockedConsoleTask:C05_OSS_AUDIO_RAM_STS
- blockedConsoleTask:C06_ENV_IMPORT
- blockedConsoleTask:C07_SLS_ALERTS
