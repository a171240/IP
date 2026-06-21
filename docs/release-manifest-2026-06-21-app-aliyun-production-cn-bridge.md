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
- Aliyun SAE/ECS/DNS/OSS/SLS/KMS changes authorized in this manifest: no
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
deploy/aliyun-production-cn.example.json
deploy/aliyun-production-cn.cloud-confirmations.example.json
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
package.json
scripts/check-aliyun-docker-context.mjs
scripts/check-aliyun-production-cn-readiness.mjs
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
docs/DEPLOY_ALIYUN_PRODUCTION_CN.md
docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md
package.json
scripts/check-aliyun-production-cn-readiness.mjs
scripts/check-app-client-api-contract.mjs
scripts/prepare-aliyun-release-artifacts.mjs
scripts/run-aliyun-predeploy.mjs
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
```

结论：Vercel production 可以作为 Supabase、旧微信小程序兼容、OSS、百炼、DeepSeek、火山语音等桥接变量来源；缺失的 8 个必填项是 APP 国内版新增运行环境、`api-cn` 域名变量、国内 APP 正式协议 URL 和微信开放平台移动应用 AppID/AppSecret，不能从旧小程序变量替代。

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
requiredReady: 21 / 25
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
backend.files: ready, 23 checked
backend.scripts: ready, 27 checked
docker: ready, image meiye-huajing-app-api:production-cn, digest sha256:905bdd0db460e4eadb5edbd9c7ed76781a651b058381059e29a4ec607d1780f3, size 3.02GB
appClientContract: 40 audited calls / 34 unique client routes, 4 deferred knowledge-space calls
appApiSmokeCoverage: 29 / 29 business routes
```

机器可验证阻塞：

```text
missing_required_env:WECHAT_OPEN_APP_ID
missing_required_env:WECHAT_OPEN_APP_SECRET
missing_required_env:PRIVACY_POLICY_URL
missing_required_env:TERMS_URL
wechat_open_platform_mobile_app_reviewing
```

人工确认阻塞：

```text
阿里云 SAE 或 ECS 容器应用已创建，运行端口 3000
api-cn 域名已备案、解析到阿里云入口并配置 HTTPS
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
node -e "JSON.parse(require('fs').readFileSync('deploy/aliyun-production-cn.cloud-confirmations.local.json','utf8'))"
node --check scripts/run-aliyun-postdeploy-smoke.mjs
node --check scripts/run-aliyun-container-smoke.mjs
node --check scripts/check-aliyun-cloud-confirmations.mjs
node --check scripts/check-aliyun-deployment-spec.mjs
node --check scripts/check-aliyun-domain-readiness.mjs
node --check scripts/generate-aliyun-operator-tasks.mjs
node scripts/generate-app-runtime-config.mjs --env-file ../.env.production-cn.local --out /tmp/meiye-build-config.generated.ts --require-production-ready --check
corepack pnpm aliyun:env:plan
corepack pnpm aliyun:env:sources
corepack pnpm aliyun:vercel-env:coverage
corepack pnpm aliyun:domain:check
corepack pnpm aliyun:deploy:spec
corepack pnpm aliyun:operator:tasks
corepack pnpm aliyun:cloud:confirmations
corepack pnpm aliyun:cloud:confirmations:strict（exit 1 as expected while cloud resources are incomplete）
corepack pnpm aliyun:readiness
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:release:artifacts -- --skip-bundle
corepack pnpm aliyun:app-client:contract
local localhost aliyun:postdeploy:smoke with --allow-missing appWechatLogin,legalLinks
corepack pnpm aliyun:container:smoke -- --port 3023
corepack pnpm aliyun:predeploy
```

`corepack pnpm aliyun:predeploy` 覆盖：

```text
aliyun:env:check
aliyun:env:plan
aliyun:env:sources
aliyun:cloud:check
aliyun:readiness
aliyun:routes:check
aliyun:app-client:contract
aliyun:app-api:coverage
aliyun:docker:check
pnpm exec tsc --noEmit --pretty false
release:preflight
build
aliyun:health:smoke
aliyun:app-api:smoke
```

关键检查摘要：

