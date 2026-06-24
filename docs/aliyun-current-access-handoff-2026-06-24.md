# 美业话镜 APP production-cn CloudShell/CLI 只读盘点交接包

Generated: 2026-06-24T14:54:59.856Z

## 当前结论

- Aliyun CLI/CloudShell read-only inventory is still blocked by local CLI/CloudShell configuration; do not treat cloud resources as ready.
- canReadCloudNow: false
- cliConfigProbeReady: false
- cliConfigProbeFailureCategory: aliyun_cli_profile_not_configured
- strictInventoryAlreadyReady: false
- strictInventoryReadyLocalOperations: 0/9
- strictInventoryExecutedCommandResults: 9/9
- strictInventoryCloudApiCalledCommandResults: 9
- strictInventoryMutationPerformedCommandResults: 0
- currentBrowserCanUseCurrentConsole: true
- currentBrowserAliyunConsoleTabCount: 1
- currentBrowserAliyunConsoleHostPaths: shell.aliyun.com
- currentBrowserCloudApiCalled: false
- currentBrowserCloudMutationPerformed: false
- inventoryPlanStatus: blocked_until_cli_configured
- totalOperations: 9
- commandTemplates: 23

## 已有 strict inventory 证据

- exists: true
- ready: false
- localOperations: 0/9
- commandResults: 9/9
- mutationPerformedCommandResults: 0
- observedOperationIds: none
- notFoundOperationIds: none
- blockedOperationIds: I01_SAE_RUNTIME, I02_ACR_IMAGE, I03_DNS_API_DOMAIN, I04_DNS_ASSET_DOMAIN, I05_OSS_AUDIO_BUCKET, I06_SLS_ALERTS, I07_CERT_HTTPS, I08_RDS_POSTGRES, I09_TAIR_REDIS
- readonly_inventory_strict_ready=0/9

## 操作路径

### 本机 Aliyun CLI

- id: local_cli
- currentStatus: aliyun_cli_profile_not_configured
- allowedActions:
  - 在安全终端完成阿里云官方 CLI 登录或 default profile 配置。
  - 把 region 明确设为 cn-hangzhou。
  - 重新运行 corepack pnpm aliyun:cloud:access 与受控只读 inventory runner。
- forbidden:
  - 不要把 AccessKeySecret、STS token、cookie 或账号凭据写入 repo、JSON、Markdown、截图或聊天。
  - 不要执行购买、创建、更新、删除、部署、DNS 修改、docker login/push 或 OSS 对象读写命令。
- verifyCommands:
  - corepack pnpm aliyun:cloud:access
  - MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json
  - corepack pnpm aliyun:cloud:inventory-results:strict

### 阿里云 CloudShell

- id: aliyun_cloudshell
- currentStatus: cloudshell_cli_config_missing_or_unread
- consolePath: 阿里云控制台 -> CloudShell -> cn-hangzhou / 华东1或华东2账号上下文
- currentBrowserCanUseCurrentConsole: true
- currentBrowserAliyunConsoleHostPaths: shell.aliyun.com
- currentBrowserCloudApiCalled: false
- currentBrowserCloudMutationPerformed: false
- currentBrowserEvidence: current_chrome_aliyun_console_tabs_1
- allowedActions:
  - 只运行 inventoryPlan.operations 中列出的 List/Describe/stat/get 类只读命令。
  - 只把资源名、布尔状态、digest、exit 状态、时间戳和非密钥 evidence handle 回填到 ignored 的 .local.json。
  - 如 CloudShell 无法访问本地 repo，则按命令计划人工记录非密钥摘要，再回到本机回填。
- forbidden:
  - 不要运行 Create/Update/Delete/Deploy/Start/Stop/GetAuthorizationToken/docker login/push/oss cp/oss cat/oss sign。
  - 不要复制 CloudShell 中的 AccessKeySecret、STS token、cookie、registry password 或证书私钥。
- verifyCommands:
  - corepack pnpm aliyun:cloud:inventory-results:strict
  - corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage
  - corepack pnpm aliyun:completion:audit

### 阿里云 ECS Workbench 终端

