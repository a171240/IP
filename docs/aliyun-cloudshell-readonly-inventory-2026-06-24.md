# 美业话镜 APP production-cn 阿里云 CloudShell 只读盘点

日期：2026-06-24
当前复核：2026-06-26

## 当前复核结论（2026-06-26）

当前 strict inventory 不能视为 ready。以本机当前权威文件和门禁为准：

- `deploy/aliyun-production-cn.cloud-inventory-results.local.json` 当前 9 个 operation 均为 `DRY_RUN_NOT_EXECUTED`。
- `corepack pnpm aliyun:cloud:inventory-results` 当前显示 `readyLocalOperations=0/9`。
- `corepack pnpm aliyun:backend-cn:status` 当前仍显示 `cloudInventoryStrictReady=false`、`cloudInventoryResultGaps=1`。
- 已登录 Chrome 中的阿里云 CloudShell 标签页可见，但终端处于 `Disconnected`；点击重连会弹出“重启实例”确认，说明会终止当前会话并创建新会话。本轮已点击“取消”，未确认重启，未运行 inventory，未调用阿里云 OpenAPI。

因此，下方 2026-06-24 的 strict ready 记录只能作为历史盘点摘要，不能作为当前可部署证据。要重新恢复该证据，必须先获得动作时确认后重启/恢复 CloudShell，或配置安全的本机 Aliyun CLI profile，然后运行：

```bash
corepack pnpm aliyun:cloudshell:collector:bootstrap | pbcopy
```

再把 CloudShell 输出的非密钥 JSON 回填到：

```text
deploy/aliyun-production-cn.cloud-inventory-results.local.json
```

最后用以下命令验收：

```bash
corepack pnpm aliyun:cloud:inventory-results:strict
corepack pnpm aliyun:backend-cn:status
```

## 2026-06-24 历史盘点记录（当前不可直接复用）

以下是 2026-06-24 当时的只读盘点结论，仅用于解释历史观察。它不能覆盖 2026-06-26 当前门禁；当前门禁仍以顶部“当前复核结论”为准。

当时只读盘点曾证明：阿里云账号可以通过 CloudShell 执行 allowlisted CLI 查询，`deploy/aliyun-production-cn.cloud-inventory-results.local.json` 曾回填为 strict ready。

即使在该历史盘点时，这也不代表可以部署。当时云资源实际状态仍然是：

- SAE production-cn 应用：未创建。
- ACR 实例/镜像仓库：未创建。
- `api-cn.ipgongchang.xin` AliDNS 记录：不存在。
- `assets-cn.ipgongchang.xin` AliDNS 记录：不存在。
- OSS bucket `meiye-huajing-service-records-production-cn`：存在，`oss-cn-hangzhou`，ACL `private`。
- OSS CORS：已配置，允许 `https://api-cn.ipgongchang.xin`、`https://assets-cn.ipgongchang.xin`，方法 `GET/POST/PUT/HEAD`。
- RAM 自定义策略：`MeiyeHuajingServiceRecordsOssPolicy` 存在，但 `AttachmentCount=0`，因此 production-cn OSS 最小权限尚未绑定完成。
- SAE service-linked role：`AliyunServiceRoleForSAE` 存在，但这不等于 SAE 应用已创建。
- SLS project `meiye-huajing-app-prod-cn`：存在，logstore `app-api` 存在。
- SLS alerts：0 条，健康检查和 5xx 告警未配置。
- SLS dashboards：0 个。
- CAS 证书订单：0 条，HTTPS 证书/绑定未确认。
- RDS PostgreSQL：`cn-hangzhou` 下实例数 0。
- RDS 全量实例：`cn-hangzhou` 下实例数 0。
- Redis/Tair：`cn-hangzhou` 下实例数 0。

## 执行边界

本次只运行 CloudShell 中的只读命令：

