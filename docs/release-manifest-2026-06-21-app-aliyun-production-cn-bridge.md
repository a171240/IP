# 美业话镜 APP 阿里云 production-cn 桥接后端发布清单

生成时间：2026-06-21 22:24:39 CST

本文只记录 APP 国内 production-cn 后端桥接包的本地准备状态，不包含任何密钥值，也不代表已经执行阿里云生产部署。

## 1. 基本信息

- Release lane: APP production-cn backend bridge
- Backend repository: `/Users/Admin/Documents/美业话镜APP/handoff/IP`
- Backend branch: `codex/app-api-handoff-20260521`
- Backend HEAD before postdeploy smoke update: `9d1281f deploy: include vercel env coverage in aliyun artifacts`
- Remote baseline branch: `origin/codex/app-api-handoff-20260521`
- Branch state before postdeploy smoke update: ahead 14, clean worktree
- App workspace: `/Users/Admin/Documents/美业话镜APP`
- Mini-program repository: `/Users/Admin/Documents/美业话镜小程序`

## 2. 权限边界

- Production deployment authorized in this manifest: no
- Git push authorized in this manifest: no
- Aliyun SAE/DNS/OSS/SLS/KMS changes authorized in this manifest: no
- Supabase production schema/data write authorized in this manifest: no
- WeChat DevTools mini-program upload authorized in this manifest: no
- WeChat Open Platform write/action authorized in this manifest: no

本清单允许的动作仅限本地文档、脚本、构建和 smoke 检查。

## 3. 本轮包含的后端提交

```text
da9f812 docs: record aliyun console readiness evidence
9d1281f deploy: include vercel env coverage in aliyun artifacts
ea1a8c7 deploy: add vercel env coverage check
cb78415 deploy: add aliyun env import plan
232cf5f docs: refresh aliyun production-cn readiness
83acfa1 deploy: require aliyun cloud confirmations
8096803 docs: add aliyun production-cn release manifest
bc2b787 deploy: track wechat open app review status
641bc1a deploy: add aliyun production-cn app api bridge
```

`9d1281f` 包含的核心文件：

```text
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
scripts/prepare-aliyun-release-artifacts.mjs
```

`ea1a8c7` 包含的核心文件：

```text
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
package.json
scripts/check-aliyun-production-cn-readiness.mjs
scripts/check-vercel-env-coverage.mjs
scripts/prepare-aliyun-runtime-env.mjs
```

`cb78415` 包含的核心文件：

```text
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
package.json
scripts/check-aliyun-production-cn-readiness.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/prepare-aliyun-runtime-env.mjs
scripts/run-aliyun-predeploy.mjs
```

`641bc1a` 包含的核心文件：

```text
.dockerignore
Dockerfile
app/api/app/health/route.ts
app/api/app/service-records/device-files/check/route.ts
app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts
app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts
app/api/app/store-profiles/[profileId]/route.ts
app/api/app/store-profiles/route.ts
app/api/healthz/route.ts
deploy/app-api-production-cn.bridge-map.json
deploy/aliyun-production-cn.example.json
deploy/aliyun-production-cn.cloud-confirmations.example.json
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
package.json
scripts/check-aliyun-docker-context.mjs
scripts/check-aliyun-production-cn-readiness.mjs
scripts/check-app-api-bridge-map.mjs
scripts/check-app-api-production-cn-routes.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/prepare-aliyun-runtime-env.mjs
scripts/run-aliyun-predeploy.mjs
scripts/smoke-aliyun-health.mjs
scripts/smoke-aliyun-remote.mjs
scripts/smoke-app-api-production-cn.mjs
```

`bc2b787` 包含的核心文件：

```text
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
scripts/check-aliyun-production-cn-readiness.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/prepare-aliyun-runtime-env.mjs
```

`83acfa1` 包含的核心文件：

```text
.gitignore
deploy/aliyun-production-cn.cloud-confirmations.example.json
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
package.json
scripts/check-aliyun-production-cn-readiness.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/run-aliyun-predeploy.mjs
```

本轮继续补充的本地门禁文件：

```text
deploy/aliyun-production-cn.example.json
deploy/aliyun-production-cn.image-publish.example.json
app/privacy/page.tsx
app/terms/page.tsx
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
package.json
scripts/check-aliyun-production-cn-readiness.mjs
scripts/check-aliyun-deployment-spec.mjs
scripts/check-aliyun-image-publish-plan.mjs
scripts/check-app-legal-pages.mjs
scripts/generate-aliyun-operator-tasks.mjs
scripts/check-app-client-api-contract.mjs
scripts/check-app-native-release-config.mjs
scripts/check-apple-app-site-association.mjs
scripts/summarize-aliyun-production-cn-status.mjs
scripts/generate-aliyun-operator-handoff.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/run-aliyun-predeploy.mjs
app/.well-known/apple-app-site-association/route.ts
app/apple-app-site-association/route.ts
lib/app-universal-link/aasa.ts
```

本 manifest 本身是后续补充的发布控制文件：

```text
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
```

## 4. 明确不包含

- 不包含 App 内支付、苹果 IAP、安卓应用市场支付。
- 不包含海报、小红书、视频任务的全量迁移。
- 不包含完整小程序页面迁移。
- 不包含小程序上传或体验版发布。
- 不包含 Supabase 生产 migration 或数据写入。
- 不包含 Vercel production deploy / promote / alias。
- 不包含阿里云控制台资源创建、环境变量导入、域名解析或证书配置。
- 不包含微信开放平台审核动作或 AppID/AppSecret 读取。

## 5. 当前工作区排除项

App 根目录当前仍是未初始化提交状态，以下内容不属于本后端桥接发布包：

```text
/Users/Admin/Documents/美业话镜APP/.env.production-cn.example
/Users/Admin/Documents/美业话镜APP/.gitignore
/Users/Admin/Documents/美业话镜APP/AGENTS.md
/Users/Admin/Documents/美业话镜APP/APP*.md
/Users/Admin/Documents/美业话镜APP/meiye-huajing-app/**
/Users/Admin/Documents/美业话镜APP/线上后台与小程序业务盘点.md
```

本地密钥/环境文件仍只保留在本机且被 git ignore：

```text
/Users/Admin/Documents/美业话镜APP/.env.production-cn.local
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.cloud-confirmations.local.json
/Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.image-publish.local.json
```

小程序仓库当前排除项：

```text
/Users/Admin/Documents/美业话镜小程序/project.config.json
/Users/Admin/Documents/美业话镜小程序/canvas/**
```

这些文件没有进入本后端 manifest，也不会随本后端包自动提交、推送、上传或部署。

## 6. Vercel 当前生产基线

只读查询时间：2026-06-21。

Vercel project:

```text
name: ip
projectId: prj_8SL1t8fEXw9QeQxScrvlroGio8TC
teamId: team_AK04Yi2jdL1IA8FMsXHRBman
framework: nextjs
nodeVersion: 24.x
```

当前 Vercel production latestDeployment:

```text
id: dpl_6cbnr11reAts8QtjfQbQXaMifF8R
url: ip-8mys5ez96-a171240s-projects.vercel.app
createdAt: 2026-06-19T06:50:04.212Z
readyState: READY
target: production
meta.release: voice-coach-opening-prepare-backend-2026-06-19
```

生产域名仍属于现有 Vercel 后端链路：

```text
www.ipnrgc.com
ip.ipgongchang.xin
ipnrgc.com
```

本轮阿里云 production-cn 目标不能直接复用 `ip.ipgongchang.xin` 作为新 APP API 域名，建议新建：

```text
https://api-cn.ipgongchang.xin
```

Vercel production 变量名只读覆盖检查：

```text
command: corepack pnpm aliyun:vercel-env:coverage
report: /tmp/meiye-vercel-env-coverage.json
containsValues: false
checkedAt: 2026-06-22 08:12 CST
vercel production variable names: 130
required APP production-cn variables covered by Vercel production: 17 / 25
required missing in Vercel production:
  APP_ENV
  APP_REGION
  APP_API_BASE_URL
  NEXT_PUBLIC_SITE_URL
  PRIVACY_POLICY_URL
  TERMS_URL
  WECHAT_OPEN_APP_ID
  WECHAT_OPEN_APP_SECRET
optional/app-launch missing in Vercel production:
  APP_ASSET_BASE_URL
  DATABASE_URL_CN
  REDIS_URL_CN
  SERVICE_RECORD_DEEPSEEK_API_KEY
  SERVICE_RECORD_DEEPSEEK_BASE_URL
  SERVICE_RECORD_DEEPSEEK_MODEL
  WECHAT_OPEN_APP_REVIEW_STATUS
  APPLE_TEAM_ID
```

