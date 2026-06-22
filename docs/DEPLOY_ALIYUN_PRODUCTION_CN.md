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
第一版部署入口：阿里云 SAE 自定义容器
地域：cn-hangzhou
SAE 应用名：meiye-huajing-app-api-production-cn
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

### 2.0 阿里云 SAE 运行时计划

第一版 APP 国内后端桥接部署目标已经固定为 SAE，而不是继续停留在“SAE 或 ECS 二选一”的描述：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:runtime:plan
```

非密钥运行时计划文件：

```text
deploy/aliyun-production-cn.runtime-plan.json
```

该文件只保存平台、地域、应用名、容器端口、健康检查、域名、ACR 镜像计划和云确认文件路径，不保存任何 AppSecret、AccessKey、Supabase key 或 token。ECS 只作为 SAE 不能满足运行约束时的备选方案；除非另开部署决策，不再作为第一版主路径。

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

这一步确认镜像已经推送/导入阿里云 ACR，并且 SAE 运行时已经配置为拉取该 remote image。它不执行 `docker login`、不推送镜像、不创建 ACR 仓库。

当前控制台核验结果：

```text
ACR 个人版：可进入创建页，但页面提示个人版无 SLA 且有使用限制，请勿在生产业务中使用。
ACR 企业版：入口存在，属于生产级实例选择/购买路径。
ACR 企业版经济版：2026-06-22 控制台核到 cn-hangzhou / 1 个月候选报价 CNY 117.00，尚未购买。
```

因此正式 production-cn 不应把个人版 ACR 当作最终生产证据。若只是桥接调试，可以单独标记为 diagnostic；正式发布需要选择企业版 ACR，或改用阿里云镜像构建/SAE 支持的其它生产级镜像来源，并把 remote image、digest 和运行时拉取证据写入 `deploy/aliyun-production-cn.image-publish.local.json`。ACR 企业版购买是明确付费动作，未取得用户对规格和金额的动作前确认时，只能在 local 文件里记录 `purchaseCandidate`，不能把 `acr.confirmed` 改成 true。

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

`aliyun:domain:check` 读取 `.env.production-cn.local` 中的 `APP_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL` 和 production-cn 必填的 `APP_ASSET_BASE_URL`，只输出非密钥域名状态。它会检查：

```text
1. 域名必须是 HTTPS，不能是 localhost、example、Vercel 或旧线上域名。
2. APP_API_BASE_URL / NEXT_PUBLIC_SITE_URL 必须使用 api-cn.*。
3. APP_ASSET_BASE_URL 必须填写，并且必须使用 assets-cn.*。
4. DNS 至少存在 A / AAAA / CNAME 记录，且不能指向 Vercel。
5. api-cn 的 /api/healthz 必须能通过 HTTPS 返回 2xx。
```

只看状态时使用 `aliyun:domain:check`，它会列出阻塞但退出 0；生产发布或部署后验收使用严格模式：

```bash
corepack pnpm aliyun:domain:strict
```

严格模式在 DNS、HTTPS 或 `/api/healthz` 未 ready 时会失败。ICP备案状态仍不能只靠本机命令证明，需要在 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 的 `apiDomainHttps` 和 `assetDomainHttps` 里分别写非密钥证据。

### 2.3 Production-cn readiness 门禁

如果要给阿里云/微信后台操作员看下一步清单，先跑：

```bash
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:runtime:plan
corepack pnpm aliyun:image:plan
corepack pnpm aliyun:legal:check
corepack pnpm aliyun:cloud:access
corepack pnpm aliyun:status
corepack pnpm aliyun:operator:tasks
corepack pnpm aliyun:sensitive:blockers
corepack pnpm aliyun:resources:matrix
corepack pnpm aliyun:user:actions
corepack pnpm aliyun:operator:handoff
```

这些命令不输出任何密钥值，也不会创建资源、导入变量或推送镜像。`aliyun:legal:check` 只确认后端包内 `/privacy` 和 `/terms` 页面存在、核心字段完整，并允许正式 URL 仍未填入 env；`aliyun:deploy:spec` 校验 `deploy/aliyun-production-cn.example.json` 的镜像、端口、ACR 发布计划、SAE runtime plan、域名、健康检查、前后置门禁顺序和 8 项外部确认；`aliyun:runtime:plan` 校验 `deploy/aliyun-production-cn.runtime-plan.json` 是否仍指向 `cn-hangzhou` 的 SAE 自定义容器、端口 3000 和 `api-cn.ipgongchang.xin`；`aliyun:cloud:access` 只检查本机是否具备阿里云 CLI 只读 inventory 条件，并输出 SAE/ACR/DNS/OSS/SLS 控制台要记录的非密钥证据字段，不调用阿里云 API；`aliyun:status` 是给当前发布负责人看的只读总览，会把本地门禁、微信审核、Apple Universal Link、阿里云云资源确认、域名和 ACR 镜像证据压缩成一个 JSON 摘要；`aliyun:operator:tasks` 会把当前 `readiness`、`domain`、`.env.production-cn.local`、`image-publish.local.json` 和 `cloud-confirmations.local.json` 汇总为 9 个任务；`aliyun:sensitive:blockers` 会把 operator tasks 里的密钥、密码、token、付款和受控标识符类人工介入项单独压缩成无密钥清单；`aliyun:resources:matrix` 会把 SAE、ACR、api-cn、assets-cn、OSS、env import 和 SLS 这 7 个阿里云资源项压缩成资源矩阵，列出控制台路径、写入的 `.local.json` 字段、当前 blocker、验收命令和是否需要动作时确认；`aliyun:user:actions` 会把微信移动应用、Apple Team ID、ACR 付费、OSS/RAM、环境变量导入、DNS/HTTPS/ICP、SAE/SLS 和最终部署授权整理成给用户看的单页动作简报；`aliyun:operator:handoff` 是给用户、阿里云操作员、微信开放平台操作员和发布负责人共用的非密钥操作包，适合直接判断“现在缺什么、去哪里拿、导入哪里”。它还会读取 Vercel production 的变量名元数据，列出哪些旧后端桥接变量已在 Vercel 中存在、哪些 production-cn 必填变量仍缺，并把 `cloud-confirmations.local.json` 与 `image-publish.local.json` 仍待填写的 JSON path、控制台来源、期望证据和禁止写入的敏感值逐项列出；这一步不读取值、不导出密钥，也不等于已导入阿里云。

```text
T01 微信开放平台移动应用审核和 APP 登录凭证
T02 国内 APP 隐私政策和用户协议正式 URL
T03 阿里云 SAE 后端运行容器
T03B 发布后端 Docker 镜像到阿里云 ACR 并配置运行时拉取
T04 api-cn/assets-cn DNS、HTTPS 和 ICP 证据
T05 服务记录音频 OSS、CORS 和 RAM 最小权限
T06 production-cn 运行环境变量导入
T07 SLS 日志和健康/5xx 告警
T08 阿里云部署后远端 smoke 验收
```

如需生成文件给人工核对：

```bash
node scripts/summarize-aliyun-production-cn-status.mjs \
  --out /tmp/meiye-aliyun-production-cn-status.json \
  --markdown /tmp/meiye-aliyun-production-cn-status.md

