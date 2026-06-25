# 美业话镜 APP production-cn 阿里云后端补齐目标

Date: 2026-06-24

当前目标已经收窄为：先把 APP 后端补到阿里云，微信开放平台移动应用先不做，等项目后端上线后再推进。

## 当前结论

```text
currentScope=backend_aliyun_only
canProceedWithoutWechat=true
canDeployBackendNow=false
backendTargetReady=0/8
微信开放平台移动应用=deferred_after_backend_online
```

这表示：微信移动应用 AppID/AppSecret 不是当前阿里云后端补齐阻塞项；但完整 APP 发布前，它们仍然要补。

## 后端部署位置

正式后端部署目标：

```text
云厂商: 阿里云
地域: cn-hangzhou
运行时: SAE 自定义容器
服务名: meiye-huajing-app-api-production-cn
容器端口: 3000
健康检查: /api/healthz
API 域名: https://api-cn.ipgongchang.xin
资源域名: https://assets-cn.ipgongchang.xin
数据库: 阿里云 RDS PostgreSQL
镜像仓库: 阿里云 ACR
文件存储: OSS bucket meiye-huajing-service-records-production-cn
日志告警: SLS project meiye-huajing-app-prod-cn
密钥注入: SAE/KMS/Secrets Manager secret env
```

## 当前阿里云证据

当前只读盘点状态：

```text
cloudInventoryStrictReady=false
cloudInventoryReadyLocalOperations=0/9
cloudInventoryExecutedCommandResults=9/9
mutationPerformedCommandResults=0
cliConfigProbeFailureCategory=aliyun_cli_profile_not_configured
```

当前含义：

```text
本地存在 cloud-inventory-results.local.json 摘要，但当前 strict 校验未通过
现有摘要不能作为 SAE/ACR/DNS/OSS/SLS/证书/RDS/Redis 存在或不存在的最终证据
浏览器控制台登录或 Workbench 可见只能作为人工观察，不能替代 strict inventory
需要恢复本机 Aliyun CLI 或 CloudShell 只读身份后重新生成非密钥摘要
云资源证据当前仍是 0/7
```

## 当前后端阻塞项

```text
DATABASE_URL_CN
RDS_MIGRATION_EVIDENCE_NOT_READY
ACR_IMAGE_REGISTRY_NOT_READY
SAE_RUNTIME_NOT_READY
API_DOMAIN_HTTPS_ICP_NOT_READY
ASSET_DOMAIN_HTTPS_ICP_NOT_READY
OSS_RAM_STS_NOT_READY
ENV_IMPORT_NOT_READY
SLS_ALERTS_NOT_READY
POSTDEPLOY_SMOKE_NOT_RUN
```

已解除的本地代码阻塞：

```text
APP_API_POSTGRES_ADAPTER_MISSING
```

RDS 代码侧首版业务数据访问已经全部指向 APP-native RDS repository；仍未闭环的是阿里云 RDS 实例、连接串密钥、schema/data 迁移、RDS smoke 和 rollback 验证：

```text
appApiRouteCount=31
appApiRoutesWithSupabaseDataAccess=4
firstVersionRdsRouteCount=25
firstVersionRdsRoutesWithSupabaseDataAccess=0/25
deferredAppApiRouteCount=6
```

