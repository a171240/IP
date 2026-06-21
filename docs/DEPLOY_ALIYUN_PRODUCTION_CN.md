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
corepack pnpm aliyun:container:smoke
```

镜像名：

```text
meiye-huajing-app-api:production-cn
```

`aliyun:docker:check` 不依赖 Docker daemon，会先检查 Dockerfile、pnpm lockfile、`.dockerignore`、健康检查入口和敏感 env 排除规则。真实镜像构建仍需要本机 Docker daemon 或阿里云镜像构建服务。

`aliyun:container:smoke` 会用去引号后的临时 env 文件启动本地 Docker 镜像，验证 `/api/healthz`、`/api/app/health`、`/api/app/health?strict=1` 和 30 个 APP API 探针，然后自动停止容器并删除临时 env 文件。不要直接把带引号的 `.env.production-cn.local` 传给 Docker `--env-file`，Docker 不会像 Node dotenv 解析器一样自动去掉引号。

### 2.1a 阿里云 ACR 镜像发布计划

```bash
corepack pnpm aliyun:image:plan
```

`aliyun:image:plan` 校验非密钥镜像发布计划：

```text
deploy/aliyun-production-cn.image-publish.example.json
deploy/aliyun-production-cn.image-publish.local.json
```

example 模板只放 ACR registry host、namespace、repository、tag、remote image、digest 状态、运行时拉取状态和证据字段。正式推送前复制到 `.local.json`，只填写资源名、布尔状态、digest 和证据编号，不写 ACR 密码、RAM Secret、token 或 image pull secret。

严格发布前必须通过：

```bash
corepack pnpm aliyun:image:plan:strict
```

这一步确认镜像已经推送/导入阿里云 ACR，并且 SAE/ECS 运行时已经配置为拉取该 remote image。它不执行 `docker login`、不推送镜像、不创建 ACR 仓库。

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
legalLinks
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
corepack pnpm aliyun:app-api:bridge-map（31 mapped routes / 29 bridge-ready routes / 2 WeChat env-blocked routes）
corepack pnpm aliyun:app-client:contract（40 audited calls / 34 unique client routes）
corepack pnpm aliyun:app-api:coverage（29 / 29 business routes covered）
corepack pnpm aliyun:app-api:smoke（30 business probes / 0 failures）
corepack pnpm aliyun:container:smoke（Docker image health + 30 APP API probes）
```

`aliyun:health:smoke` 会启动本地 production server，请求三个 health URL，并检查响应里没有敏感变量值。

`aliyun:app-api:smoke` 会启动本地 production server，用未登录或假 token 请求验证第一版 APP 后端入口已经接到业务 guard，不是 404/405，也不会写入业务数据。覆盖范围包括登录、profile、门店管理、门店邀请、知识上下文和服务记录入口。

`aliyun:app-api:bridge-map` 是小程序链路复用门禁：它读取 `deploy/app-api-production-cn.bridge-map.json`，逐条校验 31 个 APP API route、App route 文件、源小程序 API 文件和小程序源页面是否一致。当前分类是 22 条 `mp_reexport`、5 条 `mp_adapter`、1 条 `app_native`、1 条 `app_alias`、2 条 `native_health`。微信登录必须保持 `app_native/app_alias`，不能回退复用小程序 `wx.login` 链路。

`aliyun:app-client:contract` 是静态门禁：它读取 App 工程 `src/api` 里的 `apiRequest(...)` 调用，归一化动态路径后和后端 production-cn route 清单匹配。第一版范围包括登录、profile、entitlements、门店管理、邀请、顾客/场景/门店上下文和服务记录；Package 2 的 `knowledge-spaces` 调用只报告为 deferred，不作为第一版阻断。

`aliyun:app-api:coverage` 是静态门禁：它把 APP API route 清单和 smoke 探针清单做匹配，要求除 health 外的每个业务 route 至少有一个 smoke 探针覆盖。

阿里云部署后统一 smoke：

