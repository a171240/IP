# 美业话镜 APP production-cn 阿里云 Provisioning Plan

Generated: 2026-07-01T05:16:14+08:00

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
- Evidence writeback ready: 1/4
- totalGaps=40
- rdsMigrationGaps=16
- cloudInventoryResultGaps=0
- cloudConfirmationGaps=16
- imagePublishGaps=8
- Cloud resource ready: 0/7
- User action ready: 7/9
- Ready phases: PH00_READONLY_INVENTORY_IDENTITY
- Blocked phases: PH02_BASE_CLOUD_RESOURCES, PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP, PH07_PRODUCTION_DEPLOY
- Deferred phases: PH01_EXTERNAL_APP_IDENTIFIERS
- Required blocking env: DATABASE_URL_CN
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready authorization packets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- Deferred APP launch authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready console action packets: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- Blocked credential count: 1
- Blocked credential names: DATABASE_URL_CN
- Ready secret env variable count: 17
- Resource evidence ready: 0/7
- Blocked resource evidence ids: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- Partially observed resource evidence ids: none
- Current P00 inventory gate: fixture_backed_strict_ready
- cloudInventoryStrictReady=true
- readyLocalOperations=9/9
- dryRunEvidence=0/9
- releaseGateBlocker: backend:supabase / lib/supabase/server.ts requires separate authorization

## 目标闭环证据简表

- Conclusion: 现在不能部署；当前只推进阿里云后端，微信移动 App、Android/iOS 发布凭证延期到后端上线后，RDS/OSS/ACR/SAE/DNS/env/SLS/postdeploy 证据仍未闭合。
- Can deploy now: false
- Can Codex execute now: false
- Blocked credential count: 1
- Blocked credential names: DATABASE_URL_CN
- Ready secret env variable count: 17
- Evidence writeback ready: 1/4
- Resource evidence ready: 0/7
- Blocked resource evidence ids: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS
- Partially observed resource evidence ids: none
- Ready to start phases: PH00_READONLY_INVENTORY_IDENTITY, PH02_BASE_CLOUD_RESOURCES, PH03_IMAGE_PUSH_AND_PULL
- Blocked phases: PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP, PH07_PRODUCTION_DEPLOY
- Deferred phases: PH01_EXTERNAL_APP_IDENTIFIERS
- Can start now authorization packets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Can start now console tasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- Next action-time confirmations: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL
- Current P00 inventory gate: fixture_backed_strict_ready

## 当前 P00 只读盘点门禁

- Status: fixture_backed_strict_ready
- cloudInventoryStrictReady=true
- readyLocalOperations=9/9
- executedCommandResults=9/9
- mutationPerformedCommandResults=0
- cloudInventoryResultGaps=0
- localInventoryFile: deploy/aliyun-production-cn.cloud-inventory-results.local.json
- localFileExists: true
- dryRunEvidence=0/9
- failureCategories: none
- Current evidence:
  - cloudInventoryStrictReady=true
  - readyLocalOperations=9/9
  - executedCommandResults=9/9
  - mutationPerformedCommandResults=0
  - cloudInventoryResultGaps=0
  - evidenceScope=tracked fixture / local static gate, not production deploy authorization
- Next required action: If live cloud inventory must be refreshed, request action-time confirmation and run only allowlisted read-only inventory commands. Do not treat P00 fixture evidence as permission to mutate resources.

## Ready Authorization Packets

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- Action id: U00_ALIYUN_READONLY_INVENTORY_IDENTITY
- Sequence group: readonly_inventory
- Minimum user phrase: 授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- Non-secret evidence only: true
- Allowed actions:
  - 动作时确认 CloudShell 重启实例提示后恢复会话；若不确认，则改用已安全配置的 Aliyun CLI profile。
  - 只运行本仓库生成的 List/Describe/stat/get inventory 命令。
  - 只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。
- Completion evidence:
  - cloudInventoryResults.localReady=true
  - readyLocalOperations=9/9
  - executedCommandResults=9/9
  - mutationPerformedCommandResults=0
- Explicitly excluded:
  - 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。
  - 不执行 docker login/push。
  - 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。

### P11_ALIYUN_RDS_DATA_MIGRATION 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移

- Action id: U11_ALIYUN_RDS_DATA_MIGRATION
- Sequence group: cloud_foundation
- Minimum user phrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- Non-secret evidence only: false
- Current status: blocked until RDS evidence writeback closes.
- Current blockers: DATABASE_URL_CN, rdsMigrationGaps=16
- Required evidence:
  - rdsPostgres.confirmed=true
  - rdsPostgres.databaseAccountReady=true
  - rdsPostgres.databaseUrlCnSecretImported=true
  - migration.schemaInventoryReviewed=true
  - migration.schemaCompatibilityReviewed=true
  - migration.supabaseSpecificSqlResolved=true
  - migration.rdsExtensionSupportConfirmed=true
  - migration.dataAccessAdapterReady=true
  - migration.schemaMigrated=true
  - migration.dataMigrated=true
  - migration.rowCountValidationPassed=true
  - migration.criticalRecordValidationPassed=true
  - migration.appApiSmokeOnRdsPassed=true
  - migration.supabaseNoLongerFormalTarget=true
  - migration.rollbackRunbookReviewed=true
  - migration.rollbackValidationPassed=true