```text
routes: 31 checked, 0 failures
env source catalog: 61 variables, 61 source metadata ready, containsValues false
app-client contract: 40 audited calls, 34 unique client routes, 26 matched backend routes, 4 deferred knowledge-space calls, 0 failures
app-api coverage: 29 / 29 business routes, 30 probes, 0 missing
docker context: 7 files, 24 dockerignore patterns, sensitive env excluded
deployment spec: image meiye-huajing-app-api:production-cn, port 3000, apiHost api-cn.ipgongchang.xin, predeploy 14, postdeploy 5, 0 blockers
release preflight: 4 / 4 pass
build: compiled successfully; existing lint warnings only
health smoke: sensitiveLeakCount 0
app-api smoke: 30 business probes, 0 failures
postdeploy smoke: local localhost pass, remoteHealth pass, appApiSmoke pass, sensitive value pattern 0
container smoke: Docker image meiye-huajing-app-api:production-cn pass, /api/healthz 200, /api/app/health 200, strict health 503 for allowed appWechatLogin/legalLinks, app-api smoke 30 probes, sanitized env file deleted, container stopped
cloud confirmations: example template ready, local file not ready, 19 blockers, containsValues false
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

`aliyun:env:plan` 生成：

```text
/tmp/meiye-aliyun-env-import-plan.json
containsValues: false
variables: 61
sourceMetadataReady: 61 / 61
requiredBlocking: PRIVACY_POLICY_URL, TERMS_URL, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET
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
env-import-plan.json
vercel-env-coverage.json
meiye-huajing-app-api-production-cn-context.tar.gz
```

其中 `vercel-env-coverage.json` 只包含 Vercel production 变量名、环境和加密/敏感元数据，不包含真实 value；Vercel 登录态不可用时只记录 non-blocking failure，不阻断 release audit。

本机 Docker 镜像已构建成功：

```text
repoTag: meiye-huajing-app-api:production-cn
digest: sha256:905bdd0db460e4eadb5edbd9c7ed76781a651b058381059e29a4ec607d1780f3
size: 3.02GB
readiness.docker.status: ready
```

正式部署仍未执行；下一步需要推送/导入到阿里云镜像仓库，或使用阿里云镜像构建服务。

## 10. 发布前必须补齐

### 10.1 阿里云资源

```text
SAE 或 ECS 容器应用
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
WECHAT_OPEN_APP_REVIEW_STATUS=approved
WECHAT_OPEN_APP_ID=<微信开放平台移动应用 AppID>
WECHAT_OPEN_APP_SECRET=<微信开放平台移动应用 AppSecret>
```

`APP_API_BASE_URL`、`NEXT_PUBLIC_SITE_URL`、`APP_ASSET_BASE_URL` 已写入本机 `.env.production-cn.local`，但仍需阿里云 DNS/HTTPS/OSS/CDN 证据确认后才能算生产 ready。

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
```

仍需微信开放平台或正式发布资料确认：

```text
Android 应用签名：正式 release 签名证书生成，不能用 debug keystore
iOS Universal Link：HTTPS 域名路径，需要和 iOS Associated Domains / AASA 文件一致
WECHAT_OPEN_APP_ID：审核通过后读取
WECHAT_OPEN_APP_SECRET：审核通过后读取，只能导入阿里云 secret/KMS
```

审核通过后才能把 readiness blocker 从 `wechat_open_platform_mobile_app_reviewing` 清掉。

## 11. 真正部署时的命令顺序

生产动作必须另行授权。授权后建议顺序：

```bash
cd /Users/Admin/Documents/美业话镜APP/handoff/IP
corepack pnpm aliyun:cloud:check
corepack pnpm aliyun:cloud:confirmations:strict
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
2. 在阿里云 SAE/ECS 回滚到上一镜像或停止 api-cn 入口。
3. 保留 Vercel production baseline 作为现有小程序/旧后端对照。
4. 如已做数据库迁移，按单独 Supabase/RDS 迁移 manifest 回滚；本清单不覆盖数据库回滚。
```

## 13. 当前结论

本地桥接代码、APP API 路由、App production-cn API 配置和检查脚手架已经可以作为阿里云 production-cn 后端准备包继续推进；当前不能称为可发布，因为阿里云运行资源、api-cn DNS/HTTPS/OSS/SLS 确认、微信开放平台移动应用 AppID/AppSecret 和云侧环境变量导入尚未完成。