```bash
corepack pnpm aliyun:postdeploy:smoke -- \
  --base-url https://api-cn.ipgongchang.xin
```

默认输出到：

```text
/tmp/meiye-huajing-aliyun-postdeploy-smoke-*
```

目录内容：

```text
remote-health-smoke.json
app-api-smoke.json
postdeploy-smoke.json
postdeploy-smoke.md
```

如果微信开放平台或正式协议 URL 仍未补齐，只能作为桥接调试放行已知缺口：

```bash
corepack pnpm aliyun:postdeploy:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin,legalLinks
```

正式 production-cn 不应使用 Vercel、旧域名、非 HTTPS 域名或 `ip.ipgongchang.xin` 作为 `--base-url`。

部署前后都可以先跑域名检查：

```bash
corepack pnpm aliyun:domain:check
```

`aliyun:domain:check` 读取 `.env.production-cn.local` 中的 `APP_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL` 和可选的 `APP_ASSET_BASE_URL`，只输出非密钥域名状态。它会检查：

```text
1. 域名必须是 HTTPS，不能是 localhost、example、Vercel 或旧线上域名。
2. APP_API_BASE_URL / NEXT_PUBLIC_SITE_URL 必须使用 api-cn.*。
3. APP_ASSET_BASE_URL 如果填写，必须使用 assets-cn.*。
4. DNS 至少存在 A / AAAA / CNAME 记录，且不能指向 Vercel。
5. api-cn 的 /api/healthz 必须能通过 HTTPS 返回 2xx。
```

只看状态时使用 `aliyun:domain:check`，它会列出阻塞但退出 0；生产发布或部署后验收使用严格模式：

```bash
corepack pnpm aliyun:domain:strict
```

严格模式在 DNS、HTTPS 或 `/api/healthz` 未 ready 时会失败。ICP备案状态仍不能只靠本机命令证明，需要在 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 的 `apiDomainHttps` 里写非密钥证据。

### 2.3 Production-cn readiness 门禁

如果要给阿里云/微信后台操作员看下一步清单，先跑：

```bash
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:image:plan
corepack pnpm aliyun:legal:check
corepack pnpm aliyun:operator:tasks
```

这些命令不输出任何密钥值，也不会创建资源、导入变量或推送镜像。`aliyun:legal:check` 只确认后端包内 `/privacy` 和 `/terms` 页面存在、核心字段完整，并允许正式 URL 仍未填入 env；`aliyun:deploy:spec` 校验 `deploy/aliyun-production-cn.example.json` 的镜像、端口、ACR 发布计划、域名、健康检查和前后置门禁顺序；`aliyun:operator:tasks` 会把当前 `readiness`、`domain`、`.env.production-cn.local`、`image-publish.local.json` 和 `cloud-confirmations.local.json` 汇总为 9 个任务：

```text
T01 微信开放平台移动应用审核和 APP 登录凭证
T02 国内 APP 隐私政策和用户协议正式 URL
T03 阿里云 SAE/ECS 后端运行容器
T03B 发布后端 Docker 镜像到阿里云 ACR 并配置运行时拉取
T04 api-cn/assets-cn DNS、HTTPS 和 ICP 证据
T05 服务记录音频 OSS、CORS 和 RAM 最小权限
T06 production-cn 运行环境变量导入
T07 SLS 日志和健康/5xx 告警
T08 阿里云部署后远端 smoke 验收
```

如需生成文件给人工核对：