结论：Vercel production 可以作为 Supabase、旧微信小程序兼容、OSS、百炼、DeepSeek、火山语音等桥接变量来源；缺失的 8 个必填项是 APP 国内版新增运行环境、`api-cn` 域名变量、国内 APP 正式协议 URL 和微信开放平台移动应用 AppID/AppSecret，不能从旧小程序变量替代。`APPLE_TEAM_ID` 不是后端必填密钥，但会阻塞 iOS AASA / Universal Link 发布验收，必须从 Apple Developer 读取。

## 7. Supabase / 数据层状态

当前 APP production-cn 是桥接版：

```text
数据库：暂时沿用现有 Supabase
对象存储：阿里云 OSS
长录音 ASR：百炼 / DashScope
服务复盘总结：DeepSeek
语音对练：火山语音 + DeepSeek
```

本清单没有 Supabase migration 文件，也没有授权 Supabase production schema/data write。

最终完整 production-cn 仍需要独立的数据层迁移：

```text
阿里云 RDS PostgreSQL
DATABASE_URL_CN
后端 Supabase SDK 到 RDS/Postgres 数据访问层迁移
数据迁移与回滚方案
```

## 8. 当前机器可验证状态

最近一次 `corepack pnpm aliyun:readiness` 结果摘要：

```text
productionReady: false
localCodeReady: false
requiredReady: 24 / 26
optionalReady: 27
envFile: /Users/Admin/Documents/美业话镜APP/.env.production-cn.local
env mode: 600
env gitIgnored: true
urls.appApiBaseUrl: ready
urls.nextPublicSiteUrl: ready
urls.appAssetBaseUrl: ready
wechatOpenPlatform.reviewStatus: not_started
appProductionConfig.files: ready, 6 checked
appProductionConfig.scripts: ready, 5 checked
appProductionConfig.envTemplate: ready, 5 canonical keys checked, 0 forbidden backend/secret keys
backend.files: ready, 35 checked
backend.scripts: ready, 39 checked
docker: ready
imagePublishPlan: template ready, local draft exists, localDockerImage ready, ACR/runtime evidence still incomplete
appClientContract: 40 audited calls / 34 unique client routes, 4 deferred knowledge-space calls
appApiSmokeCoverage: 29 / 29 business routes
```

机器可验证阻塞：

```text
missing_required_env:WECHAT_OPEN_APP_ID
missing_required_env:WECHAT_OPEN_APP_SECRET
wechat_open_platform_mobile_app_not_ready
invalid_app_universal_link_config
app_universal_link:apple_team_id_missing
```

人工确认阻塞：

```text
阿里云 SAE 容器应用已创建，运行端口 3000
阿里云 ACR 镜像发布和运行时镜像拉取配置已确认
api-cn 域名已备案、解析到阿里云入口并配置 HTTPS
assets-cn 域名已备案、解析到阿里云入口并配置 HTTPS
OSS Bucket CORS、RAM 最小权限和服务记录音频前缀已确认
微信开放平台移动应用审核已通过，并已取得 AppID/AppSecret、Android 包名/签名、iOS Bundle ID/Universal Link 配置
生产环境变量已通过阿里云控制台、KMS 或 Secrets Manager 导入，未把密钥写进镜像
SLS 日志、健康检查失败告警和 5xx 告警已配置
```

结构化云确认状态：

```text
cloudConfirmations.mode: file
cloudConfirmations.ready: false
path: deploy/aliyun-production-cn.cloud-confirmations.local.json
runtime missing: confirmed
apiDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
assetDomainHttps missing: confirmed, dnsResolvedToAliyun, httpsEnabled, icpReady
oss missing: confirmed, corsConfigured, ramLeastPrivilege
wechatOpenPlatform missing: confirmed, mobileAppIdReady, mobileAppSecretReady, androidSignature, androidConfigured, iosUniversalLink, iosConfigured, reviewStatus=approved
envImport missing: confirmed, secretNotInImage
slsAlerts missing: confirmed, healthAlertConfigured, serverErrorAlertConfigured
```

## 9. 本地检查结果

已通过：

```text
git diff --check
git diff --cached --check
staged secret-value scan
node scripts/prepare-aliyun-runtime-env.mjs --env-file /Users/Admin/Documents/美业话镜APP/.env.production-cn.example --allow-todo
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.image-publish.example.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.local.json','utf8'))"
node --check scripts/run-aliyun-postdeploy-smoke.mjs
node --check scripts/run-aliyun-container-smoke.mjs
node --check scripts/check-aliyun-cloud-confirmations.mjs
node --check scripts/check-aliyun-deployment-spec.mjs
node --check scripts/check-aliyun-image-publish-plan.mjs
node --check scripts/check-aliyun-domain-readiness.mjs
node --check scripts/generate-aliyun-operator-tasks.mjs
node --check scripts/summarize-aliyun-production-cn-status.mjs
node --check scripts/generate-aliyun-operator-handoff.mjs
node scripts/generate-app-runtime-config.mjs --env-file ../.env.production-cn.local --out /tmp/meiye-build-config.generated.ts --require-production-ready --check
corepack pnpm aliyun:env:plan
corepack pnpm aliyun:env:sources
corepack pnpm aliyun:vercel-env:coverage
corepack pnpm aliyun:domain:check
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:image:plan
corepack pnpm aliyun:status
corepack pnpm aliyun:operator:tasks
corepack pnpm aliyun:operator:handoff
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:cloud:confirmations:strict（exit 1 as expected while cloud resources are incomplete）
corepack pnpm aliyun:readiness
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:release:artifacts -- --skip-bundle
corepack pnpm aliyun:app-api:bridge-map
corepack pnpm aliyun:app-client:contract
corepack pnpm aliyun:app-config:check
local localhost aliyun:postdeploy:smoke with --allow-missing appWechatLogin,legalLinks
corepack pnpm aliyun:container:smoke -- --port 3023
corepack pnpm aliyun:predeploy
```

`corepack pnpm aliyun:predeploy` 覆盖：