- `aliyun sae ListApplications --region cn-hangzhou`
- `aliyun cr ListInstance --region cn-hangzhou`
- `aliyun alidns DescribeSubDomainRecords --SubDomain api-cn.ipgongchang.xin`
- `aliyun alidns DescribeSubDomainRecords --SubDomain assets-cn.ipgongchang.xin`
- `aliyun oss stat oss://meiye-huajing-service-records-production-cn`
- `aliyun oss cors --method get oss://meiye-huajing-service-records-production-cn`
- `aliyun sls ListProject --region cn-hangzhou`
- `aliyun sls ListLogStores --project meiye-huajing-app-prod-cn`
- `aliyun sls ListAlerts --project meiye-huajing-app-prod-cn`
- `aliyun sls ListDashboard --project meiye-huajing-app-prod-cn`
- `aliyun cas ListUserCertificateOrder --region cn-hangzhou`
- `aliyun ram ListPolicies --PolicyType Custom`
- `aliyun ram ListRoles`
- `aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL`
- `aliyun rds DescribeDBInstances --RegionId cn-hangzhou`
- `aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou`

未执行：

- ACR 购买或付款。
- SAE 创建、部署、启动、停止或更新。
- DNS 解析修改。
- HTTPS 证书申请、上传或绑定。
- OSS 对象读写。
- RAM/STS 密钥创建或导入。
- SAE/KMS/Secrets Manager 环境变量导入。
- 微信开放平台移动 App 创建或提交审核。

## 2026-06-24 本地历史证据

当时曾更新本机忽略文件：

- `deploy/aliyun-production-cn.cloud-inventory-results.local.json`

验证命令：

```bash
corepack pnpm aliyun:cloud:inventory-results:strict
```

当时结果：

- `localReady=true`
- `readyLocalOperations=9/9`
- `executedCommandResults=12/12`
- `cloudApiCalledCommandResults=12/12`
- `mutationPerformedCommandResults=0`

2026-06-26 当前门禁已经覆盖该历史结果：本机当前 `cloud-inventory-results.local.json` 为 `DRY_RUN_NOT_EXECUTED`，`readyLocalOperations=0/9`，`cloudInventoryStrictReady=false`。必须重新获得动作时确认后恢复 CloudShell/CLI 并重新运行只读 inventory，才能把 P00 当作已闭环。

原始终端输出保存在本机临时文件：

- `/tmp/meiye-aliyun-cloudshell-inventory-probe-20260624.txt`
- `/tmp/meiye-aliyun-cloudshell-oss-ram-sls-probe-20260624.txt`
- `/tmp/meiye-aliyun-cloudshell-data-layer-probe-20260624.txt`

该临时文件不应提交；如需长期留痕，只保留本文件中的非密钥摘要。

## 2026-06-26 仍需用户介入或动作时确认的事项

当前 backend-only 目标可以继续准备但不能自动执行的第一批动作包：

- `P00_ALIYUN_READONLY_INVENTORY_IDENTITY`：恢复 Aliyun CLI / CloudShell 只读盘点；如 CloudShell 要求重启实例或开通性能型 NAS，必须动作时确认。
- `P11_ALIYUN_RDS_DATA_MIGRATION`：创建或确认 RDS PostgreSQL，完成 `DATABASE_URL_CN` secret env 导入和 RDS 迁移证据。
- `P05_OSS_RAM_STS`：OSS RAM 最小权限或 STS/运行时角色；Secret 只能进入阿里云受控 secret env。
- `P03_ACR_PURCHASE`：ACR 企业版付费购买，付款前必须由用户确认规格和金额。

完整 APP 发布项已后置，不属于当前 backend-only 阻塞：

- `P01_WECHAT_OPEN_MOBILE_APP`：微信开放平台移动 App 创建、提交审核、审核通过后取得 AppID/AppSecret。
- `P10_ANDROID_RELEASE_SIGNING`：Android release keystore/签名，不可使用 debug keystore。
- `P02_APPLE_TEAM_ID`：Apple Developer Team ID，用于 iOS Universal Link/AASA。

