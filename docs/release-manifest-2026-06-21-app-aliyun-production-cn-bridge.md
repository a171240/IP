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
requiredReady: 23 / 25
optionalReady: 28
envFile: /Users/Admin/Documents/美业话镜APP/.env.production-cn.local
env mode: 600
env gitIgnored: true
urls.appApiBaseUrl: ready
urls.nextPublicSiteUrl: ready
urls.appAssetBaseUrl: ready
wechatOpenPlatform.reviewStatus: reviewing
appProductionConfig.files: ready, 6 checked
appProductionConfig.scripts: ready, 5 checked
appProductionConfig.envTemplate: ready, 5 canonical keys checked, 0 forbidden backend/secret keys
backend.files: ready, 27 checked
backend.scripts: ready, 33 checked
docker: ready
imagePublishPlan: template ready, local draft exists, localDockerImage ready, ACR/runtime evidence still incomplete
appClientContract: 40 audited calls / 34 unique client routes, 4 deferred knowledge-space calls
appApiSmokeCoverage: 29 / 29 business routes
```

机器可验证阻塞：

```text
missing_required_env:WECHAT_OPEN_APP_ID
missing_required_env:WECHAT_OPEN_APP_SECRET
wechat_open_platform_mobile_app_reviewing
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
operator-handoff.json
operator-handoff.md
env-import-plan.json
cloud-access.json
vercel-env-coverage.json
image-publish-plan-check.json
meiye-huajing-app-api-production-cn-context.tar.gz
```

其中 `cloud-access.json` 是本机阿里云只读访问能力报告；当前用于记录是否存在 `aliyun` CLI、是否能自动读云，以及控制台需要抄录到 `.local.json` 的非密钥证据字段。`operator-handoff.json/md` 是给用户、阿里云控制台操作员、微信开放平台操作员和发布负责人共用的非密钥操作包；它会区分后端必填缺口、APP 发布/AASA 阻塞但非密钥的缺口、以及可后置变量。`vercel-env-coverage.json` 只包含 Vercel production 变量名、环境和加密/敏感元数据，不包含真实 value；Vercel 登录态不可用时只记录 non-blocking failure，不阻断 release audit。

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

2026-06-22 05:47 CST 复核：新增 `deploy/app-api-production-cn.bridge-map.json` 和 `corepack pnpm aliyun:app-api:bridge-map` 后，`corepack pnpm aliyun:predeploy` 再次通过。新增桥接门禁结果为 31 mapped routes，29 bridge-ready routes，2 WeChat env-blocked routes；微信开放平台仍按审核中处理。

2026-06-22 05:52 CST 复核：本机 ignored `.env.production-cn.local` 已补入 `PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy` 与 `TERMS_URL=https://api-cn.ipgongchang.xin/terms`。`corepack pnpm aliyun:legal:strict` 通过，`corepack pnpm aliyun:readiness` 的 requiredReady 变为 23/25，requiredBlocking 只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`corepack pnpm aliyun:health:smoke` 显示 strict health 仍为 503，但 missing 只剩 `appWechatLogin`。

2026-06-22 05:57 CST 复核：在协议 URL ready 后重新执行 `corepack pnpm aliyun:predeploy`，通过。该轮 predeploy 显示 env requiredReady 23/25、blocking 只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；`aliyun:health:smoke` missing 只剩 `appWechatLogin`；`aliyun:app-api:smoke` 仍为 30 probes / 0 failures。

2026-06-22 06:01 CST 复核：在协议 URL ready 后重新执行 `corepack pnpm aliyun:container:smoke`，通过。Docker 镜像内 `/api/healthz`、`/api/app/health` 为 200，strict health 为 503 且 missing 只剩 `appWechatLogin`；App API smoke 仍为 30 probes，临时 sanitized env file 已删除。

2026-06-22 06:18 CST 复核：新增 `corepack pnpm aliyun:status` 后，状态总览命令通过，输出 `containsValues=false`、`verdict=blocked`、`canDeployNow=false`、operator tasks `1/9 ready`、required env `23/25`，缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`。同轮重新执行 `git diff --check`、`corepack pnpm aliyun:operator:tasks`、`corepack pnpm aliyun:readiness` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`，既有 lint warnings 439 个、0 errors。

2026-06-22 06:31 CST 追加：`corepack pnpm aliyun:release:artifacts` 现在会同时生成 `production-cn-status.json` 和 `production-cn-status.md`，并把状态总览写入 `release-audit.json/md`。`corepack pnpm aliyun:predeploy` 也纳入 `aliyun:status`，部署规格 `predeployChecks` 从 18 项更新为 19 项，发布前门禁会固定覆盖“能不能上线/部署”的非密钥总览。

