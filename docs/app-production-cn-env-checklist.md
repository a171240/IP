# APP production-cn 环境变量与云资源获取清单

更新时间：2026-06-24

本清单只记录变量名、获取位置和导入位置，不记录真实密钥值。当前后端主部署目标是阿里云 SAE `cn-hangzhou` 自定义容器应用 `meiye-huajing-app-api-production-cn`，端口 `3000`；镜像进入阿里云 ACR 后由 SAE 拉取。Vercel 只作为现有后端能力来源和对照，不作为国内正式 APP 的生产运行环境。

## 当前复核结论

2026-06-22 17:31 CST 复核：现在仍不能部署。`corepack pnpm aliyun:user:actions` 当前为 `ready 0/9`，`corepack pnpm aliyun:resources:matrix` 当前为阿里云资源 `ready 0/7`。本机和 Vercel 可确认的是：本地后端容器镜像存在，APP API 桥接路由和本地 smoke 通过，Vercel production 只能提供旧后端变量名来源；阿里云 production-cn 仍缺云侧资源确认、密钥导入和移动 App 登录凭证。

2026-06-24 CST 复核：现在仍不能部署。`corepack pnpm aliyun:user:actions` 当前为 `ready 0/10`，新增阻塞项是 Android release signing 与微信开放平台 Android 应用签名；`corepack pnpm aliyun:resources:matrix` 当前仍为阿里云资源 `ready 0/7`。本机 required env 仍是 `24/26` ready，缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；CloudShell 只读盘点证据已落地并通过 strict 校验，但云资源侧仍缺 SAE、ACR、api-cn/assets-cn DNS/HTTPS/ICP、OSS RAM/STS、环境变量导入和 SLS 告警的最终确认。

2026-06-22 20:37 CST 复核：本机已通过 Homebrew 安装阿里云 CLI，`aliyun version` 为 `3.3.23`，路径为 `/opt/homebrew/bin/aliyun`。`corepack pnpm aliyun:cloud:access` 当前不再报 `aliyun_cli_missing`，但仍报 `aliyun_cli_config_missing_or_unread` 与 `cloudshell_cli_config_missing_or_unread`；脚本未读取任何配置文件内容、未调用云 API、未创建或修改阿里云资源。该状态只表示本机具备后续只读 inventory 的 CLI 前置工具，不表示阿里云资源 ready。

2026-06-22 20:53 CST 复核：已新增 `corepack pnpm aliyun:cloud:inventory-plan`。该命令只生成阿里云 CLI 只读资源盘点计划，不调用云 API、不执行 `Create/Update/Delete/Deploy/Start/Stop`、不读取或输出密钥。当前因为 CLI 账号配置仍未就绪，计划状态为 `blocked_until_cli_configured`；等 CLI/Cloud Shell 配置完成后，才能按计划核验 SAE、ACR、DNS、OSS、SLS、HTTPS 证书等云侧证据。

2026-06-22 21:08 CST 复核：已新增 `corepack pnpm aliyun:cloud:inventory-results` 和严格版 `corepack pnpm aliyun:cloud:inventory-results:strict`。该命令只校验 `deploy/aliyun-production-cn.cloud-inventory-results.local.json` 里的只读盘点结果摘要，不运行 Aliyun CLI、不调用云 API、不读取凭据。当前 local 结果文件尚未生成，所以 `inventory-results` 只作为缺口报告；后续 CLI/Cloud Shell 盘点完成后，把非密钥摘要写入该 ignored local 文件，再用 strict 校验通过后，才能把最终布尔证据同步到 `cloud-confirmations.local.json`。

2026-06-24 CST 复核：`deploy/aliyun-production-cn.cloud-inventory-results.local.json` 已存在，且已由 CloudShell Aliyun CLI 只读命令补齐。`cloudInventoryResults` 当前为 `localReady=true`、`readyLocalOperations=9/9`、`executedCommandResults=12/12`、`cloudApiCalledCommandResults=12/12`、`mutationPerformedCommandResults=0`；这证明只读盘点已完成，但不等于云资源可部署，因为 `cloudConfirmations` 仍为 `0/7` ready。

