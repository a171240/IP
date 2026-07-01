# 美业话镜 APP production-cn 阿里云 Provisioning Plan

Generated: 2026-07-01T09:06:18.702Z

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
- Cloud resource ready: 7/7
- User action ready: 8/9
- Ready phases: PH07_PRODUCTION_DEPLOY
- Blocked phases: PH00_READONLY_INVENTORY_IDENTITY, PH02_BASE_CLOUD_RESOURCES, PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP
- Deferred phases: PH01_EXTERNAL_APP_IDENTIFIERS
- Required blocking env: none
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready authorization packets: P09_PRODUCTION_DEPLOY
- Deferred APP launch authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Ready console action packets: none
- Blocked credential count: 0
- Ready secret env variable count: 0
- Resource evidence ready: 7/7
- Blocked resource evidence ids: none
- Partially observed resource evidence ids: none
- Current P00 inventory gate: strict_ready
- cloudInventoryStrictReady=true
- readyLocalOperations=9/9
- dryRunEvidence=0/9

## 目标闭环证据简表

- Conclusion: 现在不能部署；当前只推进阿里云后端，PH00/PH02 可进入动作时确认，微信移动 App、Android/iOS 发布凭证延期到后端上线后且不计入当前阻塞。
- Can deploy now: false
- Can Codex execute now: false
- Blocked credential count: 0
- Blocked credential names: none
- Ready secret env variable count: 0
- Resource evidence ready: 7/7
- Blocked resource evidence ids: none
- Partially observed resource evidence ids: none
- Ready to start phases: PH07_PRODUCTION_DEPLOY
- Blocked phases: PH00_READONLY_INVENTORY_IDENTITY, PH02_BASE_CLOUD_RESOURCES, PH03_IMAGE_PUSH_AND_PULL, PH04_ENV_IMPORT, PH05_SAE_RUNTIME_AND_SLS, PH06_DOMAIN_HTTPS_ICP
- Deferred phases: PH01_EXTERNAL_APP_IDENTIFIERS
- Can start now authorization packets: P09_PRODUCTION_DEPLOY
- Deferred APP launch packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID
- Can start now console tasks: none
- Next action-time confirmations: P09_PRODUCTION_DEPLOY
- Current P00 inventory gate: strict_ready

## 当前 P00 只读盘点门禁

- Status: strict_ready
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
  - dryRunEvidence=0/9
  - cloudShellCurrentStatus=disconnected_restart_instance_confirmation_required
  - cloudShellConnecting=false
  - cloudShellTerminalInputVisible=true
  - cloudShellCanRunReadOnlyInventory=false
  - cloudShellRequiresOpenConfirmation=false
  - cloudShellRequiresRestartConfirmation=true
  - cloudShellBlockers=cloudshell_disconnected_restart_instance_confirmation_required
- Next required action: P00 strict inventory is current; continue with the next backend cloud evidence gate.

## Ready Authorization Packets

### P09_PRODUCTION_DEPLOY 生产部署、镜像推送、DNS 变更、git push 的动作时授权

- Action id: U09_DEPLOY_AUTHORIZATION
- Sequence group: production_release
- Minimum user phrase: 授权在所有 strict 门禁通过后执行 production-cn 部署；不包含 git push 或小程序上传。
- Non-secret evidence only: true
- Allowed actions:
  - 确认 cloud confirmations、image plan、domain、readiness 和 predeploy strict 全部通过。
  - 执行 production-cn 后端部署。
  - 运行 postdeploy smoke 并记录部署证据。
- Completion evidence:
  - corepack pnpm aliyun:cloud:confirmations:strict pass
  - corepack pnpm aliyun:image:plan:strict pass
  - corepack pnpm aliyun:domain:strict pass
  - corepack pnpm aliyun:readiness:cloud-ready pass
  - corepack pnpm aliyun:postdeploy:smoke pass
- Write targets:
  - release manifest / deployment log
- Explicitly excluded:
  - 不 git push，除非单独授权。
  - 不上传微信小程序或 APP 商店包。
  - 不修改 Supabase production schema/data。


## Phases

### PH00_READONLY_INVENTORY_IDENTITY 恢复阿里云 CLI/CloudShell 只读盘点身份

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- Console tasks: none
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: notReadyForCurrentScope:P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- Current blockers: dependsOn:notReadyForCurrentScope:P00_ALIYUN_READONLY_INVENTORY_IDENTITY
- Verify commands: `corepack pnpm aliyun:cloud:access`; `MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json`; `corepack pnpm aliyun:cloud:inventory-results:strict`; `corepack pnpm aliyun:evidence:writeback:backend`
- Current action acceptance evidence:
  - none
- Deferred actions:
  - none
- Completion evidence:
  - 只运行 allowlisted List/Describe/stat/get inventory 命令。
  - cloud-inventory-results.local.json 只记录资源名、布尔值、时间戳、命令状态和非密钥 evidence handle。
  - CloudShell 若提示开通性能型 NAS 并可能产生费用，必须动作时确认后才能点击开通。
- Explicitly excluded:
  - 不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。
  - 不执行 docker login/push。
  - 不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。
  - 除用户明确确认 CloudShell 重启实例提示外，不做任何 production-cn deploy、env import、资源创建、购买或 DNS 变更。

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
  - 当前后端-only 目标不创建微信开放平台移动应用、不做 Android release signing、不读取 Apple Team ID。
  - 这些延期项只在阿里云后端上线后单独授权处理。

### PH02_BASE_CLOUD_RESOURCES 确认 RDS PostgreSQL 和 OSS/RAM/STS 基础资源