node scripts/generate-aliyun-operator-tasks.mjs \
  --out /tmp/meiye-aliyun-operator-tasks.json \
  --markdown /tmp/meiye-aliyun-operator-tasks.md

node scripts/generate-aliyun-operator-handoff.mjs \
  --out /tmp/meiye-aliyun-operator-handoff.json \
  --markdown /tmp/meiye-aliyun-operator-handoff.md
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
8. ACR 镜像发布计划和 SAE 运行时镜像拉取配置是否有非密钥证据。
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

`aliyun:readiness:cloud-ready` 会读取 `deploy/aliyun-production-cn.cloud-confirmations.local.json`。7 项云确认没有全部 ready 前，它仍会失败。`aliyun:readiness:assume-cloud-ready` 只保留给临时本地诊断，不能作为正式发布门禁；该命令会强制输出 `diagnosticOnly=true`、`releaseEvidenceUsable=false`，即使其它本地项通过，也不能作为上线证据。

`aliyun:cloud:confirmations` 会同时校验 example 模板和本机 `.local.json`：模板必须结构有效，本机文件可以在看板模式下列出未完成项。严格发布前使用：

```bash
corepack pnpm aliyun:cloud:confirmations:strict
```

严格模式会在 SAE、DNS/HTTPS/ICP、OSS/CORS/RAM、微信开放平台 approved、环境变量导入、SLS 告警任一项未确认时失败。确认文件只能写资源名、布尔状态、证据编号或控制台路径，不能写任何 AppSecret、AccessKey、Token、Service Role Key。

非密钥部署样例：