2026-06-24 数据层只读盘点补充：`cn-hangzhou` 下 RDS PostgreSQL 实例数为 0，RDS 全量实例数为 0，Redis/Tair 实例数为 0。第一版 APP production-cn 后端仍是阿里云 API 容器 + 现有 Supabase 的桥接部署；`DATABASE_URL_CN` / `REDIS_URL_CN` 可后置，不能把它们填入就等同于完成完整国内数据层迁移。

当前 Vercel production 只读覆盖检查 `corepack pnpm aliyun:vercel-env:coverage` 显示 required `17/26` 已存在，缺 `APP_ENV`、`APP_REGION`、`APP_API_BASE_URL`、`APP_ASSET_BASE_URL`、`NEXT_PUBLIC_SITE_URL`、`PRIVACY_POLICY_URL`、`TERMS_URL`、`WECHAT_OPEN_APP_ID`、`WECHAT_OPEN_APP_SECRET`。前 7 个是国内 APP/阿里云运行配置；后 2 个必须等微信开放平台移动应用创建并审核通过后获得。

当前 `/tmp/meiye-aliyun-env-import-checklist.md` 由 `corepack pnpm aliyun:env:checklist` 生成，包含 63 个变量的导入目标和来源说明，不包含真实 value。当前本机 required env 是 `24/26` ready，后端必填阻塞只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`APPLE_TEAM_ID` 会单独出现在“APP 发布阻塞但非后端必填”分组，用于 iOS Universal Link / AASA 验收。上述状态不等于云侧环境变量已经导入阿里云。

## 微信登录

阿里云不是“还缺一个 APP”。缺的是国内 APP 后端在阿里云运行时调用微信开放平台移动应用登录所需的变量。

| 变量 | 获取位置 | 导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| `WECHAT_OPEN_APP_REVIEW_STATUS` | 微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 -> 审核状态 | 本机 `.env.production-cn.local`、阿里云 SAE 普通环境变量 | 否 | 账号认证已通过；移动应用未创建，当前填 `not_started` |
| `WECHAT_OPEN_APP_ID` | 移动应用审核通过后，微信开放平台 -> 移动应用 -> 美业话镜 -> 开发信息/AppID | 阿里云 SAE 服务端普通环境变量；不能写进 App 包 | 否，但不要写进 App 包 | 移动应用创建并审核通过后才能获取 |
| `WECHAT_OPEN_APP_SECRET` | 移动应用审核通过后，微信开放平台 -> 移动应用 -> 美业话镜 -> 开发信息/AppSecret | 只导入阿里云 SAE secret/KMS/Secrets Manager | 是 | 移动应用创建并审核通过后才能获取 |

不要用小程序的 `WECHAT_MINI_APPID` / `WECHAT_MINI_SECRET` 替代移动应用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。APP 微信登录链路是：原生 iOS/Android 微信 SDK 取授权 `code`，APP 调 `POST /api/app/auth/wechat`，阿里云后端用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 向微信换取登录态。

## APP 运行域名

| 变量 | 获取位置 | 导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| `APP_API_BASE_URL` | 阿里云 DNS/SAE/HTTPS 完成后使用 `https://api-cn.ipgongchang.xin` | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机已配置，云端 DNS/HTTPS/ICP 证据未完成 |
| `NEXT_PUBLIC_SITE_URL` | 同 `APP_API_BASE_URL` | 阿里云 SAE 普通环境变量 | 否 | 本机已配置，云端证据未完成 |
| `APP_ASSET_BASE_URL` | 阿里云 DNS/CDN/OSS 自定义域完成后使用 `https://assets-cn.ipgongchang.xin` | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | production-cn 必填；本机已配置，云端 DNS/HTTPS/ICP 证据未完成 |
| `PRIVACY_POLICY_URL` | production-cn 法务页面可公网 GET 后确认 URL | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机形态检查通过，公网 GET 证据未完成 |
| `TERMS_URL` | production-cn 用户协议页可公网 GET 后确认 URL | App 本机 production-cn 配置、阿里云 SAE 普通环境变量 | 否 | 本机形态检查通过，公网 GET 证据未完成 |
| `APPLE_TEAM_ID` | Apple Developer -> Membership 或 Identifiers/App ID 页面读取 10 位 Team ID | 阿里云 SAE 普通环境变量，用于 AASA `appID` 生成 | 否 | 未提供，AASA/Universal Link 仍阻塞 |