依赖上述动作后才能继续：

- `P04_ACR_IMAGE_AND_PULL`：推送/导入 ACR 镜像并配置 SAE 拉取。
- `P06_ENV_IMPORT`：导入 production-cn 环境变量。
- `P07_DOMAIN_DNS_HTTPS`：配置 api-cn/assets-cn DNS、HTTPS、ICP备案状态。
- `P08_SAE_RUNTIME_SLS`：创建 SAE runtime 并配置 SLS 告警。
- `P09_PRODUCTION_DEPLOY`：生产部署和远端冒烟。

## 2026-06-24 01:30 补充盘点

OSS CORS 已用正确命令验证通过：

```bash
aliyun oss cors --method get oss://meiye-huajing-service-records-production-cn
```

非密钥摘要：

- `AllowedOrigin`: `https://api-cn.ipgongchang.xin`
- `AllowedOrigin`: `https://assets-cn.ipgongchang.xin`
- `AllowedMethod`: `GET`, `POST`, `PUT`, `HEAD`
- `AllowedHeader`: `*`
- `MaxAgeSeconds`: `600`

RAM/SLS 补充结论：

- `MeiyeHuajingServiceRecordsOssPolicy` 存在，描述为 production-cn service-record OSS least privilege，但 `AttachmentCount=0`，所以 `ramLeastPrivilege` 仍然不能标 ready。
- `MeiyeServiceRecordsOssPolicy` 存在且 `AttachmentCount=1`，但描述指向旧 bucket `meiye-service-records-20260611`，不能替代当前 production-cn bucket 绑定。
- `AliyunServiceRoleForSAE` 存在，说明 SAE 服务关联角色具备，但 SAE 应用仍未创建。
- `ListAlerts` 返回 `total=0`，`ListDashboard` 返回 `total=0`，所以 SLS 告警/看板仍未配置。

已更新本机忽略文件：

- `deploy/aliyun-production-cn.cloud-confirmations.local.json`

仍保持：

- `oss.confirmed=false`
- `oss.ramLeastPrivilege=false`
- `slsAlerts.confirmed=false`
- `slsAlerts.healthAlertConfigured=false`
- `slsAlerts.serverErrorAlertConfigured=false`

## 2026-06-24 数据层补充盘点

历史口径说明：2026-06-22 曾把第一版 APP production-cn 描述为阿里云 API 容器加 Supabase 旧数据层兼容。该口径已经被 2026-06-24 的“APP 国内正式版全部迁到阿里云”门禁覆盖。

当前执行口径：正式 APP production-cn 后端必须使用阿里云 RDS PostgreSQL；Supabase 只能作为迁移来源或旧链路兼容，不能作为正式数据库目标。以下盘点用于证明 RDS/Tair 当前资源状态，其中 RDS PostgreSQL、`DATABASE_URL_CN`、schema/data 迁移、RDS smoke 和回滚验收都属于当前阿里云后端阻塞项。

只读命令：

```bash
aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL
aliyun rds DescribeDBInstances --RegionId cn-hangzhou
aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou
```

非密钥摘要：

- PostgreSQL RDS: `TotalRecordCount=0`
- RDS all engines: `TotalRecordCount=0`
- Redis/Tair: `TotalCount=0`

结论：

- `DATABASE_URL_CN` 不能标 ready，因为没有 production-cn RDS PostgreSQL 实例或连接串。
- `REDIS_URL_CN` 不能标 ready，因为没有 Redis/Tair 实例。
- 即使以后填入 `DATABASE_URL_CN`，也不能等同于数据层迁移完成；首版 APP 业务数据访问代码侧已经有 APP-native RDS repository，但正式完整 production-cn 仍需要阿里云 RDS 实例、schema/data 迁移、RDS smoke、回滚和验收。`29/31` Supabase 触碰只代表兼容/会话/helper 盘点口径，不等同于业务数据仍走 Supabase。