```bash
node scripts/generate-aliyun-operator-tasks.mjs \
  --out /tmp/meiye-aliyun-operator-tasks.json \
  --markdown /tmp/meiye-aliyun-operator-tasks.md
```

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:readiness
```

`aliyun:readiness` 不输出任何密钥值，只输出状态。它会同时检查：

```text
1. .env.production-cn.local 是否存在、是否被 git 忽略、权限是否为 600。
2. 必需环境变量是否 ready。
3. APP_API_BASE_URL / NEXT_PUBLIC_SITE_URL 是否为 production-cn HTTPS 域名，且不是 example、localhost、Vercel 旧域名。
3a. `aliyun:domain:check` 是否可用，用于机器检查 DNS、HTTPS 和 `/api/healthz`。
4. 微信登录是否使用微信开放平台“移动应用” AppID / AppSecret，而不是小程序 AppID / Secret。
5. 后端阿里云部署脚本、Dockerfile、health、小程序链路桥接清单、APP client API contract、APP API smoke 是否齐全。
6. App production-cn 构建配置生成门禁是否齐全。
7. Docker daemon 是否可用于本地镜像构建。
8. ACR 镜像发布计划和 SAE/ECS 运行时镜像拉取配置是否有非密钥证据。
9. 还需要人工确认的阿里云 SAE / DNS / HTTPS / OSS / SLS 等资源，且可以读取非密钥 JSON 确认证据。
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
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:readiness:cloud-ready
```

`aliyun:readiness:cloud-ready` 会读取 `deploy/aliyun-production-cn.cloud-confirmations.local.json`。六项确认没有全部 ready 前，它仍会失败。`aliyun:readiness:assume-cloud-ready` 只保留给临时本地诊断，不能作为正式发布门禁。

`aliyun:cloud:confirmations` 会同时校验 example 模板和本机 `.local.json`：模板必须结构有效，本机文件可以在看板模式下列出未完成项。严格发布前使用：

```bash
corepack pnpm aliyun:cloud:confirmations:strict
```

严格模式会在 SAE/ECS、DNS/HTTPS/ICP、OSS/CORS/RAM、微信开放平台 approved、环境变量导入、SLS 告警任一项未确认时失败。确认文件只能写资源名、布尔状态、证据编号或控制台路径，不能写任何 AppSecret、AccessKey、Token、Service Role Key。

非密钥部署样例：

```text
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.example.json
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.image-publish.example.json
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
env-import-plan.json
vercel-env-coverage.json
app-api-bridge-map-check.json
meiye-huajing-app-api-production-cn-context.tar.gz
```

该脚本会复用当前 readiness、env、routes、小程序链路桥接清单、Docker context 检查，并默认尝试生成 Vercel production 变量名覆盖报告。Vercel 覆盖报告只包含变量名、环境和加密/敏感元数据，不包含真实 value；如果 Vercel 登录态不可用，会在审计里记录失败，不阻断本地发布审计包生成。

如果只想离线生成审计包，或不想访问 Vercel：

```bash
corepack pnpm aliyun:release:artifacts -- --skip-vercel-env-coverage
```

如果已经保存了 `vercel env ls production --format json` 输出，可以离线带入：

```bash
corepack pnpm aliyun:release:artifacts -- \
  --vercel-env-coverage-input /tmp/meiye-vercel-env-production.json
```

该脚本不输出任何密钥值。生成 tar.gz 后会扫描并拒绝以下危险内容：

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

生成不含 value 的变量来源清单：

```bash
corepack pnpm aliyun:env:sources
```

默认输出：

```text
/tmp/meiye-aliyun-env-source-catalog.json
```

这份 JSON 仍不包含真实变量值。每个变量会列出：

```text
sensitivity
owner
consolePath
obtain
importTarget
cloudConfirmationKey
```

它用于回答“这个变量去哪里拿、由谁确认、导入阿里云哪里”。例如 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 的来源是微信开放平台移动应用，不是小程序后台；`PRIVACY_POLICY_URL` / `TERMS_URL` 的来源是正式 HTTPS 协议页面；OSS、百炼、DeepSeek、火山语音、Supabase 桥接变量会分别标出对应控制台或旧 Vercel production 变量来源。

校验模板变量名覆盖：

```bash
node scripts/prepare-aliyun-runtime-env.mjs \
  --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.example \
  --allow-todo