```text
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.example.json
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.runtime-plan.json
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
production-cn-status.json
production-cn-status.md
operator-tasks.json
operator-tasks.md
sensitive-blockers.json
sensitive-blockers.md
resource-matrix.json
resource-matrix.md
user-action-brief.json
user-action-brief.md
operator-handoff.json
operator-handoff.md
env-import-plan.json
cloud-access.json
vercel-env-coverage.json
app-api-bridge-map-check.json
runtime-plan.json
meiye-huajing-app-api-production-cn-context.tar.gz
```

该脚本会复用当前 readiness、env、routes、小程序链路桥接清单、SAE runtime plan、Docker context 和 `aliyun:cloud:access` 检查，并默认尝试生成 Vercel production 变量名覆盖报告。Vercel 覆盖报告只包含变量名、环境和加密/敏感元数据，不包含真实 value；如果 Vercel 登录态不可用，会在审计里记录失败，不阻断本地发布审计包生成。

`production-cn-status.json` 和 `production-cn-status.md` 是 `aliyun:status` 的打包输出，供发布负责人快速判断当前能否上线、还缺哪些微信/阿里云/Apple 证据。`sensitive-blockers.json/md` 单独列密钥、密码、token、付款和受控标识符类人工介入项；`resource-matrix.json/md` 单独列 7 个阿里云资源项、控制台路径、写入字段、当前 blocker 和验收命令；`user-action-brief.json/md` 单独列用户/操作员动作项、获取位置、写入目标和动作时确认边界。`operator-handoff.json` 和 `operator-handoff.md` 是当前唯一建议交给人工操作员的非密钥操作包：微信开放平台 `reviewStatus=not_started` 时先创建“美业话镜”移动应用并提交审核；`reviewStatus=reviewing` 时等待审核通过；审核通过后才从移动应用详情读取 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，不要复用小程序 AppID / Secret。操作包会把 `APPLE_TEAM_ID` 单独列为 APP 发布/AASA 阻塞项：它不是后端必填密钥，但 iOS Universal Link 验收需要它生成 AASA `appID`。操作包也会内置 `cloudAccess` 摘要：当前机器是否有 `aliyun` CLI、是否已经能做只读云 inventory、以及 SAE/ACR/DNS/OSS/env/SLS 需要从控制台抄录到 `.local.json` 的非密钥字段。

2026-06-22 17:12 CST 追加：`aliyun:user:actions` 的每个动作项新增 `currentBlockers` 和 `currentEvidence`。这两个字段只来自 readiness、resource matrix 和 ignored 的 `cloud-confirmations.local.json` 非密钥字段，用来直接说明“为什么当前还没 ready”。例如微信动作会显示 `accountVerified=true`、`mobileAppCreated=false`、`mobileAppSubmitted=false`、`reviewStatus=not_started`；域名动作会显示 api-cn/assets-cn 的 DNS、HTTPS、ICP 布尔状态；最终部署授权动作会显示 `canDeployNow=false` 和 `cloudConfirmations=0/7`。

2026-06-22 15:35 CST 追加：已通过 Chrome 重新连接阿里云 Cloud Shell，只执行只读基础命令 `date`、`whoami`、`aliyun version`、`aliyun configure list`。Cloud Shell 本身可启动，`aliyun` CLI 版本为 `3.3.23`，但当前临时环境缺 `/home/shell/.aliyun/config.json`，因此不能做自动云 API inventory；`cloudApiCalled=false`、`cloudMutationPerformed=false`。新增 `deploy/aliyun-production-cn.cloud-access.example.json` 和 ignored 的 `.local.json` 观察文件，`aliyun:cloud:access` / `aliyun:operator:handoff` 会输出 `cloudShellCanRunReadOnlyInventory=false`，避免把 Chrome 控制台登录态误读成 CLI/API 已可读。

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

它用于回答“这个变量去哪里拿、由谁确认、导入阿里云哪里”。例如 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 的来源是微信开放平台移动应用，不是小程序后台；`PRIVACY_POLICY_URL` / `TERMS_URL` 的来源是正式 HTTPS 协议页面；`APP_ASSET_BASE_URL` 对应 `assetDomainHttps`，OSS Bucket/CORS/RAM 对应 `oss`；百炼、DeepSeek、火山语音、Supabase 桥接变量会分别标出对应控制台或旧 Vercel production 变量来源。

生成给阿里云操作员看的 Markdown 导入清单：

```bash
corepack pnpm aliyun:env:checklist
```

默认输出：

```text
/tmp/meiye-aliyun-env-import-plan.json
/tmp/meiye-aliyun-env-import-checklist.md
```