`api-cn` 与 `assets-cn` 是两组外部证据：`api-cn` 证明 SAE/API HTTPS 入口，`assets-cn` 证明资产域名 DNS/HTTPS/ICP。不能用 OSS Bucket CORS/RAM 证据替代 `assets-cn` 域名证据。

2026-06-22 19:17 CST 复核：当前 DNS 详情页存在旧 `api` / `ip` A 记录，均指向 `106.14.241.129`；它们不能作为 `api-cn` 或 `assets-cn` 的 APP production-cn ready 证据。操作员仍需分别补 `api-cn.ipgongchang.xin` 和 `assets-cn.ipgongchang.xin` 的阿里云入口、HTTPS 和 ICP 证据。

## 阿里云资源

| 项目 | 获取/创建位置 | 写入文件或导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| SAE 应用 | 阿里云控制台 -> SAE -> `cn-hangzhou` -> 创建应用，自定义容器，端口 `3000` | `deploy/aliyun-production-cn.cloud-confirmations.local.json` 非密钥证据；SAE 控制台运行时配置 | 否 | 只读核验应用列表显示暂无实例，目标应用 `meiye-huajing-app-api-production-cn` 未创建，`runtime.confirmed=false` |
| ACR 镜像仓库 | 阿里云控制台 -> 容器镜像服务 ACR -> 命名空间/仓库 | `deploy/aliyun-production-cn.image-publish.local.json` 非密钥证据；Docker credential helper 或 RAM | 认证信息是密钥 | 未确认 ready；企业版经济版 `cn-hangzhou` 1 个月候选报价已核到 `CNY 117.00` / `¥117.00`，购买前需用户对金额和规格动作确认 |
| OSS Bucket | 阿里云控制台 -> OSS -> Bucket、地域、CORS、RAM 最小权限 | `ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_REGION`、`SERVICE_RECORD_OSS_PREFIX`；密钥走 KMS/Secrets Manager | Bucket/Region 否，AccessKey Secret 是 | Bucket/CORS 已建；RAM 策略模板见 `deploy/aliyun-production-cn.oss-ram-policy.json`，AccessKey/Secret 仍未创建导入 |
| SLS 日志 | 阿里云控制台 -> SLS -> Project/Logstore/告警 | `deploy/aliyun-production-cn.cloud-confirmations.local.json` 非密钥证据 | 否 | 已记录 project/logstore 非密钥证据，但 health/5xx 告警未配置，`slsAlerts.confirmed=false` |
| RDS PostgreSQL | 阿里云控制台 -> RDS -> PostgreSQL 实例 | 后续 `DATABASE_URL_CN` 或等价连接串走 KMS/Secrets Manager | 是 | CloudShell 只读盘点显示 `cn-hangzhou` 实例数 0；第一版桥接部署不包含迁移，完整 production-cn 数据层需另开方案 |
| Redis/Tair | 阿里云控制台 -> Tair/Redis -> 实例 | 后续 `REDIS_URL_CN` 或等价连接串走 KMS/Secrets Manager | 是 | CloudShell 只读盘点显示 `cn-hangzhou` 实例数 0；第一版桥接部署可后置 |

## 数据层可后置变量

第一版 APP production-cn 目标是把 API 容器部署到阿里云，数据层暂时沿用现有 Supabase。下面两个变量只属于完整 production-cn 数据层迁移，不是第一版桥接部署的立即阻塞项。

| 变量 | 获取位置 | 导入位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| `DATABASE_URL_CN` | 创建或确认阿里云 RDS PostgreSQL 后生成连接串 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | `todo`；当前 `cn-hangzhou` 无 RDS 实例，且后端仍以 Supabase SDK 为主 |
| `REDIS_URL_CN` | 创建或确认阿里云 Tair/Redis 后生成连接串 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | `todo`；当前 `cn-hangzhou` 无 Redis/Tair 实例 |

