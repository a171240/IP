# 美业话镜 APP 后端阿里云 production-cn 部署说明

日期：2026-06-21

本文只描述第一版 APP 后端桥接部署：登录、测试 token、profile、多租户权限、门店邀请、服务记录长录音、店长查看本店服务记录。本文不包含任何密钥值。

配套发布控制清单：

```text
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
```

## 1. 当前部署目标

```text
运行平台：阿里云中国内地
后端形态：Next.js API 容器
建议入口：SAE 应用或 ECS Docker 容器
监听端口：3000
健康检查：GET /api/healthz
严格健康检查：GET /api/app/health?strict=1
```

当前是桥接版 production-cn：

```text
数据库：暂时沿用现有 Supabase
对象存储：阿里云 OSS
长录音 ASR：百炼 / DashScope
服务复盘总结：DeepSeek
语音对练：火山语音 + DeepSeek
```

最终版 production-cn 还需要把数据层迁到阿里云 RDS PostgreSQL。当前代码仍以 Supabase SDK 为主，不要只填 `DATABASE_URL_CN` 就认为数据库已迁移完成。

## 2. 本轮新增的后端部署入口

### 2.1 Docker 镜像

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:docker:check
corepack pnpm aliyun:docker:build
```

镜像名：

```text
meiye-huajing-app-api:production-cn
```

`aliyun:docker:check` 不依赖 Docker daemon，会先检查 Dockerfile、pnpm lockfile、`.dockerignore`、健康检查入口和敏感 env 排除规则。真实镜像构建仍需要本机 Docker daemon 或阿里云镜像构建服务。

### 2.2 健康检查

```text
GET /api/healthz
GET /api/app/health
GET /api/app/health?strict=1
```

`/api/app/health` 只返回变量组是否具备，不返回任何变量值。空值、`""`、`''`、`TODO_` 占位值都按缺失处理。当前检查组：

```text
supabase
appWechatLogin
aliyunOss
bailianAsr
serviceRecordSummary
volcSpeech
```

SAE / SLB / 网关建议使用：

```text
GET /api/healthz
```

上线前人工验证建议使用：

```text
GET /api/app/health?strict=1
```

严格模式下，只要必需变量组缺失就返回 `503`。普通模式可以用于容器存活检查，严格模式用于上线前人工门禁。

本地部署前 smoke：

```bash
corepack pnpm build
corepack pnpm aliyun:health:smoke
corepack pnpm aliyun:app-api:smoke（22 probes / 0 failures）
```

`aliyun:health:smoke` 会启动本地 production server，请求三个 health URL，并检查响应里没有敏感变量值。

`aliyun:app-api:smoke` 会启动本地 production server，用未登录或假 token 请求验证第一版 APP 后端入口已经接到业务 guard，不是 404/405，也不会写入业务数据。覆盖范围包括登录、profile、门店管理、门店邀请、知识上下文和服务记录入口。

### 2.3 Production-cn readiness 门禁

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:readiness
```

`aliyun:readiness` 不输出任何密钥值，只输出状态。它会同时检查：

```text
1. .env.production-cn.local 是否存在、是否被 git 忽略、权限是否为 600。
2. 必需环境变量是否 ready。
3. APP_API_BASE_URL / NEXT_PUBLIC_SITE_URL 是否为 production-cn HTTPS 域名，且不是 example、localhost、Vercel 旧域名。
4. 微信登录是否使用微信开放平台“移动应用” AppID / AppSecret，而不是小程序 AppID / Secret。
5. 后端阿里云部署脚本、Dockerfile、health、APP API smoke 是否齐全。
6. App production-cn 构建配置生成门禁是否齐全。
7. Docker daemon 是否可用于本地镜像构建。
8. 还需要人工确认的阿里云 SAE / DNS / HTTPS / OSS / SLS 等资源，且可以读取非密钥 JSON 确认证据。
```

严格模式用于真正发布前：

```bash
corepack pnpm aliyun:readiness:strict
```

如果还有机器可验证阻塞或未显式确认的云资源，严格模式会失败。只做本地状态看板时使用 `aliyun:readiness`。

阿里云资源确认不靠口头 `assume`。控制台资源确认后，先复制非密钥模板：

```bash
cp deploy/aliyun-production-cn.cloud-confirmations.example.json \
  deploy/aliyun-production-cn.cloud-confirmations.local.json
```

然后只在 `.local.json` 里填写资源名、布尔状态和证据链接/截图编号，不填任何密钥值：

```bash
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:readiness:cloud-ready
```