- Status: blocked_by_dependencies
- Can start now: false
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS
- Console tasks: C05_OSS_AUDIO_RAM_STS
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: notReadyForCurrentScope:P11_ALIYUN_RDS_DATA_MIGRATION, notReadyForCurrentScope:P05_OSS_RAM_STS
- Current blockers: dependsOn:notReadyForCurrentScope:P11_ALIYUN_RDS_DATA_MIGRATION; dependsOn:notReadyForCurrentScope:P05_OSS_RAM_STS
- Verify commands: `corepack pnpm aliyun:rds:migration:package`; `corepack pnpm aliyun:rds:migration:evidence:strict`; `corepack pnpm aliyun:sensitive:blockers:backend`; `corepack pnpm aliyun:backend-cn:status`; `corepack pnpm aliyun:completion:audit`; `corepack pnpm aliyun:predeploy`; `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:app-api:smoke`; `postdeploy service-records upload smoke after API deployment`
- Current action acceptance evidence:
  - region=cn-hangzhou
  - corsConfigured=true
  - ramLeastPrivilege=true
  - serviceRecordPrefix=service-records/production-cn
  - confirmed=true
- Deferred actions:
  - none
- Completion evidence:
  - RDS PostgreSQL 必须完成实例、DATABASE_URL_CN secret env、schema/data 迁移、APP API smoke 和回滚验收；首版业务数据访问代码侧已切到 RDS repository。
  - OSS 只记录 bucket、region、CORS、RAM/STS 最小权限布尔证据。
  - ACR P03 购买/仓库证据已 ready；当前阶段不再把 ACR 购买作为待执行基础动作。
- Explicitly excluded:
  - 不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。
  - 不把 Supabase 当作正式 production-cn 数据库目标。
  - 不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。
  - 不创建可提交的长期明文 Secret。
  - 不下载 OSS 对象内容。
  - 不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。
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
- Current action scopes: C02_ACR_IMAGE_AND_PULL=image_push_or_import_and_digest_verification
- Current action scope handles: currentActionScope=image_push_or_import_and_digest_verification
- Blocking dependencies: notReadyForCurrentScope:P04_ACR_IMAGE_AND_PULL
- Current blockers: dependsOn:notReadyForCurrentScope:P04_ACR_IMAGE_AND_PULL
- Verify commands: `corepack pnpm aliyun:image:plan:strict`; `corepack pnpm aliyun:container:smoke`; `corepack pnpm aliyun:image:plan`; `corepack pnpm aliyun:docker:build`
- Current action acceptance evidence:
  - acr.imagePushed=true
  - acr.digestVerified=true
  - acr.remoteDigest=sha256:<64 hex>
  - runtime.remoteImageConfigured=true
  - runtime.imagePullConfigured=true
- Deferred actions:
  - 不购买 ACR。
  - 不把 docker login、registry password、RAM Secret 或 token 写入 JSON/Markdown/git。
  - 不部署 production-cn，除非 P09_PRODUCTION_DEPLOY 单独授权。
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
- Blocking dependencies: notReadyForCurrentScope:P06_ENV_IMPORT
- Current blockers: dependsOn:notReadyForCurrentScope:P06_ENV_IMPORT
- Verify commands: `corepack pnpm aliyun:env:checklist`; `corepack pnpm aliyun:readiness:cloud-ready`; `corepack pnpm aliyun:env:handoff:backend`; `corepack pnpm aliyun:sensitive:blockers:backend`; `corepack pnpm aliyun:env:check`; `corepack pnpm aliyun:readiness:strict`
- Current action acceptance evidence:
  - secretNotInImage=true
  - importedAt=实际导入时间
  - currentBackendRequiredBlocking=none
- Deferred actions:
  - none
- Completion evidence:
  - plain env 只放非密钥标识符和公开 URL。
  - secret env 只通过 KMS/Secrets Manager/SAE secret env 导入。
  - cloud-confirmations.local.json 只记录 importedAt、target、secretNotInImage=true 和 evidence handle。
- Explicitly excluded:
  - 不把任何 value 粘贴到 Markdown、JSON、Dockerfile、镜像或 git。
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
- Blocking dependencies: notReadyForCurrentScope:P08_SAE_RUNTIME_SLS
- Current blockers: dependsOn:notReadyForCurrentScope:P08_SAE_RUNTIME_SLS
- Verify commands: `corepack pnpm aliyun:runtime:plan`; `corepack pnpm aliyun:cloud:confirmations:backend:strict`; `corepack pnpm aliyun:cloud:confirmations`; `corepack pnpm aliyun:docker:check`; `corepack pnpm aliyun:health:smoke`; `corepack pnpm aliyun:cloud:confirmations:strict`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin`; `corepack pnpm aliyun:cloud:check`
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
- Blocking dependencies: notReadyForCurrentScope:P07_DOMAIN_DNS_HTTPS
- Current blockers: dependsOn:notReadyForCurrentScope:P07_DOMAIN_DNS_HTTPS
- Verify commands: `corepack pnpm aliyun:domain:strict`; `corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin`; `corepack pnpm aliyun:domain:check`; `corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin`
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

- Status: ready_for_action_time_confirmation
- Can start now: true
- Deferred after backend online: false
- Requires action-time confirmation: true
- Authorization packets: P09_PRODUCTION_DEPLOY
- Console tasks: none
- Current action scopes: none
- Current action scope handles: none
- Blocking dependencies: none
- Current blockers: none
- Verify commands: `corepack pnpm aliyun:predeploy`; `corepack pnpm aliyun:cloud:confirmations:backend:strict`
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