## 后端密钥

| 变量 | 获取位置 | 导入位置 | 密钥 | 备注 |
| --- | --- | --- | --- | --- |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 阿里云 RAM 最小权限用户或角色 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入镜像或 git |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 阿里云 RAM 最小权限用户或角色 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入镜像或 git |
| `ALIYUN_OSS_SECURITY_TOKEN` | 阿里云 RAM/STS 临时凭证或 SAE 运行时角色链路 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 可选；后端已支持 STS token 表单上传和签名下载，长期 AccessKey 模式可留空 |
| `DASHSCOPE_API_KEY` | 阿里云百炼/Model Studio 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 服务记录 ASR/LLM 相关 |
| `VOLC_SPEECH_APP_ID` | 火山引擎 OpenSpeech 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 语音能力保留字节链路时需要 |
| `VOLC_SPEECH_ACCESS_TOKEN` | 火山引擎 OpenSpeech 控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 不写入 App 包 |
| `DEEPSEEK_API_KEY` | DeepSeek 平台控制台 | 阿里云 SAE secret/KMS/Secrets Manager | 是 | 文本生成链路使用 |

## APP 发布签名

| 项目 | 获取位置 | 导入/填写位置 | 密钥 | 当前状态 |
| --- | --- | --- | --- | --- |
| Android release keystore | Android release keystore 管理位置、本机 `~/.gradle/gradle.properties`、环境变量或 CI Secret Store | 只进入本机或 CI 受控 signing secret store，不导入阿里云 SAE | keystore/password 是密钥 | `releaseSigningConfigReady=true`，但微信开放平台 Android 应用签名尚未记录，`androidConfigured=false` |
| 微信开放平台 Android 应用签名 | 用 release APK/AAB 通过 `apksigner` 或微信签名工具读取 | 微信开放平台 -> 移动应用 -> Android 应用签名；`deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature` 只记录非密钥证据 | 签名 hash 不是密钥，keystore 密码是密钥 | 不能用 debug.keystore；必须等 release 包签名后回填 |

## 当前用户介入项

`corepack pnpm aliyun:user:actions` 当前固定输出 10 项，每项只含变量名、控制台路径、写入目标和解除条件：

1. `U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE`：微信开放平台账号已认证，但移动 App 未创建；先创建“美业话镜”移动应用并提交审核，审核通过后再取得 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。
2. `U10_ANDROID_RELEASE_SIGNING`：配置 Android release signing，用 release APK/AAB 读取微信开放平台 Android 应用签名；keystore 和密码不能写入 JSON、Markdown、镜像或 git。
3. `U02_APPLE_TEAM_ID`：从 Apple Developer 读取 10 位 Team ID，导入 SAE plain env，用于 AASA。
4. `U03_ACR_PURCHASE_CONFIRMATION`：ACR Enterprise Economic / `cn-hangzhou` / 1 month / `CNY 117.00` 需要动作时付款确认。
5. `U04_ACR_RUNTIME_AUTH`：ACR 实例 ready 后配置镜像仓库、push digest 和 SAE 拉取权限；registry password/token 不能写入文件。
6. `U05_OSS_RAM_OR_STS`：OSS 最小权限策略已创建，仍需绑定运行身份并选择受限 AccessKey 或 STS/运行时角色注入。
7. `U06_ENV_IMPORT`：把本地/Vercel/Supabase/阿里云/DeepSeek/火山等 ready 变量导入 SAE/KMS/Secrets Manager，并确认 `secretNotInImage=true`。
8. `U07_DOMAIN_DNS_HTTPS_ICP`：配置 `api-cn.ipgongchang.xin` 和 `assets-cn.ipgongchang.xin` 的阿里云入口、HTTPS 和 ICP 证据。
9. `U08_SAE_RUNTIME_AND_SLS`：创建 SAE 自定义容器应用，绑定日志采集，配置 `/api/healthz` 和 5xx 告警。
10. `U09_DEPLOY_AUTHORIZATION`：上述前置条件 ready 后，再由用户明确授权生产部署、ACR push、DNS 变更或 git push。