```text
corepack pnpm run aliyun:env:check
corepack pnpm run aliyun:env:plan
corepack pnpm run aliyun:env:sources
corepack pnpm run aliyun:deploy:spec
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

关键检查摘要：

```text
routes: 31 checked, 0 failures
app-api bridge map: 31 mapped routes, sourceTypes mp_reexport 22 / mp_adapter 5 / app_native 1 / app_alias 1 / native_health 2, failures 0
env source catalog: 62 variables, 62 source metadata ready, containsValues false
app-client contract: 40 audited calls, 34 unique client routes, 26 matched backend routes, 4 deferred knowledge-space calls, 0 failures
app production runtime config: ok=true, containsSecretValues=false, apiBaseUrl https://api-cn.ipgongchang.xin, assetBaseUrl https://assets-cn.ipgongchang.xin
app legal pages: ok=true, /privacy and /terms route files ready, env URL ready
app-native release config: ok=true, Android release signing config ready, iOS Associated Domains applinks:api-cn.ipgongchang.xin configured
aasa config: ok=false, route files exist, blocker apple_team_id_missing, universalLink https://api-cn.ipgongchang.xin/app/wechat/
app-api coverage: 29 / 29 business routes, 30 probes, 0 missing
docker context: 7 files, 24 dockerignore patterns, sensitive env excluded
image publish plan: template ready, local file not ready until ACR remote image and runtime pull evidence are filled
deployment spec: image meiye-huajing-app-api:production-cn, port 3000, apiHost api-cn.ipgongchang.xin, predeploy 20, postdeploy 5, 0 blockers
release preflight: 4 / 4 pass
build: compiled successfully; existing lint warnings only
health smoke: sensitiveLeakCount 0
app-api smoke: 30 business probes, 0 failures
postdeploy smoke: local localhost pass, remoteHealth pass, appApiSmoke pass, sensitive value pattern 0
container smoke: Docker image meiye-huajing-app-api:production-cn pass, /api/healthz 200, /api/app/health 200, strict health 503 for expected appWechatLogin only, app-api smoke 30 probes, sanitized env file deleted, container stopped
cloud confirmations: example template ready, local file not ready, 21 blockers, containsValues false
```

Domain readiness 说明：

```text
aliyun:domain:check 只输出非密钥域名检查结果，作为当前状态看板。
aliyun:domain:strict 用于生产部署后验收，DNS / HTTPS / api-cn /api/healthz 未 ready 时必须失败。
```

2026-06-21 22:36 CST 实测：

```text
corepack pnpm aliyun:domain:check: exit 0, ok=false, targetReady 0/3
corepack pnpm aliyun:domain:strict: exit 1 as expected
APP_API_BASE_URL: api-cn.ipgongchang.xin -> A 198.18.0.5, dns_special_use_ip, HTTPS ECONNRESET
NEXT_PUBLIC_SITE_URL: api-cn.ipgongchang.xin -> A 198.18.0.5, dns_special_use_ip, HTTPS ECONNRESET
APP_ASSET_BASE_URL: assets-cn.ipgongchang.xin -> A 198.18.0.6, dns_special_use_ip, HTTPS ECONNRESET
```

结论：本机目标域名变量已填，但当前 DNS/HTTPS 不是 production ready；需要阿里云公网入口、证书和 ICP 证据补齐后，`domain:strict` 才能作为部署后验收通过。

Operator tasks 说明：

```text
aliyun:operator:tasks 只输出非密钥任务清单，覆盖微信开放平台、国内 APP 协议 URL、阿里云运行时、DNS/HTTPS、OSS、环境变量导入、SLS 和部署后 smoke。
它不创建云资源、不导入变量、不部署、不 push。
```

Status summary 说明：

```text
aliyun:status 只输出非密钥总览，覆盖 productionReady、required env、微信审核、Apple Universal Link、阿里云 cloud confirmations、域名、ACR 镜像发布计划和关键未完成任务。
它是发布负责人快速判断“现在能不能上线/部署”的入口；不创建云资源、不导入变量、不部署、不 push。
```

`aliyun:env:plan` 生成：

```text
/tmp/meiye-aliyun-env-import-plan.json
containsValues: false
variables: 62
sourceMetadataReady: 62 / 62
requiredBlocking: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
```

`aliyun:env:sources` 同样不输出变量值，默认生成：

```text
/tmp/meiye-aliyun-env-source-catalog.json
```

每个变量包含 `sensitivity`、`owner`、`consolePath`、`obtain`、`importTarget`、`cloudConfirmationKey`，用于说明变量从哪里获得、由谁确认、导入阿里云哪里。

`aliyun:release:artifacts` 当前会生成：

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
image-publish-plan-check.json
meiye-huajing-app-api-production-cn-context.tar.gz
```

其中 `cloud-access.json` 是本机阿里云只读访问能力报告；当前用于记录是否存在 `aliyun` CLI、是否能自动读云，以及控制台需要抄录到 `.local.json` 的非密钥证据字段。`sensitive-blockers.json/md` 单独列密钥、密码、token、付款和受控标识符类人工介入项；`resource-matrix.json/md` 单独列 SAE、ACR、api-cn、assets-cn、OSS、env import、SLS 这 7 个阿里云资源项和对应验收字段；`user-action-brief.json/md` 单独列用户/操作员动作项、获取位置、写入目标和动作时确认边界。`operator-handoff.json/md` 是给用户、阿里云控制台操作员、微信开放平台操作员和发布负责人共用的非密钥操作包；它会区分后端必填缺口、APP 发布/AASA 阻塞但非密钥的缺口、以及可后置变量。`vercel-env-coverage.json` 只包含 Vercel production 变量名、环境和加密/敏感元数据，不包含真实 value；Vercel 登录态不可用时只记录 non-blocking failure，不阻断 release audit。

2026-06-22 03:56 CST 最新 artifacts：

```text
outDir: /tmp/meiye-huajing-aliyun-production-cn-2026-06-21T19-56-07-018Z
productionReady: false
localCodeReady: false
imagePublishPlan.localDockerImage: ready
imagePublishPlan.totalBlockers: 16
cloudConfirmations.totalBlockers: 25
vercelEnvCoverage.requiredCovered: 17 / 25
appClientContract: 40 audited calls / 34 unique client routes / 26 matched backend routes
appApiSmokeCoverage: 29 / 29 business routes / 30 probes
```

本机 Docker 镜像已在 2026-06-22 03:54 CST 重新构建成功：

```text
repoTag: meiye-huajing-app-api:production-cn
digest: sha256:07fa9b095c1897e28a8cfdfd5d2510f01fe4e1c7af0e79cf267204d551a88ed8
size: 726504043 bytes
architecture: linux/arm64
readiness.docker.status: ready
```

`corepack pnpm aliyun:container:smoke` 已通过：

```text
healthz: 200, missing appWechatLogin
appHealth: 200, missing appWechatLogin
strictHealth: 503, expected missing appWechatLogin
appApiSmoke: 30 probes / 0 failures
sanitizedEnvFileDeleted: true
```

正式部署仍未执行；`deploy/aliyun-production-cn.image-publish.local.json` 已在本机作为 ignored 非密钥草稿创建，当前只填了 local image digest。下一步需要推送/导入到阿里云 ACR，或使用阿里云镜像构建服务，并把 ACR remote image / digest / 运行时拉取证据补入该 local 文件。

本轮新增门禁：`PRIVACY_POLICY_URL` / `TERMS_URL` 的 ready 判定现在必须通过 HTTPS 正式 URL 形态校验；localhost、example、`.vercel.app` 和旧 Vercel 入口域名不会让后端 `legalLinks` 或 APP runtime/build-time config 误判为 ready。2026-06-22 追加：后端包已提供 `/privacy` 和 `/terms` 页面落点，`corepack pnpm aliyun:legal:check` 可检查页面核心字段；正式 URL 仍需运营者复核文本后填入 env。

2026-06-22 03:56 CST 复核：`corepack pnpm aliyun:predeploy` 通过。该命令重新覆盖了 env plan/source、deploy spec、image plan、cloud confirmations、domain check、readiness、routes check、App API bridge map、App client contract、App native release check、App API coverage、Docker context、TypeScript、release preflight、Next build、health smoke 和 App API smoke。当前通过表示桥接后端本地包自洽；不表示微信开放平台、阿里云 ACR/runtime、DNS/HTTPS/ICP、OSS/RAM/SLS 已生产 ready。2026-06-22 追加后，`predeploy` 还会覆盖 `aliyun:legal:check`。

2026-06-22 05:47 CST 复核：新增 `deploy/app-api-production-cn.bridge-map.json` 和 `corepack pnpm aliyun:app-api:bridge-map` 后，`corepack pnpm aliyun:predeploy` 再次通过。新增桥接门禁结果为 31 mapped routes，29 bridge-ready routes，2 WeChat env-blocked routes；当时微信开放平台按审核中处理，后续 14:52 CST 已按用户澄清修正为账号认证通过但移动应用尚未创建。

2026-06-22 05:52 CST 复核：本机 ignored `.env.production-cn.local` 已补入 `PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy` 与 `TERMS_URL=https://api-cn.ipgongchang.xin/terms`。`corepack pnpm aliyun:legal:strict` 通过，`corepack pnpm aliyun:readiness` 的 requiredReady 变为 23/25，requiredBlocking 只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`corepack pnpm aliyun:health:smoke` 显示 strict health 仍为 503，但 missing 只剩 `appWechatLogin`。

2026-06-22 05:57 CST 复核：在协议 URL ready 后重新执行 `corepack pnpm aliyun:predeploy`，通过。该轮 predeploy 显示 env requiredReady 23/25、blocking 只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`aliyun:health:smoke` missing 只剩 `appWechatLogin`；`aliyun:app-api:smoke` 仍为 30 probes / 0 failures。

2026-06-22 06:01 CST 复核：在协议 URL ready 后重新执行 `corepack pnpm aliyun:container:smoke`，通过。Docker 镜像内 `/api/healthz`、`/api/app/health` 为 200，strict health 为 503 且 missing 只剩 `appWechatLogin`；App API smoke 仍为 30 probes，临时 sanitized env file 已删除。