Markdown 清单会按“必填阻塞变量 / 可直接导入的 Plain Env / 可直接导入的 Secret Env / 可后置或空缺变量”分组，只包含变量名、状态、来源、获取位置、导入目标和动作，不包含任何 value。

`corepack pnpm aliyun:operator:tasks`、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:sensitive:blockers` 和 `corepack pnpm aliyun:operator:handoff` 还会额外输出 `sensitiveActionItems`，专门回答“还需要用户介入哪些密钥、密码、token 或付款动作”。该字段只列变量名、控制台路径、动作、解除条件和禁止事项，不输出任何 value。当前会把微信开放平台移动应用 AppID/AppSecret、Apple Team ID、ACR 企业版付费确认、ACR/SAE 镜像拉取认证、OSS RAM Secret 或 STS 注入、以及本地已有 ready 值但尚未导入阿里云的敏感/连接类变量组分开列出；其中 `WECHAT_OPEN_APP_ID` 是服务端标识符，导入阿里云 SAE plain env，`WECHAT_OPEN_APP_SECRET` 才走 KMS/Secrets Manager/SAE secret env。`aliyun:sensitive:blockers` 会额外执行 secret-like 输出扫描，只有在报告不含疑似密钥值时才通过。`corepack pnpm aliyun:resources:matrix` 则回答“阿里云上到底要开通/确认哪些资源”：它只列资源项、控制台路径、非密钥字段、当前 blocker 和验收命令，不输出任何 value，也不会执行创建、付款、DNS 修改、镜像推送或部署。

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

这一步不等于阿里云已导入环境变量。它只证明旧 Vercel 里有哪些名称可迁移，正式导入仍以阿里云 SAE/KMS/Secrets Manager 控制台和 `aliyun:cloud:check` 为准。

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

### 4.1 SAE 自定义容器

按 `deploy/aliyun-production-cn.runtime-plan.json` 创建或确认 SAE 应用：

```text
地域：cn-hangzhou
应用名：meiye-huajing-app-api-production-cn
运行时：自定义容器
端口：3000
健康检查：/api/healthz
环境变量：从 .env.production-cn.local 导入非 TODO 值
```

ECS 只作为 SAE 不能满足运行约束时的备选：

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

2026-06-22 14:18 CST 实测：`api-cn.ipgongchang.xin` 当前 A 记录为 `198.18.0.7`，`assets-cn.ipgongchang.xin` 当前 A 记录为 `198.18.0.8`；二者均为特殊用途地址，HTTPS 探测为 `ECONNRESET`，还不能作为阿里云公网入口证据。

2026-06-22 15:24 CST 通过已登录 Chrome 只读查看阿里云 DNS 控制台：`ipgongchang.xin` 当前显示 13 条解析记录，但阿里云 DNS 控制台未显示显式 api-cn/assets-cn 记录；权威 DNS 查询仍返回 `api-cn.ipgongchang.xin -> 198.18.0.7`、`assets-cn.ipgongchang.xin -> 198.18.0.8`，且随机子域也返回特殊用途地址。`api-cn/assets-cn` 当前命中 `198.18.0.0/15` 这类特殊用途占位解析，不能作为公网入口；需要先清理泛解析/占位解析，再把 `api-cn` 指向 SAE/SLB 等后端入口，把 `assets-cn` 指向 OSS/CDN 等资产入口，并配置 HTTPS/ICP。`aliyun:domain:check` 已增加 `dns_special_use_wildcard_ip` 门禁和 `wildcardProbe` 输出，避免误把泛解析占位当成已接通。

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

当前 Chrome 只读核验看到的 OSS Bucket 是 `meiye-service-records-20260611`，地域为 `oss-cn-beijing` / 华北2（北京）。这说明账号下已有服务记录相关 Bucket，但它不满足当前 production-cn 主部署目标 `cn-hangzhou` 的一致地域约束，不能直接作为正式 ready 证据。

需要确认：

```text
Bucket 地域为 cn-hangzhou
Bucket 私有读
服务端使用短期签名 URL
CORS 允许 APP 上传所需方法和 Header
RAM 权限最小化到服务记录音频前缀
```

当前 production-cn 目标 Bucket 已调整为：

```text
Bucket: meiye-huajing-service-records-production-cn
Region: cn-hangzhou
Prefix: service-records/production-cn/
```

RAM 最小权限策略模板见：

```text
deploy/aliyun-production-cn.oss-ram-policy.json
```

该模板只允许 `oss:GetObject`、`oss:PutObject`、`oss:PostObject` 访问
`acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*`。
2026-06-22 已通过阿里云 Cloud Shell 创建自定义策略 `MeiyeHuajingServiceRecordsOssPolicy`，
但尚未绑定到 RAM 用户/角色，也没有生成或导入 OSS AccessKey / STS token。
创建/绑定 RAM 用户或角色、生成 `ALIYUN_OSS_ACCESS_KEY_SECRET`、导入 SAE/KMS/Secrets Manager
都属于密钥动作，不写入文档、JSON 或 git。

后端 OSS 签名链路兼容两种凭证形态：

```text
长期或受限 AccessKey：ALIYUN_OSS_ACCESS_KEY_ID + ALIYUN_OSS_ACCESS_KEY_SECRET
临时 STS 凭证：额外注入 ALIYUN_OSS_SECURITY_TOKEN
```

如果 `ALIYUN_OSS_SECURITY_TOKEN` 存在，直传 POST policy 会返回 `x-oss-security-token`
表单字段，临时 GET 签名 URL 会追加 `security-token` 查询参数。该 token 仍按密钥处理，
只能进入 SAE/KMS/Secrets Manager，不能写入镜像、文档或 git。

### 4.5 日志与告警

已创建 SLS 基础资源：

```text
Project: meiye-huajing-app-prod-cn
Region: cn-hangzhou
Logstore: app-api
Retention: 30 days
```

仍需在 SAE 应用创建并接入日志后补：

```text
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
runtime：阿里云 SAE 应用详情，确认端口 3000 和 /api/healthz。
apiDomainHttps：阿里云 DNS / 证书服务 / 备案信息，确认 api-cn 已解析到阿里云并启用 HTTPS。
assetDomainHttps：阿里云 DNS / 证书服务 / 备案信息，确认 assets-cn 已解析到 OSS/CDN 或静态资源入口并启用 HTTPS。
oss：OSS Bucket CORS、RAM 策略和 service-records/production-cn 前缀。
wechatOpenPlatform：微信开放平台移动应用审核状态、Android 包名/签名、iOS Bundle ID/Universal Link。
envImport：SAE/KMS/Secrets Manager 环境变量导入记录，确认密钥没有写进镜像。
slsAlerts：SLS 项目和健康检查失败、5xx 告警配置。
```

检查命令：

```bash
corepack pnpm aliyun:cloud:confirmations
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