- id: ecs_workbench_terminal
- currentStatus: connected_not_inventory_ready
- consolePath: 阿里云控制台 -> ECS Workbench / 终端
- allowedActions:
  - 只把可见终端连接状态、标题、非敏感主机标签和时间戳记录为人工观察证据。
  - 如果后续要在该终端运行 Aliyun CLI，只能运行 inventoryPlan.operations 中列出的只读命令。
  - 未记录 allowlisted inventory 执行结果前，不把 Workbench 终端视为 CloudShell/OpenAPI readiness。
- forbidden:
  - 不要在 Workbench 终端里执行购买、创建、更新、删除、部署、DNS 修改、docker login/push 或 OSS 对象读写命令。
  - 不要复制终端里的 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。
  - 不要把普通远程终端连接状态当成阿里云 CloudShell 已配置或云资源已验收。
- verifyCommands:
  - corepack pnpm aliyun:cloud:access
  - corepack pnpm aliyun:cloud:inventory-results:strict
  - corepack pnpm aliyun:blockers:brief

## 只读命令计划

### I01_SAE_RUNTIME SAE production-cn runtime inventory

- product: sae
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> SAE -> cn-hangzhou -> 应用列表
- commands:
  - `aliyun sae ListApplications --region cn-hangzhou` - Find the production-cn SAE application id and verify target app name.
  - `aliyun sae DescribeApplicationConfig --region cn-hangzhou --AppId <APP_ID>` - Verify container port, health path, image source, env injection mode, and vSwitch/security group references without printing secret values.
  - `aliyun sae DescribeApplicationStatus --region cn-hangzhou --AppId <APP_ID>` - Verify runtime status after the application exists.
  - `aliyun sae ListLogConfigs --region cn-hangzhou --AppId <APP_ID>` - Verify SAE log shipping is attached to the expected SLS project/logstore.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime
- forbiddenCommands: DeployApplication, StartApplication, StopApplication, UpdateApplication, DeleteApplication

### I02_ACR_IMAGE ACR repository and production-cn image inventory

- product: cr
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 实例/命名空间/仓库
- commands:
  - `aliyun cr ListInstance --region cn-hangzhou` - Find the ACR instance id without purchasing or changing registry settings.
  - `aliyun cr ListNamespace --region cn-hangzhou --InstanceId <INSTANCE_ID>` - Verify namespace exists.
  - `aliyun cr ListRepository --region cn-hangzhou --InstanceId <INSTANCE_ID> --RepoNamespace <NAMESPACE>` - Verify repository meiye-huajing-app-api exists.
  - `aliyun cr ListRepoTag --region cn-hangzhou --InstanceId <INSTANCE_ID> --RepoNamespace <NAMESPACE> --RepoName meiye-huajing-app-api` - Verify production-cn tag and digest evidence.
- writeTargets: deploy/aliyun-production-cn.image-publish.local.json -> acr; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.acr
- forbiddenCommands: GetAuthorizationToken, CreateRepository, DeleteRepository, CreateInstance, UpdateRepository

### I03_DNS_API_DOMAIN api-cn DNS and HTTPS route inventory

- product: alidns
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> 云解析 DNS -> ipgongchang.xin -> 解析记录
- commands:
  - `aliyun alidns DescribeSubDomainRecords --SubDomain api-cn.ipgongchang.xin` - Verify api-cn record target, status, and TTL.
  - `aliyun alidns DescribeDomainRecords --DomainName ipgongchang.xin --RRKeyWord api-cn` - Cross-check api-cn record from the parent domain record list.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomain
- forbiddenCommands: AddDomainRecord, UpdateDomainRecord, DeleteDomainRecord, SetDomainRecordStatus

### I04_DNS_ASSET_DOMAIN assets-cn DNS and HTTPS route inventory

- product: alidns
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> 云解析 DNS -> ipgongchang.xin -> 解析记录
- commands:
  - `aliyun alidns DescribeSubDomainRecords --SubDomain assets-cn.ipgongchang.xin` - Verify assets-cn record target, status, and TTL.
  - `aliyun alidns DescribeDomainRecords --DomainName ipgongchang.xin --RRKeyWord assets-cn` - Cross-check assets-cn record from the parent domain record list.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomain
- forbiddenCommands: AddDomainRecord, UpdateDomainRecord, DeleteDomainRecord, SetDomainRecordStatus