2026-06-22 06:18 CST 复核：新增 `corepack pnpm aliyun:status` 后，状态总览命令通过，输出 `containsValues=false`、`verdict=blocked`、`canDeployNow=false`、operator tasks `1/9 ready`、required env `23/25`，缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。同轮重新执行 `git diff --check`、`corepack pnpm aliyun:operator:tasks`、`corepack pnpm aliyun:readiness` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`，既有 lint warnings 439 个、0 errors。

2026-06-22 06:31 CST 追加：`corepack pnpm aliyun:release:artifacts` 现在会同时生成 `production-cn-status.json` 和 `production-cn-status.md`，并把状态总览写入 `release-audit.json/md`。`corepack pnpm aliyun:predeploy` 也纳入 `aliyun:status`，部署规格 `predeployChecks` 从 18 项更新为 19 项，发布前门禁会固定覆盖“能不能上线/部署”的非密钥总览。

2026-06-22 06:36 CST 追加：新增 `corepack pnpm aliyun:app-config:check`，由后端门禁只读调用 App 工程 `generate-app-runtime-config --require-production-ready --check`，确认 production-cn 正式包会使用 `api-cn` / `assets-cn` 非密钥 runtime 配置，并拒绝旧 Vercel/小程序入口或密钥字段进入 App build config。该命令已纳入 `aliyun:readiness` 和 `aliyun:predeploy`，部署规格 `predeployChecks` 从 19 项更新为 20 项。

2026-06-22 06:45 CST 复核：新增 App runtime config 门禁后重新执行 `node --check scripts/check-app-production-runtime-config.mjs`、`corepack pnpm aliyun:app-config:check`、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:deploy:spec`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage` 和 `corepack pnpm aliyun:predeploy`，全部通过。`aliyun:status` 现在输出 `appRuntimeConfig.ok=true`、`containsSecretValues=false`、`apiBaseUrl=https://api-cn.ipgongchang.xin`、`assetBaseUrl=https://assets-cn.ipgongchang.xin`；`aliyun:deploy:spec` 显示 `predeployChecks=20`；`predeploy` 仍只剩微信 App 登录和外部云资源确认阻塞，APP API smoke `30 probes / 0 failures`。

2026-06-22 07:02 CST 追加：新增 `corepack pnpm aliyun:operator:handoff` 和 `scripts/generate-aliyun-operator-handoff.mjs`，把 `aliyun:status`、`aliyun:operator:tasks` 和 env import plan 合并成一个非密钥操作包。微信开放平台已提交审核时，当前动作是等待移动应用审核通过后读取 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；阿里云侧继续补 SAE/ECS、ACR、DNS/HTTPS/ICP、OSS/RAM、env import 和 SLS 证据。`aliyun:release:artifacts` 会随包输出 `operator-handoff.json` 和 `operator-handoff.md`。同轮已执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`corepack pnpm aliyun:operator:handoff`、`corepack pnpm aliyun:readiness`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍只剩 `appWechatLogin` 外部阻塞，APP API smoke `30 probes / 0 failures`。

2026-06-22 07:10 CST 追加：`operator-handoff` 现在把 `APPLE_TEAM_ID` 从普通可后置变量中拆出，列为 `appLaunchBlocking.variables`。当时分类应读作：后端必填变量缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；APP 发布/AASA 阻塞缺 `APPLE_TEAM_ID`，并且 `WECHAT_OPEN_APP_REVIEW_STATUS=reviewing`；`DATABASE_URL_CN` / `REDIS_URL_CN` 等仍是可后置变量，不应被误读为第一版 APP 登录链路阻塞。2026-06-22 14:52 CST 后当前状态已修正为 `WECHAT_OPEN_APP_REVIEW_STATUS=not_started`。同轮已重新执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`node --check scripts/prepare-aliyun-release-artifacts.mjs`、`git diff --check`、`corepack pnpm aliyun:operator:handoff`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:readiness` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`。

2026-06-22 07:18 CST 追加：`aliyun:readiness:assume-cloud-ready` 已降为显式诊断命令，package script 会带 `--allow-blocking`，输出固定包含 `diagnosticOnly=true` 与 `releaseEvidenceUsable=false`；即使本地机器项全部通过，也不能让 `productionReady` 变成正式可发布证据。正式发布仍只能用 `aliyun:readiness:cloud-ready`、`aliyun:cloud:confirmations:strict` 和部署后远端 smoke 证明。

## 10. 发布前必须补齐

### 10.1 阿里云资源

```text
SAE 容器应用
ACR 镜像仓库、remote image、digest 和 SAE 镜像拉取配置
api-cn 域名解析
HTTPS 证书
OSS Bucket CORS
RAM 最小权限密钥
SLS 日志项目和告警
KMS 或 Secrets Manager 环境变量管理
```

2026-06-21 只读控制台核验：

```text
阿里云控制台登录态：可用
域名控制台：ipgongchang.xin 正常，DNS 使用 dns11.hichina.com / dns12.hichina.com
云解析 DNS：ipgongchang.xin 存在 13 条记录；当前未看到 api-cn 主机记录
现有旧记录：api A 106.14.241.129
OSS 控制台：显示 1 个 Bucket；Bucket 名称、CORS、RAM 最小权限仍未确认
SAE 控制台：显示尚未开通 SAE，应用数 0
SLS：仅看到入口，未确认项目和告警
微信开放平台：浏览器安全策略阻止自动读取；2026-06-22 14:52 CST 用户澄清为账号认证通过、移动应用尚未创建，当前记录 `not_started`
```

据此，`deploy/aliyun-production-cn.cloud-confirmations.local.json` 已记录这些非密钥证据，但所有 `confirmed` 仍保持 `false`。

### 10.2 环境变量

```text
APP_API_BASE_URL=https://api-cn.ipgongchang.xin
NEXT_PUBLIC_SITE_URL=https://api-cn.ipgongchang.xin
APP_ASSET_BASE_URL=https://assets-cn.ipgongchang.xin
PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy
TERMS_URL=https://api-cn.ipgongchang.xin/terms
WECHAT_OPEN_APP_REVIEW_STATUS=not_started（当前；发布前必须 approved）
WECHAT_OPEN_APP_ID：微信开放平台移动应用 AppID
WECHAT_OPEN_APP_SECRET：微信开放平台移动应用 AppSecret
APPLE_TEAM_ID：Apple Developer 10 位 Team ID
```

`APP_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL`、`APP_ASSET_BASE_URL`、`PRIVACY_POLICY_URL`、`TERMS_URL` 已写入本机 `.env.production-cn.local`。协议 URL 形态已通过本机 strict 检查；正式生产仍需阿里云 DNS/HTTPS/ICP 证据、页面可公网 GET、运营者复核文本，并在阿里云运行环境中导入同一组 URL。

变量获取位置、导入位置和是否密钥的操作清单见 `docs/app-production-cn-env-checklist.md`。该清单明确：阿里云不是缺一个 APP，缺的是微信开放平台移动应用审核通过后的 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，以及阿里云 SAE/ACR/DNS/OSS/SLS/env import 的外部确认。

### 10.3 微信开放平台

用户已确认微信开放平台账号认证已通过，但移动应用尚未创建。当前只能记录：

```text
accountVerified=true
mobileAppCreated=false
mobileAppSubmitted=false
WECHAT_OPEN_APP_REVIEW_STATUS=not_started
```

当前 APP 工程已确认的非密钥配置：

```text
移动应用名称：美业话镜
Android applicationId / 包名：com.ipgongchang.meiyehuajing
iOS Bundle ID：com.ipgongchang.meiyehuajing
iOS Associated Domains：applinks:api-cn.ipgongchang.xin
```

`corepack pnpm aliyun:app-native:check` 当前会额外确认这些真实工程状态：

```text
Android release 已切到 signingConfigs.release；真实 release keystore 值仍需通过本机 Gradle properties 或环境变量提供
iOS target 已通过 CODE_SIGN_ENTITLEMENTS 引用 MeiyeHuajingApp.entitlements，Associated Domains 已包含 applinks:api-cn.ipgongchang.xin
```

仍需微信开放平台或正式发布资料确认：