`aliyun:readiness:cloud-ready` 会读取 `deploy/aliyun-production-cn.cloud-confirmations.local.json`。六项确认没有全部 ready 前，它仍会失败。`aliyun:readiness:assume-cloud-ready` 只保留给临时本地诊断，不能作为正式发布门禁。

非密钥部署样例：

```text
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.example.json
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.cloud-confirmations.example.json
```

### 2.4 发布审计与 Docker 上下文包

Docker daemon 不可用时，可以先生成一个不含密钥的阿里云发布审计目录和 Docker 上下文包：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:release:artifacts
```

默认输出到：

```text
/tmp/meiye-huajing-aliyun-production-cn-*
```

目录内容：

```text
release-audit.json
release-audit.md
meiye-huajing-app-api-production-cn-context.tar.gz
```

该脚本会复用当前 readiness、env、routes、Docker context 检查，不输出任何密钥值。生成 tar.gz 后会扫描并拒绝以下危险内容：

```text
.env*
.git
.next
.vercel
node_modules
*.log
*.tsbuildinfo
```

这份 tar.gz 可作为阿里云镜像构建服务或 ECS 手工构建的源上下文。正式部署前仍要以 `aliyun:cloud:check`、`aliyun:readiness:cloud-ready` 和远端 smoke 为准。

## 3. 环境变量导入

本机桥接 env 文件位置：

```text
/Users/Admin/Documents/美业话镜APP/.env.production-cn.local
```

该文件被根目录 `.gitignore` 忽略，权限应为 `600`。禁止提交、截图或复制到聊天里。

非密钥模板位置：

```text
/Users/Admin/Documents/美业话镜APP/.env.production-cn.example
```

新机器或阿里云导入前可以先复制模板，再只在本机填真实值：

```bash
cp /Users/Admin/Documents/美业话镜APP/.env.production-cn.example \
  /Users/Admin/Documents/美业话镜APP/.env.production-cn.local
chmod 600 /Users/Admin/Documents/美业话镜APP/.env.production-cn.local
```

模板只包含 `TODO_` 占位和非密钥默认值，不包含真实 key。

### 3.1 不输出密钥的检查

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:env:check
```

这个命令只输出变量名和状态，不输出变量值。

校验模板变量名覆盖：

```bash
node scripts/prepare-aliyun-runtime-env.mjs \
  --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.example \
  --allow-todo
```

### 3.2 生成阿里云控制台导入 JSON

只在确实要导入时执行，并写到仓库外：

```bash
node scripts/prepare-aliyun-runtime-env.mjs \
  --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.local \
  --allow-todo \
  --write /tmp/meiye-sae-env.json
```

默认行为会排除 `TODO_` 占位值。生成的 JSON 包含真实密钥值，导入后立即删除：

```bash
rm -f /tmp/meiye-sae-env.json
```

不要使用 `--include-todo-in-write` 导入正式环境，除非只是临时排查变量清单。

## 4. 阿里云控制台需要创建或确认的资源

### 4.1 SAE 或 ECS 容器

推荐先用 SAE：

```text
地域：华东 1 / 华北 2 任选一个和 OSS、RDS 规划一致的地域
运行时：自定义容器
端口：3000
健康检查：/api/healthz
环境变量：从 .env.production-cn.local 导入非 TODO 值
```

如果先用 ECS：

```text
安装 Docker
拉取或加载镜像
容器暴露 3000
前置 Nginx / SLB 配 HTTPS 域名
```

### 4.2 API 域名

建议：

```text
api-cn.ipgongchang.xin
```

当前 DNS 已确认 `ipgongchang.xin` 在阿里云解析。`ip.ipgongchang.xin` 仍指向 Vercel，不要直接改这个线上入口。

### 4.3 HTTPS 证书

需要在阿里云证书服务或域名网关里给 `api-cn` 配 HTTPS。APP 国内发布不能使用未备案、未 HTTPS、或临时测试域名作为正式 API 入口。

### 4.4 OSS

需要确认：

```text
Bucket 私有读
服务端使用短期签名 URL
CORS 允许 APP 上传所需方法和 Header
RAM 权限最小化到服务记录音频前缀
```

### 4.5 日志与告警

建议补：

```text
SLS 日志项目
5xx 告警
健康检查失败告警
ASR / OSS 上传失败告警
```

### 4.6 RDS / Redis

当前不是第一步阻塞，但正式 production-cn 需要：

```text
RDS PostgreSQL：替代 Supabase 数据层
Tair / Redis：任务队列、轮询和重试
```

### 4.7 云资源确认文件

本地确认文件位置：

```text
deploy/aliyun-production-cn.cloud-confirmations.local.json
```

该文件被 `.gitignore` 排除，不能提交。字段获得方式：