它不包含真实 value，可用于进阿里云 SAE/KMS/Secrets Manager 控制台时逐项核对。真正带 value 的导入文件只能用下面命令写到仓库外临时路径，并在导入后删除：

如果要给操作员一份更容易读的 Markdown 清单，使用：

```bash
corepack pnpm aliyun:env:checklist
```

这会同时写出 `/tmp/meiye-aliyun-env-import-plan.json` 和 `/tmp/meiye-aliyun-env-import-checklist.md`。`corepack pnpm aliyun:release:artifacts` 也会在审计包内自动生成 `env-import-checklist.md`。

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

如果微信开放平台移动应用已提交审核，审核中仍不能发布，只能把 blocker 从 `wechat_open_platform_mobile_app_not_ready` 细分为 `wechat_open_platform_mobile_app_reviewing`，并在操作员任务里显示为 `waiting_wechat_review`。这表示 APP 已进入审核流程，不是还缺创建 APP；审核通过后再填 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。

2026-06-22 14:52 CST 更新：用户澄清当前只是微信开放平台账号认证成功，移动应用还没创建。本机应把 `WECHAT_OPEN_APP_REVIEW_STATUS` 记录为 `not_started`，把 blocker 保持为 `wechat_open_platform_mobile_app_not_ready`。下一步是在微信开放平台创建“美业话镜”移动应用并提交审核；审核通过后才会取得移动应用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。浏览器安全策略会阻止自动读取或代填 `open.weixin.qq.com` 创建页，需用户手工完成页面材料与提交动作。