```text
Android 应用签名：用正式 release keystore 生成，并把同一份 release 证书签名填入微信开放平台；密钥值不进入仓库
iOS Universal Link：https://api-cn.ipgongchang.xin/app/wechat/，需要和 iOS Associated Domains / AASA 文件一致
APPLE_TEAM_ID：Apple Developer -> Membership 或 Identifiers/App ID 页面读取，不是密钥，用于 AASA appID
WECHAT_OPEN_APP_ID：审核通过后读取
WECHAT_OPEN_APP_SECRET：审核通过后读取，只能导入阿里云 secret/KMS
```

先创建“美业话镜”移动应用并提交审核；提交后可记录 `reviewing`，审核通过后记录 `approved` 并取得 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。审核通过前 readiness blocker 会保持 `wechat_open_platform_mobile_app_not_ready` 或 `wechat_open_platform_mobile_app_reviewing`。

2026-06-22 16:58 CST 追加：微信开放平台状态已从单个 `reviewStatus` 拆成结构化证据字段。`accountVerified=true` 只能证明账号主体认证已通过；当前 `mobileAppCreated=false`、`mobileAppSubmitted=false` 证明移动应用仍未创建/未提交，不能进入 `waiting_wechat_review`，也不能取得移动应用 AppID/AppSecret。后续只有创建并提交审核后才把 `mobileAppCreated` / `mobileAppSubmitted` 改为 true；审核通过后再把 `reviewStatus=approved`、`mobileAppIdReady=true`、`mobileAppSecretReady=true`。

2026-06-22 07:34 CST 追加：`aliyun:operator:tasks`、`aliyun:status` 和操作包输出已把微信开放平台移动应用审核中的任务状态细分为 `waiting_wechat_review`。该状态表示移动应用已进入微信审核流程，不能再误读为“还缺创建 APP”或“可以用小程序凭证替代”；正式发布仍必须等审核通过后取得移动应用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，并完成 Apple Team ID、阿里云云资源和非密钥证据确认。

2026-06-22 07:55 CST 追加：新增 `deploy/aliyun-production-cn.runtime-plan.json` 与 `corepack pnpm aliyun:runtime:plan`，把第一版 APP 国内后端主部署目标固定为阿里云 SAE `cn-hangzhou` 自定义容器应用 `meiye-huajing-app-api-production-cn`，监听端口 3000，健康检查 `/api/healthz`。该计划不含任何密钥值，只用于约束阿里云运行时、ACR 镜像计划、域名和云确认文件；ECS 仅作为 SAE 不满足运行约束时的备选。`aliyun:deploy:spec`、`aliyun:predeploy` 和 release artifacts 已接入该 runtime plan。

2026-06-22 08:24 CST 追加：新增 `assetDomainHttps` 云确认项，并把 `aliyun:readiness` 与 `aliyun:operator:tasks` 的 T04 域名任务改为同时要求 `apiDomainHttps` 和 `assetDomainHttps` ready。当前 `corepack pnpm aliyun:cloud:confirmations` 输出模板 checkedItems=7、local checkedItems=7、totalBlockers=25；其中 `assets-cn.ipgongchang.xin` 需要单独补 confirmed、dnsResolvedToAliyun、httpsEnabled、icpReady 四项非密钥证据，不能复用 `api-cn` 的证据或仅依赖 OSS 项。

2026-06-22 08:34 CST 追加：`APP_ASSET_BASE_URL` 的 env source catalog 归属从 `oss` 改为 `assetDomainHttps`，`aliyun:domain:check` 的 nextAction 也同步要求分别写入 `apiDomainHttps` 与 `assetDomainHttps` 证据。这样操作员清单会把 assets-cn 域名 DNS/HTTPS/ICP 与 OSS Bucket CORS/RAM 分开确认：前者对应 `assetDomainHttps`，后者对应 `oss`，避免把静态资源域名证据误写到 Bucket 权限证据里。

2026-06-22 08:41 CST 追加：`deploy/aliyun-production-cn.example.json` 的 `requiredExternalConfirmations` 从 6 项扩展为 8 项，并由 `aliyun:deploy:spec` 精确校验。新增/拆分点是：`api-cn` 域名证据、`assets-cn` 域名证据分别确认；production-cn 环境变量导入且密钥未进镜像作为独立外部确认。这样部署规格、`cloud-confirmations`、`operator:tasks` 和 `status` 的阻塞口径一致。

2026-06-22 08:53 CST 追加：`aliyun:release:artifacts` 的控制台摘要和 `release-audit.md` 现在也输出 `assetHost` 与 `requiredExternalConfirmations=8`，不用再打开完整 `release-audit.json` 才能确认部署规格是否覆盖 assets-cn 和 8 项外部确认。

2026-06-22 09:31 CST 追加：`APP_ASSET_BASE_URL` 已从 optional 调整为 production-cn 必填 env，与 App build/runtime 门禁保持一致。复核命令显示：`aliyun:env:plan` requiredReady `24/26`，`aliyun:readiness` requiredReady `24/26`，requiredBlocking 仍只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；真实 Vercel 只读覆盖 `aliyun:vercel-env:coverage` 为 `17/26`，`APP_ASSET_BASE_URL` 被归为国内 APP 新增必填变量。

2026-06-22 09:50 CST 追加：新增 `corepack pnpm aliyun:cloud:access` 作为只读云侧访问能力 gate。该命令不调用阿里云 API、不创建资源、不修改 DNS、不推送镜像，只检查本机是否存在 `aliyun` CLI 和常见配置文件，并输出 SAE、ACR、api-cn/assets-cn、OSS、环境变量导入、SLS 告警需要写入 `.local.json` 的非密钥证据字段。当前本机未发现 `aliyun` CLI，因此云侧状态仍以阿里云控制台人工只读核验和 `cloud-confirmations.local.json` 证据为准；部署规格 `predeployChecks` 同步从 21 项更新为 22 项。

2026-06-22 10:07 CST 追加：`aliyun:release:artifacts` 现在会生成 `cloud-access.json`，并把 `cloudAccess.canReadCloudNow`、CLI 状态、blockers 和控制台证据清单数量写入 `release-audit.json/md` 与控制台摘要。这样交付包本身可以解释为什么当前云侧仍是人工控制台确认，而不是误认为阿里云 CLI 自动 inventory 已可用。

2026-06-22 追加：新增 `scripts/aliyun-predeploy-commands.mjs` 与 `deploy/aliyun-production-cn.example.json.localPredeployChecks`，把本地 `aliyun:predeploy` 的代码级检查从正式 `predeployChecks` 的严格部署顺序里拆出。2026-06-22 15:35 CST 后本地 predeploy 为 30 项，会额外覆盖 `aliyun:env:classification:test`、`aliyun:wechat-state:test`、`aliyun:domain:test` 和 `aliyun:cloud-access:test`。2026-06-22 16:00 CST 后本地 predeploy 增加到 32 项，继续覆盖 `aliyun:sensitive:blockers:test` 和 `aliyun:sensitive:blockers`；正式 predeployChecks 增加到 23 项，新增 `corepack pnpm aliyun:sensitive:blockers`。2026-06-22 16:18 CST 后本地 predeploy 增加到 34 项，继续覆盖 `aliyun:resources:matrix:test` 和 `aliyun:resources:matrix`；正式 predeployChecks 增加到 24 项，新增 `corepack pnpm aliyun:resources:matrix`。`aliyun:deploy:spec` 会校验两份清单：本地 predeploy 继续允许在微信开放平台/阿里云云侧未完成时作为代码级总检通过；正式部署前仍必须单独通过 `aliyun:cloud:confirmations:strict`、`aliyun:readiness:cloud-ready`、`aliyun:release:artifacts`、`aliyun:docker:build` 和 `aliyun:container:smoke`。

2026-06-22 10:11 CST 追加：`corepack pnpm aliyun:operator:handoff` 现在内置 `cloudAccess` 摘要，会直接说明本机是否有 `aliyun` CLI、是否已具备只读云 inventory 条件、是否调用过云 API/执行过云修改，以及 SAE/ACR/DNS/OSS/env/SLS 需要从阿里云控制台抄录到 `.local.json` 的非密钥字段。`aliyun:status` 和 `operator:tasks` 的正式下一步命令顺序同步补上 `aliyun:cloud:confirmations:strict`、`aliyun:release:artifacts` 和 `aliyun:container:smoke`，避免只跑本地代码门禁后误认为可以部署。