```text
runtime：阿里云 SAE 应用详情或 ECS 容器运行配置，确认端口 3000 和 /api/healthz。
apiDomainHttps：阿里云 DNS / 证书服务 / 备案信息，确认 api-cn 已解析到阿里云并启用 HTTPS。
oss：OSS Bucket CORS、RAM 策略和 service-records/production-cn 前缀。
wechatOpenPlatform：微信开放平台移动应用审核状态、Android 包名/签名、iOS Bundle ID/Universal Link。
envImport：SAE/ECS/KMS/Secrets Manager 环境变量导入记录，确认密钥没有写进镜像。
slsAlerts：SLS 项目和健康检查失败、5xx 告警配置。
```

检查命令：

```bash
corepack pnpm aliyun:cloud:check
```

## 4.8 阿里云环境变量导入计划

生成不含任何变量值的导入任务单：

```bash
corepack pnpm aliyun:env:plan
```

默认输出：

```text
/tmp/meiye-aliyun-env-import-plan.json
```

这个 JSON 只包含：

```text
变量名
是否必填
当前状态：ready / todo / empty
敏感分类：public / identifier_or_connection / secret
获得来源
导入动作
```

它不包含真实 value，可用于进阿里云 SAE/ECS/KMS/Secrets Manager 控制台时逐项核对。真正带 value 的导入文件只能用下面命令写到仓库外临时路径，并在导入后删除：

```bash
node scripts/prepare-aliyun-runtime-env.mjs \
  --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.local \
  --write /tmp/meiye-sae-env.json
```

## 5. 微信登录变量来源

APP 登录使用微信开放平台的移动应用，不使用小程序 AppID/Secret。

需要变量：

```text
WECHAT_OPEN_APP_REVIEW_STATUS
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
```

来源：

```text
微信开放平台 open.weixin.qq.com
-> 管理中心
-> 移动应用
-> 美业话镜 App
-> AppID / AppSecret
```

`WECHAT_OPEN_APP_REVIEW_STATUS` 不是密钥，只用于 readiness 报告当前状态。可选值：

```text
not_started
reviewing
approved
rejected
```

当前用户已确认微信开放平台移动应用正在审核中。审核中仍不能发布，只能把 blocker 从 `wechat_open_platform_mobile_app_not_ready` 细分为 `wechat_open_platform_mobile_app_reviewing`。审核通过后再填 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。

微信开放平台移动应用需要准备：

```text
iOS Bundle ID
iOS Universal Link
Android applicationId / 包名
Android 签名
```

当前浏览器自动化不能打开 `open.weixin.qq.com`，需要用户手工登录后提供或手工填入本机 `.env.production-cn.local`。

## 6. 上线前最小验证

本地代码级验证：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:predeploy
```

`aliyun:predeploy` 等价于：

```bash
corepack pnpm aliyun:env:check
corepack pnpm aliyun:env:plan
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:readiness
corepack pnpm aliyun:routes:check
corepack pnpm aliyun:docker:check
corepack pnpm exec tsc --noEmit --pretty false
corepack pnpm release:preflight
corepack pnpm build
corepack pnpm aliyun:health:smoke
corepack pnpm aliyun:app-api:smoke
```

容器构建验证：

```bash
corepack pnpm aliyun:docker:build
```

部署后验证：

```bash
corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin
```

如果是微信开放平台变量尚未补齐的桥接调试阶段，只允许显式放行已知缺口：

```bash
corepack pnpm aliyun:remote:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin
```

`aliyun:remote:smoke` 会检查 `/api/healthz`、`/api/app/health`、`/api/app/health?strict=1` 的响应结构，并拒绝包含敏感字段名的 health 响应。

部署后还要跑 APP API 入口 smoke：

```bash
corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin
```

这个 smoke 只验证无登录请求能进到正确的鉴权、校验或假 token 分支，不替代带真实账号的业务冒烟。

业务冒烟：

```text
APP 微信登录
profile 拉取
门店邀请预览 / 接受
服务记录 session 创建
OSS 直传签名
长录音分段上传
ASR poll
服务记录总结
店长查看本店服务记录
```

## 7. 当前不能自动完成的阻塞

```text
1. 需要确认是否创建阿里云 SAE 应用和 api-cn 域名。
2. 需要微信开放平台移动应用 AppID / AppSecret。
3. 需要确认隐私政策和用户协议正式 URL。
4. 正式数据层迁移到 RDS PostgreSQL 还未开始。
5. Redis/Tair、SLS、KMS/Secrets Manager 还未确认。
```

也可以直接运行：

```bash
corepack pnpm aliyun:readiness
```

当前该门禁会把机器可验证阻塞和人工确认项分开列出。机器可验证阻塞解除后，仍需阿里云资源与微信开放平台移动应用配置确认，才能称为 production-cn 可发布。

在这些阻塞解除前，只能完成本地桥接准备和部署脚手架，不能称为 APP 国内正式生产上线完成。

## 8. 2026-06-21 本地验证状态

已通过：

```text
node scripts/prepare-aliyun-runtime-env.mjs --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.example --allow-todo
node --check scripts/check-aliyun-production-cn-readiness.mjs
node --check scripts/prepare-aliyun-release-artifacts.mjs
node --check scripts/run-aliyun-predeploy.mjs
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.example.json','utf8'))"
corepack pnpm aliyun:readiness
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:release:artifacts
corepack pnpm aliyun:predeploy
corepack pnpm aliyun:routes:check（31 routes / 0 failures）
corepack pnpm aliyun:docker:check（7 files / 24 dockerignore patterns / sensitive env excluded）
corepack pnpm aliyun:remote:smoke -- --base-url http://127.0.0.1:3022 --allow-missing appWechatLogin
corepack pnpm aliyun:env:check
corepack pnpm exec tsc --noEmit --pretty false
corepack pnpm release:preflight
corepack pnpm build
corepack pnpm aliyun:health:smoke
corepack pnpm aliyun:app-api:smoke
corepack pnpm aliyun:remote:smoke -- --base-url http://127.0.0.1:PORT --allow-missing appWechatLogin
npm run typecheck
npm run lint
npm test -- --runInBand（38 suites / 119 tests）
android ./gradlew assembleDebug
```

`aliyun:readiness` 当前机器可验证阻塞：

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
wechat_open_platform_mobile_app_reviewing 或 wechat_open_platform_mobile_app_not_ready
```

