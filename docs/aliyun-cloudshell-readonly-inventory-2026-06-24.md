# 美业话镜 APP production-cn 阿里云 CloudShell 只读盘点

日期：2026-06-24

## 结论

本次只读盘点已经证明：阿里云账号可以通过 CloudShell 执行 allowlisted CLI 查询，`deploy/aliyun-production-cn.cloud-inventory-results.local.json` 已回填为 strict ready。

这不代表可以部署。当前云资源实际状态仍然是：

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

未执行：

- ACR 购买或付款。
- SAE 创建、部署、启动、停止或更新。
- DNS 解析修改。
- HTTPS 证书申请、上传或绑定。
- OSS 对象读写。
- RAM/STS 密钥创建或导入。
- SAE/KMS/Secrets Manager 环境变量导入。
- 微信开放平台移动 App 创建或提交审核。

## 本地证据

已更新本机忽略文件：

- `deploy/aliyun-production-cn.cloud-inventory-results.local.json`

验证命令：

```bash
corepack pnpm aliyun:cloud:inventory-results:strict
```

当前结果：

- `localReady=true`
- `readyLocalOperations=7/7`
- `executedCommandResults=9`
- `cloudApiCalledCommandResults=9`
- `mutationPerformedCommandResults=0`

原始终端输出保存在本机临时文件：

- `/tmp/meiye-aliyun-cloudshell-inventory-probe-20260624.txt`
- `/tmp/meiye-aliyun-cloudshell-oss-ram-sls-probe-20260624.txt`

该临时文件不应提交；如需长期留痕，只保留本文件中的非密钥摘要。

## 仍需用户介入或动作时确认的事项

当前可以继续准备但不能自动执行的动作包：

- `P01_WECHAT_OPEN_MOBILE_APP`：微信开放平台移动 App 创建、提交审核、审核通过后取得 AppID/AppSecret。
- `P10_ANDROID_RELEASE_SIGNING`：Android release keystore/签名，不可使用 debug keystore。
- `P02_APPLE_TEAM_ID`：Apple Developer Team ID，用于 iOS Universal Link/AASA。
- `P03_ACR_PURCHASE`：ACR 企业版付费购买，付款前必须由用户确认规格和金额。
- `P05_OSS_RAM_STS`：OSS RAM 最小权限或 STS/运行时角色；Secret 只能进入阿里云受控 secret env。

依赖上述动作后才能继续：

- `P04_ACR_IMAGE_AND_PULL`：推送/导入 ACR 镜像并配置 SAE 拉取。
- `P06_ENV_IMPORT`：导入 production-cn 环境变量。
- `P07_DOMAIN_DNS_HTTPS_ICP`：配置 api-cn/assets-cn DNS、HTTPS、ICP备案状态。
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