```

### 3.2 只读盘点 Vercel production 变量名

旧 Vercel 项目是桥接期的变量来源之一，但这里只读取变量名、环境和加密状态，不读取、不导出真实 value：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:vercel-env:coverage
```

默认输出无密钥报告：

```text
/tmp/meiye-vercel-env-coverage.json
```

这个报告回答三件事：

```text
Vercel production 里已经有哪些变量名
阿里云 production-cn 导入计划里哪些变量名在 Vercel production 缺失
哪些缺口是 APP 国内版新增项，例如 api-cn 域名变量、正式协议 URL、WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET
```

如果已经在浏览器或 CLI 里保存了 `vercel env ls production --format json` 输出，也可以离线解析：

```bash
node scripts/check-vercel-env-coverage.mjs \
  --input /tmp/meiye-vercel-env-production.json \
  --write-report /tmp/meiye-vercel-env-coverage.json
```

这一步不等于阿里云已导入环境变量。它只证明旧 Vercel 里有哪些名称可迁移，正式导入仍以阿里云 SAE/ECS/KMS/Secrets Manager 控制台和 `aliyun:cloud:check` 为准。

### 3.3 生成阿里云控制台导入 JSON

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

机器检查：

```bash
corepack pnpm aliyun:domain:check
```

阿里云 DNS、证书和后端部署都完成后，必须改跑严格模式：

```bash
corepack pnpm aliyun:domain:strict
```

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

iOS Universal Link 还需要一个 Apple Developer 侧的非密钥变量：

```text
APPLE_TEAM_ID
```

来源：

```text
Apple Developer
-> Membership 或 Certificates, Identifiers & Profiles
-> Identifiers
-> 美业话镜 App ID
-> Team ID
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
移动应用名称：美业话镜
Android applicationId / 包名：com.ipgongchang.meiyehuajing
Android 应用签名：用正式 release keystore 生成，并把同一份 release 证书签名填入微信开放平台；密钥值不进入仓库
iOS Bundle ID：com.ipgongchang.meiyehuajing
iOS Universal Link：https://api-cn.ipgongchang.xin/app/wechat/
iOS AASA：https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association
```

其中移动应用名称、Android 包名、iOS Bundle ID 已能从当前 APP 工程核对；iOS Associated Domains 已在当前 Xcode target 的 entitlements 中配置为 `applinks:api-cn.ipgongchang.xin`。Android 应用签名、微信开放平台 iOS Universal Link、Apple Developer Team ID 和部署后的 AASA 返回仍需要在微信开放平台移动应用配置页、Apple Developer / 阿里云域名环境里确认。`APPLE_TEAM_ID` 从 Apple Developer 的 Membership 或 App ID 页面获取，不是密钥；后端 AASA 路由会用它生成 `appID`。

当前浏览器自动化不能打开 `open.weixin.qq.com`，需要用户手工登录后提供或手工填入本机 `.env.production-cn.local` 与 `deploy/aliyun-production-cn.cloud-confirmations.local.json`。

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
corepack pnpm aliyun:env:sources
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:image:plan
corepack pnpm aliyun:legal:check
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:readiness
corepack pnpm aliyun:routes:check
corepack pnpm aliyun:app-api:bridge-map
corepack pnpm aliyun:app-client:contract
corepack pnpm aliyun:app-native:check
corepack pnpm aliyun:aasa:check
corepack pnpm aliyun:app-api:coverage
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
corepack pnpm aliyun:container:smoke
```

部署后验证：

```bash
corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin
```

分步排查命令：

```bash
corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin
corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin
```

如果是微信开放平台变量或正式协议 URL 尚未补齐的桥接调试阶段，只允许显式放行已知缺口：

```bash
corepack pnpm aliyun:postdeploy:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin,legalLinks