不在当前后端阻塞项里：

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
WECHAT_OPEN_PLATFORM_MOBILE_APP
ANDROID_RELEASE_WECHAT_SIGNATURE
```

## 资源怎么获得

### 1. RDS PostgreSQL / DATABASE_URL_CN

从哪里获得：

```text
阿里云控制台 -> 云数据库 RDS -> PostgreSQL -> cn-hangzhou
```

需要做什么：

```text
创建或确认 PostgreSQL 实例
创建 production-cn 数据库和数据库账号
生成 DATABASE_URL_CN，但只导入 SAE/KMS/Secrets Manager secret env
完成 Supabase 到 RDS/PostgreSQL schema、data、row count、关键记录、rollback 验证
把非密钥证据写入 deploy/aliyun-production-cn.rds-migration.local.json
```

注意：

```text
不要把数据库密码、连接串、dump 内容写入 Markdown、JSON、Docker image、APP 包或 git。
```

### 2. ACR 镜像仓库

从哪里获得：

```text
阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou
```

需要做什么：

```text
确认或购买 ACR Enterprise Economic
创建 namespace/repository: meiye-huajing-app-api
后续单独执行 docker login / docker push
记录非密钥 registry host、namespace、image digest
```

当前已记录的购买候选：

```text
edition=ACR Enterprise Economic
region=cn-hangzhou
term=1 month
quotedAmount=CNY 117.00
```

### 3. OSS / RAM / STS

从哪里获得：

```text
阿里云控制台 -> OSS / RAM / STS
```

当前已观察：

```text
bucket=meiye-huajing-service-records-production-cn
region=oss-cn-hangzhou
acl=private
CORS 已包含 api-cn/assets-cn
RAM policy 存在但未绑定，AttachmentCount=0
```

需要补：

```text
runtime role 或受限 RAM/STS 注入路径
ramLeastPrivilege=true
serviceRecordPrefix=service-records/production-cn
ALIYUN_OSS_ACCESS_KEY_SECRET 只能进 secret env
```

### 4. SAE runtime

从哪里获得：

```text
阿里云控制台 -> SAE -> cn-hangzhou
```

需要做什么：

```text
创建自定义容器应用 meiye-huajing-app-api-production-cn
容器端口 3000
健康检查 /api/healthz
配置 ACR 镜像拉取
挂载 SAE/KMS/Secrets Manager 环境变量
接入 SLS
```

### 5. 域名、HTTPS、ICP备案

从哪里获得：

```text
阿里云控制台 -> 云解析 DNS / 数字证书 CAS / SAE 或 OSS/CDN 自定义域名
```

需要补：

```text
api-cn.ipgongchang.xin 解析到 SAE 公网入口
assets-cn.ipgongchang.xin 解析到 OSS/CDN 或资源入口
HTTPS 证书签发和绑定
ICP备案满足国内正式访问要求
```

### 6. 环境变量导入

从哪里获得：

```text
Vercel 项目环境变量
本机 .env.production-cn.local
阿里云 SAE/KMS/Secrets Manager
```

需要补：

```text
把后端必填 env 导入阿里云运行环境
密钥类只进 KMS/Secrets Manager/SAE secret env
DATABASE_URL_CN 在 RDS 闭环后导入
微信移动应用 env 当前后置，不阻塞 backend-cn
```

### 7. SLS 告警

从哪里获得：

```text
阿里云控制台 -> 日志服务 SLS
```

当前已观察：

```text
project=meiye-huajing-app-prod-cn
logstore=app-api
alerts=0
```

需要补：

```text
/api/healthz 健康检查告警
5xx 告警
必要的运行日志查询入口
```

## 当前验证命令

```bash
corepack pnpm aliyun:backend-cn:status
corepack pnpm aliyun:backend-cn:apply-package
corepack pnpm aliyun:rds:migration:evidence
corepack pnpm aliyun:resources:matrix
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:image:plan
```

严格门禁：

```bash
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:predeploy
```

## 下一步顺序

```text
1. 创建/确认 RDS PostgreSQL，并完成 Supabase 到 RDS/PostgreSQL 迁移证据
2. 闭环 OSS RAM/STS 最小权限
3. 创建/确认 ACR，构建并推送后端镜像
4. 导入后端环境变量到 SAE/KMS/Secrets Manager
5. 创建 SAE runtime
6. 绑定 api-cn/assets-cn DNS、HTTPS、ICP备案
7. 配置 SLS health/5xx alerts
8. 跑 Aliyun 后端 health 和 APP API smoke
```