`corepack pnpm aliyun:sensitive:blockers` 当前固定输出 7 类密钥/密码/token/付款/受控标识符阻塞：微信移动 App 凭证、Android release signing、Apple Team ID、ACR 付费、ACR/SAE 镜像认证、OSS RAM Secret 或 STS、以及 ready 敏感环境变量导入。Apple Team ID 是 Apple Developer 受控标识符，不是密钥；Android keystore password 是密钥。该报告不读取也不输出任何 value。

`corepack pnpm aliyun:console:runbook` 当前固定输出 7 项阿里云控制台任务：SAE runtime、ACR 镜像与 SAE 拉取、api-cn 域名、assets-cn 域名、OSS/RAM/STS、SAE/KMS/Secrets Manager 环境变量导入、SLS 告警。该 runbook 会把每项的目标字段、当前 blocker、当前非密钥证据、写入目标和验证命令集中输出；它不创建资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。

`corepack pnpm aliyun:action:authorization` 当前固定输出 10 项动作授权矩阵，把微信移动应用、Android release signing、Apple Team ID、ACR 付款、ACR/SAE 镜像认证、OSS RAM/STS、环境变量导入、DNS/HTTPS/ICP、SAE/SLS、生产部署授权分别归类。当前所有 10 项都不能在没有动作时确认的情况下自动执行；Codex 可以继续做的只限本地检查、报告、非密钥证据记录和本地提交。

`corepack pnpm aliyun:wechat-open:package` 当前固定输出微信开放平台移动应用创建材料包：App 名称、Android 包名、iOS Bundle ID、Universal Link、AASA URL、当前移动 App 未创建状态、审核前缺口、审核通过后 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET` 的阿里云写入目标和禁止事项。该材料包只输出非密钥字段，不创建移动应用、不读取 AppSecret、不导入环境变量。

## 可执行检查

本地只读检查：

```bash
corepack pnpm aliyun:status
corepack pnpm aliyun:env:checklist
corepack pnpm aliyun:operator:handoff
corepack pnpm aliyun:console:runbook
corepack pnpm aliyun:action:authorization
corepack pnpm aliyun:wechat-open:package
corepack pnpm aliyun:env:handoff
corepack pnpm aliyun:cloud:access
corepack pnpm aliyun:cloud:inventory-plan
corepack pnpm aliyun:cloud:inventory-results
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:readiness
corepack pnpm aliyun:predeploy
```

`aliyun:env:checklist` 会生成 `/tmp/meiye-aliyun-env-import-checklist.md`，按必填阻塞变量、APP 发布阻塞但非后端必填、可直接导入的 plain env、可直接导入的 secret env、可后置或空缺变量分组；它只包含变量名、获取位置、导入目标和动作，不包含真实 value。

`aliyun:env:handoff` 会输出无值的环境变量获取与导入手册，按 `blockedRequired`、`appLaunchBlocking`、`readyPlainEnv`、`readySecretEnv` 和 `deferred` 分组回答“从哪里取得、写到阿里云哪里、当前是否阻塞、禁止写到哪里”。该手册会明确 `WECHAT_OPEN_APP_ID` 只能作为服务端 SAE plain env，`WECHAT_OPEN_APP_SECRET` 只能进入 KMS/Secrets Manager/SAE secret env，`APPLE_TEAM_ID` 是受控标识符且不能猜测。

`aliyun:status` 现在也会读取 `cloud-inventory-results.local.json` 的非密钥摘要，并在 `cloudInventoryResults` 里显示 CLI/Cloud Shell 只读盘点结果是否已落地、local operations ready 数量和 blocker；当前 strict 只读 inventory 已经覆盖 9 项并 ready，但它只证明“资源存在/不存在/未配置”的只读事实，仍不能替代云侧 `cloudConfirmations`、ACR 镜像发布、密钥导入或生产部署授权。

正式部署前必须满足：

```text
WECHAT_OPEN_APP_REVIEW_STATUS=approved
WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 已从微信开放平台移动应用取得
APPLE_TEAM_ID 已取得并 AASA 可 GET
SAE / ACR / api-cn / assets-cn / OSS / SLS / env import 外部确认 ready
```