corepack pnpm aliyun:remote:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin,legalLinks
```

`aliyun:remote:smoke` 会检查 `/api/healthz`、`/api/app/health`、`/api/app/health?strict=1` 的响应结构，并拒绝包含敏感字段名的 health 响应。

也可以单独跑 APP API 入口 smoke：

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
2. 需要确认阿里云 ACR 镜像仓库、remote image、digest 和 SAE/ECS 镜像拉取配置。
3. 需要微信开放平台移动应用 AppID / AppSecret。
4. 需要确认隐私政策和用户协议正式 URL。
5. 正式数据层迁移到 RDS PostgreSQL 还未开始。
6. Redis/Tair、SLS、KMS/Secrets Manager 还未确认。
```

也可以直接运行：

```bash
corepack pnpm aliyun:readiness
```

当前该门禁会把机器可验证阻塞和人工确认项分开列出。机器可验证阻塞解除后，仍需阿里云资源与微信开放平台移动应用配置确认，才能称为 production-cn 可发布。

`aliyun:readiness` 同时检查 App 工程的 production-cn 配置模板：

```text
APP files checked: .env.production-cn.example、package.json、generate-app-runtime-config、validate-package0、bootstrap、build-config.generated
APP scripts checked: config:generate:production-cn、config:check:production-cn、config:check:template、android:assemble:production-cn、validate:package0
APP env template canonical keys: APP_ENV、APP_API_BASE_URL、APP_ASSET_BASE_URL、PRIVACY_POLICY_URL、TERMS_URL
APP env template forbidden backend/secret keys: WECHAT_OPEN_APP_ID、WECHAT_OPEN_APP_SECRET、SUPABASE_SERVICE_ROLE_KEY、ALIYUN_OSS_ACCESS_KEY_SECRET、DASHSCOPE_API_KEY、DEEPSEEK_API_KEY、VOLC_SPEECH_ACCESS_TOKEN
```

在这些阻塞解除前，只能完成本地桥接准备和部署脚手架，不能称为 APP 国内正式生产上线完成。

## 8. 2026-06-21 本地验证状态

已通过：

```text
node scripts/prepare-aliyun-runtime-env.mjs --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.example --allow-todo
node --check scripts/check-aliyun-production-cn-readiness.mjs
node --check scripts/check-app-api-bridge-map.mjs
node --check scripts/check-app-native-release-config.mjs
node --check scripts/check-apple-app-site-association.mjs
node --check scripts/check-app-legal-pages.mjs
node --check scripts/prepare-aliyun-release-artifacts.mjs
node --check scripts/generate-aliyun-operator-tasks.mjs
node --check scripts/run-aliyun-predeploy.mjs
node --check scripts/run-aliyun-container-smoke.mjs
node --check scripts/check-aliyun-cloud-confirmations.mjs
node --check scripts/check-aliyun-deployment-spec.mjs
node --check scripts/check-aliyun-image-publish-plan.mjs
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/app-api-production-cn.bridge-map.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.image-publish.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.example.json','utf8'))"
corepack pnpm aliyun:readiness
corepack pnpm aliyun:env:sources（62 variables / 62 source metadata ready）
corepack pnpm aliyun:image:plan（template ready / local missing）
corepack pnpm aliyun:legal:check（/privacy 与 /terms route files ready；正式 URL env 仍允许缺失）
corepack pnpm aliyun:operator:tasks
corepack pnpm aliyun:cloud:confirmations（template ready / local 21 blockers）
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:release:artifacts
corepack pnpm aliyun:predeploy
corepack pnpm aliyun:routes:check（31 routes / 0 failures）
corepack pnpm aliyun:app-api:bridge-map（31 mapped routes / sourceTypes: mp_reexport 22, mp_adapter 5, app_native 1, app_alias 1, native_health 2）
corepack pnpm aliyun:app-client:contract（40 audited calls / 34 unique client routes）
corepack pnpm aliyun:app-native:check（当前 ok=true；Android release 已切到 signingConfigs.release；iOS Associated Domains 已配置 applinks:api-cn.ipgongchang.xin；真实 Android keystore 值仍需由本机 Gradle properties 或环境变量提供）
corepack pnpm aliyun:aasa:check（当前 ok=false；AASA route exists；APPLE_TEAM_ID 缺失）
corepack pnpm aliyun:app-api:coverage（29 / 29 business routes covered）
corepack pnpm aliyun:docker:check（7 files / 24 dockerignore patterns / sensitive env excluded）
corepack pnpm aliyun:container:smoke（Docker health + 30 APP API probes / sanitized env deleted）
node --check scripts/check-aliyun-domain-readiness.mjs
corepack pnpm aliyun:domain:check（状态看板 exit 0；当前 ok=false）
corepack pnpm aliyun:deploy:spec（image meiye-huajing-app-api:production-cn / port 3000 / predeploy 18 / postdeploy 5）
corepack pnpm aliyun:remote:smoke -- --base-url http://127.0.0.1:3022 --allow-missing appWechatLogin,legalLinks
corepack pnpm aliyun:env:check
corepack pnpm exec tsc --noEmit --pretty false
corepack pnpm release:preflight
corepack pnpm build
corepack pnpm aliyun:health:smoke
corepack pnpm aliyun:app-api:smoke
corepack pnpm aliyun:remote:smoke -- --base-url http://127.0.0.1:PORT --allow-missing appWechatLogin,legalLinks
npm run typecheck
npm run lint
npm test -- --runInBand（38 suites / 119 tests）
android ./gradlew assembleDebug
```