2026-06-22 16:58 CST 更新：微信状态在 `deploy/aliyun-production-cn.cloud-confirmations*.json` 中拆成结构化字段：`accountVerified` 表示开放平台账号认证是否已通过，`mobileAppCreated` 表示移动应用是否已创建，`mobileAppSubmitted` 表示移动应用是否已提交审核，`reviewStatus` 只表示移动应用审核状态。当前本机 ignored 证据应记录为 `accountVerified=true`、`mobileAppCreated=false`、`mobileAppSubmitted=false`、`reviewStatus=not_started`；这仍然不能取得 AppID/AppSecret，也不能视为微信登录 ready。

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
corepack pnpm run aliyun:env:check
corepack pnpm run aliyun:env:plan
corepack pnpm run aliyun:env:sources
corepack pnpm run aliyun:env:classification:test
corepack pnpm run aliyun:wechat-state:test
corepack pnpm run aliyun:domain:test
corepack pnpm run aliyun:cloud-access:test
corepack pnpm run aliyun:sensitive:blockers:test
corepack pnpm run aliyun:resources:matrix:test
corepack pnpm run aliyun:deploy:spec
corepack pnpm run aliyun:sensitive:blockers
corepack pnpm run aliyun:resources:matrix
corepack pnpm run aliyun:runtime:plan
corepack pnpm run aliyun:image:plan
corepack pnpm run aliyun:legal:check
corepack pnpm run aliyun:cloud:access
corepack pnpm run aliyun:cloud:confirmations
corepack pnpm run aliyun:domain:check
corepack pnpm run aliyun:cloud:check
corepack pnpm run aliyun:readiness
corepack pnpm run aliyun:status
corepack pnpm run aliyun:routes:check
corepack pnpm run aliyun:app-api:bridge-map
corepack pnpm run aliyun:app-client:contract
corepack pnpm run aliyun:app-config:check
corepack pnpm run aliyun:app-native:check
corepack pnpm run aliyun:aasa:check
corepack pnpm run aliyun:app-api:coverage
corepack pnpm run aliyun:docker:check
corepack pnpm exec tsc --noEmit --pretty false
corepack pnpm run release:preflight
corepack pnpm run build
corepack pnpm run aliyun:health:smoke
corepack pnpm run aliyun:app-api:smoke
```

这组本地代码级检查由 `deploy/aliyun-production-cn.example.json` 的 `localPredeployChecks` 记录，并由 `aliyun:deploy:spec` 校验。它不会代替正式部署前的严格云侧门禁：`aliyun:cloud:confirmations:strict`、`aliyun:readiness:cloud-ready`、`aliyun:release:artifacts`、`aliyun:docker:build` 和 `aliyun:container:smoke` 仍按下方“真正部署时的命令顺序”单独执行。

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
2. 需要确认阿里云 ACR 镜像仓库、remote image、digest 和 SAE 镜像拉取配置。
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

`aliyun:readiness` 同时检查 App 工程的 production-cn 配置模板和当前 runtime build config：

```text
APP files checked: .env.production-cn.example、package.json、generate-app-runtime-config、validate-package0、bootstrap、build-config.generated
APP scripts checked: config:generate:production-cn、config:check:production-cn、config:check:template、android:assemble:production-cn、validate:package0
APP env template canonical keys: APP_ENV、APP_API_BASE_URL、APP_ASSET_BASE_URL、PRIVACY_POLICY_URL、TERMS_URL
APP env template forbidden backend/secret keys: WECHAT_OPEN_APP_ID、WECHAT_OPEN_APP_SECRET、SUPABASE_SERVICE_ROLE_KEY、ALIYUN_OSS_ACCESS_KEY_SECRET、DASHSCOPE_API_KEY、DEEPSEEK_API_KEY、VOLC_SPEECH_ACCESS_TOKEN
APP runtime config check: corepack pnpm aliyun:app-config:check，实际调用 App 工程 generate-app-runtime-config --require-production-ready --check，只输出非密钥 APP runtime 字段
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
node --check scripts/check-aliyun-runtime-plan.mjs
node --check scripts/check-aliyun-image-publish-plan.mjs
node --check scripts/check-app-production-runtime-config.mjs
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.runtime-plan.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/app-api-production-cn.bridge-map.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.image-publish.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.example.json','utf8'))"
corepack pnpm aliyun:readiness
corepack pnpm aliyun:env:sources（63 variables / 63 source metadata ready）
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
corepack pnpm aliyun:app-config:check（production-cn runtime config ok=true / containsSecretValues=false / apiBaseUrl https://api-cn.ipgongchang.xin / assetBaseUrl https://assets-cn.ipgongchang.xin）
corepack pnpm aliyun:app-native:check（当前 ok=true；Android release 已切到 signingConfigs.release；iOS Associated Domains 已配置 applinks:api-cn.ipgongchang.xin；真实 Android keystore 值仍需由本机 Gradle properties 或环境变量提供）
corepack pnpm aliyun:aasa:check（当前 ok=false；AASA route exists；APPLE_TEAM_ID 缺失）
corepack pnpm aliyun:app-api:coverage（29 / 29 business routes covered）
corepack pnpm aliyun:docker:check（7 files / 24 dockerignore patterns / sensitive env excluded）
corepack pnpm aliyun:container:smoke（Docker health + 30 APP API probes / sanitized env deleted）
node --check scripts/check-aliyun-domain-readiness.mjs
corepack pnpm aliyun:domain:check（状态看板 exit 0；当前 ok=false）
corepack pnpm aliyun:deploy:spec（image meiye-huajing-app-api:production-cn / port 3000 / localPredeploy 27 / predeploy 22 / postdeploy 5）
corepack pnpm aliyun:runtime:plan（SAE / cn-hangzhou / meiye-huajing-app-api-production-cn / port 3000）
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