2026-06-22 06:36 CST 追加：新增 `corepack pnpm aliyun:app-config:check`，由后端门禁只读调用 App 工程 `generate-app-runtime-config --require-production-ready --check`，确认 production-cn 正式包会使用 `api-cn` / `assets-cn` 非密钥 runtime 配置，并拒绝旧 Vercel/小程序入口或密钥字段进入 App build config。该命令已纳入 `aliyun:readiness` 和 `aliyun:predeploy`，部署规格 `predeployChecks` 从 19 项更新为 20 项。

2026-06-22 06:45 CST 复核：新增 App runtime config 门禁后重新执行 `node --check scripts/check-app-production-runtime-config.mjs`、`corepack pnpm aliyun:app-config:check`、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:deploy:spec`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage` 和 `corepack pnpm aliyun:predeploy`，全部通过。`aliyun:status` 现在输出 `appRuntimeConfig.ok=true`、`containsSecretValues=false`、`apiBaseUrl=https://api-cn.ipgongchang.xin`、`assetBaseUrl=https://assets-cn.ipgongchang.xin`；`aliyun:deploy:spec` 显示 `predeployChecks=20`；`predeploy` 仍只剩微信 App 登录和外部云资源确认阻塞，APP API smoke `30 probes / 0 failures`。

2026-06-22 07:02 CST 追加：新增 `corepack pnpm aliyun:operator:handoff` 和 `scripts/generate-aliyun-operator-handoff.mjs`，把 `aliyun:status`、`aliyun:operator:tasks` 和 env import plan 合并成一个非密钥操作包。微信开放平台已提交审核时，当前动作是等待移动应用审核通过后读取 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；阿里云侧继续补 SAE/ECS、ACR、DNS/HTTPS/ICP、OSS/RAM、env import 和 SLS 证据。`aliyun:release:artifacts` 会随包输出 `operator-handoff.json` 和 `operator-handoff.md`。同轮已执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`corepack pnpm aliyun:operator:handoff`、`corepack pnpm aliyun:readiness`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍只剩 `appWechatLogin` 外部阻塞，APP API smoke `30 probes / 0 failures`。

2026-06-22 07:10 CST 追加：`operator-handoff` 现在把 `APPLE_TEAM_ID` 从普通可后置变量中拆出，列为 `appLaunchBlocking.variables`。当前分类应读作：后端必填变量缺 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；APP 发布/AASA 阻塞缺 `APPLE_TEAM_ID`，并且 `WECHAT_OPEN_APP_REVIEW_STATUS=reviewing`；`DATABASE_URL_CN` / `REDIS_URL_CN` 等仍是可后置变量，不应被误读为第一版 APP 登录链路阻塞。同轮已重新执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`node --check scripts/prepare-aliyun-release-artifacts.mjs`、`git diff --check`、`corepack pnpm aliyun:operator:handoff`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:readiness` 和 `corepack pnpm aliyun:predeploy`，全部通过；`predeploy` 仍显示 health strict 只缺 `appWechatLogin`，APP API smoke `30 probes / 0 failures`。

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
微信开放平台：浏览器安全策略阻止自动读取，仍以用户确认的 reviewing 为准
```

据此，`deploy/aliyun-production-cn.cloud-confirmations.local.json` 已记录这些非密钥证据，但所有 `confirmed` 仍保持 `false`。

### 10.2 环境变量

```text
APP_API_BASE_URL=https://api-cn.ipgongchang.xin
NEXT_PUBLIC_SITE_URL=https://api-cn.ipgongchang.xin
APP_ASSET_BASE_URL=https://assets-cn.ipgongchang.xin
PRIVACY_POLICY_URL=https://api-cn.ipgongchang.xin/privacy
TERMS_URL=https://api-cn.ipgongchang.xin/terms
WECHAT_OPEN_APP_REVIEW_STATUS=reviewing（当前；发布前必须 approved）
WECHAT_OPEN_APP_ID：微信开放平台移动应用 AppID
WECHAT_OPEN_APP_SECRET：微信开放平台移动应用 AppSecret
APPLE_TEAM_ID：Apple Developer 10 位 Team ID
```

`APP_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL`、`APP_ASSET_BASE_URL`、`PRIVACY_POLICY_URL`、`TERMS_URL` 已写入本机 `.env.production-cn.local`。协议 URL 形态已通过本机 strict 检查；正式生产仍需阿里云 DNS/HTTPS/ICP 证据、页面可公网 GET、运营者复核文本，并在阿里云运行环境中导入同一组 URL。

