# 美业话镜 APP production-cn 阿里云后端-only 当前执行简报

Generated: 2026-06-26T00:44:10.727Z

## 结论

- 现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，先补 RDS、ACR、OSS、SAE、DNS/HTTPS/ICP、env、SLS 和 smoke 证据。
- currentScope: backend_aliyun_only
- backendOnly: true
- canDeployNow: false
- canProceedWithoutWechat: true
- backendTargetReady: 0/8
- cloudResourceEvidenceReady: 0/7
- cloudConfirmationsReady: 0/6
- operatorTasksReady: 0/8
- sensitiveBlocked: 5/5
- blockedCredentialCount: 1
- blockedCredentialNames: DATABASE_URL_CN
- readySecretEnvVariableCount: 17
- containsValues: false
- mutationPerformed: false
- secretLeakCheck: true

## 当前只做

- 阿里云后端：RDS/ACR/OSS/SAE/DNS/HTTPS/ICP/env/SLS/smoke。
- 数据库目标：阿里云 RDS PostgreSQL；Supabase 只作为迁移来源或旧链路兼容，不是正式国内生产数据库目标。
- 资源证据写回只记录非密钥字段、资源名、布尔值、时间和 evidence handle。

## 当前不做

- 移动应用开放平台、Android 签名、Apple Team ID：延期到后端上线后，不在本后端清单中展开。
- 不购买、不创建云资源、不导入密钥、不推送镜像、不部署 production-cn、不 git push，除非有动作时授权。

## 状态来源与一致性

- 主门禁来源：`corepack pnpm aliyun:backend-cn:status`，用于判断 `canDeployBackendNow`、`backendTargetReady`、后端 requiredBlocking 和当前后端 credential 摘要。
- 密钥/密码字段来源：`corepack pnpm aliyun:sensitive:blockers:backend`，用于列出 `DATABASE_URL_CN`、已 ready 但仍需导入阿里云 secret env 的变量、获取位置、导入目标和禁止写入位置。
- 本简报来源：`corepack pnpm aliyun:blockers:brief:backend`，只聚合本地 value-free 证据，不调用阿里云写 API，不购买、不创建、不导入、不部署。

## 后端阻塞

- requiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY, API_DOMAIN_HTTPS_ICP_NOT_READY, ASSET_DOMAIN_HTTPS_ICP_NOT_READY, DATABASE_URL_CN, ENV_IMPORT_NOT_READY, OSS_RAM_STS_NOT_READY, POSTDEPLOY_SMOKE_NOT_RUN, RDS_MIGRATION_EVIDENCE_NOT_READY, SAE_RUNTIME_NOT_READY, SLS_ALERTS_NOT_READY
- machineBlocking: missing_required_env:DATABASE_URL_CN
- cloudResourceObservedPartialIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS
- cloudResourceObservedBlockedIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT
- sensitiveBlockedIds: S03_ACR_PAID_PURCHASE, S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT
- canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS
- canStartNowAuthorizationPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P03_ACR_PURCHASE
- blockedByAuthorizationPacketDependencies: P04_ACR_IMAGE_AND_PULL, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, P09_PRODUCTION_DEPLOY

## 数据层边界

- current: Supabase migration source / legacy compatibility only
- target: Aliyun RDS PostgreSQL
- status: blocked_until_aliyun_rds_postgresql_migration_ready
- databaseUrlCnStatus: todo
- rdsMigrationIncludedInThisRelease: false
- rdsMigrationRequiredForFinalProductionCn: true
- notes:
  - 正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL；Supabase 只能作为迁移来源或旧链路兼容，不是正式数据库。
  - DATABASE_URL_CN 是正式全阿里云数据层的必填阻塞项；首版 APP 业务数据访问代码侧已切到 RDS repository，但仅填写连接串仍不等于完成 RDS 实例、schema/data、smoke 和 rollback 验收。
  - REDIS_URL_CN 只有在 production-cn 队列/缓存实现明确依赖 Tair/Redis 时才升级为必填阻塞项。

## 阿里云资源状态