2026-06-22 追加：`corepack pnpm aliyun:operator:handoff` 现在也内置 Vercel production 变量名覆盖摘要，直接列出 Vercel 中已存在、可作为迁移来源的旧后端桥接变量名，以及 production-cn 仍缺的必填变量名。该摘要保持 `containsValues=false`，不会输出密钥值；`aliyun:release:artifacts -- --skip-vercel-env-coverage` 已透传跳过参数给 `operator-handoff`，因此离线审计包不会隐式访问 Vercel。同轮已执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`node --check scripts/prepare-aliyun-release-artifacts.mjs`、`node scripts/generate-aliyun-operator-handoff.mjs` 默认/跳过两种模式、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle`、`corepack pnpm exec eslint scripts/generate-aliyun-operator-handoff.mjs scripts/prepare-aliyun-release-artifacts.mjs`、`git diff --check`、新增行密钥扫描、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:operator:tasks` 和 `corepack pnpm aliyun:predeploy`，全部通过；当前正式阻塞仍是微信开放平台 APP 审核/APPID/AppSecret、Apple Team ID/AASA、阿里云云资源确认、ACR、DNS/HTTPS/ICP、OSS/RAM、env import 和 SLS。

2026-06-22 追加：新增结构化 `bridgeDataLayer` 到 `aliyun:readiness`、`aliyun:status`、`aliyun:operator:tasks`、`aliyun:operator:handoff` 和 `aliyun:release:artifacts`。机器输出现在会明确：第一版后端桥接部署当前数据层是 Supabase，目标数据层是阿里云 RDS PostgreSQL，`rdsMigrationIncludedInThisRelease=false`；`DATABASE_URL_CN` / `REDIS_URL_CN` 只是后续迁移变量，不应被误读为第一版部署阻塞或已完成数据层迁移。同轮已执行相关脚本 `node --check`、`corepack pnpm aliyun:readiness`、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:operator:tasks`、`node scripts/generate-aliyun-operator-handoff.mjs --skip-vercel-env-coverage`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:deploy:spec`、目标 eslint、`git diff --check`、新增行密钥扫描和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`。

2026-06-22 10:44 CST 追加：`aliyun:cloud:confirmations:strict` 加严 `.local.json` 占位证据校验，严格模式会把 `pending_*` / `TBD_*` 字符串作为 blocker。这样阿里云/微信控制台证据必须是真实非密钥资源名、控制台路径、时间或证据编号，不能保留 `pending_env_import`、`pending_sls_project_confirmation` 等占位文本后误判为云侧 ready。同轮已执行 `node --check scripts/check-aliyun-cloud-confirmations.mjs`、`corepack pnpm aliyun:cloud:confirmations`、`corepack pnpm aliyun:operator:tasks`、`corepack pnpm aliyun:status`、目标 eslint、`git diff --check`、新增行密钥扫描、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:deploy:spec` 和 `corepack pnpm aliyun:predeploy`，全部通过；当前 cloud confirmations local blockers 为 30，其中 5 个是新增占位证据 blocker，`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`。

2026-06-22 追加：`aliyun:operator:handoff` 现在输出结构化 `localEvidenceGaps`，把 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 和 `deploy/aliyun-production-cn.image-publish.local.json` 的剩余 blocker 映射到具体 JSON path、控制台来源、期望证据和禁止写入的敏感值。当前生成结果显示云侧确认仍有 30 个 blocker、镜像/运行时发布仍有 16 个 blocker；该清单用于指导阿里云/微信/Apple 控制台抄录非密钥证据，不代表已经创建云资源、推送 ACR 镜像或导入 production-cn 密钥。同轮已执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、目标 eslint、`git diff --check`、`corepack pnpm aliyun:operator:handoff -- --skip-vercel-env-coverage`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、新增行密钥扫描和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`。

2026-06-22 追加：Chrome 只读核验阿里云控制台后确认当前账号可登录，SAE 概览应用列表为“暂无数据”；DNS `ipgongchang.xin` 搜索 `api-cn` 与 `assets-cn` 均为 `共 0 条`；OSS 存在 Bucket `meiye-service-records-20260611`，地域为 `oss-cn-beijing` / 华北2（北京）。据此加严 `aliyun:cloud:confirmations:strict` 的 OSS 校验：production-cn 目标地域必须是 `cn-hangzhou`，北京 Bucket 只能作为已发现资源证据，不能误判为本轮阿里云 production-cn ready。

2026-06-22 追加：同步修正 `aliyun:cloud:access` 的 OSS 控制台证据清单，`expected.region` 固定为 production-cn 目标地域 `cn-hangzhou`，`oss-cn-beijing` 仅保留在本机 ignored `.local.json` 的只读发现证据里，避免操作交接时把北京 Bucket 当成可用目标。

2026-06-22 13:08 CST 追加：在用户明确授权阿里云侧“需要什么自己开通”后，已通过阿里云控制台完成两项可安全推进的云侧动作：创建 OSS Bucket `meiye-huajing-service-records-production-cn`，地域 `cn-hangzhou`，私有读写并开启阻止公共访问；配置该 Bucket CORS，来源为 `https://api-cn.ipgongchang.xin` 与 `https://assets-cn.ipgongchang.xin`，Methods 为 `GET/POST/PUT/HEAD`，Allowed Headers 为 `*`，Expose Headers 为 `ETag`、`x-oss-request-id`、`x-oss-hash-crc64ecma`，Max Age 为 `600`。同轮已开通 SAE 服务并创建标准服务关联角色 `AliyunServiceRoleForSAE`，SAE `cn-hangzhou` 创建应用表单可进入；但 SAE 应用 `meiye-huajing-app-api-production-cn` 尚未创建，因为现有 runtime plan 固定为 ACR 自定义容器，而 ACR 个人版页面明确提示“无 SLA 且勿在生产业务中使用”。本轮没有创建 ACR 个人版实例、没有购买企业版实例、没有推送镜像、没有创建 RAM AccessKey、没有导入任何密钥环境变量。`deploy/aliyun-production-cn.cloud-confirmations.local.json` 仅同步非密钥证据：OSS 的 `region` 和 `corsConfigured` 已满足，仍保留 `oss:ramLeastPrivilege` 与 `oss:confirmed` blocker；runtime 仍保留 `confirmed` blocker。

2026-06-22 追加：新增 `deploy/aliyun-production-cn.oss-ram-policy.json`，作为服务记录音频 OSS 的 RAM 最小权限策略模板。该模板只允许 `oss:GetObject`、`oss:PutObject`、`oss:PostObject` 访问 `meiye-huajing-service-records-production-cn/service-records/production-cn/*`，不包含任何 AccessKey、Secret 或 token。当前 RAM 控制台权限策略页在 Chrome 中停留骨架屏，未取得可提交的创建表单；因此不能把 `ramLeastPrivilege` 改为 true，也没有创建或绑定 RAM 用户/角色、没有生成 `ALIYUN_OSS_ACCESS_KEY_SECRET`、没有导入 SAE/KMS/Secrets Manager。后续需要用户在 RAM 控制台完成策略创建/绑定和密钥安全导入，或明确授权采用 SAE 角色/STS 方案并同步改造后端签名逻辑。

2026-06-22 追加：尝试开通日志服务 SLS。控制台开通页显示“仅开通 SLS 不会产生费用”，进入订单/收银台后实付金额为 `￥0.00`，但最后一步仍是“支付”确认动作；按浏览器安全边界已停在支付页，未点击最终支付，未创建 SLS Project，未配置日志采集、健康检查失败告警或 5xx 告警。`deploy/aliyun-production-cn.cloud-confirmations.local.json` 只记录该非密钥停点证据，`slsAlerts.confirmed`、`healthAlertConfigured` 和 `serverErrorAlertConfigured` 继续保持 false。

2026-06-22 追加：后端 OSS 签名链路新增可选 `ALIYUN_OSS_SECURITY_TOKEN` 支持。长期或受限 AccessKey 模式保持兼容；如果运行环境注入 STS token，`createAliyunOssPostPolicy` 会把 `x-oss-security-token` 写入表单字段和 policy 条件，`createAliyunOssSignedGetUrl` 会追加 `security-token` 查询参数。`scripts/prepare-aliyun-runtime-env.mjs` 已把 `ALIYUN_OSS_SECURITY_TOKEN` 作为 optional secret 纳入 env plan，`tests/aliyun-oss-sts.static.test.js` 覆盖该契约。同轮已执行 `node --test tests/aliyun-oss-sts.static.test.js`、`corepack pnpm exec tsc --noEmit --pretty false`、`corepack pnpm aliyun:env:plan` 和 `corepack pnpm aliyun:health:smoke`，均通过或符合预期；`aliyun:env:plan` 仍只阻塞 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，`aliyun:health:smoke` 仍只缺 `appWechatLogin`。这不代表 RAM 已完成，`oss:ramLeastPrivilege` 仍必须等策略创建/绑定和密钥或 STS 安全导入后才能改为 ready。