### I05_OSS_AUDIO_BUCKET OSS service-record audio bucket inventory

- product: oss
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> OSS -> meiye-huajing-service-records-production-cn
- commands:
  - `aliyun oss stat oss://meiye-huajing-service-records-production-cn` - Verify bucket existence and region metadata only.
  - `aliyun oss cors get oss://meiye-huajing-service-records-production-cn` - Verify CORS policy needed by service-record uploads.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.ossAudio
- forbiddenCommands: aliyun oss cp, aliyun oss cat, aliyun oss sign, aliyun oss rm, aliyun oss mb, aliyun oss set-acl

### I06_SLS_ALERTS SLS project, logstore, and alert inventory

- product: sls
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> 日志服务 SLS -> Project meiye-huajing-app-prod-cn
- commands:
  - `aliyun sls ListProject --region cn-hangzhou` - Verify the production-cn SLS project is visible.
  - `aliyun sls ListLogStores --project meiye-huajing-app-prod-cn` - Verify app-api logstore exists.
  - `aliyun sls ListAlerts --project meiye-huajing-app-prod-cn` - Verify alert rules exist without reading log contents.
  - `aliyun sls ListDashboard --project meiye-huajing-app-prod-cn` - Verify dashboard coverage for APP API runtime observation.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts
- forbiddenCommands: CreateAlert, UpdateAlert, DeleteAlert, CreateLogStore, DeleteLogStore, GetLogs

### I07_CERT_HTTPS HTTPS certificate inventory

- product: cas
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> 数字证书管理服务 -> 证书列表/部署任务
- commands:
  - `aliyun cas ListUserCertificateOrder --region cn-hangzhou` - Verify certificate order/list evidence for api-cn and assets-cn.
  - `aliyun cas ListDeploymentJob --region cn-hangzhou` - Verify deployment job evidence without downloading certificate material.
- writeTargets: deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomain; deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomain
- forbiddenCommands: GetUserCertificateDetail, CreateCertificate, DeleteCertificate, CreateDeploymentJob

### I08_RDS_POSTGRES RDS PostgreSQL production-cn data-layer inventory

- product: rds
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> RDS -> cn-hangzhou -> PostgreSQL 实例
- commands:
  - `aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL` - Verify whether a production-cn PostgreSQL RDS instance exists before treating DATABASE_URL_CN as available.
  - `aliyun rds DescribeDBInstances --RegionId cn-hangzhou` - Cross-check all RDS engines in cn-hangzhou without reading connection strings or credentials.
- writeTargets: release artifacts -> bridgeDataLayer.databaseUrlCnStatus
- forbiddenCommands: CreateDBInstance, ModifyDBInstance, DeleteDBInstance, CreateDatabase, CreateAccount

### I09_TAIR_REDIS Redis/Tair production-cn cache inventory

- product: r-kvstore
- region: cn-hangzhou
- status: blocked_until_cli_configured
- consoleFallback: 阿里云控制台 -> Tair/Redis -> cn-hangzhou -> 实例
- commands:
  - `aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou` - Verify whether a production-cn Redis/Tair instance exists before treating REDIS_URL_CN as available.
- writeTargets: release artifacts -> bridgeDataLayer.redisUrlCnStatus
- forbiddenCommands: CreateInstance, ModifyInstanceAttribute, DeleteInstance, RestartInstance, TransformToPrePaid

## 回填目标

- deploy/aliyun-production-cn.cloud-inventory-results.local.json
- deploy/aliyun-production-cn.cloud-confirmations.local.json
- deploy/aliyun-production-cn.image-publish.local.json

## Strict 验证顺序

- `corepack pnpm aliyun:cloud:access`
- `corepack pnpm aliyun:cloud:inventory-results:strict`
- `corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage`
- `corepack pnpm aliyun:cloud:confirmations:strict`
- `corepack pnpm aliyun:image:plan:strict`
- `corepack pnpm aliyun:completion:audit`
- `corepack pnpm aliyun:predeploy`

## 安全边界

- This command only generates a local handoff package.
- It does not call Aliyun cloud APIs, configure CLI credentials, create resources, change DNS, import env vars, push images, or deploy production-cn.
- All reports are value-free; raw CLI stdout/stderr and credential files are never read or written.