- Write targets:
  - deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence
  - DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- Explicitly excluded:
  - 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。
  - 不把 Supabase 当作正式 production-cn 数据库目标。
  - 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。

### P05_OSS_RAM_STS 绑定 OSS RAM 最小权限或 STS/运行时角色方案

- Action id: U05_OSS_RAM_OR_STS
- Sequence group: cloud_foundation
- Minimum user phrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- Non-secret evidence only: false
- Current status: blocked until cloud confirmation evidence closes.
- Current blockers: items.oss.confirmed, items.oss.corsConfigured, items.oss.ramLeastPrivilege
- Preferred path: SAE RRSA/OIDC runtime role with non-secret role/provider/file-path env inputs.
- Fallback path: STS or least-privilege RAM user secret env only.
- Explicitly excluded:
  - 不创建可提交的长期明文 Secret。
  - 不下载 OSS 对象内容。
  - 不把 AccessKeySecret、STS token 或 OIDC token file contents 写入 JSON、Markdown、镜像或 git。

### P04_ACR_IMAGE_AND_PULL 推送后端镜像并配置 SAE 镜像拉取

- Action id: U04_ACR_RUNTIME_AUTH
- Sequence group: image_runtime
- Minimum user phrase: 授权把后端镜像推送到已创建的 ACR，并配置 SAE 拉取该镜像；不输出 registry 密码。
- Non-secret evidence only: true
- Current status: blocked until image-publish/runtime pull evidence closes.
- Current blockers: acr.remoteDigest, acr.imagePushed, acr.digestVerified, acr.pushNetworkPath, runtime.confirmed, runtime.remoteImageConfigured, runtime.imagePullConfigured
- Explicitly excluded:
  - 不购买 ACR。
  - 不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。
  - 不部署 production-cn，除非 U09 单独授权。

## Phases

### PH00_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- Status: fixture_backed_strict_ready
- Can start now: true
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- Current blockers: none in fixture-backed static evidence; refresh may be required before live release.
- Verify commands: `corepack pnpm aliyun:cloud:inventory-results:strict`; `corepack pnpm aliyun:evidence:writeback:backend`

### PH01_EXTERNAL_APP_IDENTIFIERS 补齐微信移动应用、Android release 签名和 Apple Team ID

- Status: deferred_after_backend_online
- Can start now: false
- Deferred after backend online: true
- Requires action-time confirmation: true
- Authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Current blockers: deferredAfterBackendOnline:P01_WECHAT_OPEN_MOBILE_APP; deferredAfterBackendOnline:P10_ANDROID_RELEASE_SIGNING; deferredAfterBackendOnline:P02_APPLE_TEAM_ID
- Explicitly excluded:
  - 当前后端-only 目标不创建微信开放平台移动应用、不做 Android release signing、不读取 Apple Team ID。

### PH02_BASE_CLOUD_RESOURCES 确认 RDS PostgreSQL 和 OSS/RAM/STS 基础资源

- Status: ready_for_action_time_confirmation
- Can start now: true
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS
- Console tasks: C05_OSS_AUDIO_RAM_STS
- Current blockers: DATABASE_URL_CN; rdsMigrationGaps=16; cloudConfirmationGaps includes OSS evidence
- Verify commands: `corepack pnpm aliyun:rds:migration:evidence:strict`; `corepack pnpm aliyun:oss:runtime-access:strict`; `corepack pnpm aliyun:cloud:confirmations:strict`

### PH03_IMAGE_PUSH_AND_PULL 推送后端镜像并配置 SAE 镜像拉取

- Status: ready_for_action_time_confirmation
- Can start now: true
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P04_ACR_IMAGE_AND_PULL
- Console tasks: C02_ACR_IMAGE_AND_PULL
- Current blockers: imagePublishGaps=8
- Verify commands: `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:container:smoke`

### PH04_ENV_IMPORT 导入 production-cn 环境变量

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P06_ENV_IMPORT
- Blocking dependencies: RDS/DATABASE_URL_CN evidence, OSS access evidence, image/runtime evidence, SAE runtime target
- Verify commands: `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:readiness:cloud-ready`

### PH05_SAE_RUNTIME_AND_SLS 创建/确认 SAE runtime 并配置 SLS

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P08_SAE_RUNTIME_SLS
- Blocking dependencies: RDS secret env, ACR image, OSS runtime access, env import
- Verify commands: `corepack pnpm aliyun:cloud:confirmations:strict`; `corepack pnpm aliyun:backend-cn:status`

### PH06_DOMAIN_HTTPS_ICP 配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P07_DOMAIN_DNS_HTTPS
- Blocking dependencies: runtime public entry and asset origin evidence
- Verify commands: `corepack pnpm aliyun:domain:strict`; `corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin`

### PH07_PRODUCTION_DEPLOY 执行 production-cn 部署和 postdeploy smoke

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P09_PRODUCTION_DEPLOY
- Blocking dependencies: all backend evidence, `backend:supabase` authorization, production deployment authorization
- Explicitly excluded:
  - 本线程不部署、不上传、不 push、不写 Supabase/RDS 生产。

## Verification

```bash
corepack pnpm aliyun:evidence:writeback:backend
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:blockers:brief:backend
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
```