2026-06-22 13:42 CST 追加：SLS 已可直接进入控制台，并创建 production-cn 后端日志项目 `meiye-huajing-app-prod-cn`，地域 `cn-hangzhou`；在该项目下创建 Logstore `app-api`，默认 `Standard`、按写入数据量计费、数据保存时间 `30` 天、WebTracking 关闭、Shard 数目 `2`。创建成功弹窗提示“是否立即接入数据”时已取消，原因是 SAE 应用尚未创建，不能提前绑定错误采集源；因此 `slsAlerts.slsProject` 已更新为真实项目名，但 `healthAlertConfigured`、`serverErrorAlertConfigured` 与 `slsAlerts.confirmed` 继续保持 false，等 SAE runtime 和健康检查 URL 可用后再配置。

2026-06-22 13:42 CST 追加：RAM 控制台权限策略页在 Chrome 中反复卡骨架屏，控制台日志显示 `SecurityError: Failed to read a named property 'setTimeout' from 'Window'`；改用阿里云 Cloud Shell 通过当前登录态执行 `aliyun ram CreatePolicy`，已创建自定义策略 `MeiyeHuajingServiceRecordsOssPolicy`，`PolicyType=Custom`，`DefaultVersion=v1`，`CreateDate=2026-06-22T05:42:34Z`，`RequestId=B001B97B-26B7-5737-9A05-61792150EB1C`。策略内容来自 `deploy/aliyun-production-cn.oss-ram-policy.json`，只允许服务记录前缀的 `oss:GetObject`、`oss:PutObject`、`oss:PostObject`。本轮没有创建 RAM AccessKey、没有读取或导入 secret、没有绑定 RAM 用户/角色；因此 `oss.ramLeastPrivilege` 仍保持 false，等绑定到实际运行身份并完成密钥或 STS 安全导入后再改为 ready。

2026-06-22 13:46 CST 追加：ACR 企业版购买页已核到最低生产候选路径：`cn-hangzhou` 企业版经济版、购买时长 `1` 个月，应付 `CNY 117.00`，按钮为“立即购买”。该页面属于明确付费购买动作，当前未点击购买、未创建企业版实例、未创建 namespace/repository、未 push 镜像。`deploy/aliyun-production-cn.image-publish.local.json` 只记录非密钥 `purchaseCandidate`，`acr.confirmed`、`imagePushed`、`digestVerified`、`runtime.remoteImageConfigured` 和 `runtime.imagePullConfigured` 继续保持 false；`corepack pnpm aliyun:image:plan` 会输出该候选报价，但严格发布仍必须等 ACR 真实实例、remote image/digest 和 SAE 拉取证据完成。

2026-06-22 13:58 CST 追加：加严 Docker 构建上下文门禁。由于生产 Dockerfile 使用 `COPY . .`，`.dockerignore` 现在显式排除 `deploy/*.local.json`、`**/*.local.json`、`.npmrc*`、证书/私钥/移动描述文件等常见凭据文件；`aliyun:docker:check` 同步校验这些排除项，并禁止用反向规则重新包含 `.env`、`.local.json`、`.npmrc`、证书或私钥。这样本机 ignored 的阿里云非密钥证据文件和未来可能出现的凭据文件都不会进入生产镜像构建上下文；真实密钥仍只能通过阿里云 SAE 环境变量、KMS 或 Secrets Manager 注入。

2026-06-22 14:01 CST 追加：在上述 `.dockerignore` 门禁后重新执行 `corepack pnpm aliyun:docker:build`，Docker build context 为约 `1.06MB`，生产镜像 `meiye-huajing-app-api:production-cn` 重新构建成功，manifest digest 为 `sha256:494907a4f9e7342064dda55fe30e0e48dd245b6d6ae753bdbb3945f77c0f518d`。随后执行 `corepack pnpm aliyun:container:smoke` 通过：容器从 `/Users/Admin/Documents/美业话镜APP/.env.production-cn.local` 的临时 sanitized copy 启动，临时 env 文件已删除，health / app health 只缺 `appWechatLogin`，strict health 返回 `503`，APP API smoke 共 `30` 个 probe 覆盖 account/auth/context/invites/service-records/store-admin，结果符合微信开放平台移动应用未 ready 的预期。该 digest 只证明本地 production-cn 镜像 ready，不代表已推送 ACR 或 SAE 已配置拉取。

2026-06-22 14:06 CST 追加：`aliyun:operator:tasks`、`aliyun:status` 和 `aliyun:operator:handoff` 新增结构化 `sensitiveActionItems`，专门列出仍需用户介入的密钥、密码、token 或付款动作，不输出任何真实 value。当前输出 6 项 blocked：微信开放平台移动应用审核通过后的 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；Apple Developer 的 `APPLE_TEAM_ID`；ACR 企业版经济版 `cn-hangzhou` 1 个月 `CNY 117.00` 付款确认；ACR/SAE 镜像拉取认证；OSS RAM Secret 或 STS 注入；以及本地已有 ready 值但尚未导入阿里云运行环境的敏感/连接类变量组。`status.humanSummary` 会直接显示该数量，操作包 Markdown 也会单独列出每项的控制台路径、解除条件和禁止事项，方便发布负责人先判断哪些事情必须由用户或控制台操作员介入。

2026-06-22 14:18 CST 追加：重新执行 `corepack pnpm aliyun:domain:check`，当前 `api-cn.ipgongchang.xin` 已有 A 记录 `198.18.0.7`，`assets-cn.ipgongchang.xin` 已有 A 记录 `198.18.0.8`，但二者均属于特殊用途地址，HTTPS 探测均为 `ECONNRESET`，因此仍不能作为阿里云 production-cn 公网入口证据。本地 ignored 的 `deploy/aliyun-production-cn.cloud-confirmations.local.json` 已把域名证据从旧的“记录缺失”更新为这次实测状态，`confirmed`、`dnsResolvedToAliyun`、`httpsEnabled`、`icpReady` 继续保持 `false`。

2026-06-22 14:25 CST 追加：新增 `corepack pnpm aliyun:env:checklist`，复用无值 env import plan 生成 `/tmp/meiye-aliyun-env-import-checklist.md`。该 Markdown 清单按“必填阻塞变量 / 可直接导入的 Plain Env / 可直接导入的 Secret Env / 可后置或空缺变量”分组，只列变量名、状态、敏感等级、来源分类、获取位置、导入目标和动作，不输出任何真实 value。`aliyun:release:artifacts` 也会把 `env-import-checklist.md` 放进审计包，方便阿里云 SAE/KMS/Secrets Manager 导入时逐项核对。

2026-06-22 14:33 CST 追加：修正 env import plan 的非密钥分类，`ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_REGION` 和 `SERVICE_RECORD_ASR_PROVIDER` 现在明确归入 `阿里云 SAE plain env`，不再出现在 Secret Env 分组；新增 `tests/aliyun-env-import-plan.static.test.mjs` 与 `corepack pnpm aliyun:env:classification:test`，确保 ready 且 public 的变量不会误指向 secret env。`aliyun:predeploy` 已纳入该测试，部署规格 `localPredeployChecks` 当时更新为 27 项。

2026-06-22 14:41 CST 追加：继续修正微信开放平台移动应用变量导入分类，`WECHAT_OPEN_APP_ID` 现在明确作为服务端标识符导入 `阿里云 SAE plain env`，但仍禁止写进 App 包；`WECHAT_OPEN_APP_SECRET` 继续只能导入 KMS/Secrets Manager/SAE secret env。`sensitiveActionItems` 的微信任务文案也同步拆分 AppID 与 AppSecret 的导入目标，避免把非密钥 AppID 误读成 secret env，或误读成可以写入客户端。该变更不改变发布阻塞结论：微信开放平台移动应用仍需审核通过后才能取得 AppID/AppSecret。