2026-06-22 07:10 CST 更新：`aliyun:operator:handoff` 会把缺口分成三类：后端必填变量缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；APP 发布阻塞但非密钥缺 `APPLE_TEAM_ID`，微信开放平台状态按 `WECHAT_OPEN_APP_REVIEW_STATUS` 区分 `not_started` / `reviewing` / `approved`；其他可后置变量如 `DATABASE_URL_CN` / `REDIS_URL_CN` 不再和 iOS AASA 阻塞混在一起。`aliyun:operator:tasks` / `aliyun:status` 只会在移动应用确实进入审核时显示 `waiting_wechat_review`，当前未创建移动应用时保持 `wechat_open_platform_mobile_app_not_ready`。

2026-06-22 追加：`aliyun:operator:handoff` 现在也内置 Vercel production 变量名覆盖摘要，会输出 `requiredCovered`、`optionalCovered`、可迁移桥接变量名、Vercel 仍缺的 production-cn 必填变量名，以及其中属于国内 APP/微信开放平台/正式域名的新变量。该摘要只来自 `vercel env ls --format json` 的元数据，`containsValues=false`，不会展示或写出任何环境变量值；`aliyun:release:artifacts -- --skip-vercel-env-coverage` 会把跳过参数透传给 `operator-handoff`，离线生成审计包时不会隐式访问 Vercel。

2026-06-22 追加：`aliyun:readiness` / `aliyun:status` / `aliyun:operator:tasks` / `aliyun:operator:handoff` / `aliyun:release:artifacts` 现在都会输出结构化 `bridgeDataLayer`。该字段明确第一版 APP production-cn 是阿里云 API 容器 + 现有 Supabase 数据层的桥接部署，`DATABASE_URL_CN` / `REDIS_URL_CN` 可后置；RDS PostgreSQL / Tair 仍是完整 production-cn 数据层迁移的后续任务，不能因为填写变量或完成 SAE 部署就认为数据层已经国产化迁移完成。

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

因此当前域名不是 production ready。下一步需要把 `api-cn` / `assets-cn` 解析到公网可访问的阿里云 SAE/SLB 或 OSS/CDN 入口，并配置 HTTPS 证书；之后再跑 `corepack pnpm aliyun:domain:strict`。

`aliyun:cloud:check` 当前云确认状态：

```text
cloudConfirmations.mode: file
cloudConfirmations.ready: false
path: deploy/aliyun-production-cn.cloud-confirmations.local.json
runtime missing: confirmed
apiDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
assetDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
oss missing: confirmed, region=cn-hangzhou, corsConfigured, ramLeastPrivilege
wechatOpenPlatform missing: confirmed, mobileAppIdReady, mobileAppSecretReady, androidSignature, androidConfigured, iosUniversalLink, iosConfigured, reviewStatus=approved
envImport missing: confirmed, secretNotInImage
slsAlerts missing: confirmed, healthAlertConfigured, serverErrorAlertConfigured
```

`APP_ASSET_BASE_URL` 已按 `https://assets-cn.ipgongchang.xin` 写入本地配置，但资产域名、HTTPS/ICP 和 OSS/CDN 仍未人工确认为 production ready；`assetDomainHttps` 必须单独确认，不能复用 `apiDomainHttps` 的证据。`corepack pnpm aliyun:cloud:confirmations:strict` 现在也会校验 OSS region 必须为 `cn-hangzhou`，北京 Bucket 只能作为“已发现资源但未满足目标地域”的证据。

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

该目录包含不含密钥的 `release-audit.*`、`env-import-plan.json`、`cloud-access.json`、`vercel-env-coverage.json`、`image-publish-plan-check.json`、`domain-readiness.json`、`cloud-confirmations-check.json`、`operator-tasks.*`。当前摘要：