2026-06-22 05:47 CST 复核：新增小程序链路桥接门禁后，`corepack pnpm aliyun:predeploy` 再次通过；`aliyun:app-api:bridge-map` 输出 31 mapped routes，29 bridge-ready routes，2 WeChat env-blocked routes。

`aliyun:readiness` 当前机器可验证阻塞：

```text
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
wechat_open_platform_mobile_app_reviewing 或 wechat_open_platform_mobile_app_not_ready
invalid_app_universal_link_config
app_universal_link:apple_team_id_missing
```

2026-06-22 05:52 CST 更新：本机 `.env.production-cn.local` 已补入 `PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy` 与 `TERMS_URL=https://api-cn.ipgongchang.xin/terms`，`corepack pnpm aliyun:legal:strict` 通过；`aliyun:readiness` requiredReady 为 23/25，必需变量只剩 `WECHAT_OPEN_APP_ID` 和 `WECHAT_OPEN_APP_SECRET` 未 ready。

2026-06-22 05:57 CST 复核：协议 URL ready 后重新运行 `corepack pnpm aliyun:predeploy`，通过；env requiredReady 23/25，health smoke 只缺 `appWechatLogin`，App API smoke 30 probes / 0 failures。

2026-06-21 21:45 CST 更新：本机 `.env.production-cn.local` 已补入非密钥域名：

```text
APP_API_BASE_URL=https://api-cn.ipgongchang.xin
NEXT_PUBLIC_SITE_URL=https://api-cn.ipgongchang.xin
APP_ASSET_BASE_URL=https://assets-cn.ipgongchang.xin
```

这些值只表示本地目标配置已补齐；正式发布仍要由 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 确认 DNS、HTTPS、ICP、OSS/CORS/RAM 和 SLS。

2026-06-22 追加：后端包已提供 APP 国内版协议页面落点：

```text
GET /privacy
GET /terms
```

本地门禁：

```bash
corepack pnpm aliyun:legal:check
```

该门禁只证明页面文件和核心字段存在，不代表运营者已经确认正式法律文本。本机当前已按推荐落点填入：

```text
PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy
TERMS_URL=https://api-cn.ipgongchang.xin/terms
```

如果最终使用独立 APP 站点域名，也可以改为同路径的 `https://app-cn.ipgongchang.xin/privacy` 和 `https://app-cn.ipgongchang.xin/terms`，但必须保持 APP 构建配置、阿里云运行环境和应用商店提交材料一致。

域名机器检查命令：

```bash
corepack pnpm aliyun:domain:check
corepack pnpm aliyun:domain:strict
```