变量获取位置、导入位置和是否密钥的操作清单见 `docs/app-production-cn-env-checklist.md`。该清单明确：阿里云不是缺一个 APP，缺的是微信开放平台移动应用审核通过后的 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，以及阿里云 SAE/ACR/DNS/OSS/SLS/env import 的外部确认。

### 10.3 微信开放平台

用户已确认微信开放平台移动应用正在审核中。审核中只能记录：

```text
WECHAT_OPEN_APP_REVIEW_STATUS=reviewing
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

审核通过后才能把 readiness blocker 从 `wechat_open_platform_mobile_app_reviewing` 清掉。

2026-06-22 07:34 CST 追加：`aliyun:operator:tasks`、`aliyun:status` 和操作包输出已把微信开放平台移动应用审核中的任务状态细分为 `waiting_wechat_review`。该状态表示移动应用已进入微信审核流程，不能再误读为“还缺创建 APP”或“可以用小程序凭证替代”；正式发布仍必须等审核通过后取得移动应用 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`，并完成 Apple Team ID、阿里云云资源和非密钥证据确认。

2026-06-22 07:55 CST 追加：新增 `deploy/aliyun-production-cn.runtime-plan.json` 与 `corepack pnpm aliyun:runtime:plan`，把第一版 APP 国内后端主部署目标固定为阿里云 SAE `cn-hangzhou` 自定义容器应用 `meiye-huajing-app-api-production-cn`，监听端口 3000，健康检查 `/api/healthz`。该计划不含任何密钥值，只用于约束阿里云运行时、ACR 镜像计划、域名和云确认文件；ECS 仅作为 SAE 不满足运行约束时的备选。`aliyun:deploy:spec`、`aliyun:predeploy` 和 release artifacts 已接入该 runtime plan。

2026-06-22 08:24 CST 追加：新增 `assetDomainHttps` 云确认项，并把 `aliyun:readiness` 与 `aliyun:operator:tasks` 的 T04 域名任务改为同时要求 `apiDomainHttps` 和 `assetDomainHttps` ready。当前 `corepack pnpm aliyun:cloud:confirmations` 输出模板 checkedItems=7、local checkedItems=7、totalBlockers=25；其中 `assets-cn.ipgongchang.xin` 需要单独补 confirmed、dnsResolvedToAliyun、httpsEnabled、icpReady 四项非密钥证据，不能复用 `api-cn` 的证据或仅依赖 OSS 项。

2026-06-22 08:34 CST 追加：`APP_ASSET_BASE_URL` 的 env source catalog 归属从 `oss` 改为 `assetDomainHttps`，`aliyun:domain:check` 的 nextAction 也同步要求分别写入 `apiDomainHttps` 与 `assetDomainHttps` 证据。这样操作员清单会把 assets-cn 域名 DNS/HTTPS/ICP 与 OSS Bucket CORS/RAM 分开确认：前者对应 `assetDomainHttps`，后者对应 `oss`，避免把静态资源域名证据误写到 Bucket 权限证据里。

2026-06-22 08:41 CST 追加：`deploy/aliyun-production-cn.example.json` 的 `requiredExternalConfirmations` 从 6 项扩展为 8 项，并由 `aliyun:deploy:spec` 精确校验。新增/拆分点是：`api-cn` 域名证据、`assets-cn` 域名证据分别确认；production-cn 环境变量导入且密钥未进镜像作为独立外部确认。这样部署规格、`cloud-confirmations`、`operator:tasks` 和 `status` 的阻塞口径一致。

2026-06-22 08:53 CST 追加：`aliyun:release:artifacts` 的控制台摘要和 `release-audit.md` 现在也输出 `assetHost` 与 `requiredExternalConfirmations=8`，不用再打开完整 `release-audit.json` 才能确认部署规格是否覆盖 assets-cn 和 8 项外部确认。

2026-06-22 09:31 CST 追加：`APP_ASSET_BASE_URL` 已从 optional 调整为 production-cn 必填 env，与 App build/runtime 门禁保持一致。复核命令显示：`aliyun:env:plan` requiredReady `24/26`，`aliyun:readiness` requiredReady `24/26`，requiredBlocking 仍只剩 `WECHAT_OPEN_APP_ID` / `WECHAT_OPEN_APP_SECRET`；真实 Vercel 只读覆盖 `aliyun:vercel-env:coverage` 为 `17/26`，`APP_ASSET_BASE_URL` 被归为国内 APP 新增必填变量。