2026-06-22 14:52 CST 追加：用户澄清微信开放平台当前只是账号认证成功，移动应用尚未创建。已把本机 ignored 状态调整为 `WECHAT_OPEN_APP_REVIEW_STATUS=not_started`，`wechatOpenPlatform.reviewStatus=not_started`，证据为 `user_confirmed_wechat_open_platform_account_verified_mobile_app_not_created_browser_read_blocked_by_policy_2026-06-22`。`open.weixin.qq.com` 创建页受浏览器安全策略保护，不能由自动化读取或代填；下一步需用户在微信开放平台创建“美业话镜”移动应用并提交审核，审核通过后再把 AppID/AppSecret 安全导入阿里云运行环境。

2026-06-22 15:08 CST 追加：补齐 `not_started` 口径防回归门禁。新增 `tests/aliyun-wechat-open-platform-state.static.test.js` 与 `corepack pnpm aliyun:wechat-state:test`，检查云确认模板、APP API 桥接清单、部署文档和 readiness nextAction 都把当前微信开放平台状态视为“账号认证通过但移动应用尚未创建”。`scripts/check-aliyun-production-cn-readiness.mjs` 的 nextActions 也已区分 `not_started`、`reviewing`、`rejected`：当前 `not_started` 会提示先创建“美业话镜”移动应用并提交审核，而不是直接去读取 AppID/AppSecret。`aliyun:predeploy` 已纳入该测试，部署规格 `localPredeployChecks` 更新为 28 项。

2026-06-22 15:24 CST 追加：通过已登录 Chrome 只读核验阿里云控制台：SAE 可进入概览页但尚未证明目标应用 `meiye-huajing-app-api-production-cn` 已创建；ACR 仍停在企业版经济版华东1（杭州）1 个月购买页，应付 `¥117.00`，未付款；OSS Bucket 列表确认 `meiye-huajing-service-records-production-cn` 位于华东1（杭州），但 CORS/RAM 绑定仍需单独证明；阿里云 DNS 控制台 `ipgongchang.xin` 记录列表未显示显式 api-cn/assets-cn 记录。权威 DNS 查询显示 `api-cn/assets-cn` 当前命中 `198.18.0.0/15` 特殊用途占位地址，随机子域也返回特殊用途地址，说明域名仍是 `dns_special_use_wildcard_ip` 阻塞。新增 `tests/aliyun-domain-readiness.static.test.js` 与 `corepack pnpm aliyun:domain:test`，`aliyun:predeploy` 本地门禁同步增加到 29 项。

2026-06-22 15:35 CST 追加：重新连接阿里云 Cloud Shell 后只执行只读基础命令，确认 `aliyun` CLI 版本 `3.3.23`，但 `aliyun configure list` 报 `/home/shell/.aliyun/config.json` 不存在；本轮 Cloud Shell 观察为 `cloudApiCalled=false`、`cloudMutationPerformed=false`、`canRunReadOnlyInventory=false`。新增 `deploy/aliyun-production-cn.cloud-access.example.json`、ignored `.local.json` 观察文件、`tests/aliyun-cloud-access.static.test.js` 和 `corepack pnpm aliyun:cloud-access:test`；`aliyun:operator:handoff` 现在会显示 `browserConsoleChromeLoggedIn`、`cloudShellConnected` 与 `cloudShellCanRunReadOnlyInventory`，避免把 Cloud Shell 可打开误判为云 API 可自动盘点。`aliyun:predeploy` 本地门禁同步增加到 30 项。

2026-06-22 16:00 CST 追加：新增 `corepack pnpm aliyun:sensitive:blockers` 与 `tests/aliyun-sensitive-blockers.static.test.js`，把 `operator:tasks` 里的 `sensitiveActionItems` 单独压缩成无密钥 JSON/Markdown 清单。该命令只输出变量名、控制台路径、动作、解除条件和禁止事项，并执行 secret-like 输出扫描；当前预期仍为 blocked，但命令本身只有在输出疑似真实密钥值时才失败。这样用户介入项可以直接按 S01-S06 追踪：微信开放平台移动 App 登录凭证、Apple Team ID、ACR 付费确认、ACR/SAE 镜像拉取认证、OSS RAM Secret 或 STS、以及本地 ready 但尚未导入阿里云的敏感环境变量组。

2026-06-22 16:18 CST 追加：新增 `corepack pnpm aliyun:resources:matrix` 与 `tests/aliyun-resource-matrix.static.test.js`，把现有 `operator:tasks`、`cloud:confirmations`、`image:plan` 和 `cloud:access` 汇总成阿里云资源矩阵。当前矩阵固定输出 7 项：SAE runtime、ACR 镜像仓库/SAE 拉取、api-cn DNS/HTTPS/ICP、assets-cn DNS/HTTPS/ICP、OSS 音频存储、SAE/KMS/Secrets Manager 环境变量导入、SLS 日志告警。每项都会列控制台路径、写入 `.local.json` 的非密钥字段、当前 blocker、验收命令、是否需要动作时确认，并声明 `mutationPerformed=false`；`aliyun:release:artifacts` 也会随包输出 `resource-matrix.json` 和 `resource-matrix.md`。

2026-06-22 16:34 CST 追加：新增 `corepack pnpm aliyun:user:actions` 与 `tests/aliyun-user-action-brief.static.test.js`，把 `sensitive:blockers`、`resources:matrix` 和 `status` 合并成用户动作简报。当前固定输出 9 项：微信移动应用创建/审核、Apple Team ID、ACR 付费确认、ACR/SAE 镜像认证、OSS RAM/STS、环境变量导入、DNS/HTTPS/ICP、SAE/SLS、最终生产部署授权。该简报只列获取位置、写入目标、变量名、解除条件和动作时确认边界，不输出任何 value，并声明 `mutationPerformed=false`；`aliyun:release:artifacts` 也会随包输出 `user-action-brief.json` 和 `user-action-brief.md`。

## 11. 真正部署时的命令顺序

生产动作必须另行授权。授权后建议顺序：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:cloud:confirmations:strict
corepack pnpm aliyun:image:plan:strict
corepack pnpm aliyun:domain:strict
corepack pnpm aliyun:readiness:cloud-ready
corepack pnpm aliyun:release:artifacts
corepack pnpm aliyun:docker:build
corepack pnpm aliyun:container:smoke
```

阿里云部署完成后：

```bash
corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin
```

分步排查命令：

```bash
corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin
corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin
```

如果微信开放平台移动应用仍未 `approved`（`not_started` 或 `reviewing`），只能作为桥接调试放行已知缺口：

```bash
corepack pnpm aliyun:remote:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin,legalLinks
```

或使用统一 postdeploy smoke：

```bash
corepack pnpm aliyun:postdeploy:smoke -- \
  --base-url https://api-cn.ipgongchang.xin \
  --allow-missing appWechatLogin,legalLinks
```

这种放行不能用于正式 production-cn 发布结论。

## 12. 回滚 / 恢复

在阿里云 production-cn 尚未部署前：

```text
回滚动作：无需执行，线上仍是 Vercel production baseline。
当前线上基线：dpl_6cbnr11reAts8QtjfQbQXaMifF8R
```

如果后续阿里云已经部署：

```text
1. 将 APP 端 APP_API_BASE_URL / 发布配置回退到上一可用 API。
2. 在阿里云 SAE 回滚到上一镜像或停止 api-cn 入口。
3. 保留 Vercel production baseline 作为现有小程序/旧后端对照。
4. 如已做数据库迁移，按单独 Supabase/RDS 迁移 manifest 回滚；本清单不覆盖数据库回滚。
```

## 13. 当前结论

本地桥接代码、APP API 路由、小程序链路桥接清单、App production-cn API 配置、native release 配置和检查脚手架已经可以作为阿里云 production-cn 后端准备包继续推进；当前不能称为可发布，因为阿里云运行资源、ACR 镜像发布、api-cn/assets-cn DNS/HTTPS/ICP、OSS/CORS/RAM、SLS、Apple Team ID/AASA、微信开放平台移动应用创建/审核/AppID/AppSecret 和云侧环境变量导入尚未完成。微信开放平台当前只是账号认证通过，移动应用尚未创建，不能把 App 微信登录视为正式 ready。