| 资源 | ready | 观察状态 | 观察成熟度 | 下一步 | 写入目标 |
| --- | --- | --- | --- | --- | --- |
| `R01_SAE_RUNTIME` | false | not_created_or_not_confirmed | blocked | 创建或确认 cn-hangzhou SAE 应用 meiye-huajing-app-api-production-cn，容器端口 3000，健康检查 /api/healthz。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime |
| `R02_ACR_IMAGE_REGISTRY` | false | purchase_candidate_visible_not_purchased | blocked | 动作时确认 ACR Enterprise Economic / cn-hangzhou / 1 month / CNY 117.00 后，购买实例并创建 namespace/repository。 | deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence |
| `R03_API_DOMAIN_HTTPS` | false | domain_visible_records_missing | blocked | 补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps |
| `R04_ASSET_DOMAIN_HTTPS` | false | domain_visible_records_missing | blocked | 补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps |
| `R05_OSS_AUDIO_STORAGE` | false | bucket_visible_unconfirmed | partial | 继续确认 CORS、RAM 最小权限和 service-records/production-cn 前缀；只记录 bucket/region/布尔证据。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss |
| `R06_ENV_IMPORT` | false | cloudshell_disconnected_restart_confirmation_required | blocked | 只有 Cloud Shell/CLI 配置 ready 后，才运行受控只读 inventory runner；否则继续用控制台人工证据。 | deploy/aliyun-production-cn.cloud-inventory-results.local.json |
| `R07_SLS_ALERTS` | false | project_logstore_visible_alerts_pending | partial | SAE runtime ready 后配置日志采集、/api/healthz 健康告警和 5xx 告警。 | deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts |

## 现在需要动作时确认的后端授权包

### P00_ALIYUN_READONLY_INVENTORY_IDENTITY

- title: 恢复阿里云 CLI/CloudShell 只读盘点身份
- owner: 用户/阿里云只读盘点操作员
- minimumUserPhrase: 授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。
- writeTargets: deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries
- verifyCommands: corepack pnpm aliyun:cloud:access; MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json; corepack pnpm aliyun:cloud:inventory-results:strict; corepack pnpm aliyun:evidence:writeback:backend
- nonSecretEvidenceOnly: true

### P11_ALIYUN_RDS_DATA_MIGRATION

- title: 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移
- owner: 阿里云 RDS/后端数据迁移操作员
- minimumUserPhrase: 授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。
- writeTargets: docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff; deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres / migration non-secret evidence; DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy
- nonSecretEvidenceOnly: false

### P05_OSS_RAM_STS

- title: 绑定 OSS RAM 最小权限或 STS/运行时角色方案
- owner: 阿里云 OSS/RAM 操作员
- minimumUserPhrase: 授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss; ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env
- verifyCommands: corepack pnpm aliyun:cloud:confirmations; corepack pnpm aliyun:health:smoke
- nonSecretEvidenceOnly: false

### P03_ACR_PURCHASE

- title: 确认 ACR 企业版付费购买
- owner: 用户/阿里云 ACR 操作员
- minimumUserPhrase: 授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence
- verifyCommands: corepack pnpm aliyun:image:plan
- nonSecretEvidenceOnly: true

## 当前可回填的后端证据

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

## 还缺的变量获取与导入

- 真实 value 只能进入阿里云 KMS/Secrets Manager/SAE secret env，不能写入报告、JSON、Docker 镜像或 git。

| 变量 | 授权包 | 获取位置 | 获取方式 | 导入目标 | 禁止写入 |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | P11_ALIYUN_RDS_DATA_MIGRATION | 阿里云控制台 -> RDS PostgreSQL -> 数据库连接 | 先生成并核对 docs/app-production-cn-rds-migration-package.md，创建或确认 production-cn RDS PostgreSQL，关闭 compatibilityReviewChecklist 6 类 Supabase SQL 兼容审查，完成 schema/data、APP API smoke 和 rollback 验收后，只把连接串导入 secret env。 | 阿里云 KMS/Secrets Manager/SAE secret env | 只在动作时导入 KMS/Secrets Manager/SAE secret env；不要写入 JSON、Markdown、Docker 镜像或 git。 |

## 已 ready 但仍需导入阿里云 secret env

- groupCount: 9
- variableCount: 17
- 这些值只在动作时由受控渠道导入阿里云运行环境，本简报不展开真实值。

## 环境变量来源概览

- vercelRequiredCovered: 17/27
- canMigrateFromVercelProduction: 46
- appAliyunOwnedNotInVercel: 10
- currentBackendBlockedExternalRequired: DATABASE_URL_CN
- deferredAppLaunchBlockedExternalRequiredCount: 3
- scopeNote: backend-only summary treats only currentBackend as current blockers; deferredAppLaunch remains full App launch context.
- secretOrSensitiveToImport: 17

## CloudShell / CLI 只读盘点

- interpretation: strict_inventory_incomplete_and_fresh_read_unavailable
- strictInventoryEvidenceReady: false
- freshCloudReadAvailableNow: false
- currentCliProfileReady: false
- currentBrowserConsoleUsable: true
- notACloudResourceReadyProof: true
- nextEvidenceAction: configure_aliyun_cli_profile_or_use_cloudshell_for_fresh_readonly_inventory

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