2026-06-22 09:50 CST 追加：新增 `corepack pnpm aliyun:cloud:access` 作为只读云侧访问能力 gate。该命令不调用阿里云 API、不创建资源、不修改 DNS、不推送镜像，只检查本机是否存在 `aliyun` CLI 和常见配置文件，并输出 SAE、ACR、api-cn/assets-cn、OSS、环境变量导入、SLS 告警需要写入 `.local.json` 的非密钥证据字段。当前本机未发现 `aliyun` CLI，因此云侧状态仍以阿里云控制台人工只读核验和 `cloud-confirmations.local.json` 证据为准；部署规格 `predeployChecks` 同步从 21 项更新为 22 项。

2026-06-22 10:07 CST 追加：`aliyun:release:artifacts` 现在会生成 `cloud-access.json`，并把 `cloudAccess.canReadCloudNow`、CLI 状态、blockers 和控制台证据清单数量写入 `release-audit.json/md` 与控制台摘要。这样交付包本身可以解释为什么当前云侧仍是人工控制台确认，而不是误认为阿里云 CLI 自动 inventory 已可用。

2026-06-22 追加：新增 `scripts/aliyun-predeploy-commands.mjs` 与 `deploy/aliyun-production-cn.example.json.localPredeployChecks`，把本地 `aliyun:predeploy` 的 26 项代码级检查从正式 `predeployChecks` 的 22 项严格部署顺序里拆出。`aliyun:deploy:spec` 会校验两份清单：本地 predeploy 继续允许在微信开放平台/阿里云云侧未完成时作为代码级总检通过；正式部署前仍必须单独通过 `aliyun:cloud:confirmations:strict`、`aliyun:readiness:cloud-ready`、`aliyun:release:artifacts`、`aliyun:docker:build` 和 `aliyun:container:smoke`。

2026-06-22 10:11 CST 追加：`corepack pnpm aliyun:operator:handoff` 现在内置 `cloudAccess` 摘要，会直接说明本机是否有 `aliyun` CLI、是否已具备只读云 inventory 条件、是否调用过云 API/执行过云修改，以及 SAE/ACR/DNS/OSS/env/SLS 需要从阿里云控制台抄录到 `.local.json` 的非密钥字段。`aliyun:status` 和 `operator:tasks` 的正式下一步命令顺序同步补上 `aliyun:cloud:confirmations:strict`、`aliyun:release:artifacts` 和 `aliyun:container:smoke`，避免只跑本地代码门禁后误认为可以部署。

2026-06-22 追加：`corepack pnpm aliyun:operator:handoff` 现在也内置 Vercel production 变量名覆盖摘要，直接列出 Vercel 中已存在、可作为迁移来源的旧后端桥接变量名，以及 production-cn 仍缺的必填变量名。该摘要保持 `containsValues=false`，不会输出密钥值；`aliyun:release:artifacts -- --skip-vercel-env-coverage` 已透传跳过参数给 `operator-handoff`，因此离线审计包不会隐式访问 Vercel。同轮已执行 `node --check scripts/generate-aliyun-operator-handoff.mjs`、`node --check scripts/prepare-aliyun-release-artifacts.mjs`、`node scripts/generate-aliyun-operator-handoff.mjs` 默认/跳过两种模式、`corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage`、`corepack pnpm aliyun:release:artifacts -- --skip-bundle`、`corepack pnpm exec eslint scripts/generate-aliyun-operator-handoff.mjs scripts/prepare-aliyun-release-artifacts.mjs`、`git diff --check`、新增行密钥扫描、`corepack pnpm aliyun:status`、`corepack pnpm aliyun:operator:tasks` 和 `corepack pnpm aliyun:predeploy`，全部通过；当前正式阻塞仍是微信开放平台 APP 审核/APPID/AppSecret、Apple Team ID/AASA、阿里云云资源确认、ACR、DNS/HTTPS/ICP、OSS/RAM、env import 和 SLS。

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

如果微信开放平台仍在审核中，只能作为桥接调试放行已知缺口：

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

本地桥接代码、APP API 路由、小程序链路桥接清单、App production-cn API 配置、native release 配置和检查脚手架已经可以作为阿里云 production-cn 后端准备包继续推进；当前不能称为可发布，因为阿里云运行资源、ACR 镜像发布、api-cn/assets-cn DNS/HTTPS/ICP、OSS/CORS/RAM、SLS、Apple Team ID/AASA、微信开放平台移动应用 AppID/AppSecret 和云侧环境变量导入尚未完成。微信开放平台移动应用当前按审核中处理，审核通过前不能把 App 微信登录视为正式 ready。