`aliyun:domain:check` 可以作为当前状态看板；`aliyun:domain:strict` 只有在 api-cn/assets-cn DNS、HTTPS 和 api-cn `/api/healthz` 都 ready 后才会通过。

2026-06-21 22:36 CST 实测结果：

```text
targetReady: 0 / 3
APP_API_BASE_URL: api-cn.ipgongchang.xin -> A 198.18.0.5, dns_special_use_ip, HTTPS ECONNRESET
NEXT_PUBLIC_SITE_URL: api-cn.ipgongchang.xin -> A 198.18.0.5, dns_special_use_ip, HTTPS ECONNRESET
APP_ASSET_BASE_URL: assets-cn.ipgongchang.xin -> A 198.18.0.6, dns_special_use_ip, HTTPS ECONNRESET
```

因此当前域名不是 production ready。下一步需要把 `api-cn` / `assets-cn` 解析到公网可访问的阿里云 SAE/SLB/ECS 或 OSS/CDN 入口，并配置 HTTPS 证书；之后再跑 `corepack pnpm aliyun:domain:strict`。

`aliyun:cloud:check` 当前云确认状态：

```text
cloudConfirmations.mode: file
cloudConfirmations.ready: false
path: deploy/aliyun-production-cn.cloud-confirmations.local.json
runtime missing: confirmed
apiDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
oss missing: confirmed, corsConfigured, ramLeastPrivilege
wechatOpenPlatform missing: confirmed, mobileAppIdReady, mobileAppSecretReady, androidSignature, androidConfigured, iosUniversalLink, iosConfigured, reviewStatus=approved
envImport missing: confirmed, secretNotInImage
slsAlerts missing: confirmed, healthAlertConfigured, serverErrorAlertConfigured
```

`APP_ASSET_BASE_URL` 已按 `https://assets-cn.ipgongchang.xin` 写入本地配置，但资产域名和 OSS/CDN 仍未人工确认为 production ready。

最新发布审计产物：

```text
/tmp/meiye-huajing-aliyun-production-cn-*/release-audit.md
/tmp/meiye-huajing-aliyun-production-cn-*/operator-tasks.json
/tmp/meiye-huajing-aliyun-production-cn-*/operator-tasks.md
/tmp/meiye-huajing-aliyun-production-cn-*/domain-readiness.json
/tmp/meiye-huajing-aliyun-production-cn-*/meiye-huajing-app-api-production-cn-context.tar.gz
```

2026-06-22 03:56 CST 最新不打包审计目录：

```text
/tmp/meiye-huajing-aliyun-production-cn-2026-06-21T19-56-07-018Z
```

该目录包含不含密钥的 `release-audit.*`、`env-import-plan.json`、`vercel-env-coverage.json`、`image-publish-plan-check.json`、`domain-readiness.json`、`cloud-confirmations-check.json`、`operator-tasks.*`。当前摘要：

```text
productionReady: false
localCodeReady: false
Vercel required coverage: 17 / 25
imagePublishPlan: localDockerImage ready, ACR/runtime blockers 16
cloudConfirmations: local blockers 21
appClientContract: 40 audited calls / 34 unique client routes
appApiSmokeCoverage: 29 / 29 business routes
```

本轮为 `--skip-bundle` 审计，未重新生成 context tar；Docker context 和镜像已由 `aliyun:docker:check`、`aliyun:docker:build`、`aliyun:container:smoke` 覆盖。

2026-06-22 03:54 CST 更新：本机 Docker Desktop 已启动，`corepack pnpm aliyun:docker:build` 已成功构建镜像。该镜像包含 health/readiness 对国内 APP 正式协议 URL 的基础形态校验：

```text
repoTag: meiye-huajing-app-api:production-cn
imageDigest: sha256:07fa9b095c1897e28a8cfdfd5d2510f01fe4e1c7af0e79cf267204d551a88ed8
imageId: sha256:07fa9b095c1897e28a8cfdfd5d2510f01fe4e1c7af0e79cf267204d551a88ed8
imageSize: 726504043 bytes
architecture: linux/arm64
```