```text
productionReady: false
localCodeReady: false
Vercel required coverage: 17 / 26
Vercel production names: 130
required missing: APP_ENV, APP_REGION, APP_API_BASE_URL, APP_ASSET_BASE_URL, NEXT_PUBLIC_SITE_URL, PRIVACY_POLICY_URL, TERMS_URL, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
optional/app-launch missing: DATABASE_URL_CN, REDIS_URL_CN, SERVICE_RECORD_DEEPSEEK_API_KEY, SERVICE_RECORD_DEEPSEEK_BASE_URL, SERVICE_RECORD_DEEPSEEK_MODEL, WECHAT_OPEN_APP_REVIEW_STATUS, APPLE_TEAM_ID
imagePublishPlan: localDockerImage ready, ACR/runtime blockers 16
cloudAccess: canReadCloudNow false, blocker aliyun_cli_missing
cloudConfirmations: local blockers 30
appClientContract: 40 audited calls / 34 unique client routes
appApiSmokeCoverage: 29 / 29 business routes
```

本轮为 `--skip-bundle` 审计，未重新生成 context tar；Docker context 和镜像已由 `aliyun:docker:check`、`aliyun:docker:build`、`aliyun:container:smoke` 覆盖。

2026-06-22 08:24 CST 更新：云确认模板从 6 项扩展为 7 项，新增 `assetDomainHttps`，用于单独确认 `assets-cn.ipgongchang.xin` 的 DNS、HTTPS 和 ICP 证据。`corepack pnpm aliyun:cloud:confirmations` 当前显示 example checkedItems=7 且模板通过，local checkedItems=7、totalBlockers=25；新增的 4 个 local blocker 是 `assetDomainHttps:confirmed`、`assetDomainHttps:dnsResolvedToAliyun`、`assetDomainHttps:httpsEnabled`、`assetDomainHttps:icpReady`。

2026-06-22 08:41 CST 更新：`deploy/aliyun-production-cn.example.json` 的 `requiredExternalConfirmations` 从 6 项扩展为 8 项：`api-cn` 和 `assets-cn` 域名证据拆开，且新增 production-cn 环境变量已导入、密钥未进镜像的外部确认。`aliyun:deploy:spec` 会检查这 8 项完整存在。

2026-06-22 09:31 CST 更新：`APP_ASSET_BASE_URL` 从 optional 调整为 production-cn 必填 env。`corepack pnpm aliyun:env:plan` 和 `corepack pnpm aliyun:readiness` 当前均显示 requiredReady `24/26`，requiredBlocking 仍只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`corepack pnpm aliyun:vercel-env:coverage` 当前显示 Vercel required coverage `17/26`，并把 `APP_ASSET_BASE_URL` 归入国内 APP 新增必填项，不能再按可选变量处理。

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

2026-06-22 16:38 CST 更新：ignored 非密钥草稿 `deploy/aliyun-production-cn.image-publish.local.json` 已补入运行时目标 `SAE`、应用名 `meiye-huajing-app-api-production-cn` 和运行时镜像拉取计划证据。`corepack pnpm aliyun:image:plan` 当前仍为 `ok=false`，但 blocker 已收敛到 12 项，剩余均为 ACR registry/namespace/remote image/remote digest/push evidence、ACR confirmed/imagePushed/digestVerified，以及 SAE runtime confirmed/remoteImageConfigured/imagePullConfigured。当前本地镜像可识别为 `meiye-huajing-app-api:production-cn`，digest `sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d`，未推送到阿里云 ACR，不能部署。

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

2026-06-22 10:44 CST 更新：`corepack pnpm aliyun:cloud:confirmations:strict` 现在会把 `.local.json` 里的 `pending_*` / `TBD_*` 字符串视为占位证据 blocker。控制台证据文件仍只能写非密钥资源名、布尔值、控制台路径或证据编号；不能通过把 `confirmed` 改成 `true` 但保留 `pending_env_import`、`pending_sls_project_confirmation` 这类占位文本来通过正式云侧门禁。

2026-06-22 追加：`corepack pnpm aliyun:operator:handoff` 现在输出 `localEvidenceGaps`，会把 `cloud-confirmations.local.json` 当前 30 个云侧 blocker 和 `image-publish.local.json` 当前 16 个镜像/运行时 blocker 映射到具体 JSON path。操作员应按该清单从阿里云、微信开放平台或 Apple Developer 控制台抄录非密钥证据；不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、token、cookie 或 Supabase service role key 写入这些 local 文件。