2026-06-21 21:45 CST 更新：本机 `.env.production-cn.local` 已补入非密钥域名：

```text
APP_API_BASE_URL=https://api-cn.ipgongchang.xin
NEXT_PUBLIC_SITE_URL=https://api-cn.ipgongchang.xin
APP_ASSET_BASE_URL=https://assets-cn.ipgongchang.xin
```

这些值只表示本地目标配置已补齐；正式发布仍要由 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 确认 DNS、HTTPS、ICP、OSS/CORS/RAM 和 SLS。

`aliyun:cloud:check` 当前云确认状态：

```text
cloudConfirmations.mode: file
cloudConfirmations.ready: false
path: deploy/aliyun-production-cn.cloud-confirmations.local.json
runtime missing: confirmed
apiDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
oss missing: confirmed, corsConfigured, ramLeastPrivilege
wechatOpenPlatform missing: confirmed, mobileAppIdReady, mobileAppSecretReady, androidConfigured, iosConfigured, reviewStatus=approved
envImport missing: confirmed, secretNotInImage
slsAlerts missing: confirmed, healthAlertConfigured, serverErrorAlertConfigured
```

`APP_ASSET_BASE_URL` 已按 `https://assets-cn.ipgongchang.xin` 写入本地配置，但资产域名和 OSS/CDN 仍未人工确认为 production ready。

最新发布审计产物：

```text
/tmp/meiye-huajing-aliyun-production-cn-2026-06-21T12-15-51-558Z/release-audit.md
/tmp/meiye-huajing-aliyun-production-cn-2026-06-21T12-15-51-558Z/meiye-huajing-app-api-production-cn-context.tar.gz
```

产物检查：

```text
entryCount: 3842
forbiddenEntryCount: 0
bytes: 295585706
```

`corepack pnpm aliyun:docker:build` 已尝试，但本机 Docker daemon 未启动成功，当前 readiness 报告为 `docker_daemon_unavailable`。Docker daemon 就绪后需要重跑该命令。

本地 production server 已用 `.env.production-cn.local` 做过 HTTP 验证：

```text
GET /api/healthz -> 200, ok:false, missing:[appWechatLogin]
GET /api/app/health -> 200, ok:false, missing:[appWechatLogin]
GET /api/app/health?strict=1 -> 503, ok:false, missing:[appWechatLogin]
sensitiveLeakCount -> 0
```

本地 production server 也已用未登录/假 token 请求验证第一版 APP API 入口：

```text
checkedProbes: 22
scopes:
- auth: 2
- account: 2
- context: 3
- invites: 3
- service-records: 9
- store-admin: 3
结果：0 failures，入口均进入预期的 missing_code / auth_required / invite_not_found 分支。
```

这说明当前 TODO 微信开放平台变量不会被健康检查误判为 ready。