`corepack pnpm aliyun:container:smoke` 已用该镜像完成本地容器验证：

```text
containerHealth: /api/healthz 200, /api/app/health 200, strict health 503 for expected appWechatLogin only
appApiSmoke: 30 probes / 0 failures
sanitizedEnvFileDeleted: true
```

2026-06-22 06:01 CST 更新：协议 URL ready 后重新运行 `corepack pnpm aliyun:container:smoke`，通过；容器内 `/api/healthz`、`/api/app/health` 为 200，strict health 为 503 且 missing 只剩 `appWechatLogin`，App API smoke 30 probes，临时 sanitized env file 已删除。

最新 `aliyun:readiness` 中 Docker 状态为 `ready`，`corepack pnpm aliyun:image:plan` 也能识别本地镜像。本机已创建 ignored 非密钥草稿 `deploy/aliyun-production-cn.image-publish.local.json`，当前只填了 local image digest。正式部署仍需要把该镜像推送/导入到阿里云 ACR，或使用阿里云镜像构建服务从审计包/源码上下文构建，并把 remote image / digest / 运行时拉取证据补入该 local 文件后通过 `corepack pnpm aliyun:image:plan:strict`。

如果 `corepack pnpm aliyun:image:plan` 报 `localDockerImage=image_not_found_or_docker_unavailable`，说明当前 Docker daemon 里没有可推送的本地镜像缓存；正式推送前重新执行 `corepack pnpm aliyun:docker:build` 和 `corepack pnpm aliyun:container:smoke`。

2026-06-22 03:54 CST 复核：`corepack pnpm aliyun:image:plan` 当前能识别本机镜像：

```text
localDockerImage.status: ready
localDockerImage.id: sha256:07fa9b095c1897e28a8cfdfd5d2510f01fe4e1c7af0e79cf267204d551a88ed8
localDockerImage.size: 726504043
```

`deploy/aliyun-production-cn.image-publish.local.json` 作为 ignored 非密钥草稿已同步到该 local digest。ACR remote image / digest 仍未填写，不能视为阿里云镜像已发布。

本地 production server 已用 `.env.production-cn.local` 做过 HTTP 验证：

```text
GET /api/healthz -> 200, ok:false, missing:[appWechatLogin, legalLinks]
GET /api/app/health -> 200, ok:false, missing:[appWechatLogin, legalLinks]
GET /api/app/health?strict=1 -> 503, ok:false, missing:[appWechatLogin, legalLinks]
sensitiveLeakCount -> 0
```

2026-06-22 05:52 CST 更新：协议 URL ready 后再次运行 `corepack pnpm aliyun:health:smoke`，`/api/healthz` 与 `/api/app/health` 仍为 200，strict health 仍为 503，但 missing 已从 `[appWechatLogin, legalLinks]` 变为只剩 `[appWechatLogin]`，`sensitiveLeakCount` 仍为 0。

本地 production server 也已用未登录/假 token 请求验证第一版 APP API 入口：

```text
checkedProbes: 30
appClientContract: 40 audited calls / 34 unique client routes, 4 deferred knowledge-space calls, 0 failures
appApiSmokeCoverage: 29 / 29 business routes
scopes:
- auth: 2
- account: 2
- context: 6
- invites: 4
- service-records: 13
- store-admin: 3
结果：0 failures，入口均进入预期的 missing_code / auth_required / invite_not_found 分支。
```

`PRIVACY_POLICY_URL` / `TERMS_URL` 的 ready 判定现在不只是“有值”：后端 health/readiness 和 APP runtime/build-time config 都要求 HTTPS，且不能是 localhost、example、`.vercel.app` 或旧 Vercel 入口域名。当前 TODO 微信开放平台变量不会被健康检查或 APP 正式包配置误判为 ready。
